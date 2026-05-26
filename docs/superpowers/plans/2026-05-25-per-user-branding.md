# Per-user Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `connecta_plus` users pick from 6 palette presets, 4 font pairings, and upload a custom sidebar logo. Branding is per-user (tied to logged-in session) and applied via CSS variable injection on `<html>`.

**Architecture:** New `user_branding` table joined to `auth.users`. Presets defined as static TS constants. Runtime `applyBranding()` mutates CSS vars on `:root`. Pre-mount hydration from localStorage to avoid FOUC. Settings UI in `/settings`, gated on `isConnectaPlus`.

**Tech Stack:** React + TypeScript, Vite, Tailwind, Supabase (Postgres + Storage), shadcn/ui, sonner toasts.

**Spec:** `docs/superpowers/specs/2026-05-25-per-user-branding-design.md`

**This project has no test framework** (no `npm test` script). TDD substitutes:
- `npx tsc --noEmit` for type-checking after each task
- `npm run lint` for style
- `npm run build` for full integrity at the end
- Manual browser smoke at the end

---

## File Structure

**New files:**

- `supabase/migrations/20260525_b01_user_branding.sql` — table + RLS
- `supabase/migrations/20260525_b02_branding_logos_bucket.sql` — storage bucket + policies
- `src/lib/branding/types.ts` — TS types for branding data
- `src/lib/branding/presets.ts` — palette + font pairing constants
- `src/lib/branding/apply.ts` — `applyBranding()` runtime function
- `src/lib/branding/storage.ts` — localStorage cache helpers
- `src/lib/branding/hydrate.ts` — pre-mount sync hydration
- `src/contexts/BrandingContext.tsx` — React provider + context
- `src/hooks/useBranding.ts` — re-export from context for convenience
- `src/components/branding/BrandLogo.tsx` — logo component with wordmark fallback
- `src/components/settings/BrandingSection.tsx` — composed Settings UI section
- `src/components/settings/PalettePicker.tsx` — palette tile grid
- `src/components/settings/FontPicker.tsx` — font pairing tile grid
- `src/components/settings/LogoUploader.tsx` — file dropzone + replace/remove

**Modified files:**

- `src/main.tsx` — call sync hydration before `createRoot`
- `src/App.tsx` — wrap tree in `<BrandingProvider>` (inside `<AuthProvider>`)
- `src/components/DashboardSidebar.tsx:458-466` — replace text wordmark with `<BrandLogo />`
- `src/pages/Settings.tsx` — mount `<BrandingSection />` (gated on `isConnectaPlus`)
- `src/contexts/AuthContext.tsx` — clear `connecta_branding` localStorage on sign-out
- `tailwind.config.ts:21-25` — font families read from CSS vars
- `src/index.css:159-163` — `.font-wordmark` uses `--font-display` var

---

## Task 1: DB migration — `user_branding` table + RLS

**Files:**
- Create: `supabase/migrations/20260525_b01_user_branding.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260525_b01_user_branding.sql
-- Per-user branding for connecta_plus users: palette + font pairing + logo URL.

create table if not exists public.user_branding (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  palette      text not null default 'editorial'
                 check (palette in ('editorial','slate','forest','plum','crimson','mono')),
  font_pairing text not null default 'editorial'
                 check (font_pairing in ('editorial','modern','classic','bold')),
  logo_url     text,
  logo_alt     text,
  updated_at   timestamptz not null default now()
);

create or replace function public.touch_user_branding_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists user_branding_touch on public.user_branding;
create trigger user_branding_touch
  before update on public.user_branding
  for each row execute function public.touch_user_branding_updated_at();

alter table public.user_branding enable row level security;

-- User can read own row
drop policy if exists user_branding_select_own on public.user_branding;
create policy user_branding_select_own on public.user_branding
  for select using (user_id = auth.uid());

-- Admins can read any row (uses existing public.is_admin() SECURITY DEFINER
-- helper — see finance_tables migration for prior usage).
drop policy if exists user_branding_select_admin on public.user_branding;
create policy user_branding_select_admin on public.user_branding
  for select using (public.is_admin());

-- User can insert / update own row
drop policy if exists user_branding_insert_own on public.user_branding;
create policy user_branding_insert_own on public.user_branding
  for insert with check (user_id = auth.uid());

drop policy if exists user_branding_update_own on public.user_branding;
create policy user_branding_update_own on public.user_branding
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_branding to authenticated;
```

- [ ] **Step 2: Verify migration syntax**

