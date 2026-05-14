# App-Wide Editorial Rebrand — Design Spec

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-14
**Supersedes:** `2026-05-14-app-rebrand-design.md` (parked draft, superseded by this re-brainstormed version)
**Companion plan:** `2026-05-14-landing-page-redesign-design.md` (shipped — this plan cascades that system across the rest of the app)

---

## 1. Goal

Make every authenticated and unauthenticated route inside `src/` feel like the same brand as the new landing page. After this plan:

- No surface uses any color outside the **Ink + Aqua + Honey** 5-shade palette (+ one `--honey-deep` derived shade for destructive)
- No text uses any font outside **EB Garamond**, **Figtree**, or **JetBrains Mono**
- Both `.dark` and `.light` themes render correctly on every route (light variant of the new palette is in scope — not dark-only)
- The app stays a calm work tool — landing-style animations (ProxText cursor proximity, ScrollFloat character-rise, sticker drift, scribble underlines) are **NOT** ported into the app

The brand should read identical between `connectacreators.com/` (landing) and `connectacreators.com/dashboard` (app). The visual language is the same; the animation budget is not.

## 2. Locked decisions (from re-brainstorm, 2026-05-14)

These four decisions reshape the parked spec — they are the brainstorm output, not negotiable inside the implementation plan:

| Decision | Resolution | Rationale |
|---|---|---|
| Animation scope | **Landing-only.** No ProxText / ScrollFloat / stickers / scribble underlines in the app. | App is a productivity tool — per-letter cursor effects on data tables would hurt scannability. Brand carries through palette + typography alone. |
| Light mode | **Build a full light variant of the new palette.** Don't kill the ThemeToggle. | User decision. Doubles QA per page but preserves user choice. |
| `font-caslon` (Libre Caslon Text) | **Migrate → EB Garamond app-wide.** Remove the alias, replace 21 className hits with `font-serif`, drop the Libre Caslon Text Google Fonts import. | Two classical serifs running simultaneously fights "set by default." User explicitly overrode the prior memory that preserved Caslon. |
| Destructive color | **Honey at deeper saturation (`--honey-deep`).** One derived shade, stays inside the 5-shade system; no red anywhere. | No red lets the palette stay editorial. Verb + icon disambiguate destructive intent. |

## 3. Token system

### 3.1 Dark theme (default)

```css
:root, .dark {
  /* === Editorial palette · Ink + Aqua + Honey === */
  --ink:        222 27% 7%;     /* #0A0E12  page background */
  --graphite:   215 19% 13%;    /* #1A1F26  card / surface  */
  --bone:       42 23% 89%;     /* #EAE6DC  foreground text */
  --aqua:       184 41% 70%;    /* #8FD0D5  primary         */
  --honey:      30 67% 63%;     /* #E0A560  warm accent     */
  --honey-deep: 22 65% 47%;     /* ~#C7682A destructive     */

  /* Derived */
  --bone-muted: 42 23% 89% / 0.62;
  --bone-faint: 42 23% 89% / 0.38;
  --line:       42 23% 89% / 0.10;
  --line-strong:42 23% 89% / 0.18;
}
```

### 3.2 Light theme

```css
.light {
  --ink:        222 27% 7%;     /* used as foreground text */
  --graphite:   42 23% 95%;     /* near-white card / surface */
  --bone:       40 26% 96%;     /* page background */
  --aqua:       184 41% 38%;    /* darker for contrast on bone */
  --honey:      30 67% 42%;     /* darker for contrast on bone */
  --honey-deep: 22 65% 38%;
}
```

In light mode the `--ink` and `--bone` role assignments invert (Ink becomes foreground, Bone becomes background). The Aqua and Honey values are darker because the pale-tint versions designed for dark backgrounds fail AA contrast on a bone background.

### 3.3 Role-token plumbing

Existing variables in `src/index.css` re-route to the new palette tokens. Keep variable *names* identical so existing Tailwind classes resolve without component changes:

```css
--background: var(--ink);              /* page bg */
--foreground: var(--bone);             /* text */
--card:       var(--graphite);
--card-foreground: var(--bone);
--primary:    var(--aqua);
--primary-foreground: var(--ink);
--accent:     var(--honey);
--accent-foreground: var(--ink);
--destructive: var(--honey-deep);
--destructive-foreground: var(--bone);
--muted:      var(--graphite);
--muted-foreground: var(--bone-muted);
--border:     var(--line);
--input:      var(--graphite);
--ring:       var(--aqua);
```

(In `.light` these resolve to the inverted values automatically because `.light` overrides `--ink`/`--bone`/etc.)

### 3.4 Tailwind config

```ts
fontFamily: {
  sans:  ['Figtree', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
  serif: ['"EB Garamond"', 'Georgia', 'serif'],
  mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
},
```

