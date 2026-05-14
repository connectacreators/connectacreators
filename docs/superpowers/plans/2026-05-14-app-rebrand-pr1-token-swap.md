# App Rebrand — PR 1: Token Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global cyan/lime/Inter token system with the editorial Ink+Aqua+Honey + EB Garamond/Figtree system so every route auto-themes through the existing role tokens (`--background`, `--primary`, `--accent`, `--card`, `--foreground`, etc.) without any component code changes.

**Architecture:** This PR edits only **5 files** — three CSS/config files plus two HTML entry points. We change the *values* behind the role tokens but keep the *names* identical, so Tailwind classes like `bg-primary`, `text-foreground`, `border-border` resolve to the new palette automatically. Custom component-level CSS classes inside `src/index.css` (`.glass-card-cyan`, `.badge-cyan`, `.btn-17-*`, scrollbar overrides, ReactFlow overrides) and Tailwind static utilities (`bg-cyan-500`, `text-lime-400`, literal hex in JSX) **stay as-is** in this PR — they're handled in PR 2's component sweep. The half-themed period this creates is intentional and expected per the spec.

**Tech Stack:** React + Vite + TypeScript + Tailwind 3 + shadcn/ui. CSS variables in `src/index.css`. Tailwind font families in `tailwind.config.ts`. Two Vite entry points (`index.html` + `landing.html`).

---

## File Structure

Files this PR touches:

| File | Change |
|---|---|
| [`src/index.css`](src/index.css) | Replace `@import` (Libre Caslon Text → EB Garamond + Figtree + JetBrains Mono). Rewrite `:root` token block (lines 12–87). Rewrite `.light` token block (lines 90–132). Update `.font-caslon`, `.font-caslon-text`, `.font-wordmark` class definitions to use EB Garamond. Update `body` and `h1–h6` `font-family` declarations. |
| [`tailwind.config.ts`](tailwind.config.ts) | Replace `fontFamily.sans` (Inter → Figtree). Add `fontFamily.serif` (EB Garamond). Add `fontFamily.mono` (JetBrains Mono). Delete `fontFamily.playfair` and `fontFamily.inter` aliases. |
| [`src/App.css`](src/App.css) | Delete hardcoded hex colors (`#646cffaa`, `#61dafbaa`, `#888`) — replace with token references or remove unused leftover CRA boilerplate. |
| [`index.html`](index.html) | Replace Inter `<link>` with EB Garamond + Figtree + JetBrains Mono `<link>`. |
| [`landing.html`](landing.html) | No changes — landing.css already imports its own fonts. Verify after build. |

**Out of scope for PR 1 (intentional):**
- Tailwind static utilities like `bg-cyan-500`, `text-lime-400` → still render cyan/lime after PR 1
- Literal hex in JSX inline styles → still render old colors
- Custom CSS classes inside `src/index.css` that hardcode cyan/lime (`.glass-card-cyan`, `.badge-cyan`, `.btn-17-*`, scrollbar styles, ReactFlow overrides) → still render old colors
- The 21 className hits of `font-caslon` in `src/pages/*.tsx` → no changes needed, the CSS class definition we update in this PR makes them render EB Garamond automatically

---

## Verification approach (no unit tests — this is a CSS+config change)

Because this PR has no runtime logic to assert on, "tests" here are:
1. **Build verification:** `npm run build` succeeds (TypeScript + Tailwind + Vite all compile cleanly)
2. **Grep verification:** specific tokens replaced (new HSL values present where expected, old cyan/lime HSL values absent from the token blocks)
3. **Dev-server verification:** `npm run dev` starts cleanly and the dashboard renders the new palette
4. **Visual sanity check:** open dashboard in browser, confirm: body background is Ink (not blue-grey), primary buttons are Aqua (not cyan), font is Figtree (not Inter)

Each task ends with one of these verifications. There is no unit-test pyramid for token files; that's a feature, not a gap.

---

## Task 1: Set up — verify clean working tree + create feature branch

**Files:** (none modified yet)

- [ ] **Step 1: Confirm clean working tree**

Run:
```bash
git status --short
```
Expected: any untracked files are pre-existing exploration HTMLs in `docs/superpowers/preview-*.html`; no other modifications. If anything else is modified, stop and investigate before proceeding.

- [ ] **Step 2: Create the PR 1 branch off main**

Run:
```bash
git fetch origin main
git checkout -b rebrand/pr1-token-swap origin/main
```
Expected: switched to a new branch `rebrand/pr1-token-swap` based on the latest `origin/main`.

