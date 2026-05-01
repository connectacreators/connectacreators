# ConnectaCreators — Ocean Surge × iPhone 17 Glass Rebrand

**Date:** 2026-03-15
**Scope:** Full app — landing pages, dashboard, all components
**Status:** Approved by user

---

## Context

ConnectaCreators currently uses a warm cream/gold (`#ede8d0`) accent on dark `#212121` backgrounds with iOS-style glassmorphism. This system projects a luxury/corporate feeling that does not resonate with the primary users: **content creators and social media agencies**.

Competitors Opus.pro and Spotter Studio have set a high visual bar — dark, AI-native, vibrant color accents, sharp typography. The current brand does not compete aesthetically.

The rebrand adopts the **Ocean Surge × iPhone 17 Glass** direction:
- **Cyan** (`#0891B2`) + **Lime** (`#84CC16`) dual-accent on deep `#06090c` black
- Consistent iPhone 17-style glassmorphism (3 glass tiers)
- **Inter** throughout (replacing Arial/Helvetica fallback and activating the already-loaded font)
- **Lucide React** icons at `#94a3b8` inactive / `#22d3ee` active (never emoji, never black-on-dark)
- Gradient runs cyan→lime on primary CTAs, logo, active states, and headline accents

---

## 1. Design Tokens — CSS Variables (`src/index.css`)

Replace the current HSL variable system with the Ocean Surge palette. All component colors derive from these tokens.

### Dark mode (default)

```css
:root {
  /* Backgrounds */
  --background:        6 12% 5%;      /* #06090c — near black */
  --card:              0 0% 7%;       /* #111115 — card surface */
  --sidebar-bg:        195 91% 3%;    /* #040f12 — sidebar base */
  --popover:           0 0% 7%;

  /* Brand accents */
  --primary:           197 91% 37%;   /* #0891B2 — cyan */
  --primary-light:     187 100% 42%;  /* #06B6D4 — cyan light */
  --primary-dark:      199 100% 27%;  /* #0369A1 — cyan dark */
  --accent:            84 68% 45%;    /* #84CC16 — lime */
  --accent-light:      77 65% 53%;    /* #a3e635 — lime light */

  /* Text */
  --foreground:        213 31% 91%;   /* #e2e8f0 */
  --muted-foreground:  215 20% 45%;   /* #64748b */
  --subtle:            215 16% 57%;   /* #94a3b8 — icon inactive */

  /* Surfaces */
  --muted:             0 0% 10%;      /* #1a1a1a */
  --border:            197 30% 12%;   /* rgba cyan-tinted border */
  --input:             0 0% 10%;

  /* Semantic */
  --destructive:       0 84% 60%;
  --ring:              197 91% 37%;   /* cyan focus ring */

  /* Radius */
  --radius: 0.75rem;

  /* Glass blur levels */
  --blur-sidebar:      72px;
  --blur-card:         24px;
  --blur-input:        12px;
  --blur-topbar:       20px;

  /* Gradient */
  --gradient-brand:    linear-gradient(135deg, #0891B2, #84CC16);
  --gradient-hero:     linear-gradient(135deg, #06B6D4, #a3e635);

  /* Ambient glow */
  --glow-cyan:         rgba(8, 145, 178, 0.12);
  --glow-lime:         rgba(132, 204, 22, 0.06);
}
```

### Light mode

```css
.light {
  --background:        210 20% 96%;   /* #f0f4f8 */
  --card:              0 0% 100%;
  --foreground:        215 28% 12%;   /* #1a2332 */
  --muted-foreground:  215 16% 47%;
  --subtle:            215 14% 60%;
  --primary:           197 91% 37%;   /* same cyan — readable on white */
  --accent:            84 68% 38%;    /* slightly deeper lime for white bg */
  --border:            210 20% 88%;
  --muted:             210 20% 94%;
  --input:             0 0% 100%;
}
```

---

## 2. Glass Class System (`src/index.css`)

Three tiers matching iPhone 17 frosted-glass hierarchy. Replace existing `.glass-*` classes.

### Tier 1 — Sidebar (strongest)
```css
.glass-sidebar {
  background: rgba(8, 145, 178, 0.04);
  backdrop-filter: blur(72px) saturate(180%) brightness(1.04);
  -webkit-backdrop-filter: blur(72px) saturate(180%) brightness(1.04);
  border-right: 1px solid rgba(8, 145, 178, 0.12);
}
.glass-sidebar::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 50%;
  background: linear-gradient(180deg, rgba(8, 145, 178, 0.08) 0%, transparent 100%);
  pointer-events: none;
}
```

### Tier 2 — Cards / Panels (standard)

> **Note:** Any element applying `.glass-card` must have `position: relative` so the `::before` specular highlight is clipped correctly within the card boundary. Audit all card parents during implementation.