Remove `font-caslon`, `font-playfair`, `font-inter` aliases entirely. Removing the `font-caslon` Tailwind alias is what forces all 21 className hits to be rewritten to `font-serif`.

## 4. Typography hierarchy

| Role | Family | Tailwind class | Notes |
|---|---|---|---|
| Page H1, section H2 | EB Garamond | `font-serif` | All routes |
| Card titles (h3 / h4) inside dashboards | EB Garamond | `font-serif` | Only in app dashboards; public/auth surfaces stay sans |
| Body, table cells, form labels, buttons, badges | Figtree | `font-sans` (default) | The workhorse |
| Big numeric displays (stats, finance, metrics) | Figtree, tabular-nums | `font-sans tabular-nums` | Legibility wins; not editorial decoration |
| Monospace fragments (IDs, code, URLs) | JetBrains Mono | `font-mono` | As today |

Italic + roman weights of EB Garamond load via Google Fonts variable axis 400..800 (already in landing.css). Move that import to the global `src/index.css` so it loads on every route, not just landing.

## 5. Status color conventions

| State semantic | Color token | Implementation |
|---|---|---|
| Success / Live / Active / Scheduled | Aqua | `bg-primary/14 text-primary` |
| Pending / Warning / In Review / Featured | Honey | `bg-accent/14 text-accent` |
| Draft / Inactive / Muted | Bone-faint | `bg-muted text-muted-foreground` |
| Destructive / Error / Delete | Honey-deep | `bg-destructive text-destructive-foreground` |

Multi-series charts ramp Aqua → Honey through tonal variants. No green / red / purple anywhere in chrome.

## 6. Delivery: three PRs

### PR 1 — Token swap (3-5 files)

**Files:**
1. [`src/index.css`](src/index.css) — rewrite the `:root, .dark` token block and the `.light` token block to the new palette + role plumbing (see §3). Move EB Garamond + Figtree imports here so they load on every route, not just landing. Remove the Libre Caslon Text `@import` line at the top of the file.
2. [`tailwind.config.ts`](tailwind.config.ts) — set `fontFamily.sans` to Figtree, add `fontFamily.serif: ['EB Garamond', ...]`, add `fontFamily.mono: ['JetBrains Mono', ...]`. Remove `font-caslon`, `font-playfair`, `font-inter` aliases.
3. [`src/App.css`](src/App.css) — delete or align to new system. Remove hard-coded hex.
4. [`index.html`](index.html) — already has correct Google Fonts links from landing work; verify they're loading for the app entry too. If not, add.
5. [`landing.html`](landing.html) — verify, since this is the landing entry. Should already be correct.