Run: `grep -c "^create\|^alter\|^drop\|^grant" supabase/migrations/20260525_b01_user_branding.sql`
Expected: at least 9 statements counted.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525_b01_user_branding.sql
git commit -m "feat(branding): add user_branding table with RLS"
```

---

## Task 2: DB migration — `branding-logos` storage bucket

**Files:**
- Create: `supabase/migrations/20260525_b02_branding_logos_bucket.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260525_b02_branding_logos_bucket.sql
-- Public-read storage bucket for connecta_plus users' uploaded sidebar logos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding-logos',
  'branding-logos',
  true,
  1048576, -- 1 MB
  array['image/png','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read
drop policy if exists branding_logos_public_read on storage.objects;
create policy branding_logos_public_read on storage.objects
  for select using (bucket_id = 'branding-logos');

-- Authenticated user can upload to their own folder
-- Path convention: {user_id}/logo-{timestamp}.{ext}
drop policy if exists branding_logos_user_insert on storage.objects;
create policy branding_logos_user_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated user can update/delete their own folder
drop policy if exists branding_logos_user_update on storage.objects;
create policy branding_logos_user_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists branding_logos_user_delete on storage.objects;
create policy branding_logos_user_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Verify**

Run: `grep -c "create policy\|create_policy" supabase/migrations/20260525_b02_branding_logos_bucket.sql`
Expected: 4 policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525_b02_branding_logos_bucket.sql
git commit -m "feat(branding): add branding-logos storage bucket"
```

---

## Task 3: TS types

**Files:**
- Create: `src/lib/branding/types.ts`

- [ ] **Step 1: Write types**

```ts
// src/lib/branding/types.ts

export type PaletteId = 'editorial' | 'slate' | 'forest' | 'plum' | 'crimson' | 'mono';
export type FontPairingId = 'editorial' | 'modern' | 'classic' | 'bold';

export interface Palette {
  /** HSL triplets — used directly in `hsl(var(--foo))` consumers. No leading hsl()! */
  ink: string;          // page background
  graphite: string;     // card / surface
  bone: string;         // foreground text
  aqua: string;         // primary
  honey: string;        // accent
  honeyDeep: string;    // destructive
}

export interface FontPairing {
  display: string;  // headings (h1, h2, wordmark)
  body: string;     // paragraph copy
  ui: string;       // buttons, labels, nav
}

export interface UserBranding {
  palette: PaletteId;
  fontPairing: FontPairingId;
  logoUrl: string | null;
  logoAlt: string | null;
}

/** Editorial defaults — applied when no row exists or user is not connecta_plus. */
export const EDITORIAL_DEFAULT: UserBranding = {
  palette: 'editorial',
  fontPairing: 'editorial',
  logoUrl: null,
  logoAlt: null,
};

export const LOCAL_STORAGE_KEY = 'connecta_branding';
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "branding/types|error" | head -5`
Expected: no errors mentioning `branding/types`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/branding/types.ts
git commit -m "feat(branding): TS types and editorial default"
```

---

## Task 4: Palette + font presets

**Files:**
- Create: `src/lib/branding/presets.ts`

HSL values converted from the brainstorming mockup hex codes (see `.superpowers/brainstorm/.../palettes.html`):

| Palette | ink (bg) | graphite (surface) | bone (fg) | aqua (primary) | honey (accent) | honey-deep (destructive) |
|---|---|---|---|---|---|---|
| editorial | #141414 → `0 0% 8%` | #1F1F1F → `0 0% 12%` | #EAE6DC → `42 23% 89%` | #8FD0D5 → `184 41% 70%` | #E0A560 → `30 67% 63%` | #C7682A → `22 65% 47%` |
| slate | #0F1419 → `215 28% 9%` | #1E293B → `217 33% 17%` | #E2E8F0 → `214 32% 91%` | #38BDF8 → `199 89% 60%` | #FBBF24 → `45 96% 56%` | #DC2626 → `0 73% 50%` |
| forest | #0F1A14 → `145 28% 9%` | #1A2620 → `155 19% 13%` | #E8EDDF → `78 24% 90%` | #86B48D → `131 24% 62%` | #D49B5A → `30 56% 59%` | #B85C2A → `19 64% 44%` |
| plum | #15101C → `265 28% 9%` | #221A2D → `265 26% 14%` | #ECE6F0 → `285 26% 92%` | #B89FD9 → `265 41% 74%` | #E8BC60 → `42 76% 64%` | #B23A5E → `342 50% 46%` |
| crimson | #171010 → `0 19% 8%` | #241818 → `0 22% 12%` | #F0E6E0 → `24 41% 91%` | #D96363 → `0 65% 62%` | #E8B86F → `33 72% 67%` | #A33232 → `0 53% 42%` |
| mono | #000000 → `0 0% 0%` | #0E0E0E → `0 0% 5%` | #FFFFFF → `0 0% 100%` | #FFFFFF → `0 0% 100%` | #888888 → `0 0% 53%` | #444444 → `0 0% 27%` |

- [ ] **Step 1: Write presets**

```ts
// src/lib/branding/presets.ts
import type { Palette, PaletteId, FontPairing, FontPairingId } from './types';

export const PALETTES: Record<PaletteId, Palette> = {
  editorial: {
    ink:       '0 0% 8%',
    graphite:  '0 0% 12%',
    bone:      '42 23% 89%',
    aqua:      '184 41% 70%',
    honey:     '30 67% 63%',
    honeyDeep: '22 65% 47%',
  },
  slate: {
    ink:       '215 28% 9%',
    graphite:  '217 33% 17%',
    bone:      '214 32% 91%',
    aqua:      '199 89% 60%',
    honey:     '45 96% 56%',
    honeyDeep: '0 73% 50%',
  },
  forest: {
    ink:       '145 28% 9%',
    graphite:  '155 19% 13%',
    bone:      '78 24% 90%',
    aqua:      '131 24% 62%',
    honey:     '30 56% 59%',
    honeyDeep: '19 64% 44%',
  },
  plum: {
    ink:       '265 28% 9%',
    graphite:  '265 26% 14%',
    bone:      '285 26% 92%',
    aqua:      '265 41% 74%',
    honey:     '42 76% 64%',
    honeyDeep: '342 50% 46%',
  },
  crimson: {
    ink:       '0 19% 8%',
    graphite:  '0 22% 12%',
    bone:      '24 41% 91%',
    aqua:      '0 65% 62%',
    honey:     '33 72% 67%',
    honeyDeep: '0 53% 42%',
  },
  mono: {
    ink:       '0 0% 0%',
    graphite:  '0 0% 5%',
    bone:      '0 0% 100%',
    aqua:      '0 0% 100%',
    honey:     '0 0% 53%',
    honeyDeep: '0 0% 27%',
  },
};

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  editorial: {
    display: '"EB Garamond", Georgia, serif',
    body:    '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  modern: {
    display: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    body:    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  classic: {
    display: '"EB Garamond", Georgia, serif',
    body:    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  bold: {
    display: '"Anton", Impact, sans-serif',
    body:    '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
};

/** Human-readable labels for the Settings UI. */
export const PALETTE_LABELS: Record<PaletteId, string> = {
  editorial: 'Editorial',
  slate:     'Slate Pro',
  forest:    'Forest',
  plum:      'Plum',
  crimson:   'Crimson',
  mono:      'Mono',
};

export const FONT_PAIRING_LABELS: Record<FontPairingId, string> = {
  editorial: 'Editorial',
  modern:    'Modern Sans',
  classic:   'Classic',
  bold:      'Bold Display',
};
```

- [ ] **Step 2: Verify all presets have all six HSL keys**

Run: `node -e "const {PALETTES} = require('./src/lib/branding/presets.ts'); console.log('skip - ts')"` — TS so this won't work directly. Instead grep:

`grep -c "honeyDeep:" src/lib/branding/presets.ts`
Expected: 6.

`grep -c "ui:" src/lib/branding/presets.ts`
Expected: 4 (one per font pairing).

- [ ] **Step 3: Commit**

```bash
git add src/lib/branding/presets.ts
git commit -m "feat(branding): palette and font pairing presets"
```

---

## Task 5: `applyBranding()` runtime

**Files:**
- Create: `src/lib/branding/apply.ts`

- [ ] **Step 1: Write the apply function**

```ts
// src/lib/branding/apply.ts
import type { UserBranding } from './types';
import { PALETTES, FONT_PAIRINGS } from './presets';

/**
 * Mutates document.documentElement style + data attributes so the entire app
 * re-skins based on the user's branding. Safe to call multiple times.
 *
 * Existing role tokens in src/index.css (--background, --primary, etc.) already
 * route through --ink/--graphite/--bone/--aqua/--honey/--honey-deep, so
 * overriding those six is enough to re-skin the whole app.
 */
export function applyBranding(brand: UserBranding): void {
  if (typeof document === 'undefined') return; // SSR-safe no-op

  const root = document.documentElement;
  const palette = PALETTES[brand.palette];
  const fonts = FONT_PAIRINGS[brand.fontPairing];

  root.style.setProperty('--ink',         palette.ink);
  root.style.setProperty('--graphite',    palette.graphite);
  root.style.setProperty('--bone',        palette.bone);
  root.style.setProperty('--aqua',        palette.aqua);
  root.style.setProperty('--honey',       palette.honey);
  root.style.setProperty('--honey-deep',  palette.honeyDeep);

  // Derived neutrals — alias to bone so tints stay coherent.
  root.style.setProperty('--bone-muted',  palette.bone);
  root.style.setProperty('--bone-faint',  palette.bone);
  root.style.setProperty('--line',        palette.bone);

  root.style.setProperty('--font-display', fonts.display);
  root.style.setProperty('--font-body',    fonts.body);
  root.style.setProperty('--font-ui',      fonts.ui);

  root.setAttribute('data-brand-palette', brand.palette);
  root.setAttribute('data-brand-font',    brand.fontPairing);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "branding/apply" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/branding/apply.ts
git commit -m "feat(branding): applyBranding() CSS variable injection"
```

---

## Task 6: localStorage cache helpers

**Files:**
- Create: `src/lib/branding/storage.ts`

- [ ] **Step 1: Write helpers**

```ts
// src/lib/branding/storage.ts
import type { UserBranding } from './types';
import { LOCAL_STORAGE_KEY } from './types';

/** Synchronous read; safe in pre-mount hydration. Returns null if missing/corrupt. */
export function readCachedBranding(): UserBranding | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed
      && typeof parsed.palette === 'string'
      && typeof parsed.fontPairing === 'string'
    ) {
      return {
        palette:     parsed.palette,
        fontPairing: parsed.fontPairing,
        logoUrl:     parsed.logoUrl ?? null,
        logoAlt:     parsed.logoAlt ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedBranding(brand: UserBranding): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(brand));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function clearCachedBranding(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "branding/storage" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/branding/storage.ts
git commit -m "feat(branding): localStorage cache helpers"
```

---

## Task 7: Pre-mount sync hydration

**Files:**
- Create: `src/lib/branding/hydrate.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the hydration helper**

```ts
// src/lib/branding/hydrate.ts
import { applyBranding } from './apply';
import { readCachedBranding } from './storage';
import { EDITORIAL_DEFAULT } from './types';

/**
 * Synchronous, FOUC-prevention. Call this in main.tsx BEFORE createRoot().
 * Reads cached branding from localStorage (if any) and applies it instantly.
 * If no cache exists, applies the editorial default (no-op visually since
 * index.css already has those values).
 */
export function hydrateBrandingFromCache(): void {
  const cached = readCachedBranding();
  applyBranding(cached ?? EDITORIAL_DEFAULT);
}
```

- [ ] **Step 2: Wire it into `main.tsx`**

Replace the contents of `src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { hydrateBrandingFromCache } from './lib/branding/hydrate'

// Apply cached branding before React mounts to prevent flash of default theme.
hydrateBrandingFromCache();

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "hydrate|main.tsx" | head -5`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/branding/hydrate.ts src/main.tsx
git commit -m "feat(branding): pre-mount cache hydration"
```

---

## Task 8: BrandingContext + Provider + useBranding hook

**Files:**
- Create: `src/contexts/BrandingContext.tsx`
- Create: `src/hooks/useBranding.ts`

- [ ] **Step 1: Write the context + provider**

```tsx
// src/contexts/BrandingContext.tsx
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { applyBranding } from '@/lib/branding/apply';
import { writeCachedBranding, clearCachedBranding } from '@/lib/branding/storage';
import { EDITORIAL_DEFAULT, type UserBranding, type PaletteId, type FontPairingId } from '@/lib/branding/types';

interface BrandingContextValue {
  branding: UserBranding;
  isAvailable: boolean; // true if user is connecta_plus
  isLoading: boolean;
  setPalette: (id: PaletteId) => Promise<void>;
  setFontPairing: (id: FontPairingId) => Promise<void>;
  setLogo: (logoUrl: string | null, logoAlt?: string | null) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, isConnectaPlus } = useAuth();
  const [branding, setBranding] = useState<UserBranding>(EDITORIAL_DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch from DB once auth is hydrated. Only for connecta_plus users.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setBranding(EDITORIAL_DEFAULT);
      applyBranding(EDITORIAL_DEFAULT);
      clearCachedBranding();
      setIsLoading(false);
      return;
    }
    if (!isConnectaPlus) {
      // Plan downgrade or non-plus user — force defaults.
      setBranding(EDITORIAL_DEFAULT);
      applyBranding(EDITORIAL_DEFAULT);
      clearCachedBranding();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    supabase
      .from('user_branding')
      .select('palette, font_pairing, logo_url, logo_alt')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[branding] fetch failed, using defaults', error);
          setBranding(EDITORIAL_DEFAULT);
          applyBranding(EDITORIAL_DEFAULT);
          setIsLoading(false);
          return;
        }
        const next: UserBranding = data
          ? {
              palette:     data.palette as PaletteId,
              fontPairing: data.font_pairing as FontPairingId,
              logoUrl:     data.logo_url ?? null,
              logoAlt:     data.logo_alt ?? null,
            }
          : EDITORIAL_DEFAULT;
        setBranding(next);
        applyBranding(next);
        writeCachedBranding(next);
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id, isConnectaPlus]);

  // Multi-tab sync: another tab updated branding, mirror it here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'connecta_branding') return;
      if (!e.newValue) {
        setBranding(EDITORIAL_DEFAULT);
        applyBranding(EDITORIAL_DEFAULT);
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue) as UserBranding;
        setBranding(parsed);
        applyBranding(parsed);
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback(async (next: UserBranding) => {
    if (!user || !isConnectaPlus) return;
    setBranding(next);
    applyBranding(next);
    writeCachedBranding(next);
    const { error } = await supabase
      .from('user_branding')
      .upsert({
        user_id:      user.id,
        palette:      next.palette,
        font_pairing: next.fontPairing,
        logo_url:     next.logoUrl,
        logo_alt:     next.logoAlt,
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('[branding] persist failed', error);
      throw error;
    }
  }, [user, isConnectaPlus]);

  const setPalette = useCallback(
    (id: PaletteId) => persist({ ...branding, palette: id }),
    [branding, persist]
  );
  const setFontPairing = useCallback(
    (id: FontPairingId) => persist({ ...branding, fontPairing: id }),
    [branding, persist]
  );
  const setLogo = useCallback(
    (logoUrl: string | null, logoAlt: string | null = null) =>
      persist({ ...branding, logoUrl, logoAlt }),
    [branding, persist]
  );
  const resetToDefault = useCallback(
    () => persist(EDITORIAL_DEFAULT),
    [persist]
  );

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isAvailable: isConnectaPlus,
        isLoading,
        setPalette,
        setFontPairing,
        setLogo,
        resetToDefault,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBrandingContext(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBrandingContext must be used inside <BrandingProvider>');
  return ctx;
}
```

- [ ] **Step 2: Write the convenience hook**

```ts
// src/hooks/useBranding.ts
export { useBrandingContext as useBranding } from '@/contexts/BrandingContext';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "BrandingContext|useBranding" | head -5`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/BrandingContext.tsx src/hooks/useBranding.ts
git commit -m "feat(branding): React context + provider + useBranding hook"
```

---

## Task 9: Mount `<BrandingProvider>` in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read App.tsx provider stack**

Run: `grep -n "AuthProvider\|LeadNotificationProvider\|<.*Provider" src/App.tsx | head -10`
Expected: identify the line right after `<AuthProvider>` opens, so we can nest `<BrandingProvider>` inside it (we need `useAuth()` available).

- [ ] **Step 2: Add the import and wrap**

In `src/App.tsx`, add the import alongside the other provider imports:

```tsx
import { BrandingProvider } from "@/contexts/BrandingContext";
```

Then nest `<BrandingProvider>` immediately INSIDE `<AuthProvider>` and outside any provider that might read branding. Example transformation:

```tsx
<AuthProvider>
  <BrandingProvider>
    {/* existing children — LeadNotificationProvider, OutOfCreditsProvider, etc. */}
  </BrandingProvider>
</AuthProvider>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "App.tsx" | head -5`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(branding): mount BrandingProvider in App"
```

---

## Task 10: `<BrandLogo />` component

**Files:**
- Create: `src/components/branding/BrandLogo.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/branding/BrandLogo.tsx
import { useState } from 'react';
import { useBranding } from '@/hooks/useBranding';

interface Props {
  /** Override the default "Connecta" wordmark text when no logo URL is set. */
  fallbackText?: string;
  className?: string;
}

/**
 * Renders the user's uploaded sidebar logo if present, otherwise the
 * Connecta wordmark. Falls back to the wordmark on image load error so
 * deleted / 404 logo URLs don't blank out the sidebar.
 */
export default function BrandLogo({ fallbackText = 'Connecta', className }: Props) {
  const { branding } = useBranding();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = branding.logoUrl && !imgFailed;

  if (showImage) {
    return (
      <img
        src={branding.logoUrl!}
        alt={branding.logoAlt || fallbackText}
        onError={() => setImgFailed(true)}
        className={className ?? 'h-7 w-auto object-contain'}
      />
    );
  }
  return (
    <span
      className={className ?? 'font-wordmark text-xl text-foreground'}
      style={{ letterSpacing: '-0.022em', fontWeight: 700 }}
    >
      {fallbackText}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "BrandLogo" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/branding/BrandLogo.tsx
git commit -m "feat(branding): BrandLogo component with wordmark fallback"
```

---

## Task 11: Swap sidebar wordmark for `<BrandLogo />`

**Files:**
- Modify: `src/components/DashboardSidebar.tsx`

- [ ] **Step 1: Remove the dead `connectaTextLogo` import**

Delete line 37: `import connectaTextLogo from "@/assets/connecta-logo-new.png";`

- [ ] **Step 2: Add the BrandLogo import**

Add near the other component imports:

```tsx
import BrandLogo from "@/components/branding/BrandLogo";
```

- [ ] **Step 3: Replace the inline wordmark `<span>`**

In `src/components/DashboardSidebar.tsx` around lines 459-466, replace:

```tsx
<button onClick={() => navigate("/")} className="focus:outline-none">
  <span
    className="font-wordmark text-xl text-foreground hover:opacity-80 transition-opacity"
    style={{ letterSpacing: "-0.022em", fontWeight: 700 }}
  >
    Connecta
  </span>
</button>
```

with:

```tsx
<button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
  <BrandLogo />
</button>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "DashboardSidebar" | head -5`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(branding): sidebar uses BrandLogo instead of hardcoded wordmark"
```

---

## Task 12: Tailwind config — font families via CSS vars + wordmark class update

**Files:**
- Modify: `tailwind.config.ts:21-25`
- Modify: `src/index.css:159-163`

- [ ] **Step 1: Update `tailwind.config.ts` font families**

Replace lines 21-25:

```ts
fontFamily: {
  sans:  ['Figtree', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
  serif: ['"EB Garamond"', 'Georgia', 'serif'],
  mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
},
```

with:

```ts
fontFamily: {
  // sans/serif read the live --font-body / --font-display CSS vars so
  // every existing font-sans / font-serif utility picks up the user's
  // selected pairing automatically. Fallbacks remain hard-coded behind
  // the var() for safety if the var isn't yet set.
  sans:  ['var(--font-body, Figtree)',  '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
  serif: ['var(--font-display, "EB Garamond")', 'Georgia', 'serif'],
  mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
},
```

- [ ] **Step 2: Update `.font-wordmark` in `src/index.css`**

Replace lines 159-163:

```css
.font-wordmark {
  font-family: 'EB Garamond', Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.04em;
}
```

with:

```css
.font-wordmark {
  font-family: var(--font-display, 'EB Garamond'), Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 3: Type-check + build sanity**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "tailwind" | head -5`
Expected: no errors (tailwind config isn't checked by app tsconfig — that's fine, just ensure nothing else broke).

Then run: `npm run lint 2>&1 | tail -10`
Expected: no new lint errors introduced.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts src/index.css
git commit -m "feat(branding): tailwind + wordmark read font from CSS vars"
```

---

## Task 13: `PalettePicker` component

**Files:**
- Create: `src/components/settings/PalettePicker.tsx`

- [ ] **Step 1: Write the picker**

```tsx
// src/components/settings/PalettePicker.tsx
import { useBranding } from '@/hooks/useBranding';
import { PALETTES, PALETTE_LABELS } from '@/lib/branding/presets';
import type { PaletteId } from '@/lib/branding/types';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

const ORDER: PaletteId[] = ['editorial', 'slate', 'forest', 'plum', 'crimson', 'mono'];

export default function PalettePicker() {
  const { branding, setPalette } = useBranding();

  const handlePick = async (id: PaletteId) => {
    try {
      await setPalette(id);
      toast.success(`Palette: ${PALETTE_LABELS[id]}`);
    } catch {
      toast.error('Failed to save palette');
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Color palette</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ORDER.map((id) => {
          const p = PALETTES[id];
          const isSelected = branding.palette === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePick(id)}
              className={`relative rounded-xl border overflow-hidden text-left transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/40'
                  : 'border-border hover:border-foreground/30'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select ${PALETTE_LABELS[id]} palette`}
            >
              <div className="flex h-20">
                <div className="w-1/4" style={{ background: `hsl(${p.ink})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.graphite})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.aqua})` }} />
                <div className="w-1/4" style={{ background: `hsl(${p.honey})` }} />
              </div>
              <div className="px-3 py-2 bg-card text-card-foreground flex items-center justify-between">
                <span className="text-xs font-medium">{PALETTE_LABELS[id]}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "PalettePicker" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PalettePicker.tsx
git commit -m "feat(branding): PalettePicker component"
```

