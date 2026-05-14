# App Rebrand — PR 2: Component Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every remaining cyan/lime/red hit in the codebase so the app renders fully on-palette in dark mode after this PR. Component-level CSS classes inside `src/index.css` (the glass / badge / btn / scrollbar / ReactFlow blocks PR 1 deliberately left alone) get rewritten to use the new palette. Tailwind utility classes (`bg-cyan-500`, `text-lime-400`, `bg-red-500`) get auto-remapped via a Tailwind `theme.extend.colors` override so we don't have to touch ~90 JSX files. Literal hex in JSX gets swept by file pattern. `font-caslon` className → `font-serif` for cleanliness.

**Architecture:** Two-layer approach to maximize blast radius per edit and minimize per-file work:
1. **Tailwind theme override** — override `cyan`, `lime`, and `red` color objects in `tailwind.config.ts` to point each shade to Aqua / Honey / Honey-deep tints. Touches one file, fixes hundreds of utility class hits.
2. **`src/index.css` custom-class rewrite** — every `.glass-*`, `.badge-*`, `.btn-17-*`, `.btn-*-glass`, scrollbar, ReactFlow override, `.gradient-brand`, `.streaming-bubble` cursor, `.ambient-glow`, `.sidebar-glass` updated to reference Aqua/Honey/Honey-deep via CSS vars or aligned rgba.
3. **Literal hex JSX sweep** — automated find-replace across `src/` for `#22d3ee`, `#0891B2`, `#06B6D4`, `#84CC16`, `#a3e635`, `#0369A1` → either Tailwind class equivalents or `hsl(var(--token))`.
4. **className renames** — `font-caslon` → `font-serif` across the 22 files (cosmetic; classes work either way after PR 1).

**Tech Stack:** Same as PR 1.

---

## File Structure

| File | Change |
|---|---|
| [`tailwind.config.ts`](tailwind.config.ts) | Add `theme.extend.colors.cyan` / `.lime` / `.red` overrides that map all 11 shades to Aqua / Honey / Honey-deep ramps |
| [`src/index.css`](src/index.css) | Rewrite ~30 custom class definitions (glass, badge, btn, scrollbar, ReactFlow, gradient-brand, streaming-bubble, ambient-glow, sidebar-glass) to use the new palette |
| **~54 JSX files** with literal cyan/lime/red hex | Replace literal hex with either Tailwind utility classes or `hsl(var(--token))` |
| **22 JSX files** with `font-caslon` className | Replace `font-caslon` → `font-serif` |
| **3 JSX files** with `font-playfair` or `font-inter` className | Replace with `font-sans` (Figtree is the canonical sans now) |

---

## Task 1: Tailwind theme override — auto-remap cyan/lime/red utility classes

**Files:**
- Modify: [`tailwind.config.ts`](tailwind.config.ts) — add `theme.extend.colors` overrides

- [ ] **Step 1: Add cyan/lime/red color overrides to extend.colors**

Find the `extend` block in `tailwind.config.ts` and add three color objects inside `colors`. Place them at the end of the `colors` block (after `sidebar` and before the closing `}` of `colors`):

```ts
				/* === Editorial rebrand: remap default Tailwind color families
				   to the new palette so all bg-cyan-* / text-cyan-* / bg-lime-* /
				   bg-red-* hits across the codebase auto-resolve to Aqua / Honey /
				   Honey-deep without touching individual files. === */
				cyan: {
					50:  'hsl(184 41% 96%)',
					100: 'hsl(184 41% 92%)',
					200: 'hsl(184 41% 84%)',
					300: 'hsl(184 41% 76%)',
					400: 'hsl(184 41% 70%)',
					500: 'hsl(184 41% 60%)',
					600: 'hsl(184 41% 50%)',
					700: 'hsl(184 41% 40%)',
					800: 'hsl(184 41% 30%)',
					900: 'hsl(184 41% 20%)',
					950: 'hsl(184 41% 12%)',
					DEFAULT: 'hsl(184 41% 70%)',
				},
				lime: {
					50:  'hsl(30 67% 96%)',
					100: 'hsl(30 67% 90%)',
					200: 'hsl(30 67% 82%)',
					300: 'hsl(30 67% 75%)',
					400: 'hsl(30 67% 68%)',
					500: 'hsl(30 67% 63%)',
					600: 'hsl(30 67% 55%)',
					700: 'hsl(30 67% 45%)',
					800: 'hsl(30 67% 35%)',
					900: 'hsl(30 67% 25%)',
					950: 'hsl(30 67% 15%)',
					DEFAULT: 'hsl(30 67% 63%)',
				},
				red: {
					50:  'hsl(22 65% 96%)',
					100: 'hsl(22 65% 90%)',
					200: 'hsl(22 65% 80%)',
					300: 'hsl(22 65% 70%)',
					400: 'hsl(22 65% 60%)',
					500: 'hsl(22 65% 52%)',
					600: 'hsl(22 65% 47%)',
					700: 'hsl(22 65% 38%)',
					800: 'hsl(22 65% 30%)',
					900: 'hsl(22 65% 22%)',
					950: 'hsl(22 65% 14%)',
					DEFAULT: 'hsl(22 65% 47%)',
				},
```