**Expected breakage after PR 1 ships:**
- `bg-cyan-*` / `text-cyan-*` / `bg-lime-*` classes still render their original cyan/lime (Tailwind compiles utilities statically — they don't go through CSS vars). Visible cyan/lime patches remain in old components.
- Literal hex values in JSX (`#22d3ee`, `#0891B2`, `#06B6D4`, `#84CC16`, `#a3e635`, `#0369A1`) still render their old values.
- `font-caslon` className becomes a no-op (Tailwind alias removed) → those 21 elements fall back to whatever sans-serif their parent inherits. They look wrong (sans where serif was expected).

This breakage is **intentional and expected** — it's the cleanest possible bisect point between "token system flipped" and "components catching up." Ship PR 1, screenshot the breakage, move to PR 2.

### PR 2 — Component sweep (~95 files)

Systematic grep-replace pass, committed in batches grouped by file family:

| Batch | What | Estimated files |
|---|---|---|
| 2a | `bg-cyan-*` / `text-cyan-*` / `border-cyan-*` → `bg-primary` family | ~20 |
| 2b | `bg-lime-*` / `text-lime-*` → `bg-accent` family | ~10 |
| 2c | Literal hex (`#22d3ee`, `#0891B2`, `#06B6D4`, `#84CC16`, `#a3e635`, `#0369A1`) → token references | ~59 (overlap with 2a/2b) |
| 2d | `font-caslon` className → `font-serif` | 21 |
| 2e | Inline-style `style={{ background: '#...', color: '#...' }}` → CSS vars or className equivalents | ~35 |

Commits are organized by **page family** so reviewers can pull up one page at a time:
- Dashboard family: Dashboard, CommandCenter, MasterDatabase, ClientDatabase, ContractsPage, Finances
- Content family: EditingQueue, MasterEditingQueue, ContentCalendar, SuperPlanningCanvas, ViralToday
- Client family: Clients, ClientDetail, ClientStrategy, ClientWorkflow, ClientFollowUpAutomation
- Public family: PublicBooking, PublicContract, PublicContentCalendar, PublicEditingQueue, PublicFolderShare, PublicOnboarding, PublicLandingPage
- Auth + onboarding family: ChangePassword, Onboarding, Checkout, PaymentSuccess
- Marketing family (non-landing): About, ComingSoon, Index, IndexEN, LandingPageNewES, NotFound

After PR 2 ships: app is fully on-palette in dark mode. Light mode may still have legibility issues.

### PR 3 — Light mode + density audit (~10-15 files)

Walk both themes through:

- [`src/pages/MasterDatabase.tsx`](src/pages/MasterDatabase.tsx)
- [`src/pages/EditingQueue.tsx`](src/pages/EditingQueue.tsx)
- [`src/pages/MasterEditingQueue.tsx`](src/pages/MasterEditingQueue.tsx)
- [`src/pages/ContentCalendar.tsx`](src/pages/ContentCalendar.tsx)
- [`src/pages/LeadTracker.tsx`](src/pages/LeadTracker.tsx)
- [`src/pages/SuperPlanningCanvas.tsx`](src/pages/SuperPlanningCanvas.tsx)
- [`src/pages/ViralToday.tsx`](src/pages/ViralToday.tsx)
- [`src/pages/Onboarding.tsx`](src/pages/Onboarding.tsx)
- [`src/pages/PublicBooking.tsx`](src/pages/PublicBooking.tsx)
- [`src/components/CompanionBubble.tsx`](src/components/CompanionBubble.tsx) — verify it adopts Graphite surface, not its own distinct dark

For each: in light mode, screenshot every state (loading, empty, error, populated, hover, focus). Verify **WCAG AA contrast** (4.5:1 for body text, 3:1 for ≥18pt or bold ≥14pt) on Aqua and Honey against both Bone and Graphite surfaces. Tweak per-theme lightness on `--aqua` / `--honey` until AA is achieved everywhere. Tables stay Figtree at 13–14px in both themes.

## 7. Hard rules

After this plan lands, these must hold:

- `grep -rE "#(0891B2|06B6D4|0369A1|84CC16|a3e635|22d3ee)" src` returns zero results
- `grep -r "font-caslon" src` returns zero results
- `grep -rE "(bg|text|border)-(cyan|lime|red|green|purple|blue|emerald|amber|rose|fuchsia)-[0-9]" src --include="*.tsx"` returns zero results (only the token families — primary, accent, muted, destructive — and neutrals are allowed)
- No raw hex literal appears in JSX inline styles (`grep -rE 'style=.*#[0-9a-fA-F]{3,6}' src --include="*.tsx"` returns only prompt strings / non-styling content)
- No font-family override in inline styles — every text element uses `font-sans` / `font-serif` / `font-mono` only

## 8. Out of scope

- Landing page (already shipped)
- Email templates (separate system, not touched)
- Animation port to app (decided landing-only)
- Layout changes (sidebar/topbar structure stays — this is a re-skin, not a redesign)
- New marketing pages beyond what exists
- Companion bubble's *behavior* (text, AI logic) — only its visual surface is in scope

## 9. Acceptance criteria

After all 3 PRs ship:

1. Every authenticated route renders correctly in both `.dark` and `.light` without visual regression
2. The brand reads identical between landing + every app surface — same fonts, same palette, same card radii, same button shapes
3. Power-user pages (MasterDatabase, EditingQueue, ContentCalendar) still scan well in both themes — no readability regression on Graphite or Bone surfaces
4. All hard-rule greps return zero results
5. ThemeToggle works — clicking it flips every page cleanly without flash, broken cards, or orphan colors
6. Companion bubble adopts Graphite surface and feels part of the app, not a foreign overlay

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| PR 1 visibly broken on prod between PRs | Land PR 1 + PR 2 in same day. If PR 2 will take more than 24h, gate PR 1 behind a feature flag or hold it until PR 2 is ready. |
| Light-mode contrast failures discovered late | PR 3 has explicit per-page audit checklist; build a contrast verification script as the first task in PR 3. |
| `font-caslon` migration changes vertical rhythm | EB Garamond x-height is similar to Libre Caslon Text; should be near-drop-in. If specific elements look off, adjust line-height locally during PR 2. |
| Hardcoded hex in dependencies (third-party components) | Out of scope for this plan — if discovered, file as a follow-up. |
| Inline style hex in dynamic content (e.g., user-uploaded brand colors, content previews) | Audit during PR 2 to distinguish styling-hex from content-hex. Rule of thumb: a hex value inside `style={{ color: ... }}` driven by component state stays if it represents *user content* (e.g., a client's brand color); it changes if it's hard-coded UI chrome. |

## 11. Sequencing reminder

1. Land all 3 PRs of this plan
2. Live with the result for a few days
3. If marketing pages (`/about`, `/coming-soon`) need their own editorial treatment beyond palette + fonts, that's a follow-up plan
4. Optional follow-up: revisit whether `font-caslon` makes a comeback for specific surfaces — once the system is unified, future deviations can be intentional rather than legacy
