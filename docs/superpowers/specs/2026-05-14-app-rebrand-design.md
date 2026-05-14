# Whole-App Rebrand — Color + Font Enforcement

**Status:** PARKED — re-brainstorm before executing. Landing-page plan ships first; this one is dormant until the user revisits.
**Date:** 2026-05-14
**Scope:** Every authenticated and unauthenticated route inside `src/` — replace current dark cyan/lime palette with Ink + Aqua + Honey · enforce EB Garamond + Figtree as the only two font families allowed
**Companion plan:** `2026-05-14-landing-page-redesign-design.md` — that one ships first as a scoped pilot, this one cascades the same system across the rest of the app
**Sequencing:** Do not start until landing-page plan has shipped and the user has lived with it for at least a day. Land that, then run this.

---

## 1. Goal

Make every page of the app feel like the same brand. Today the app is a dark cyan/lime palette with `font-caslon` and Inter, while the new landing will be Ink + Aqua + Honey with EB Garamond + Figtree. That gap dies in this plan.

After this plan, no surface inside the app uses any color outside the 5-shade palette, and no text uses any font outside EB Garamond / Figtree / JetBrains Mono.

## 2. The locked system

Identical to the landing-page spec — see that doc for the full token table. Repeated here in code form for the implementor:

```css
:root {
  /* === Editorial palette · Ink + Aqua + Honey === */
  --ink:       222 27% 7%;          /* #0A0E12  background  */
  --graphite:  215 19% 13%;         /* #1A1F26  surface     */
  --bone:      42 23% 89%;          /* #EAE6DC  foreground  */
  --aqua:      184 41% 70%;         /* #8FD0D5  primary     */
  --honey:     30 67% 63%;          /* #E0A560  warm accent */

  /* Derived */
  --bone-muted: 42 23% 89% / 0.62;
  --bone-faint: 42 23% 89% / 0.38;
  --line:       42 23% 89% / 0.10;
  --line-strong:42 23% 89% / 0.18;
}
```

Tailwind tokens (in `tailwind.config.ts`):

```ts
background:  'hsl(var(--ink))',
foreground:  'hsl(var(--bone))',
card:        'hsl(var(--graphite))',
primary:     'hsl(var(--aqua))',
'primary-foreground': 'hsl(var(--ink))',
accent:      'hsl(var(--honey))',
'accent-foreground':  'hsl(var(--ink))',
muted:       'hsl(var(--bone-muted))',
'muted-foreground':   'hsl(var(--bone-muted))',
border:      'hsl(var(--line))',
input:       'hsl(var(--graphite))',
ring:        'hsl(var(--aqua))',
```

## 3. Strategy — three phases inside this plan

### Phase 1 — Token swap (one PR, ~3 files)

Edit only these files:
1. [src/index.css](src/index.css) — replace `:root` and `.dark` variable blocks with the new 5-shade system. Delete the cyan/lime values. Keep variable *names* identical (`--background`, `--primary`, `--accent`, `--card`, `--muted`, `--border`, etc.) so existing Tailwind classes resolve to the new values without component changes.
2. [tailwind.config.ts](tailwind.config.ts) — change `fontFamily.sans` from Inter to Figtree; add `fontFamily.serif: ['EB Garamond', ...]`. Remove `font-caslon`, `font-playfair`, `font-inter` aliases.
3. [src/App.css](src/App.css) — delete or align to new system. Remove any hard-coded hex.

Add Google Fonts `<link>` to [index.html](index.html) or `@import` in `index.css` for EB Garamond (400, 500, italic 400, italic 500) and Figtree (400, 500, 600, 700).

After phase 1, the app re-themes itself globally. Many things will look right; some will break (icons that hard-coded `#22d3ee`, gradients that referenced `--primary-light`, status pills using lime/red).

### Phase 2 — Component sweep (the hard part)

Grep for and replace every hardcoded color reference. Inventory from initial scan:

- ~~`font-caslon` — used in dashboard cards, page titles, ScribbleUnderline labels. Replace with `font-serif`.~~ **DO NOT TOUCH.** `font-caslon` is an intentional brand decision for body type. Confirmed by user 2026-05-14. Any future cleanup of this alias requires explicit user approval. (Memory: `project_caslon_body_font.md`.)
- `text-[#22d3ee]` and `bg-[#22d3ee]` (cyan hover state) — replace with `text-primary` and `bg-primary`.
- `bg-cyan-*`, `text-cyan-*`, `border-cyan-*` — anywhere they appear, replace with `bg-primary` family.
- `bg-lime-*`, `text-lime-*` (legacy accent) — replace with `bg-accent` (Honey).
- Any `#0891B2`, `#06B6D4`, `#0369A1`, `#84CC16`, `#a3e635` literal hex — replace with the corresponding token.
- Gradients in [src/index.css](src/index.css) — rewrite using `--aqua` and `--honey` instead of cyan ramps.

Status pill convention (post-rebrand):
- "Live / Scheduled / Active / Success" → Aqua background at 14% + Aqua text
- "Pending / In Review / Warning / Featured" → Honey background at 14% + Honey text
- "Draft / Inactive / Muted" → Bone-faint background + Bone-muted text
- "Error / Destructive" → Honey at higher saturation (no red anywhere)

### Phase 3 — Data-density audit

Walk each high-density page and verify text legibility on Graphite cards:

- [src/pages/MasterDatabase.tsx](src/pages/MasterDatabase.tsx)
- [src/pages/EditingQueue.tsx](src/pages/EditingQueue.tsx)
- [src/pages/MasterEditingQueue.tsx](src/pages/MasterEditingQueue.tsx)
- [src/pages/ContentCalendar.tsx](src/pages/ContentCalendar.tsx)
- [src/pages/LeadTracker.tsx](src/pages/LeadTracker.tsx)
- [src/pages/SuperPlanningCanvas.tsx](src/pages/SuperPlanningCanvas.tsx)
- [src/pages/ViralToday.tsx](src/pages/ViralToday.tsx)

For each: check table row scannability, form input contrast, and that EB Garamond is reserved for page titles / not used as table body type. Tables stay in Figtree at 13–14px.

## 4. Hard rules (enforced, not suggested)

- **No raw hex in JSX.** Every color value comes from a Tailwind token or CSS variable. After this plan, `grep -rE "#[0-9a-fA-F]{3,6}" src --include="*.tsx"` should return only Storybook stories, prompt strings, or unrelated content (not styling).
- **No font-family overrides in inline styles.** Every text element uses `font-sans` (Figtree) or `font-serif` (EB Garamond). The string `font-caslon` should not exist after this plan.
- **No accent colors beyond Aqua + Honey.** No greens, reds, purples in status badges, charts, or icons. If a chart needs more than 2 series, ramp Aqua → Honey through tonal variants.

## 5. Out of scope

- Landing page (already covered by separate plan, ships first)
- Marketing pages other than landing (`/about`, `/coming-soon`, etc.) — handle in a third follow-up if needed
- Email templates — different system, not touched here
- The Companion AI chat bubble — its own component family, audit separately if it diverges

## 6. Files affected (initial estimate)

Conservative: **3 files in phase 1**, **~40 files in phase 2** (component sweep), **~10 files in phase 3** (density audit + tweaks).

Hard prediction is impossible until phase 1 lands and we see what visibly breaks.

## 7. Acceptance criteria

After this plan:

- `grep -r "font-caslon" src` returns zero results
- `grep -rE "#(0891B2|06B6D4|0369A1|84CC16|a3e635|22d3ee)" src` returns zero results
- Every authenticated route renders without visual regression on a fresh git checkout
- The brand feels identical between landing page and dashboard — same fonts, same palette, same button shapes, same card radii
- Power-user pages (MasterDatabase, EditingQueue, ContentCalendar) still scan well — no readability regression on Graphite surfaces
- Light mode (if currently supported) is either updated to match or disabled — pick one in implementation, don't ship a half-themed light mode

## 8. Open questions (resolve before writing-plans)

1. **Light mode:** Keep the existing `.dark` / light pair, or commit to dark-only? Recommendation: dark-only for now — the editorial system is designed dark, and maintaining a light theme doubles the visual QA per page. Add a light mode later if customers ask for it.
2. **`font-caslon` history:** Was Caslon a deliberate brand choice (and someone will fight to keep it) or a wisprflow-adjacent guess? If the former, raise this with the team before swap-out.
3. **Companion bubble:** It currently has its own dark surface tokens. Should it adopt Graphite or stay distinctive? Recommendation: adopt Graphite for consistency.