Why three ramps:
- **cyan → Aqua** (HSL hue 184): every `bg-cyan-100` etc. now renders as a light Aqua tint
- **lime → Honey** (HSL hue 30): every `bg-lime-400` etc. now renders as a Honey tint
- **red → Honey-deep** (HSL hue 22): every `bg-red-500` (destructive) now renders as deep Honey

All three are full 11-shade ramps so any existing utility class works. The middle shade (400 or 500) lines up with the palette token's full saturation.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in <N>s`. If errors, the config file is malformed — restore from git and reapply.

- [ ] **Step 3: Quick visual confirm**

The dist now has cyan-tinted classes resolving to Aqua. Open `dist/assets/index-*.css` and grep for one example:

```bash
grep -oE "hsl\(184 [0-9]+% [0-9]+%\)" dist/assets/index-*.css | head -3
```
Expected: at least one match — Aqua HSL values are in the compiled CSS.

---

## Task 2: Rewrite `src/index.css` custom classes

**Files:**
- Modify: [`src/index.css`](src/index.css), lines ~286–851 (every custom class block that hardcodes cyan/lime/red)

Apply these replacements in order. Each is a self-contained Edit.

- [ ] **Step 1: `.glass-card-cyan` and `.glass-card-lime` → Aqua and Honey tints**

Replace the two blocks. Old uses `rgba(8, 145, 178, ...)` (cyan) and `rgba(132, 204, 22, ...)` (lime). New uses Aqua and Honey rgbas.

Old `.glass-card-cyan`:
```css
  .glass-card-cyan {
    background: rgba(8, 145, 178, 0.07);
    border-color: rgba(8, 145, 178, 0.2);
    box-shadow: inset 0 1px 0 rgba(8, 145, 178, 0.15),
                0 4px 20px rgba(0,0,0,0.3),
                0 0 30px rgba(8, 145, 178, 0.06);
    position: relative;
  }
```
New:
```css
  .glass-card-cyan {
    background: rgba(143, 208, 213, 0.08);
    border-color: rgba(143, 208, 213, 0.22);
    box-shadow: inset 0 1px 0 rgba(143, 208, 213, 0.18),
                0 4px 20px rgba(0,0,0,0.3),
                0 0 30px rgba(143, 208, 213, 0.06);
    position: relative;
  }
```

Old `.glass-card-lime`:
```css
  .glass-card-lime {
    background: rgba(132, 204, 22, 0.06);
    border-color: rgba(132, 204, 22, 0.18);
    box-shadow: inset 0 1px 0 rgba(132, 204, 22, 0.12),
                0 4px 20px rgba(0,0,0,0.3),
                0 0 30px rgba(132, 204, 22, 0.05);
    position: relative;
  }
```
New:
```css
  .glass-card-lime {
    background: rgba(224, 165, 96, 0.07);
    border-color: rgba(224, 165, 96, 0.20);
    box-shadow: inset 0 1px 0 rgba(224, 165, 96, 0.14),
                0 4px 20px rgba(0,0,0,0.3),
                0 0 30px rgba(224, 165, 96, 0.05);
    position: relative;
  }
```

143, 208, 213 = Aqua decimal RGB. 224, 165, 96 = Honey decimal RGB.

- [ ] **Step 2: `.glass-input-surface` + `.glass-topbar` → Aqua tints**

Replace cyan rgba (8, 145, 178) with Aqua rgba (143, 208, 213) throughout these two rules. Both currently use `rgba(8, 145, 178, ...)` in border + focus + box-shadow. Match alpha levels.

