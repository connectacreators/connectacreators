# Horse Logo Brand Integration — Design Spec

**Date**: 2026-03-21
**Status**: Approved via visual preview (v12)

## Overview

Integrate the Connecta horse logo (green-to-cyan gradient horse head) across the brand touchpoints: landing page hero, post-login splash screen, dashboard sidebar, and favicon.

## Assets

- **Static PNG**: `/Users/admin/Documents/Connecta-Horse-Logo.png` (267KB) — used in sidebar, favicon, canvas watermark
- **Animated video (hero)**: `hf_20260321_025830_aea5faa4-7299-47a9-a81f-d6fd8712d2f0.mp4` (7.2MB) — horse animation for hero section
- **Animated video (splash)**: `hf_20260321_042607_dbe04f45-e491-40a5-bea3-1efd6b46acb6.mp4` (3.2MB) — used in post-login splash only

**Asset handling**: Copy videos to `public/assets/` as `horse-hero.mp4` and `horse-splash.mp4` (static serving, no Vite bundling). Copy PNG to `src/assets/connecta-horse-logo.png` for imports. Transfer all assets to VPS during deployment.

## Integration Points

### 1. Landing Page Hero (`src/pages/LandingPageNew.tsx`)

**Route**: `/` (connectacreators.com root, NOT `/home`)

**Horse placement**: Centered above the pill badge (currently reads "ALL-IN-ONE CREATOR PLATFORM" — update text to "AI-Powered Creator Platform"). The horse is the brand centerpiece, prominently visible.

**Technical approach**:
- `<video>` element with `autoplay loop muted playsinline`
- `mix-blend-mode: lighten` to eliminate black video background
- `filter: brightness(1.3) contrast(1.4)` to crush dark grays to true black before blending
- `mask-image: radial-gradient(ellipse 75% 75% at 50% 50%, black 40%, transparent 68%)` for soft edge feathering
- Soft cyan-to-lime radial glow (`radial-gradient`) behind the horse, animated with subtle pulse
- Gentle float animation: `translateY(-10px)` over 8s ease-in-out cycle
- Height: ~180-200px

**Hero mockup replacement**: Replace existing ViralTodayMiniMockup + ScriptWizardHeroMockup with an interactive canvas representation. Extract as `src/components/CanvasHeroMockup.tsx` to avoid bloating LandingPageNew.tsx (already 1032 lines).

- **3-column grid layout**: `240px | 1fr | 220px`
- **Left column (Research)**: 4 input nodes — Viral Video, Text Notes, Competitor Analysis, Media Upload
- **Center column (AI Assistant)**: Full chat card with realistic conversation showing script generation workflow
- **Right column (Output)**: Generated Script node with Hook/Body/CTA preview
- **SVG connector lines**: Animated dashed bezier paths from input nodes → AI → output
- **Hover interaction**: Parent container uses `.canvas-grid:has(.node:hover) .node:not(:hover) { opacity: 0.35 }` to dim siblings. `:has()` works on the parent/ancestor, not siblings directly.
- **No background on nodes**: Transparent/near-transparent (`rgba(255,255,255,.015)`) to not obscure the horse watermark behind canvas section
- Each node has colored icon (cyan, yellow, purple, orange) for visual differentiation
- Output node uses lime green tinting to differentiate from input nodes
- **Mobile responsive**: On screens < 768px, collapse to single column (stacked vertically: inputs → AI chat → output) with connectors hidden

**Ambient background**: 3 radial gradient blobs (cyan, lime, teal) with slow drift/breathe animations (16-22s cycles), very low opacity (.03-.06)

**Canvas section watermark**: Static horse PNG at very low opacity (.04) centered behind the canvas mockup area

### 2. Post-Login Splash Screen (New Component: `src/components/SplashScreen.tsx`)

**Trigger**: Fires on first navigation to `/dashboard` after authentication via `AuthContext.onAuthStateChange`. Uses `sessionStorage` flag (`splash_shown`) so it only shows once per session. Check for existing `WelcomeSubscriptionModal` — splash plays first (1.2s), then modal shows after if applicable.