```css
.glass-card {
  background: rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 20px rgba(0,0,0,0.3);
  position: relative; /* required for ::before highlight */
}
/* Specular highlight */
.glass-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 40%;
  background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%);
  pointer-events: none; border-radius: inherit;
}

/* Tinted variants */
.glass-card-cyan {
  background: rgba(8, 145, 178, 0.07);
  border-color: rgba(8, 145, 178, 0.2);
  box-shadow: inset 0 1px 0 rgba(8, 145, 178, 0.15), 0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(8,145,178,0.06);
}
.glass-card-lime {
  background: rgba(132, 204, 22, 0.06);
  border-color: rgba(132, 204, 22, 0.18);
  box-shadow: inset 0 1px 0 rgba(132, 204, 22, 0.12), 0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(132,204,22,0.05);
}
```

### Tier 3 — Inputs / Topbar (lightest)
```css
.glass-input-surface {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(8, 145, 178, 0.18);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
}
.glass-topbar {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(8, 145, 178, 0.12);
}
/* Gradient highlight line along top edge */
.glass-topbar::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(8,145,178,0.4), rgba(132,204,22,0.2), transparent);
}
```

### Ambient background glow
```css
.ambient-glow {
  background:
    radial-gradient(ellipse at 20% 0%, rgba(8,145,178,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(132,204,22,0.06) 0%, transparent 50%);
}
```

---

## 3. Typography

**Font:** Inter (already loaded via Google Fonts in `index.html`). Activate it in Tailwind config.

```js
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
}
```

**Scale used across components:**

| Role | Weight | Size | Color |
|------|--------|------|-------|
| Hero headline | 800 | 2xl–4xl | `#fff` with gradient span |
| Section heading | 700 | lg | `#e2e8f0` |
| Card value | 800 | xl | `#f1f5f9` |
| Card label | 700 | 9px, uppercase, 1px tracking | `#64748b` |
| Body text | 400 | sm | `#64748b` |
| Overline / section label | 700 | 10px, uppercase, 1.5px tracking | `#0891B2` |
| Navigation label | 600 | xs | `#94a3b8` |

**Gradient text** (hero headlines, "viral" emphasis):
```css
.text-gradient {
  background: linear-gradient(135deg, #06B6D4, #84CC16);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## 4. Icon Treatment

Library: **Lucide React** (already installed). No emojis anywhere in the UI.

| State | Color | Token |
|-------|-------|-------|
| Inactive nav icon | `#94a3b8` | `--subtle` |
| Active nav icon | `#22d3ee` | `--primary-light` |
| Cyan card icon | `#0891B2` | `--primary` |
| Lime card icon | `#84CC16` | `--accent` |
| Neutral card icon | `#94a3b8` | `--subtle` |
| Input prefix icon | `#94a3b8` | `--subtle` |
| Button icon | inherits button text color | — |

**Stroke width:** `1.75` for nav/cards, `2` for small badge icons.

---

## 5. Button System

```css
/* Primary — gradient cyan→lime */
.btn-primary {
  background: linear-gradient(135deg, #0891B2, #84CC16);
  color: #fff;
  box-shadow: 0 4px 20px rgba(8,145,178,0.35), inset 0 1px 0 rgba(255,255,255,0.15);
}
/* Specular gloss on all buttons */
.btn::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%);
}

/* Secondary — cyan glass */
.btn-secondary {
  background: rgba(8, 145, 178, 0.1);
  border: 1px solid rgba(8, 145, 178, 0.25);
  color: #22d3ee;
}

/* Accent — lime glass */
.btn-accent {
  background: rgba(132, 204, 22, 0.1);
  border: 1px solid rgba(132, 204, 22, 0.25);
  color: #a3e635;
}

/* Ghost — neutral */
.btn-ghost {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
```

---

## 6. Status Badges / Pills

```css
.badge-cyan    { background: rgba(8,145,178,0.15);   color: #22d3ee; border: 1px solid rgba(8,145,178,0.25); }
.badge-lime    { background: rgba(132,204,22,0.12);  color: #a3e635; border: 1px solid rgba(132,204,22,0.25); }
.badge-amber   { background: rgba(245,158,11,0.10);  color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
.badge-neutral { background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.08); }
```

Used for: script status, lead status, video status, subscription tier labels, viral score chips.

---

## 7. Component Changes

### `src/components/DashboardSidebar.tsx`
- Apply `.glass-sidebar` class + `::before` gloss strip
- Nav button inactive: `text-[#94a3b8]`, active: `text-[#22d3ee] bg-[rgba(8,145,178,0.2)] border-[rgba(8,145,178,0.35)]`
- Active glow: `shadow-[0_0_16px_rgba(8,145,178,0.3)]`
- Logo mark: gradient `from-[#0891B2] to-[#84CC16]`

### `src/components/DashboardTopBar.tsx`
- Apply `.glass-topbar` with gradient highlight line
- Topbar icon: `text-[#0891B2]`

### Cards (all pages using shadcn `<Card>`)
- Default: `.glass-card` (neutral frosted)
- Metric/stat cards: `.glass-card-cyan` for primary volume metrics (scripts, clients, leads); `.glass-card-lime` for performance/growth metrics (viral score, views, conversions)
- Specular `::before` highlight on all

