# Per-user Branding for Connecta Plus

**Date:** 2026-05-25
**Status:** Design approved, ready for implementation planning
**Gate:** `connecta_plus` role (already exists)

## Purpose

Let Connecta Plus users customize the app's appearance — color palette, font pairing, and sidebar logo — so that when they log in they see a UI branded for their own business. Branding is **per-user** (tied to the logged-in session), not per-managed-client.

**Example:** `drcalvinsclinic@gmail.com` logs in and sees the Plum palette, EB Garamond headings, and a "Dr Calvin's Clinic" wordmark in the sidebar. Admin `robertogaunaj@gmail.com` logs in to the same app and sees the default Editorial palette with the standard "connecta" wordmark.

## Scope

**In v1:**

- 6 curated dark-mode color palettes (Editorial, Slate, Forest, Plum, Crimson, Mono)
- 4 curated font pairings (Editorial, Modern Sans, Classic, Bold Display) — all using fonts already loaded by the app
- Custom sidebar logo upload (single transparent PNG or SVG, max 1MB)
- Settings UI in `/settings` with live preview
- Auto-save on change

**Out of scope (parked for v2):**

- Light-mode palette variants
- Favicon customization
- Login / auth page branding (would require pre-auth brand resolution)
- Email template branding
- Custom subdomains
- Per-client (vs per-user) branding

## Architecture

### Data model

New table `user_branding`:

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | PK, FK to `auth.users(id)`, `ON DELETE CASCADE` |
| `palette` | `text` | Not null, default `'editorial'`. Enum: `editorial \| slate \| forest \| plum \| crimson \| mono` (enforced via CHECK constraint) |
| `font_pairing` | `text` | Not null, default `'editorial'`. Enum: `editorial \| modern \| classic \| bold` (CHECK constraint) |
| `logo_url` | `text` | Nullable. Supabase Storage public URL. Null means fall back to the default `connecta` wordmark. |
| `logo_alt` | `text` | Nullable. Accessibility label. Falls back to user's display name. |
| `updated_at` | `timestamptz` | `default now()`, auto-updated via trigger |

**RLS policies on `user_branding`:**

- `SELECT` — user can read their own row; admins (`is_admin()` helper) can read any row for support.
- `INSERT` / `UPDATE` — user can only mutate their own row (`user_id = auth.uid()`).
- `DELETE` — not granted to clients. Cascade from `auth.users` deletion handles cleanup.

**Storage bucket `branding-logos`:**

- Public-read, authenticated-write.
- Path convention: `{user_id}/logo-{unix_timestamp}.{ext}` — the timestamp suffix invalidates CDN cache after replacement.
- Storage policy: file size `< 1048576` bytes (1MB).
- Accepted MIME types: `image/png`, `image/svg+xml`.

### Presets (static data)

A new file `src/lib/branding/presets.ts` defines all palettes and font pairings as TypeScript constants. No DB rows for the presets themselves — they live in code so they're versioned with the app.

**Palette shape** — HSL triplets matching the existing `src/index.css` token names:

```ts
type Palette = {
  ink: string;        // page background
  graphite: string;   // card / surface
  bone: string;       // foreground text
  aqua: string;       // primary
  honey: string;      // accent
  honeyDeep: string;  // destructive
};

export const PALETTES: Record<PaletteId, Palette> = {
  editorial: { ink: '0 0% 8%', graphite: '0 0% 12%', bone: '42 23% 89%', aqua: '184 41% 70%', honey: '30 67% 63%', honeyDeep: '22 65% 47%' },
  slate:     { /* navy + sky blue + amber */ },
  forest:    { /* dark green + sage + ochre */ },
  plum:      { /* dark purple + lavender + gold */ },
  crimson:   { /* dark + crimson + warm cream */ },
  mono:      { /* pure black + white */ },
};
```