---

## Task 14: `FontPicker` component

**Files:**
- Create: `src/components/settings/FontPicker.tsx`

- [ ] **Step 1: Write the picker**

```tsx
// src/components/settings/FontPicker.tsx
import { useBranding } from '@/hooks/useBranding';
import { FONT_PAIRINGS, FONT_PAIRING_LABELS } from '@/lib/branding/presets';
import type { FontPairingId } from '@/lib/branding/types';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

const ORDER: FontPairingId[] = ['editorial', 'modern', 'classic', 'bold'];

export default function FontPicker() {
  const { branding, setFontPairing } = useBranding();

  const handlePick = async (id: FontPairingId) => {
    try {
      await setFontPairing(id);
      toast.success(`Font: ${FONT_PAIRING_LABELS[id]}`);
    } catch {
      toast.error('Failed to save font');
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Font pairing</h3>
      <div className="grid grid-cols-2 gap-3">
        {ORDER.map((id) => {
          const fp = FONT_PAIRINGS[id];
          const isSelected = branding.fontPairing === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePick(id)}
              className={`relative rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/40 bg-card'
                  : 'border-border hover:border-foreground/30 bg-card/50'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select ${FONT_PAIRING_LABELS[id]} font pairing`}
            >
              <div className="text-2xl mb-1" style={{ fontFamily: fp.display, fontWeight: id === 'bold' ? 400 : 600 }}>
                Aa
              </div>
              <div className="text-xs opacity-70 mb-2" style={{ fontFamily: fp.body }}>
                The quick brown fox
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ fontFamily: fp.ui }}>
                  {FONT_PAIRING_LABELS[id]}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "FontPicker" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/FontPicker.tsx
git commit -m "feat(branding): FontPicker component"
```