### Inputs (`src/index.css` + shadcn input overrides)
- Apply `.glass-input-surface`
- Focus ring: `ring-[rgba(8,145,178,0.3)] border-[rgba(8,145,178,0.5)]`
- Prefix icons: `text-[#94a3b8]`

### Kanban columns (`src/pages/LeadTracker.tsx`)
- Column left-border accent: cyan (#0891B2) for New, lime (#84CC16) for Contacted, amber (#F59E0B) for Booked
- Card background: `rgba(255,255,255,0.03)` glass

### Viral score badges (`src/pages/ViralToday.tsx`, `src/components/canvas/VideoNode.tsx`)
- High score (≥8×): `.badge-lime`
- Mid score (4–8×): `.badge-cyan`
- Low score: `.badge-neutral`

---

## 8. Landing Pages

### `src/pages/LandingPageNew.tsx` (primary English landing)
- Background: `#06090c` with ambient glow (cyan top-left, lime bottom-right)
- Hero headline: Inter 800, gradient span on key word
- CTA button: `.btn-primary` (gradient cyan→lime)
- Feature cards: `.glass-card` with cyan-tinted borders
- Gradient top border line on each section divider
- Remove any emoji usage, replace with Lucide icons

### `src/pages/Index.tsx` (Spanish landing `/reto`)
- Same color system applied
- Keep Cormorant Garamond for the founder story section headline (it fits the premium tone there)
- **Gold audit required before implementation**: do a full pass on all `#C8923A` / `#E8B458` / `gold` / `amber` usages in this file. Rule: gold kept only on testimonial card borders and the founder accent line. All other gold (buttons, dividers, icon fills, CTA backgrounds) → replaced with cyan/lime system.

---

## 9. Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Replace all CSS variables + glass classes |
| `index.html` | Ensure Inter is loaded (already loaded, verify weights 400/600/700/800) |
| `tailwind.config.ts` | Set `fontFamily.sans` to Inter |
| `src/components/DashboardSidebar.tsx` | Ocean Surge glass sidebar + icon colors |
| `src/components/DashboardTopBar.tsx` | Glass topbar + gradient line |
| `src/pages/Dashboard.tsx` | Update card colors, remove gold accent usage |
| `src/pages/ViralToday.tsx` | Viral score badge colors, icon colors |
| `src/pages/LeadTracker.tsx` | Kanban column accent colors |
| `src/pages/LandingPageNew.tsx` | Full rebrand: colors, glass cards, buttons, icons |
| `src/pages/Index.tsx` | Color system update (keep Cormorant for founder section) |
| `src/pages/SelectPlan.tsx` | Plan cards → glass-card-cyan for popular tier |
| `src/components/AIScriptWizard.tsx` | Step cards → glass-card neutral, active step → glass-card-cyan |
| `src/components/canvas/CanvasToolbar.tsx` | Icon colors #94a3b8 / active #22d3ee |
| `src/components/canvas/VideoNode.tsx` | Viral score badges |
| `src/components/ScriptsLogin.tsx` | Login page colors + button |
| `src/pages/Settings.tsx` | Settings cards → glass-card neutral |
| `src/pages/Subscription.tsx` | Plan cards → glass-card-cyan for active tier |

---

## 10. What Does NOT Change

- **Component structure / logic** — no routing, data fetching, or business logic changes
- **Chess knight logo** — keep the SVG; just render it in white on the gradient logo-mark background
- **Glassmorphism approach** — refining, not removing; the existing `.glass-ios` / `.card-glass-17` approach is replaced with the cleaner 3-tier system
- **Dark/light theme toggle** — preserve; light mode gets cyan on white (same primary, adjusted surface colors)
- **Lucide React** — already installed, no new package needed
- **Inter font** — already loaded in `index.html`, just needs activation in Tailwind

---

## 11. Verification

1. **Visual check**: Run `npm run dev`, open dashboard — sidebar should show deep glass with cyan glow on active item, `#94a3b8` icons on inactive
2. **Theme toggle**: Switch to light mode — backgrounds go to `#f0f4f8`, cyan primary remains readable, lime accent remains visible
3. **Landing pages**: `/` and `/reto` — gradient hero text visible, glass feature cards render, no emoji present
4. **Viral Today** (`/viral-today`): Viral score badges use `.badge-lime` (≥8×) and `.badge-cyan` (4–8×)
5. **Lead Tracker**: Kanban columns show cyan/lime/amber left-border accents
6. **No regressions** — spot-check these secondary routes visually:
   - `/book/:clientId` (PublicBooking) — glass input visible, button gradient correct
   - `/checkout` — payment form readable, no gold artifacts
   - `/public/calendar/:clientId` — public page colors consistent
   - `/public/onboard/:clientId` — form inputs using glass-input-surface
   - `/settings` — cards using glass-card neutral
   - `/subscription` — active plan card using glass-card-cyan
   - `/s/:id` (PublicScript) — script line type colors unaffected (these use fixed semantic colors, not brand tokens)
7. **Build**: `npm run build` exits clean with no TypeScript errors