> Only `editorial` shows full HSL triplets above. The remaining five are summarized by intent; concrete HSL values will be derived from the brainstorming mockups (`.superpowers/brainstorm/.../palettes.html`) during implementation. The mockup's hex values are the source of truth — convert each to HSL when populating `presets.ts`.

**Font pairing shape:**

```ts
type FontPairing = {
  display: string;  // headings (e.g. h1, h2)
  body: string;     // paragraph copy
  ui: string;       // buttons, labels, nav
};

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  editorial: { display: '"EB Garamond", serif', body: '"Figtree", sans-serif', ui: '"Inter", sans-serif' },
  modern:    { display: '"Inter", sans-serif',  body: '"Inter", sans-serif',  ui: '"Inter", sans-serif' },
  classic:   { display: '"EB Garamond", serif', body: '"Inter", sans-serif',  ui: '"Inter", sans-serif' },
  bold:      { display: '"Anton", sans-serif',   body: '"Figtree", sans-serif', ui: '"Inter", sans-serif' },
};
```

### Theming runtime

**`applyBranding(brand)` in `src/lib/branding/apply.ts`** — one pure function that mutates `document.documentElement.style`:

1. Sets palette HSL triplets on `:root` (e.g. `--ink`, `--graphite`, `--bone`, `--aqua`, `--honey`, `--honey-deep`). The existing role tokens (`--background`, `--primary`, `--card`, etc.) already route through these, so the entire app re-skins from this single call.
2. Sets font CSS vars: `--font-display`, `--font-body`, `--font-ui`.
3. Writes a `[data-brand-palette="forest"]` attribute on `<html>` for any palette-specific tweaks that can't be expressed as variables.

**Tailwind config update** — `tailwind.config.ts` currently has `serif: ['"EB Garamond"', 'serif']` etc. Change these to read from the new CSS vars so existing utility classes (`font-serif`, `font-sans`) automatically pick up the active pairing.

**Hydration order (prevents FOUC):**

1. **Synchronous, before React mounts** (`src/main.tsx`): read `localStorage.connecta_branding` (JSON: `{ palette, font_pairing, logo_url }`), call `applyBranding()` immediately. This means returning users see their brand on the very first paint.
2. **After auth hydrates** (inside an effect in `AuthContext` or a dedicated `BrandingProvider`): if `isConnectaPlus`, fetch the user's `user_branding` row, call `applyBranding()` again with fresh data, persist to localStorage.
3. **On role change away from `connecta_plus`**: call `applyBranding(EDITORIAL_DEFAULT)` and clear localStorage. Branding row is NOT deleted — it's preserved for re-upgrade.

**`useBranding()` hook** (`src/hooks/useBranding.ts`): returns `{ branding, updateBranding, isLoading, isAvailable }`. Backed by a small React context store so the Settings UI and the sidebar logo stay in sync without prop drilling.

**`<BrandLogo />` component** (`src/components/branding/BrandLogo.tsx`): reads `useBranding().branding.logo_url`. If set, renders `<img src={logo_url} alt={logo_alt} />` with `onError` fallback to the default wordmark. If null, renders the existing `connectaTextLogo` import. Replaces the hardcoded `<img src={connectaTextLogo} />` at `src/components/DashboardSidebar.tsx:37`.

### Settings UI

New "Branding" section added to `src/pages/Settings.tsx`, rendered only when `isConnectaPlus` is true. Sections, in order:

1. **Header** — Title "Branding" + subtitle "Customize how Connecta looks when you're logged in." Small "Connecta Plus" badge.
2. **Palette picker** — Six tiles in a 3-column grid. Each tile is a mini sidebar-and-content preview (same visual idiom as the brainstorming mockup). Selected tile gets an outline + checkmark. Click commits the change immediately (live preview).
3. **Font picker** — Four tiles each showing "Aa" + a representative heading + the family name. Same live-preview behavior.
4. **Logo upload** — Dropzone showing the current logo on a dark surface. "Replace" and "Remove" buttons. Client-side validates MIME (`image/png` or `image/svg+xml`) and size (< 1MB) before uploading to `branding-logos` storage bucket; storage policy enforces the same limit server-side.
5. **Reset to default** — Button at the bottom; clears the row back to editorial defaults and removes the uploaded logo file.