---

## Task 15: `LogoUploader` component

**Files:**
- Create: `src/components/settings/LogoUploader.tsx`

- [ ] **Step 1: Write the uploader**

```tsx
// src/components/settings/LogoUploader.tsx
import { useRef, useState } from 'react';
import { useBranding } from '@/hooks/useBranding';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MAX_BYTES = 1_048_576; // 1 MB
const ALLOWED_TYPES = ['image/png', 'image/svg+xml'];

export default function LogoUploader() {
  const { user } = useAuth();
  const { branding, setLogo } = useBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!user) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Logo must be a PNG or SVG');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Logo must be under 1MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === 'image/svg+xml' ? 'svg' : 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from('branding-logos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from('branding-logos').getPublicUrl(path);
      const publicUrl = data.publicUrl;

      // Best-effort cleanup of any prior logo for this user.
      if (branding.logoUrl) {
        const prior = extractStoragePath(branding.logoUrl);
        if (prior) {
          await supabase.storage.from('branding-logos').remove([prior]).catch(() => {});
        }
      }

      await setLogo(publicUrl, file.name);
      toast.success('Logo uploaded');
    } catch (e: any) {
      console.error('[branding] upload failed', e);
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (branding.logoUrl) {
      const prior = extractStoragePath(branding.logoUrl);
      if (prior) {
        await supabase.storage.from('branding-logos').remove([prior]).catch(() => {});
      }
    }
    await setLogo(null, null);
    toast.success('Logo removed');
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3">Sidebar logo</h3>
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
        <div className="w-32 h-16 rounded-lg bg-background border border-border flex items-center justify-center overflow-hidden">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.logoAlt || 'Logo preview'} className="max-h-12 max-w-28 object-contain" />
          ) : (
            <span className="font-wordmark text-base text-foreground" style={{ letterSpacing: '-0.022em', fontWeight: 700 }}>Connecta</span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">PNG or SVG, max 1MB. Transparent background recommended.</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
              {branding.logoUrl ? 'Replace' : 'Upload'}
            </Button>
            {branding.logoUrl && (
              <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      </div>
    </div>
  );
}

/** Extract storage path (e.g. "{uid}/logo-{ts}.png") from a public URL. */
function extractStoragePath(publicUrl: string): string | null {
  const marker = '/branding-logos/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "LogoUploader" | head -5`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/LogoUploader.tsx