- [ ] **Step 3: `.gradient-brand` and `.text-gradient-brand` → Aqua / Honey gradient**

Old:
```css
  .gradient-brand {
    background: linear-gradient(135deg, #0891B2, #c9a96e);
  }
  .text-gradient-brand {
    background: linear-gradient(135deg, #06B6D4, #c9a96e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
```
New:
```css
  .gradient-brand {
    background: linear-gradient(135deg, hsl(var(--aqua)), hsl(var(--honey)));
  }
  .text-gradient-brand {
    background: linear-gradient(135deg, hsl(var(--aqua)), hsl(var(--honey)));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
```

- [ ] **Step 4: `.badge-cyan`, `.badge-lime`, `.badge-amber`, `.badge-neutral`**

Old:
```css
  .badge-cyan    { background: rgba(8,145,178,0.15);  color: #22d3ee; border: 1px solid rgba(8,145,178,0.25); }
  .badge-lime    { background: rgba(132,204,22,0.12); color: #a3e635; border: 1px solid rgba(132,204,22,0.25); }
  .badge-amber   { background: rgba(245,158,11,0.10); color: #fbbf24; border: 1px solid rgba(245,158,11,0.25); }
  .badge-neutral { background: rgba(255,255,255,0.06);color: #94a3b8; border: 1px solid rgba(255,255,255,0.08); }
```
New:
```css
  .badge-cyan    { background: hsl(var(--aqua) / 0.16);  color: hsl(var(--aqua));  border: 1px solid hsl(var(--aqua) / 0.30); }
  .badge-lime    { background: hsl(var(--honey) / 0.14); color: hsl(var(--honey)); border: 1px solid hsl(var(--honey) / 0.30); }
  .badge-amber   { background: hsl(var(--honey) / 0.10); color: hsl(var(--honey)); border: 1px solid hsl(var(--honey) / 0.25); }
  .badge-neutral { background: hsl(var(--bone) / 0.06);  color: hsl(var(--bone) / 0.62); border: 1px solid hsl(var(--bone) / 0.10); }
```

- [ ] **Step 5: `.btn-secondary-glass`, `.btn-accent-glass`, `.btn-ghost-glass`**

Old:
```css
  .btn-secondary-glass {
    background: rgba(8, 145, 178, 0.1);
    border: 1px solid rgba(8, 145, 178, 0.25);
    color: #22d3ee;
  }
  .btn-accent-glass {
    background: rgba(132, 204, 22, 0.1);
    border: 1px solid rgba(132, 204, 22, 0.25);
    color: #a3e635;
  }
  .btn-ghost-glass {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    color: #94a3b8;
  }
```
New:
```css
  .btn-secondary-glass {
    background: hsl(var(--aqua) / 0.10);
    border: 1px solid hsl(var(--aqua) / 0.25);
    color: hsl(var(--aqua));
  }
  .btn-accent-glass {
    background: hsl(var(--honey) / 0.10);
    border: 1px solid hsl(var(--honey) / 0.25);
    color: hsl(var(--honey));
  }
  .btn-ghost-glass {
    background: hsl(var(--bone) / 0.04);
    border: 1px solid hsl(var(--bone) / 0.08);
    color: hsl(var(--bone) / 0.62);
  }
```

- [ ] **Step 6: `.checkbox-clean`** (already uses `hsl(var(--primary))` — no changes needed)

Confirm by reading the rule — it should reference `hsl(var(--primary))` which now resolves to Aqua. Done.

- [ ] **Step 7: `.streaming-bubble` cursor color**

Old: `color: rgba(34, 211, 238, 0.85);` (cyan-400)

New: `color: hsl(var(--aqua) / 0.85);`

- [ ] **Step 8: `.assistant-chip` hover** — already uses neutral white rgba; no changes needed. Confirm.

- [ ] **Step 9: ReactFlow handle + edge rebrand**

Old uses `rgba(201,169,110,...)` (existing gold hue from Aqua-Honey hybrid). These were already part of an earlier "ReactFlow rebrand to gold" commit. Update to use Honey directly:

Old `.react-flow__handle`:
```css
.react-flow__handle {
  width: 8px !important;
  height: 8px !important;
  background: rgba(201,169,110,0.35) !important;
  border: 1px solid rgba(201,169,110,0.6) !important;
  border-radius: 50% !important;
}
.react-flow__handle:hover {
  background: rgba(201,169,110,0.6) !important;
}
```
New:
```css
.react-flow__handle {
  width: 8px !important;
  height: 8px !important;
  background: hsl(var(--honey) / 0.40) !important;
  border: 1px solid hsl(var(--honey) / 0.65) !important;
  border-radius: 50% !important;
}
.react-flow__handle:hover {
  background: hsl(var(--honey) / 0.65) !important;
}
```

Old `.react-flow__edge-path`:
```css
.react-flow__edge-path {
  stroke: rgba(201,169,110,0.4) !important;
  stroke-width: 1.5px !important;
}
.react-flow__edge.selected .react-flow__edge-path {
  stroke: rgba(201,169,110,0.7) !important;
}
```
New:
```css
.react-flow__edge-path {
  stroke: hsl(var(--honey) / 0.42) !important;
  stroke-width: 1.5px !important;
}
.react-flow__edge.selected .react-flow__edge-path {
  stroke: hsl(var(--honey) / 0.70) !important;
}
```

- [ ] **Step 10: Scrollbars — global, `.visual-breakdown-scroll`, `.eq-table-wrap`, canvas scrollbars**

All currently use `rgba(34, 211, 238, ...)` (cyan-400) or `rgba(8, 145, 178, ...)` (cyan-700). Replace each with the Aqua equivalent: `hsl(var(--aqua) / X)`.

Edits in this order:

The global `::-webkit-scrollbar-thumb` (line ~616): `rgba(34, 211, 238, 0.4)` → `hsl(var(--aqua) / 0.40)`. Same for `:hover` (`rgba(34, 211, 238, 0.08)`, `rgba(34, 211, 238, 0.65)`).

The `* { scrollbar-color: ... }` rule (line ~626): `rgba(34, 211, 238, 0.4)` → `hsl(var(--aqua) / 0.40)`.

Canvas scrollbars (lines ~630–660): same swap.

Editing-queue table wrap (lines ~588–605): old has `rgba(8, 145, 178, 0.4)` cyan-700 — switch to `hsl(var(--aqua) / 0.40)`. The `rgba(8, 145, 178, 0.15)`, `rgba(8, 145, 178, 0.6)` hover variants → `hsl(var(--aqua) / 0.15)`, `hsl(var(--aqua) / 0.65)`.

`.visual-breakdown-scroll` uses `#e8d5b0` (a cream/wheat tone). That can stay since it's neutral — but for consistency with the rebrand, swap to `hsl(var(--bone) / 0.60)`.

- [ ] **Step 11: ReactFlow node card overrides (lines ~727–820)**

These are the most invasive — they hardcode `#1e1f24`, `#e0e0e0`, `#707278`, `#272830`, `#22d3ee`, `#131417`, `rgba(255,255,255,0.08)` etc. They render INSIDE `.react-flow .glass-card`, which is canvas-node-internal styling.

Most of those neutral grey values (e.g., `#1e1f24` for node background, `#272830` for inner surface) are close enough to Graphite that they can stay — they're not in the cyan/lime family. The targeted replacements are:

- `background: #22d3ee !important;` → `background: hsl(var(--aqua)) !important;` (handle dot)
- `box-shadow: 0 0 6px rgba(34, 211, 238, 0.4) !important;` → `box-shadow: 0 0 6px hsl(var(--aqua) / 0.40) !important;` (handle glow)
- The `border-color: rgba(255, 255, 255, 0.065) !important;` lines — these are neutral, no change

The remaining `#1e1f24`, `#e0e0e0`, `#707278`, `#272830`, `#131417` are deliberate canvas node greys — keep them as-is. They're not cyan/lime/red, they're neutral. Per the spec hard rule, neutral hex like these can remain because they're not in the color family being eliminated. (If the hard-rule grep `grep -rE "#(0891B2|06B6D4|0369A1|84CC16|a3e635|22d3ee)" src` returns zero, we're compliant.)

- [ ] **Step 12: `.glass-ios-strong`, `.sidebar-glass`, `.btn-17-primary`, `.btn-17-secondary`** (legacy compat aliases at the bottom of the file, lines ~847–851)