**Save model:** auto-save, debounced 400ms. No "Save" / "Cancel" buttons — the live preview already commits visually, and the toast on each save confirms persistence.

## Plan gating & edge cases

- **Single gate**: `isConnectaPlus` from `AuthContext`. If false, the Branding section in Settings is not rendered, and the user's branding (if any) is not applied — they see the default Editorial theme.
- **Downgrade behavior**: When a user's role changes away from `connecta_plus`, the existing `useAuth()` role-change effect (or its caller in `BrandingProvider`) calls `applyBranding(EDITORIAL_DEFAULT)` and clears `localStorage.connecta_branding`. This happens on the next role hydration — typically within seconds of the role change taking effect, or on the next page load. The `user_branding` row is **preserved** so re-upgrade restores their branding without re-uploading the logo.
- **Stale logo URL** (deleted asset, 404): `<BrandLogo onError>` falls back to the connecta wordmark; we log a warning client-side but don't block the UI.
- **First paint without localStorage**: User sees Editorial defaults briefly until auth + branding fetch completes, then re-skins. Tradeoff accepted for v1 — eliminating this would require server-rendered brand resolution.
- **Multi-tab sync**: `applyBranding` re-runs on the `storage` event so a change in tab A propagates to tab B without reload.
- **Non-Plus user signs in on a shared device after a Plus user**: localStorage may still hold the Plus user's branding. Solution: clear `connecta_branding` from localStorage as part of the existing sign-out flow.

## Testing

- **Unit** (`src/lib/branding/__tests__/apply.test.ts`): `applyBranding()` sets expected CSS variables on the `:root` element for each preset.
- **Unit** (`src/lib/branding/__tests__/presets.test.ts`): every palette has all six HSL keys; every font pairing has display/body/ui; all IDs are unique.
- **Integration** (manual or Playwright if a test harness exists): log in as a `connecta_plus` user, change palette in Settings, navigate to `/dashboard`, `/clients`, `/scripts`, `/canvas` — confirm palette and logo persist on every surface.
- **Manual regression**: downgrade role mid-session → UI reverts on next auth refresh. Re-upgrade → branding returns. Upload non-image → rejected. Upload > 1MB → rejected (both client and server enforce). Delete uploaded logo → wordmark fallback renders.

## File touch list (preview, not authoritative)

- `supabase/migrations/{date}_user_branding.sql` — new
- `supabase/migrations/{date}_branding_logos_bucket.sql` — new
- `src/lib/branding/presets.ts` — new
- `src/lib/branding/apply.ts` — new
- `src/lib/branding/types.ts` — new
- `src/hooks/useBranding.ts` — new
- `src/contexts/BrandingProvider.tsx` — new (or merge into `AuthContext`)
- `src/components/branding/BrandLogo.tsx` — new
- `src/components/settings/BrandingSection.tsx` — new
- `src/main.tsx` — modify (sync pre-mount hydration)
- `src/components/DashboardSidebar.tsx` — modify (swap `<img src={connectaTextLogo}>` for `<BrandLogo />`)
- `src/pages/Settings.tsx` — modify (mount `<BrandingSection>` when `isConnectaPlus`)
- `tailwind.config.ts` — modify (font families read from CSS vars)
- `src/index.css` — possibly modify (ensure palette vars are the source-of-truth, no overrides)

## Open questions

None remaining as of brainstorming — all major decisions captured above. Implementation planning may surface implementation-level questions (e.g., should `BrandingProvider` be a separate context or part of `AuthContext`); those are tactical and not scope-changing.
