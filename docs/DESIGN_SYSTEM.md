# Connecta Design System

Reference for the rebrand. Match this when adding any new UI surface.

---

## 1. Typography

### Display / titles → Big Caslon

All page titles, hero headings, section headers, card labels, and modal titles use **Big Caslon** (a classical serif).

```tsx
<h1 className="font-caslon" style={{ letterSpacing: "0.02em" }}>...</h1>
```

The `.font-caslon` utility lives in [src/index.css](src/index.css#L130) and resolves to:

```
font-family: 'Big Caslon', 'Book Antiqua', 'Palatino Linotype', Palatino, Georgia, serif;
letter-spacing: 0.06em;  /* default — override per-site */
```

**Letter-spacing per context:**
- Hero h1 (landing page) — `0.02em`
- All other titles — `0.06em` (the class default)

**Weight:** prefer `font-light` (300). Reserve `font-bold` for the gold-gradient emphasis word inside hero h1.

### Body → Inter

Set globally in `body`. Don't override unless you have a reason.

---

## 2. Color Palette

The page lives in dark mode. Backgrounds are **neutral grey** (no blue cast).

| Role | Token / Hex | Usage |
|---|---|---|
| Page background | `#131315` | Top-level pages (signup, login, modals) |
| Sidebar/dashboard bg | `hsl(218 33% 4%)` | The legacy app background |
| Card fill (rest) | `#16171a` | All card surfaces at rest |
| Card fill (hover) | `#131315` | Subtle darken on hover |
| Card border | `rgba(255,255,255,0.08)` | Default thin border |
| Card border (hover) | `rgba(255,255,255,0.13)` | Brightens on hover |
| **Primary accent (cyan)** | `#22d3ee` / `#06B6D4` / `#0891B2` | Existing app accent — kept |
| **Secondary accent (warm gold)** | `#c9a96e` | Replaces the old lime — used in gradients, hot/flame badges, ambient glows |
| Foreground | `rgba(255,255,255,0.92)` | Primary text |
| Muted foreground | `rgba(255,255,255,0.35–0.4)` | Subdued copy |

### Gradients

```css
.gradient-brand       { background: linear-gradient(135deg, #0891B2, #c9a96e); }
.text-gradient-brand  { background: linear-gradient(135deg, #06B6D4, #c9a96e); -webkit-background-clip: text; ... }
```

Used for the gold-italic emphasis word in hero titles and stat numbers.

### Forbidden colors

**No lime / green** anywhere on the marketing site. Old refs to purge: `#84CC16`, `#a3e635`, `rgba(132,204,22,*)`, `bg-green-500`, `text-green-*`.

---

## 3. Logo

| Asset | Use |
|---|---|
| `src/assets/connecta-logo-new.png` | Full lockup (fingerprint + wordmark) — landing page navbar |
| `src/assets/connecta-favicon-icon.png` | Icon mark only — auth pages, modals, anywhere a small mark fits |
| Sidebar | Pure typographic "Connecta" in `font-caslon` at `0.02em`, no image |

The horse logo is **deprecated** — do not use.

---

## 4. Buttons

### Primary CTA → Ghost + Scribble

No fill, no border at rest. A wobbly pencil rectangle traces around the button on hover. Used for all main CTAs (Try It Free, Start Free Today, Sign In, Create Account, etc.).

```tsx
<button className="relative inline-flex items-center justify-center gap-2 py-3 px-8
                   text-sm font-semibold text-white/85 hover:text-white
                   transition-colors overflow-visible">
  <svg className="scribble-btn"
       viewBox="0 0 320 48" preserveAspectRatio="none"
       style={{ position: 'absolute', inset: -2, width: 'calc(100% + 4px)',
                height: 'calc(100% + 4px)', overflow: 'visible',
                pointerEvents: 'none', opacity: 0 }}>
    <path d="M10,3 C80,1.5 220,1 290,2 C306,2.5 316,5 317,10 C318,18 318,30 317,38
             C316,44 306,46 285,47 C200,48 100,48 30,47 C12,46 2,43 2,38
             C1,29 1,17 2,10 C2.5,6 5,3.5 10,3 Z"
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ strokeDasharray: 700, strokeDashoffset: 700 }} />
  </svg>
  Button text
</button>
```

The `:hover` rule that animates the scribble lives in [src/index.css](src/index.css) — selector targets `.scribble-btn` inside `a:hover` / `button:hover`. Adjust the SVG `viewBox` to roughly match the button's aspect ratio.

### Secondary / inline → Plain text link

Underlined `text-foreground/80` for inline links inside paragraphs.

---

## 5. Cards

```tsx
<div className="rounded-xl border border-[rgba(255,255,255,0.08)]
                bg-[#16171a] hover:bg-[#131315]
                hover:border-[rgba(255,255,255,0.13)] transition-colors">
  ...
  <h2 className="font-caslon"><ScribbleUnderline>{title}</ScribbleUnderline></h2>
  ...
</div>
```

### Card title hover → Pencil underline

Wrap the title text in [`<ScribbleUnderline>`](src/components/ui/ScribbleUnderline.tsx). On group-hover (any hover within the card), a wavy SVG line draws under the title.

The CSS lives in [src/index.css](src/index.css) — the `.scribble-path` rule transitions `stroke-dashoffset` from 130 → 0.

---

## 6. Sidebar Navigation

### Hover & active → Side mark

Thin white left bar (`1.5px × 55%`) scales in vertically on hover. Active state keeps the bar visible at higher opacity.

```tsx
<button className={`nav-side-mark relative ${isActive ? 'nav-active text-[#e8e8e8]' : 'text-[#aaa] hover:text-[#ccc]'}`}>
  <Icon /> {label}
</button>
```

Rules in [src/index.css](src/index.css) under `.nav-side-mark::before`. **No cyan glow, no gradient background** — those were the old tech aesthetic.

---

## 7. Inputs

```tsx
<input
  className="w-full px-3 py-2.5 rounded-lg text-foreground
             placeholder:text-muted-foreground/60 text-sm focus:outline-none transition-colors"
  style={{
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  }}
  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
/>
```

Subtle white border, focus brightens to `rgba(255,255,255,0.25)`. **No cyan glow** on focus.

---

## 8. Animations

- **No neon glow** anywhere. The old `BorderGlow` component is deprecated — don't use it for new work.
- Hover transitions: 150–250ms `ease`.
- Scribble strokes: 380–500ms `ease-out`.
- Side mark scale: 180ms `ease`.

---

## 9. Caching / Performance

User-specific data (display name, role, credits, selected client) is hydrated synchronously from `localStorage` via [`src/lib/sessionCache.ts`](src/lib/sessionCache.ts). New components that fetch user data should follow the same pattern: read cache on init, write cache after fetch. List pages use the same approach (stale-while-revalidate) — see EditingQueue, ContentCalendar for reference.

---

## 10. File Map

| Concern | Where |
|---|---|
| `.font-caslon`, `.scribble-path`, `.nav-side-mark::before`, scribble-btn animation | [src/index.css](src/index.css) (`@layer base`) |
| `<ScribbleUnderline>` component | [src/components/ui/ScribbleUnderline.tsx](src/components/ui/ScribbleUnderline.tsx) |
| Session cache utility | [src/lib/sessionCache.ts](src/lib/sessionCache.ts) |
| Logo assets | [src/assets/connecta-logo-new.png](src/assets/connecta-logo-new.png), [src/assets/connecta-favicon-icon.png](src/assets/connecta-favicon-icon.png) |

When adding a new page or component: pick from this doc first. When in doubt, copy from a recently-styled page (Signup, Settings, Dashboard).
