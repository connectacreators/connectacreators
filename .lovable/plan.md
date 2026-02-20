
# Animated Dotted Background for Dashboard Pages

## What We're Building
A subtle, continuously moving gradient-dotted background pattern (inspired by the reference image) that appears behind all dashboard/app pages. The dots will slowly drift diagonally, creating a premium, living feel without distracting from the content.

## Approach

### 1. Create a new `AnimatedDots` component
A lightweight CSS-only animated background using a radial-gradient dot pattern with a CSS `@keyframes` animation that slowly translates the pattern diagonally. No canvas or framer-motion needed -- pure CSS keeps it performant.

- Dot grid via `radial-gradient` (similar to the existing `GridPattern` component but animated)
- Slow diagonal drift using `@keyframes` on `background-position`
- Very low opacity so it stays subtle (around 0.03-0.05)
- Theme-aware colors (light vs dark mode)

### 2. Add it to dashboard pages
Insert the `AnimatedDots` component as a fixed/absolute background layer in the following pages:
- **Dashboard** (`src/pages/Dashboard.tsx`)
- **Scripts** (`src/pages/Scripts.tsx`)
- **Clients** (`src/pages/Clients.tsx`)
- **ClientDetail** (`src/pages/ClientDetail.tsx`)
- **LeadTracker** (`src/pages/LeadTracker.tsx`)
- **LeadCalendar** (`src/pages/LeadCalendar.tsx`)
- **Settings** (`src/pages/Settings.tsx`)
- **Subscription** (`src/pages/Subscription.tsx`)
- **Videographers** and **VideographerDetail**
- **BookingSettings**

---

## Technical Details

### New file: `src/components/ui/AnimatedDots.tsx`
- A `div` with `position: fixed`, `inset: 0`, `pointer-events: none`, `z-index: 0`
- Background: `radial-gradient(circle at 1px 1px, color 1px, transparent 0)` with ~30px spacing
- CSS animation: keyframe that shifts `background-position` over ~20-30 seconds in a loop (diagonal movement)
- Opacity: ~0.04 for subtlety
- The animation keyframes will be added inline or via a `style` tag to keep it self-contained

### Dashboard pages
- Add `<AnimatedDots />` as a child of the outermost wrapper `div` in each dashboard page, positioned behind all content