git commit -m "feat(branding): LogoUploader with size/type validation"
```

---

## Task 16: `BrandingSection` composer + Settings page mount

**Files:**
- Create: `src/components/settings/BrandingSection.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Write the section composer**

```tsx
// src/components/settings/BrandingSection.tsx
import { useBranding } from '@/hooks/useBranding';
import PalettePicker from './PalettePicker';
import FontPicker from './FontPicker';
import LogoUploader from './LogoUploader';
import { Button } from '@/components/ui/button';
import { RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Settings section for connecta_plus users to customize palette, font, and logo.
 * Returns null for non-plus users so the parent page can render it unconditionally.
 */
export default function BrandingSection() {
  const { isAvailable, isLoading, resetToDefault } = useBranding();

  if (!isAvailable) return null;

  const handleReset = async () => {
    try {
      await resetToDefault();
      toast.success('Branding reset to default');
    } catch {
      toast.error('Failed to reset');
    }
  };

  return (
    <section className="space-y-6 pt-6 mt-6 border-t border-border">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-foreground">Branding</h2>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              <Sparkles className="w-3 h-3" />
              Connecta Plus
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Customize how Connecta looks when you're logged in. Changes save automatically.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={handleReset} disabled={isLoading}>
          <RotateCcw className="w-3.5 h-3.5 mr-2" />
          Reset
        </Button>
      </div>

      <PalettePicker />
      <FontPicker />
      <LogoUploader />
    </section>
  );
}
```

