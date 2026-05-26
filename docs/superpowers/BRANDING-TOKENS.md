# Branding Tokens — Quick Reference

When writing new components or modifying existing ones in the **app surface** (everything except landing/marketing/public pages), use CSS variables instead of palette hex values. This is what makes the Connecta Plus palette/font picker actually re-skin the whole app per user.

> If you forget this, the new element will look fine in Editorial mode but will stay Editorial-colored when the user switches to Plum / Forest / Slate / etc.

## The token mapping

| Brand intent | Use this | Don't use |
|---|---|---|
| Dark page background | `bg-background` or `style={{ background: "hsl(var(--ink))" }}` | `bg-[#141414]`, `"#141414"`, `"#0A0E12"` |
| Card / surface (dark) | `bg-card` or `"hsl(var(--graphite))"` | `bg-[#1F1F1F]`, `"#1A1A1A"`, `"#1F1F1F"` |
| Foreground text (on dark) | `text-foreground` or `"hsl(var(--bone))"` | `text-[#EAE6DC]`, `"#EAE6DC"` |
| Light "cream" surface | `style={{ background: "hsl(var(--cream))" }}` or class `editorial-page` | `bg-[#EAE6DC]`, `"#EAE6DC"` for backgrounds |
| Dark text on cream | `"hsl(var(--ink-on-cream))"` | `"#141414"` (when on a light bg) |
| Muted text on dark | `"hsl(var(--bone) / 0.55)"` | `rgba(234,230,220,0.55)` |
| Muted text on cream | `"hsl(var(--ink-on-cream) / 0.55)"` | `rgba(20,20,20,0.55)` |
| Primary action (aqua) | `bg-primary`, `text-primary` or `"hsl(var(--aqua))"` | `"#8FD0D5"` |
| Warm accent (honey) | `bg-accent` or `"hsl(var(--honey))"` | `"#E0A560"` |
| Destructive | `bg-destructive` or `"hsl(var(--honey-deep))"` | `"#C7682A"` |
| Hairline / divider | `border-border` or `"hsl(var(--bone) / 0.08)"` | `"rgba(234,230,220,0.08)"` |
| Border on cream | `"hsl(var(--ink-on-cream) / 0.10)"` | `"rgba(20,20,20,0.10)"` |
| Heading font | `font-serif` or `"var(--font-display, EB Garamond)"` | `"EB Garamond"`, `"'EB Garamond', serif"` |
| Body font | `font-sans` or `"var(--font-body, Figtree)"` | `"Figtree, sans-serif"` |
| UI / nav font | `"var(--font-ui, Inter)"` | `"Inter, sans-serif"` (when meant as theme UI font) |

## Tailwind arbitrary syntax

For one-off Tailwind classes (when no semantic token exists):

```tsx
// Yes — these follow palette swap
<div className="bg-[hsl(var(--cream))]" />
<span className="text-[hsl(var(--bone)/0.55)]" />
<div className="border-[hsl(var(--ink-on-cream)/0.10)]" />

// No — these freeze on the editorial palette
<div className="bg-[#EAE6DC]" />
<span className="text-[rgba(234,230,220,0.55)]" />
```

## What to LEAVE hardcoded

Some colors are intentional and should NOT follow the palette swap. Add a `// STATUS:` comment so reviewers and future-you know it's deliberate.

- **Status / semantic colors** — overdue badge red `#B23A2A`, success teal `#2F6B62`, filming tint `#2B221B`, editing tint `#1F2A22`, etc. These signal meaning, not brand.
- **Monogram client avatars** — the 7-color rotation in `TriageClientBlock.tsx`. Picked for visual variety, not palette.
- **Pure overlays** — `rgba(255,255,255,X)` and `rgba(0,0,0,X)` for glass effects, scrim layers, hover states. Not brand-tied.
- **Shadcn semantic Tailwind colors** — `text-green-400`, `text-red-500`, `bg-blue-500/15` chips. These are state indicators.
- **Specific brand assets** — logos, illustrations, photographs.

```tsx
// STATUS: overdue urgency — semantic red, not palette
<div style={{ background: "#B23A2A" }} />
```

## Surfaces that intentionally STAY editorial-branded

Don't sweep these — they're public-facing Connecta marketing:

- `src/landing.css`, `src/landing-main.tsx`
- `src/components/landing/*`
- `src/pages/LandingPageNew.tsx`, `LandingPageNewES.tsx`, `PublicLandingPage.tsx`
- `src/pages/Index.tsx`, `About.tsx`
- `src/pages/PublicBooking.tsx`, `PublicScript.tsx`, `PublicFolderShare.tsx`
- `src/pages/PrivacyPolicy.tsx`, `TermsAndConditions.tsx`
- `src/components/LeadForm.tsx`, `src/components/CanvasHeroMockup.tsx`

## Enforcement

A pre-commit hook at `.githooks/pre-commit` blocks commits that introduce palette hex in the app surface. Enable once per clone:

```bash
git config core.hooksPath .githooks
```

If you legitimately need to commit a hex value (e.g., adding a new status color), the hook tells you exactly which file/line — just add a `// STATUS:` comment to it or override with `git commit --no-verify` (and please leave a note in the commit message).

## Where the palettes themselves live

Single source of truth: `src/lib/branding/presets.ts`. Adding a new palette = adding one entry there + adding the ID to the `PaletteId` type + adding it to the `ORDER` in `PalettePicker.tsx`.

CSS variables are set on `:root` at runtime by `src/lib/branding/apply.ts` when a Connecta Plus user logs in. The defaults in `src/index.css` `:root` block match the Editorial palette so non-plus users still see the right thing.
