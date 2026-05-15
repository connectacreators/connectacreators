# Landing page — mobile adaptation

**Status:** approved 2026-05-15
**File:** `src/pages/LandingPageNew.tsx` (+ `src/landing.css`, `src/components/landing/*`)
**Goal:** Make the editorial landing readable, calm, and fast on phones (≤768px). Cluttered first, slow second.

## Problem

`LandingPageNew.tsx` (2224 lines) was designed desktop-first. On phones it currently:

- Crowds the hero with two absolutely-positioned `InteractiveSticker` doodles (`yuppiesBubble`, `yuppiesMagnifyingGlass`) sized as fixed pixels.
- Renders the `PromptStream` hero as left/right `CurvedLoop` SVG marquees that need viewport width to meet at the center mic — on a phone the curves break.
- Runs a global `mousemove` proximity tracker that updates `--prox-wght` on every `.prox-word`/`.prox-letter` — touch devices have no cursor so it burns CPU listening for nothing.
- Runs GSAP `ScrollFloat` per-character animation on every section H2 + Final CTA.
- Mixes left-aligned and centered section headers (The Brain and Publishing teaser are left-aligned).
- Has only one media query (`@media (max-width: 768px)` at landing.css:279) adjusting bone-panel margin. Everything else is desktop layout squashed onto a 375px viewport.

## Design — Strategic trim, everything centered

Keep all 7 sections in order. Keep editorial soul (EB Garamond + ink/bone palette + honey/aqua italics + bone-panel rhythm). Cut decorative + animation weight on mobile. Center every section.

### Section-by-section trim

| Section | Keep on mobile | Cut on mobile |
|---|---|---|
| **Hero** | Eyebrow, H1 ("Go *Viral,* Get *Clients.*"), two CTAs | `yuppiesBubble` + `yuppiesMagnifyingGlass` stickers; `LetterRise` per-letter rise; `PromptStream`'s two `CurvedLoop` halves |
| **Hero (replaced)** | Centered vertical trio: italic prompt line → static waveform pill → tilted output band | The marquee animation on the output band (one static line) |
| **Metrics** | Bone panel, 7K → 62K stat, single-line proof | `miroodles-laptop-eye` sticker |
| **The Brain** | H2 + lede + **one** representative node card (left-aligned card body, but card itself centered) | Full multi-node Super Canvas mockup + connectors; `brain-doodle` sticker; ScrollFloat |
| **Viral Today** | H2 + lede + "See today's picks →" CTA | Animated feed preview cards |
| **Pipeline** | H2 + 3 tiles (Editing · Calendar · Companion) in a 3-col grid with icon + name | Long-form per-tile descriptions; ScrollFloat |
| **Publishing teaser** | H2 + 2-line lede (re-aligned to centered) | Decorative visual block; ScrollFloat |
| **Testimonial** | Quote, name, proof line | `hands-like` heart sticker; ScrollFloat |
| **Final CTA** | H2 + single aqua pill + trust line | Secondary "Watch demo" CTA (duplicate of hero) |

### Centering

All section content centered on mobile. Specifically:

- `Section 1 — The Brain` — desktop is left-aligned with the Super Canvas mock on the right. Mobile: H2 + lede + node card all `text-align: center` / `margin: 0 auto` / `max-width: 320px`.
- `Section 4 — Publishing teaser` — desktop is left-aligned. Mobile: re-aligned center.

### Global cuts on mobile

These are runtime cuts (not just CSS hide) so the JS doesn't run at all on phones:

- **Mousemove proximity tracker** — wrap the global listener in `if (!isMobile)` so it never attaches.
- **GSAP ScrollFloat per-char animation** — `ScrollFloat` falls back to a plain `<h2>` on mobile (no GSAP import, no ScrollTrigger).
- **CurvedLoop marquees** — not rendered on mobile.
- **InteractiveSticker** — short-circuits to `null` on mobile.
- **PromptStream** — renders a different child component on mobile (the centered trio).
- **LetterRise** — falls back to a plain rendering on mobile.

## Implementation strategy

**Breakpoint:** `768px` — matches the existing single media query in `landing.css:279` and the in-file `hidden-mobile`/`hidden-desktop` rule at `LandingPageNew.tsx:1201`.

**Detection:** A single `useIsMobile()` hook (already exists at `src/hooks/use-mobile.tsx`) returning a stable boolean. Used in:

- `LandingPageNew.tsx` — gates the proximity tracker `useEffect`, gates LetterRise, picks `PromptStreamMobile` vs `PromptStream`, returns `null` from `InteractiveSticker` wrapper, gates `ScrollFloat` to plain heading.
- `src/components/landing/PromptStream.tsx` — exports a sibling `PromptStreamMobile` (centered trio, static).
- `src/components/landing/ScrollFloat.tsx` — early-returns plain children when mobile.
- `src/components/landing/InteractiveSticker.tsx` — early-returns `null` when mobile.

**Why runtime, not just CSS:** User picked "cluttered first, slow second" but we get both for free — runtime gating skips the GSAP/IntersectionObserver/mousemove setup entirely, so mobile loads a much lighter JS path.

**Why a hook, not media query CSS:** Some of the cuts (proximity listener, GSAP setup, IntersectionObserver) live in `useEffect`s that fire regardless of CSS visibility. Only a JS check skips them.

**Mobile-only CSS:** Added to `landing.css` inside a new `@media (max-width: 768px) { .landing-editorial … }` block:

- All section content `text-align: center; margin-left: auto; margin-right: auto;`
- Section padding compressed (`padding: 64px 18px` instead of desktop's `120-140px 0`)
- Bone panels keep `margin: 0 10px` + `border-radius: 28px` (already there) but get reduced internal padding
- Hero H1 `font-size: clamp(34px, 9vw, 44px)` (down from `clamp(40px, 7vw, 88px)`)
- Section H2 `font-size: clamp(24px, 6vw, 30px)`

## Out of scope

- Desktop landing changes — desktop stays exactly as it is.
- New copy. Wording stays.
- New routes or sections.
- Touch gestures / swipe interactions. (Approach C was rejected.)
- A separate `LandingPageNewMobile.tsx` file. Keep one file, gate at the component level.

## Files touched

1. `src/pages/LandingPageNew.tsx` — import `useIsMobile`, gate proximity tracker, swap PromptStream → PromptStreamMobile, swap LetterRise → plain heading, cut secondary CTA on mobile, re-center two left-aligned sections.
2. `src/components/landing/PromptStream.tsx` — add `PromptStreamMobile` export (centered vertical trio, no CurvedLoop, no animation).
3. `src/components/landing/ScrollFloat.tsx` — early-return plain children when `useIsMobile()`.
4. `src/components/landing/InteractiveSticker.tsx` — early-return `null` when `useIsMobile()`.
5. `src/landing.css` — append a `@media (max-width: 768px)` block with centering + compressed padding + scaled-down hero/H2 sizes.

## Acceptance

- iPhone-sized viewport (375 × 812): page scrolls smoothly, no horizontal overflow, no stickers visible, hero is the centered trio.
- Chrome DevTools throttled to "Slow 3G + 4× CPU slowdown": page is interactive within ~3s and doesn't drop frames on scroll.
- Desktop ≥1024px: visually unchanged from current production.
- `prefers-reduced-motion: reduce` continues to disable remaining animations (already wired at `landing.css:619`).

## Future (not this spec)

- Sticky bottom CTA bar on mobile after the user scrolls past the hero.
- A11y audit (color contrast on honey-italics against bone).
- Real product previews (replace the node card mock with a screenshot of an actual Super Canvas board).