If a worktree is in use already, skip this step and confirm you're on a clean branch off main.

- [ ] **Step 3: Confirm baseline build works**

Run:
```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds, output ends with `✓ built in <N>s`. If the baseline build fails, stop — PR 1 cannot proceed until the codebase builds cleanly.

---

## Task 2: Swap the Google Fonts import at the top of `src/index.css`

**Files:**
- Modify: [`src/index.css`](src/index.css), line 1

- [ ] **Step 1: Replace the Libre Caslon Text import with EB Garamond + Figtree + JetBrains Mono**

Edit line 1 of `src/index.css`.

Old:
```css
@import url('https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&display=swap');
```

New:
```css
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
```

Why: this single `@import` line is what every app route loads (because `src/main.tsx` imports `./index.css`). After this, EB Garamond's variable-axis weight range, Figtree's four weights, and JetBrains Mono's three weights are available globally. Libre Caslon Text is no longer loaded.

- [ ] **Step 2: Verify the import is correctly the only one at the top of the file**

Run:
```bash
head -3 /Users/admin/Documents/connectacreators/src/index.css
```
Expected output starts with the new `@import` line, followed by `@tailwind base;`.

- [ ] **Step 3: Verify no other file still imports Libre Caslon Text**

Run:
```bash
grep -rn "Libre+Caslon" /Users/admin/Documents/connectacreators/src /Users/admin/Documents/connectacreators/index.html /Users/admin/Documents/connectacreators/landing.html 2>/dev/null
```
Expected: zero results. If any other file still references Libre Caslon Text, decide case-by-case whether to remove it as part of this PR or leave for follow-up.

---

## Task 3: Rewrite the `:root` token block in `src/index.css`

**Files:**
- Modify: [`src/index.css`](src/index.css), lines 12–87 (the `:root { ... }` block inside `@layer base`)

- [ ] **Step 1: Replace the entire `:root` block**

Replace lines 12 through 87 (everything between `:root {` and the closing `}` before `/* Light Mode: Ocean Surge on white */`) with:

```css
  :root, .dark {
    /* === Editorial palette · Ink + Aqua + Honey (dark theme) === */
    --ink:        222 27% 7%;     /* #0A0E12  page background */
    --graphite:   215 19% 13%;    /* #1A1F26  card / surface  */
    --bone:       42 23% 89%;     /* #EAE6DC  foreground text */
    --aqua:       184 41% 70%;    /* #8FD0D5  primary         */
    --honey:      30 67% 63%;     /* #E0A560  warm accent     */
    --honey-deep: 22 65% 47%;     /* ~#C7682A destructive     */

    /* Derived neutrals */
    --bone-muted: 42 23% 89%;
    --bone-faint: 42 23% 89%;
    --line:       42 23% 89%;

    /* === Role tokens (route through palette, keep names identical) === */
    --background:           var(--ink);
    --foreground:           var(--bone);
    --card:                 var(--graphite);
    --card-foreground:      var(--bone);
    --popover:              var(--graphite);
    --popover-foreground:   var(--bone);
    --primary:              var(--aqua);
    --primary-foreground:   var(--ink);
    --primary-light:        var(--aqua);
    --primary-dark:         var(--aqua);
    --secondary:            var(--graphite);
    --secondary-foreground: var(--bone);
    --accent:               var(--honey);
    --accent-foreground:    var(--ink);
    --accent-light:         var(--honey);
    --muted:                var(--graphite);
    --muted-foreground:     var(--bone-muted);
    --subtle:               var(--bone-muted);
    --border:               var(--line);
    --input:                var(--graphite);
    --ring:                 var(--aqua);
    --destructive:          var(--honey-deep);
    --destructive-foreground: var(--bone);

    /* Sidebar tokens (DashboardSidebar) */
    --sidebar-background:        var(--ink);
    --sidebar-foreground:        var(--bone);
    --sidebar-primary:           var(--aqua);
    --sidebar-primary-foreground: var(--ink);
    --sidebar-accent:            var(--honey);
    --sidebar-accent-foreground: var(--ink);
    --sidebar-border:            var(--line);
    --sidebar-ring:              var(--aqua);

    --radius: 0.75rem;

    /* Neutral opacity scale — kept for legacy consumers */
    --surface-1: rgba(234, 230, 220, 0.03);
    --surface-2: rgba(234, 230, 220, 0.06);
    --line-1:    rgba(234, 230, 220, 0.08);
    --text-1:    rgba(234, 230, 220, 0.35);
    --text-2:    rgba(234, 230, 220, 0.6);

    /* Custom design tokens — re-routed through the new palette */
    --gradient-primary: linear-gradient(135deg, hsl(var(--aqua)), hsl(var(--honey)));
    --gradient-hero:    linear-gradient(135deg, hsl(var(--aqua)) 0%, hsl(var(--honey)) 100%);
    --gradient-bg:      radial-gradient(ellipse at top, hsl(var(--aqua) / 0.1), transparent 50%);
    --gradient-dark:    linear-gradient(135deg, hsl(var(--ink)) 0%, hsl(222 27% 4%) 100%);

    --blur-subtle: blur(20px);
    --blur-strong: blur(40px);

    --shadow-soft: 0 4px 20px hsl(var(--aqua) / 0.10);
    --shadow-glow: 0 0 40px hsl(var(--aqua) / 0.20);
    --shadow-card: 0 8px 32px hsl(0 0% 0% / 0.20);

    --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    --transition-bounce: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }
```

Why every line of this matters:
- **Two-selector header (`:root, .dark`):** so both default-themed and `.dark`-classed elements get these values. (The codebase uses `darkMode: ["class"]` in `tailwind.config.ts:4`, so this is the dark theme.)
- **Palette as raw HSL triplets:** `222 27% 7%` not `hsl(222 27% 7%)` — Tailwind's `hsl(var(--...))` wrapper requires the bare triplet form.
- **Role tokens routed through palette tokens:** `--background: var(--ink)` means anyone who reads `--background` gets `--ink`'s value. Existing Tailwind classes like `bg-background` resolve through this chain automatically.
- **`--primary-light` / `--primary-dark` collapsed to Aqua:** previous values were a cyan ramp (`197 91% 37%` / `199 100% 27%`). The new palette is monochromatic on Aqua — we don't have separate light/dark cyans. Any legacy consumers of these vars get the same Aqua value (no broken references).
- **`--sidebar-*` tokens routed through palette:** sidebar adopts the same surfaces as the rest of the app (Ink background, Bone text, Aqua primary). PR 3 audit will confirm or tweak this is right.
- **Gradients rewritten:** `--gradient-primary` now sweeps Aqua → Honey (was cyan → cyan-dark). Editorial reads as warm-cool, not cool-cool.

- [ ] **Step 2: Verify the new block is syntactically correct**

Run:
```bash
grep -n "^\s*:root, .dark {" /Users/admin/Documents/connectacreators/src/index.css
grep -n "^\s*--ink:" /Users/admin/Documents/connectacreators/src/index.css
grep -n "^\s*--background:\s*var(--ink)" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: each `grep` returns one line. If any returns zero, the rewrite is malformed — re-check indentation / closing braces.

- [ ] **Step 3: Verify the old cyan/lime HSL values are gone from the `:root` block**

Run:
```bash
grep -nE "197 91%|84 68%" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: zero results in the `:root` block. Leftover hits elsewhere in the file (in custom classes like `.glass-card-cyan`) are fine — those are PR 2's job.

---

## Task 4: Rewrite the `.light` token block in `src/index.css`

**Files:**
- Modify: [`src/index.css`](src/index.css), lines 90–132 (the `.light { ... }` block)

- [ ] **Step 1: Replace the entire `.light` block**

Replace lines 90 through 132 (everything inside `.light { ... }` including the closing brace, but NOT the closing brace of `@layer base`) with:

```css
  /* Light theme — Bone background, Ink text, darker Aqua/Honey for AA contrast */
  .light {
    --ink:        222 27% 7%;     /* foreground text in light */
    --graphite:   42 23% 95%;     /* near-white card / surface */
    --bone:       40 26% 96%;     /* page background */
    --aqua:       184 41% 38%;    /* darker for contrast on bone */
    --honey:      30 67% 42%;     /* darker for contrast on bone */
    --honey-deep: 22 65% 38%;

    --bone-muted: 222 27% 30%;
    --bone-faint: 222 27% 50%;
    --line:       222 27% 80%;

    --background:           var(--bone);
    --foreground:           var(--ink);
    --card:                 var(--graphite);
    --card-foreground:      var(--ink);
    --popover:              var(--graphite);
    --popover-foreground:   var(--ink);
    --primary:              var(--aqua);
    --primary-foreground:   var(--bone);
    --primary-light:        var(--aqua);
    --primary-dark:         var(--aqua);
    --secondary:            var(--graphite);
    --secondary-foreground: var(--ink);
    --accent:               var(--honey);
    --accent-foreground:    var(--bone);
    --accent-light:         var(--honey);
    --muted:                var(--graphite);
    --muted-foreground:     var(--bone-muted);
    --subtle:               var(--bone-muted);
    --border:               var(--line);
    --input:                var(--graphite);
    --ring:                 var(--aqua);
    --destructive:          var(--honey-deep);
    --destructive-foreground: var(--bone);

    --sidebar-background:        var(--graphite);
    --sidebar-foreground:        var(--ink);
    --sidebar-primary:           var(--aqua);
    --sidebar-primary-foreground: var(--bone);
    --sidebar-accent:            var(--honey);
    --sidebar-accent-foreground: var(--bone);
    --sidebar-border:            var(--line);
    --sidebar-ring:              var(--aqua);

    --gradient-primary: linear-gradient(135deg, hsl(var(--aqua)), hsl(var(--honey)));
    --gradient-hero:    linear-gradient(135deg, hsl(var(--aqua)) 0%, hsl(var(--honey)) 100%);
    --gradient-bg:      radial-gradient(ellipse at top, hsl(var(--aqua) / 0.06), transparent 50%);
    --gradient-dark:    linear-gradient(135deg, hsl(var(--bone)) 0%, hsl(var(--graphite)) 100%);

    --blur-subtle: blur(20px);
    --blur-strong: blur(40px);

    --shadow-soft: 0 4px 20px hsl(var(--aqua) / 0.08);
    --shadow-glow: 0 0 40px hsl(var(--aqua) / 0.10);
    --shadow-card: 0 8px 32px hsl(0 0% 0% / 0.06);

    --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    --transition-bounce: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }
```

Why this differs from `:root, .dark`:
- **`--ink` and `--bone` swap roles:** in light mode `--ink` becomes foreground text and `--bone` becomes page background. The palette tokens themselves keep the same lightness as dark mode (Ink stays `222 27% 7%`), but the role tokens (`--background`, `--foreground`) point to different palette tokens.
- **Aqua and Honey are darker:** `184 41% 38%` (vs `70%` in dark) and `30 67% 42%` (vs `63%` in dark) — these match the spec §3.2. Pale-tint Aqua fails AA contrast on a Bone background; the darker variant passes.
- **`--bone-muted`, `--bone-faint`, `--line` are based on Ink in light mode:** because in light mode text/lines are dark variants of the foreground (Ink), not light variants of Bone.

Note: I am only adjusting the variables that materially change. PR 3 may tune the specific lightness values after AA verification in real screenshots.

- [ ] **Step 2: Verify the `.light` block is intact**

Run:
```bash
grep -n "^\s*\.light {" /Users/admin/Documents/connectacreators/src/index.css
grep -nE "^\s*\}\s*$" /Users/admin/Documents/connectacreators/src/index.css | head -10
```
Expected: `.light {` appears once. The brace count below it is balanced (one closing `}` for `.light`, one for the outer `@layer base`).

- [ ] **Step 3: Verify build still works after `:root` + `.light` rewrite**

Run:
```bash
npm run build 2>&1 | tail -15
```
Expected: build succeeds. Any error here is likely a missing brace or malformed CSS — diff against this plan and fix.

- [ ] **Step 4: Commit progress (mid-task checkpoint)**

```bash
git add src/index.css
git commit -m "feat(theme): rewrite :root and .light token blocks for Ink+Aqua+Honey

Routes all role tokens (--background, --foreground, --primary, --accent,
--card, --border, etc.) through the new palette tokens (--ink, --bone,
--aqua, --honey, --honey-deep). Variable names kept identical so existing
Tailwind classes resolve through the role tokens without component edits.