- [ ] **Step 2: Mount in Settings.tsx**

Read `src/pages/Settings.tsx` to find a sensible insertion point — at the bottom of the main settings form, before the danger zone (delete account section). Add the import:

```tsx
import BrandingSection from "@/components/settings/BrandingSection";
```

And render `<BrandingSection />` near the bottom of the page body, above any "Delete account" / danger-zone block. Example placement:

```tsx
{/* ... existing settings sections ... */}

<BrandingSection />

{/* Danger zone / delete account follows */}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "BrandingSection|Settings.tsx" | head -5`
Expected: no errors.

Run: `npm run lint 2>&1 | tail -5`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/BrandingSection.tsx src/pages/Settings.tsx
git commit -m "feat(branding): mount BrandingSection in Settings page"
```

---

## Task 17: Clear branding cache on sign-out

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Locate the sign-out handler**

Run: `grep -n "signOut\|signout\|supabase.auth.signOut" src/contexts/AuthContext.tsx | head -10`
Identify the function or block that runs on sign-out.

- [ ] **Step 2: Add the cache clear**

Import at the top of `src/contexts/AuthContext.tsx`:

```tsx
import { clearCachedBranding } from "@/lib/branding/storage";
```

Inside the `signOut` function (before/after the `supabase.auth.signOut()` call — either is fine, just ensure it always runs):

```tsx
clearCachedBranding();
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "AuthContext" | head -5`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(branding): clear branding cache on sign-out"
```