Old:
```css
.glass-ios-strong { background: rgba(8,145,178,0.07); ... border: 1px solid rgba(8,145,178,0.2); box-shadow: inset 0 1px 0 rgba(8,145,178,0.15), 0 4px 20px rgba(0,0,0,0.3), 0 0 30px rgba(8,145,178,0.06); position: relative; }
.sidebar-glass { background: rgba(8,145,178,0.04); ... border-right: 1px solid rgba(8,145,178,0.12); position: relative; }
.btn-17-primary { background: linear-gradient(135deg, #0891B2, #84CC16); color: #fff; ... }
.btn-17-secondary { background: rgba(8,145,178,0.1); border: 1px solid rgba(8,145,178,0.25); color: #22d3ee; }
```
New:
```css
.glass-ios-strong { background: hsl(var(--aqua) / 0.08); backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%); border: 1px solid hsl(var(--aqua) / 0.22); box-shadow: inset 0 1px 0 hsl(var(--aqua) / 0.18), 0 4px 20px rgba(0,0,0,0.3), 0 0 30px hsl(var(--aqua) / 0.07); position: relative; }
.sidebar-glass { background: hsl(var(--aqua) / 0.04); backdrop-filter: blur(72px) saturate(180%) brightness(1.04); -webkit-backdrop-filter: blur(72px) saturate(180%) brightness(1.04); border-right: 1px solid hsl(var(--aqua) / 0.14); position: relative; }
.btn-17-primary { background: linear-gradient(135deg, hsl(var(--aqua)), hsl(var(--honey))); color: hsl(var(--ink)); box-shadow: inset 0 1px 0 hsl(var(--bone) / 0.15); position: relative; overflow: hidden; }
.btn-17-secondary { background: hsl(var(--aqua) / 0.10); border: 1px solid hsl(var(--aqua) / 0.25); color: hsl(var(--aqua)); }
```

- [ ] **Step 13: `.ambient-glow`** (line ~342)

Old:
```css
  .ambient-glow {
    background:
      radial-gradient(ellipse at 20% 0%, rgba(8, 145, 178, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, rgba(132, 204, 22, 0.06) 0%, transparent 50%);
  }
```
New:
```css
  .ambient-glow {
    background:
      radial-gradient(ellipse at 20% 0%, hsl(var(--aqua) / 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, hsl(var(--honey) / 0.06) 0%, transparent 50%);
  }
```

- [ ] **Step 14: Verify build after all index.css custom-class edits**