Component-level CSS classes that hardcode cyan/lime (.glass-card-cyan,
.badge-cyan, .btn-17-*, scrollbar overrides, ReactFlow overrides) stay
as-is in this PR — they're migrated in PR 2's component sweep."
```

Why mid-task commit: the token swap is the riskiest part of PR 1; commit it so we can rollback to a known-good state if a later step breaks something.

---

## Task 5: Update `.font-caslon`, `.font-caslon-text`, `.font-wordmark` in `src/index.css`

**Files:**
- Modify: [`src/index.css`](src/index.css), lines 141–158 (the three custom font classes)

These are NOT Tailwind aliases — they're regular CSS classes defined inside `@layer base`. The 21 `className="font-caslon ..."` hits across `src/pages/*.tsx` resolve through these class definitions. By repointing them to EB Garamond here, all 21 sites automatically render the new font without any per-file changes. PR 2 will later do the optional cleanup of renaming the className itself to `font-serif`.

- [ ] **Step 1: Replace the three font-related class definitions**

Find the block that starts with:
```css
  .font-caslon {
    font-family: 'Big Caslon', 'Book Antiqua', 'Palatino Linotype', Palatino, Georgia, serif;
    letter-spacing: 0.06em;
  }
```

Replace lines 141–158 (the three classes `.font-caslon`, `.font-caslon-text`, `.font-wordmark`) with:

```css
  /* === Editorial serif aliases ===
     All three previously pointed to Caslon variants. As part of the 2026-05-14
     editorial rebrand, they now point to EB Garamond. The classNames themselves
     are kept so the 21 existing className="font-caslon ..." sites work without
     edits. PR 2 will optionally migrate those className references to
     `font-serif` for consistency. */
  .font-caslon {
    font-family: 'EB Garamond', Georgia, serif;
    letter-spacing: -0.015em;
    font-weight: 500;
  }

  .font-caslon-text {
    font-family: 'EB Garamond', Georgia, serif;
    letter-spacing: -0.005em;
  }

  .font-wordmark {
    font-family: 'EB Garamond', Georgia, serif;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
```

Why the letter-spacing changes: EB Garamond has tighter optical spacing than Big Caslon. `0.06em` was Big Caslon-specific compensation; for EB Garamond `-0.015em` matches the landing's title spacing. Wordmark keeps a wider tracking (`0.04em`) for uppercase brand display.

- [ ] **Step 2: Verify the replacement**

Run:
```bash
grep -n "font-family: 'EB Garamond'" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: at least 3 results (the three classes you just edited). Plus any in body/headings from Task 6, if you do this in parallel.

```bash
grep -n "Big Caslon" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: zero results.

---

## Task 6: Update `body` + `h1–h6` default font-family in `src/index.css`

**Files:**
- Modify: [`src/index.css`](src/index.css), lines 201–215 (the `body` and `h1, h2, h3, h4, h5, h6` rules)

- [ ] **Step 1: Replace the body and headings rules**

Find:
```css
  body {
    @apply bg-background text-foreground antialiased;
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    background: hsl(218 33% 4%);
  }

  .light body,
  body:has(.light) {
    background: hsl(210 20% 96%);
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    font-weight: 700;
  }
```

Replace with:
```css
  body {
    @apply bg-background text-foreground antialiased;
    font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    font-feature-settings: "ss01", "ss02";
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'EB Garamond', Georgia, serif;
    font-weight: 600;
    letter-spacing: -0.015em;
  }
```

Why the changes:
- **Body Figtree instead of Inter:** the spec's body font default. Figtree's `ss01`/`ss02` stylistic sets are the rounded apertures the landing uses; turn them on globally for consistency.
- **Removed hardcoded `background: hsl(218 33% 4%);`:** the `@apply bg-background` already sets the background through the role token, which now resolves to Ink (`#0A0E12`). Hardcoding a different navy on top would override the token. Same reason the `.light body` rule is removed — `bg-background` resolves to Bone in light mode automatically.
- **Headings to EB Garamond at weight 600:** spec hierarchy. `600` is the editorial sweet spot (matches landing H2s). Letter-spacing tightening matches the landing.

- [ ] **Step 2: Verify**

Run:
```bash
grep -nE "font-family: (Inter|'Inter')" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: zero results.

Run:
```bash
grep -n "background: hsl(218" /Users/admin/Documents/connectacreators/src/index.css
```
Expected: zero results.

---

## Task 7: Verify the index.css edits build cleanly

**Files:** (no edits this task — verification only)

- [ ] **Step 1: Run the full build**

Run:
```bash
npm run build 2>&1 | tail -25
```
Expected: build succeeds. Output ends with `✓ built in <N>s`. If anything fails, the error message points to the offending CSS line — fix and rerun before continuing.

- [ ] **Step 2: Quick grep audit on the index.css token rewrite**

Run all three:
```bash
echo "=== new tokens present ==="
grep -cE "^\s+--ink:" /Users/admin/Documents/connectacreators/src/index.css
grep -cE "^\s+--bone:" /Users/admin/Documents/connectacreators/src/index.css
grep -cE "^\s+--aqua:" /Users/admin/Documents/connectacreators/src/index.css
grep -cE "^\s+--honey:" /Users/admin/Documents/connectacreators/src/index.css
echo "=== old palette values absent from token blocks ==="
sed -n '/^@layer base {/,/^  body {/p' /Users/admin/Documents/connectacreators/src/index.css | grep -E "197 91%|84 68%|218 50%" | wc -l
echo "=== old fonts absent ==="
grep -E "Inter|Libre Caslon|Big Caslon" /Users/admin/Documents/connectacreators/src/index.css | wc -l
```
Expected:
- First four counts: each ≥ 2 (token defined in both `:root, .dark` and `.light` blocks)
- Old palette count: `0` (none of the old cyan/lime/sidebar HSLs are inside the token blocks)
- Old fonts count: `0` (no remaining reference to Inter / Libre Caslon / Big Caslon)

---

## Task 8: Update `tailwind.config.ts` — font families

**Files:**
- Modify: [`tailwind.config.ts`](tailwind.config.ts), lines 20–25 (the `fontFamily` block)

- [ ] **Step 1: Replace the fontFamily block**

Find:
```ts
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        'playfair': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        'inter': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
      },