---

## Task 18: Build + lint sanity sweep

- [ ] **Step 1: Run full type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | tail -20`
Expected: zero errors. If errors exist, fix them before continuing.

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -20`
Expected: zero new errors introduced by branding files. Pre-existing repo-wide warnings are out of scope — only fix things in files this plan touched.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -30`
Expected: successful build. If the build fails, fix the offending file before committing.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git status
# if there are fixup changes:
git add -p
git commit -m "fix(branding): build/lint cleanup"
```

If clean, no commit needed.

---

## Task 19: Manual smoke test

**Note:** Apply the two migrations (Tasks 1 & 2) to your Supabase project BEFORE running the dev server, otherwise the fetch in `BrandingProvider` will 404.

Use the Supabase CLI or SQL editor:

```bash
supabase db push
```

OR copy-paste both migration files into the Supabase Studio SQL editor.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Open: `http://localhost:5173/` (or whatever Vite reports)

- [ ] **Step 2: Smoke checklist (sign in as a `connecta_plus` user)**

- [ ] Navigate to `/settings`. The Branding section is visible at the bottom.
- [ ] Click a palette tile (e.g., Plum). The whole app re-skins live. Toast confirms save.
- [ ] Click a different font pairing (e.g., Bold Display). Headings update everywhere. Toast confirms save.
- [ ] Upload a PNG logo (transparent, < 1MB). Sidebar wordmark replaced. Toast confirms.
- [ ] Refresh the page. Branding persists (no flash of default theme).
- [ ] Open the same app in a second browser tab. Change palette in tab 1. Tab 2 re-skins.
- [ ] Sign out. Sign in as a non-plus user. Branding section is NOT visible. UI shows editorial defaults.
- [ ] Sign back in as the plus user. Branding restored.
- [ ] Click "Reset" in Branding section. Palette + font + logo revert to editorial defaults.
- [ ] Try uploading a 2MB image: rejected with toast. Try uploading a `.jpg`: rejected with toast.