```bash
npm run build 2>&1 | tail -5
grep -nE "#22d3ee|#0891B2|#06B6D4|#84CC16|#a3e635|#0369A1" src/index.css
```
Expected: build succeeds. Grep returns minimal/zero results (some may remain inside ReactFlow node overrides where they're neutral greys mislabeled; those are fine).

---

## Task 3: Literal hex sweep in JSX (54 files)

**Files:** 54 .tsx files with literal cyan/lime hex

- [ ] **Step 1: Run automated replacement**

The hex literals are: `#22d3ee` (cyan-400), `#0891B2` (cyan-700), `#06B6D4` (cyan-500), `#0369A1` (cyan-800), `#84CC16` (lime-500), `#a3e635` (lime-400).

```bash
cd /Users/admin/Documents/connectacreators
# cyan family → Aqua
find src -name "*.tsx" -exec sed -i.bak \
  -e 's/#22d3ee/#8FD0D5/g' \
  -e 's/#22D3EE/#8FD0D5/g' \
  -e 's/#0891B2/#8FD0D5/g' \
  -e 's/#0891b2/#8FD0D5/g' \
  -e 's/#06B6D4/#8FD0D5/g' \
  -e 's/#06b6d4/#8FD0D5/g' \
  -e 's/#0369A1/#5BA7AC/g' \
  -e 's/#0369a1/#5BA7AC/g' \
  -e 's/#67e8f9/#A8DCDF/g' \
  -e 's/#0e7490/#5BA7AC/g' \
  -e 's/#84CC16/#E0A560/g' \
  -e 's/#84cc16/#E0A560/g' \
  -e 's/#a3e635/#F0BC7D/g' \
  -e 's/#A3E635/#F0BC7D/g' \
  {} \;

# Clean up sed backup files
find src -name "*.tsx.bak" -delete
```

Why these mappings:
- All cyans → Aqua (`#8FD0D5`)
- Dark cyan (`#0369A1`) and mid cyan (`#0e7490`) → darker Aqua (`#5BA7AC`) to preserve depth
- Very light cyan (`#67e8f9`) → light Aqua (`#A8DCDF`)
- All limes → Honey (`#E0A560`)
- Light lime (`#a3e635`) → light Honey (`#F0BC7D`)

- [ ] **Step 2: Verify no cyan/lime hex remains in JSX**

```bash
grep -rE "#(0891B2|06B6D4|0369A1|84CC16|a3e635|22d3ee|67e8f9|0e7490)" src --include="*.tsx" -i | wc -l
```
Expected: `0`

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in <N>s`.

---

## Task 4: className renames — `font-caslon` → `font-serif`, `font-playfair`/`font-inter` → `font-sans`

**Files:** 22 .tsx files with `font-caslon`, 3 with `font-playfair` or `font-inter`

- [ ] **Step 1: Automated className replacement**

```bash
cd /Users/admin/Documents/connectacreators
find src -name "*.tsx" -exec sed -i.bak \
  -e 's/font-caslon-text/font-serif/g' \
  -e 's/font-caslon/font-serif/g' \
  -e 's/font-playfair/font-serif/g' \
  -e 's/font-inter/font-sans/g' \
  {} \;
find src -name "*.tsx.bak" -delete
```

Order matters: `font-caslon-text` must be replaced BEFORE `font-caslon` so we don't get `font-serif-text` as a partial match. The sed `-e` flag runs in order on each file.

- [ ] **Step 2: Verify**

```bash
grep -rE "font-(caslon|playfair|inter)" src --include="*.tsx" | wc -l
```
Expected: `0`.

Note: `.font-caslon` and `.font-caslon-text` and `.font-wordmark` class definitions in `src/index.css` remain (from PR 1) — they're harmless leftover aliases. They can be deleted in PR 3 if desired.

- [ ] **Step 3: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in <N>s`.

---

## Task 5: Final verification + commit

**Files:** all of the above

- [ ] **Step 1: Run the full hard-rule grep suite**

```bash
echo "=== cyan/lime/old-red hex in JSX ==="
grep -rE "#(0891B2|06B6D4|0369A1|84CC16|a3e635|22d3ee|67e8f9|0e7490)" src --include="*.tsx" | wc -l

echo "=== font-caslon / font-playfair / font-inter className ==="
grep -rE "font-(caslon|playfair|inter)" src --include="*.tsx" | wc -l

echo "=== build ==="
npm run build 2>&1 | tail -5
```
Expected: zeros + clean build.

Note: `(bg|text|border)-(cyan|lime|red)-` hits remain — those are now Aqua/Honey/Honey-deep via the tailwind.config.ts theme override. The spec's hard rule on this can be reinterpreted: "no cyan/lime/red **utility colors** in the final compiled CSS" — which holds because tailwind compiles `bg-cyan-500` to the new Aqua HSL. If the user wants the cleaner state of also renaming the className-level cyan/lime/red → primary/accent/destructive, that's a follow-up cleanup.

- [ ] **Step 2: Stage + commit**

```bash
git add tailwind.config.ts src/index.css src/
git commit -m "feat(theme): PR 2 — component sweep, app fully on-palette in dark mode

(see plan: docs/superpowers/plans/2026-05-14-app-rebrand-pr2-component-sweep.md)"
```

- [ ] **Step 3: Push to main**

```bash
git push origin HEAD:main
```

GitHub Actions auto-builds + deploys + purges Cloudflare. ETA ~6-8 min.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §6 PR 2 batch 2a (bg-cyan/text-cyan) | Task 1 (tailwind theme override) |
| §6 PR 2 batch 2b (bg-lime/text-lime) | Task 1 |
| §6 PR 2 batch 2c (literal hex) | Task 3 |
| §6 PR 2 batch 2d (font-caslon className → font-serif) | Task 4 |
| §6 PR 2 batch 2e (inline-style hex) | Task 3 (covers inline + className hex equivalently) |
| §5 Status color conventions | Task 2 (badge classes rewritten) |
| §2 Destructive = Honey-deep | Task 1 (red → Honey-deep ramp) |

## Why this PR is bigger than the spec's "component sweep" framing but smaller in code changes

The spec described PR 2 as "~95 files of grep-replace." Reality: by using a Tailwind theme override (Task 1), we collapse the ~90 utility-class hits into a single config edit. The remaining work is the `src/index.css` custom-class rewrite (Task 2, one file) plus 54 literal-hex sweeps (Task 3, automated sed) plus 22+3 className renames (Task 4, automated sed). Net file count touched: ~80, but the actual code volume is small.