```

Replace with:
```ts
      fontFamily: {
        sans:  ['Figtree', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
```

Why:
- **`sans` → Figtree:** the spec's body default. Every `font-sans` (default unless overridden) is now Figtree.
- **`serif` added:** every `font-serif` className becomes EB Garamond. This is the canonical class for editorial titles after the rebrand.
- **`mono` added:** for IDs, code, URLs. JetBrains Mono is in the Google Fonts import from Task 2.
- **`playfair` and `inter` aliases removed:** there are 3 className hits combined (per earlier grep). Those will fall back to the default Tailwind `font-family` for whatever class they currently use — likely `font-playfair`/`font-inter` users were already getting Inter, and now they'll get Figtree. PR 2 will sweep those 3 className hits to use `font-sans` or `font-serif` properly. No new className alias `font-caslon` is added because we handle that case via the CSS class def in Task 5.

- [ ] **Step 2: Verify the config still parses**

Run:
```bash
npx tsc --noEmit tailwind.config.ts 2>&1 | head -5
```
Expected: zero errors. If `tsc` complains about `Config` types being unused, that's fine — the file uses `satisfies Config` so type-checking is permissive.

- [ ] **Step 3: Run the build to verify Tailwind picks up the new font families**

Run:
```bash
npm run build 2>&1 | tail -15
```
Expected: build succeeds. The Tailwind utility classes `font-sans`, `font-serif`, `font-mono` now resolve to the new families.

---

## Task 9: Clean up `src/App.css`

**Files:**
- Modify: [`src/App.css`](src/App.css)

This file is CRA boilerplate that still references `#646cffaa` (purple) and `#61dafbaa` (React cyan). The `.read-the-docs` rule uses `#888`. Some of these may be unused, but to satisfy the hard-rule grep "no literal hex in styling" we either delete them or convert them. Inspection: the codebase does not import `App.css` anywhere meaningful (only `src/App.tsx` imports it for legacy reasons). Safest move: delete the cruft, keep only the rules actually used.

- [ ] **Step 1: Check what currently imports App.css**

Run:
```bash
grep -rn "App.css" /Users/admin/Documents/connectacreators/src --include="*.tsx" --include="*.ts" 2>/dev/null
```
Expected: one or two hits, likely in `src/App.tsx` or `src/main.tsx`. Note where it's used — if nothing references the `.logo`, `.read-the-docs`, or `.card` classes inside the app, they're dead and can be deleted.

- [ ] **Step 2: Replace App.css with a minimal version**

Replace the **entire contents** of `src/App.css` with:

```css
#root {
  max-width: 1280px;
  margin: 0 auto;
}
```

Why: the original `#root` rule centered content with `padding: 2rem` and `text-align: center`. That's CRA template defaults that don't match how the app actually renders (the app uses `bg-background`, full-width layouts, etc.). Stripping App.css to just the max-width keeps any layout consumers happy without imposing centering or padding. The `.logo`, `.read-the-docs`, `.card`, and `@keyframes logo-spin` rules are dead boilerplate — delete them.

If grep showed an actual consumer of `.logo` / `.read-the-docs` / `.card`, restore those classes but rewrite the colors with role tokens (`color: hsl(var(--muted-foreground))` instead of `color: #888`).

- [ ] **Step 3: Verify**

Run:
```bash
grep -E "#[0-9a-fA-F]{3,6}" /Users/admin/Documents/connectacreators/src/App.css
```
Expected: zero results.

---

## Task 10: Update `index.html` — swap Inter `<link>` for EB Garamond + Figtree + JetBrains Mono

**Files:**
- Modify: [`index.html`](index.html), line 14

- [ ] **Step 1: Replace the Inter `<link>`**

Find:
```html
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

Replace with:
```html
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

Why: `src/index.css` already `@import`s these fonts (Task 2), so the `<link>` is technically redundant — but the `<link>` makes the fonts available before the CSS is parsed, reducing FOUT (flash of unstyled text) on first paint. Keep both, matched.

Note: leave the `<link rel="preconnect">` to `fonts.googleapis.com` and `fonts.gstatic.com` (lines 12–13) — those are still useful and apply to any Google Fonts request.

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "fonts.googleapis.com" /Users/admin/Documents/connectacreators/index.html
```
Expected: one `<link>` to the new EB Garamond/Figtree/JetBrains Mono URL, plus the `preconnect` lines.

```bash
grep "family=Inter" /Users/admin/Documents/connectacreators/index.html
```
Expected: zero results.

---

## Task 11: Verify `landing.html` needs no changes

**Files:** (no edits — verification only)

- [ ] **Step 1: Sanity-check that landing.html still loads correctly**

The landing entry imports `src/landing-main.tsx` which imports `src/landing.css` which already has the EB Garamond + Figtree `@import`. The landing's fonts are independent of `src/index.css`. No edit needed.

Run:
```bash
grep -n "fonts.googleapis.com\|@import" /Users/admin/Documents/connectacreators/landing.html /Users/admin/Documents/connectacreators/src/landing.css | head -10
```
Expected: `landing.html` has no font links (correct — landing.css handles it). `landing.css` has the EB Garamond + Figtree `@import` line.

---

## Task 12: Full build + dev-server smoke test

**Files:** (none — verification only)

- [ ] **Step 1: Full clean build**

Run:
```bash
rm -rf dist node_modules/.vite
npm run build 2>&1 | tail -30
```
Expected: build succeeds. The `dist/` directory contains `index.html`, `landing.html`, and an `assets/` directory with hashed `.css` and `.js` bundles.

Why clean: Vite's cache may have a stale Tailwind output. Wiping it ensures we're testing the actual new build, not a cached one.

- [ ] **Step 2: Start the dev server**

Run:
```bash
npm run dev 2>&1 &
DEV_PID=$!
sleep 5
curl -s http://localhost:8080/ -o /dev/null -w "%{http_code}\n"
kill $DEV_PID 2>/dev/null
```
Expected: HTTP `200`. Adjust port if your local Vite uses something other than 8080 (check `vite.config.ts`).

If non-200: the dev server didn't start cleanly — inspect the background output by removing the `&` and reading the error.

- [ ] **Step 3: Manual visual sanity check (USER DOES THIS)**

Start the dev server (`npm run dev`) and open `http://localhost:8080/dashboard` in a browser. Check:

| Expected | What you should see |
|---|---|
| Page background | Near-black with very subtle blue cast (Ink `#0A0E12`) — **NOT** the old `#161a1f` blue-grey |
| Body text | Warm off-white (Bone `#EAE6DC`) in Figtree — **NOT** Inter |
| Primary buttons | Pale Aqua (`#8FD0D5`) — **NOT** cyan (`#0891B2`) |
| H1/H2 page titles | EB Garamond, serif, weight 600 — **NOT** sans-serif |
| `font-caslon` className usages | Rendered in EB Garamond (e.g., dashboard cards, page titles still labeled with `font-caslon`) |
| What WILL still look broken | `bg-cyan-500`/`bg-lime-400` Tailwind utilities, literal hex inline styles, custom CSS classes inside `src/index.css` (glass-card-cyan, badge-cyan, btn-17-*, scrollbar overrides). These are PR 2's job. |

Document any unexpected breakage (text invisible? Cards stacked wrong? Buttons missing?) — those are gaps in PR 1 to investigate before commit. If the only oddities are "I see cyan/lime patches in component internals," that's expected.

- [ ] **Step 4: Test theme toggle (still works)**

In the dev browser, find the ThemeToggle (top bar somewhere) and click it. Expected:
- Dark mode → Light mode swap
- Background flips Ink → Bone
- Text flips Bone → Ink
- Primary stays Aqua (darker shade for AA contrast)
- No JS errors in console

If light mode renders unreadable (e.g., bone text on bone background somewhere), note the page — PR 3 will fix. Don't block PR 1 on PR 3 issues unless the dashboard is *completely* unreadable.

---

## Task 13: Final commit + PR

**Files:**
- All edits from Tasks 2–10

- [ ] **Step 1: Stage everything**

Run:
```bash
git add src/index.css src/App.css tailwind.config.ts index.html
git status --short
```
Expected: four files staged (plus possibly any commits from Task 4's mid-task checkpoint already on the branch).

- [ ] **Step 2: Verify the diff one more time**

Run:
```bash
git diff --staged --stat
git diff --staged src/index.css | head -100
```
Read through to confirm: only token blocks, font-class definitions, body/h1-h6 rules, and the @import line changed. Component-level CSS classes (`.glass-card-cyan`, `.badge-cyan`, etc.) are UNTOUCHED.

If you see staged changes to unrelated parts of `src/index.css` (e.g., scrollbar styles, ReactFlow overrides), unstage them with `git restore --staged` and investigate — those belong in PR 2.

- [ ] **Step 3: Create the final commit**

```bash
git commit -m "$(cat <<'EOF'
feat(theme): PR 1 — global token swap to Ink+Aqua+Honey + EB Garamond/Figtree

Replaces the global :root and .light token blocks in src/index.css with
the editorial palette (Ink, Graphite, Bone, Aqua, Honey, Honey-deep).
Role tokens (--background, --foreground, --primary, --accent, --card,
--border, etc.) keep their names so existing Tailwind utility classes
auto-resolve to the new palette. Sidebar tokens point to the same
palette — no separate sidebar surface.

Fonts: swaps Inter (body) and Big Caslon (font-caslon class) for
Figtree (body, font-sans) and EB Garamond (headings, font-serif,
font-caslon class). Adds JetBrains Mono (font-mono) for upcoming
monospace fragments. Removes the Libre Caslon Text Google Fonts import.

Tailwind config: fontFamily.sans → Figtree, adds fontFamily.serif and
fontFamily.mono, removes legacy font-playfair / font-inter aliases.

Out of scope for this PR (handled in PR 2 component sweep):
- Tailwind static utilities like bg-cyan-500 / text-lime-400
- Literal hex in JSX inline styles
- Custom CSS classes inside src/index.css that hardcode cyan/lime
  (.glass-card-cyan, .badge-cyan, .btn-17-*, scrollbar overrides,
  ReactFlow overrides)

Per the spec a half-themed period after this PR is intentional. The
21 `className="font-caslon"` hits across src/pages/*.tsx automatically
render EB Garamond via the updated CSS class definition; PR 2 will
optionally migrate those classNames to `font-serif`.

Spec: docs/superpowers/specs/2026-05-14-app-editorial-rebrand-design.md
EOF
)"
```

- [ ] **Step 4: Push the branch + open PR**

```bash
git push -u origin rebrand/pr1-token-swap
```

If working in this repo's PR-via-GitHub workflow, open a PR titled "feat(theme): PR 1 — global token swap" pointing `rebrand/pr1-token-swap` → `main`. The PR description should include:

- Goal (one line)
- The "Out of scope" callout from the commit message
- A screenshot of the dashboard before/after (so reviewers see the half-themed period is expected)
- A link to the spec

- [ ] **Step 5: After merge, kick off PR 2 planning**

Once PR 1 is merged to `main`, the app is on the new palette globally with intentional cyan/lime patches in component internals. That's the trigger to invoke the writing-plans skill again with the same spec, this time scoped to PR 2 (component sweep).

---

## Spec coverage check

Each spec section has at least one task implementing it:

| Spec section | Task(s) |
|---|---|
| §2 Decision: Light mode | Task 4 |
| §2 Decision: font-caslon migrate | Task 5 |
| §2 Decision: Destructive = Honey-deep | Task 3 (`--destructive: var(--honey-deep)`) |
| §3.1 Dark theme tokens | Task 3 |
| §3.2 Light theme tokens | Task 4 |
| §3.3 Role-token plumbing | Task 3 + Task 4 (both have role-token block) |
| §3.4 Tailwind config fonts | Task 8 |
| §4 Typography hierarchy default (H1-H6 EB Garamond, body Figtree) | Task 6 |
| §6 PR 1 file list | Tasks 2, 3, 4, 5, 6, 8, 9, 10, 11 |
| §6 PR 1 expected breakage callout | Task 12 step 3 (the "What WILL still look broken" table) |

§2 Decision "Animations landing-only" needs no PR 1 task — it's a *non*-change, enforced by NOT porting the landing's animation files.

## Final notes for the engineer

- **Keep this PR small.** If you find yourself editing `.glass-card-cyan` or `.badge-cyan` inside `src/index.css`, stop — that's PR 2's job. PR 1's blast radius is intentionally token blocks + font definitions only.
- **Don't get clever with the role tokens.** The whole point of routing `--background → var(--ink)` is that components that read `--background` keep working. Don't try to inline the values.
- **The half-themed period is normal.** Reviewers will see cyan patches. The PR description should make this explicit.