- [ ] **Step 3: Manual test report**

If anything fails the checklist, surface the failure and fix before moving to push.

---

## Task 20: Push to main

- [ ] **Step 1: Review the branch's commits**

Run: `git log --oneline origin/main..HEAD`
Expected: every commit is branding-related, no unrelated changes.

- [ ] **Step 2: Push the branch**

Run: `git push -u origin worktree-connecta-plus-branding`

- [ ] **Step 3: Either open a PR or merge directly**

- If the project uses PRs (check recent merges): `gh pr create --title "feat: per-user branding for Connecta Plus" --body ...`
- If push-to-main is the norm (CI/CD auto-deploys per memory): merge locally and push to main:
  ```bash
  git checkout main
  git pull
  git merge --no-ff worktree-connecta-plus-branding
  git push origin main
  ```

The user prefers shipping by push to main per their memory note. Confirm with them before pushing if uncertain.

---

## Self-review notes

- **Spec coverage:** Each spec section maps to tasks. Data model → Tasks 1-2. Presets → Tasks 3-4. Runtime → Tasks 5-9. Sidebar swap → Task 11. Settings UI → Tasks 13-16. Plan gating handled in Task 8 (BrandingProvider reads `isConnectaPlus`). Edge cases (stale logo URL, downgrade, multi-tab, sign-out cleanup) covered in Tasks 10, 8, 8, 17.
- **No placeholders:** Every code block is complete.
- **Type consistency:** `UserBranding` fields (palette / fontPairing / logoUrl / logoAlt) used identically across types.ts, context, components.
- **Test substitute:** No test framework in repo — using `tsc --noEmit`, `lint`, `build`, and a manual smoke checklist as verification.