**Duration**: ~1.2 seconds

**Animation sequence** (use framer-motion `animate` prop, matching existing patterns in LandingPageNew.tsx):
1. Full-screen overlay (`position: fixed; inset: 0; background: #06090c`)
2. Splash video starts at **1 second mark** (`currentTime = 1`)
3. Video uses `mix-blend-mode: lighten` + `filter: brightness(1.3) contrast(1.4)` + radial mask
4. Burst-in: `scale: [1.3, 0.95, 1.02, 1.0]`, `filter: ["blur(20px)", "blur(0)"]` over 0.8s (spring easing)
5. Ring pulse: border circle expands from scale(0.5) to scale(2.8) and fades out
6. Loading bar: gradient fill (cyan → lime) over 1.2s
7. "CONNECTA" text fades in at 0.3s delay
8. Overlay fades out over 0.45s, reveals dashboard

### 3. Dashboard Sidebar (`src/components/DashboardSidebar.tsx`)

**Change**: Replace text wordmark with horse icon only (no "Connecta" text beside it).

**Implementation**:
- Import `connectaHorseLogo` from `@/assets/connecta-horse-logo.png`
- Replace `<img src={connectaLoginLogo}>` and `<img src={connectaLoginLogoDark}>` with the horse PNG (same image for both themes since the logo has its own colors)
- Height: ~30-32px
- No text label — just the horse icon in the logo area

### 4. Favicon

**Implementation**:
- Replace `public/favicon.png` (referenced by `index.html` line 6) with horse PNG resized to 32x32
- Optionally add `public/apple-touch-icon.png` (180x180) and reference in `index.html`

## Design Tokens (Preserved)

| Token | Value |
|-------|-------|
| Background | `#06090c` |
| Cyan accent | `#22d3ee` / `#06B6D4` |
| Lime accent | `#84CC16` |
| Brand gradient | `linear-gradient(135deg, #06B6D4 20%, #84CC16 80%)` |
| Font | Inter (300, 400, 500, 600, 700) |
| Border subtle | `rgba(255,255,255,.05)` |
| Text muted | `rgba(255,255,255,.35)` |

## Files to Modify

1. **`src/pages/LandingPageNew.tsx`** — Hero section: horse video above pill, swap mockup components for `<CanvasHeroMockup />`
2. **`src/components/DashboardSidebar.tsx`** — Replace text wordmark with horse icon
3. **New**: `src/components/CanvasHeroMockup.tsx` — Interactive canvas mockup for hero
4. **New**: `src/components/SplashScreen.tsx` — Post-login animated splash
5. **`src/App.tsx`** or **`src/pages/Dashboard.tsx`** — Wire splash screen into post-login flow
6. **`public/favicon.png`** — Replace with horse favicon
7. **`public/assets/`** — Add `horse-hero.mp4` and `horse-splash.mp4`
8. **`src/assets/`** — Add `connecta-horse-logo.png`

## Files NOT to Modify

- `src/pages/Home.tsx` — This is `/home` route, not the landing page
- Navbar logo — Stays as current text wordmark per user decision
- Footer — No changes

## Video Black Background Elimination

Both video assets have black backgrounds. The technique to make them transparent:

```css
mix-blend-mode: lighten;
filter: brightness(1.3) contrast(1.4);
mask-image: radial-gradient(ellipse 75% 75% at 50% 50%, black 40%, transparent 68%);
```

- `lighten` keeps only pixels brighter than the background
- `brightness(1.3) contrast(1.4)` crushes dark grays to true black
- Radial mask feathers the outer edges for a clean fade

## Interactions

- **Node hover**: Expand to show feature list, dim siblings to 35% via parent `:has()` selector
- **CTA click**: Triggers splash screen → dashboard transition
- **Horse float**: Gentle vertical bob animation (8s cycle)
- **Ambient glows**: 3 blobs with independent drift/breathe cycles (16-22s)
- **SVG connectors**: Animated dashed lines (stroke-dasharray: 8,5; 2s cycle)
