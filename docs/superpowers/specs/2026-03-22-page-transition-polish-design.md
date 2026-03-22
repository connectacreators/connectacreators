# Page Transition & Loading Polish — Design Spec
**Date:** 2026-03-22
**Status:** Approved

---

## Problem

Navigating between dashboard pages feels glitchy because:
1. `<Outlet />` in `DashboardLayout` swaps pages with no animation — old page vanishes instantly
2. Per-card stagger delay (`i * 0.08s`) compounds badly with many items (10 cards = 0.8s before last card appears)
3. Data-fetch loading states show a bare spinner, then cards pop in abruptly

## Goal

Make page navigation feel fast and fluid:
- Pages transition with a smooth fade-up (not a jarring swap)
- Cards animate in quickly and consistently across all pages
- While data loads, the page shows content-shaped skeletons instead of a spinner

---

## Architecture

### 1. Route-Level Transition — `DashboardLayout.tsx`

Add `useLocation()` and wrap `<Outlet />` with `AnimatePresence mode="wait"`:

```tsx
const location = useLocation();

<AnimatePresence mode="wait" initial={false}>
  <motion.div
    key={location.pathname}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15, ease: "easeInOut" }}
    className="flex-1 flex flex-col min-h-0"
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

- `mode="wait"` — old page fully exits before new page enters (prevents overlap glitch)
- `initial={false}` — no animation on first app load, only on navigation
- Exit: 0.12s fade out; Enter: 0.15s fade in
- The `motion.div` takes over the flex layout role of the current plain `div`

---

### 2. `PageTransition` Component — new file

Create `src/components/PageTransition.tsx`:

```tsx
import { motion } from "framer-motion";

export default function PageTransition({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

Every page wraps its outermost content div with `<PageTransition>`. This gives the content a subtle rise-and-fade on mount, layered on top of the route-level fade.

**Pages to update** (all authenticated dashboard pages, ~30 files):
Replace outermost `<div className="flex-1 ...">` or `<main ...>` with `<PageTransition className="flex-1 ...">`.

---

### 3. Card Stagger Fix

Current pattern in Dashboard, Clients, Checkout, ClientDatabase:
```tsx
transition: { delay: i * 0.08, duration: 0.45 }
```

Replace with:
```tsx
transition: { delay: Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }
```

Changes:
- Delay per item: `0.08s → 0.04s` (half the wait)
- Max total stagger delay: capped at `0.2s` (item 5 and beyond all start at 0.2s)
- Duration: `0.45s → 0.35s` (snappier individual animation)
- Net effect: a 10-card grid finishes animating in 0.55s instead of 1.25s

This fix applies to every `fadeUp` / `custom={i}` pattern in the codebase.

---

### 4. Skeleton Loaders

Replace bare `<Loader2 animate-spin>` loading states with content-shaped skeletons on 5 key pages. Each skeleton mirrors the visual structure of the real content so the page feels "already loaded."

The existing `Skeleton` component (`src/components/ui/skeleton.tsx`) is used as-is (animate-pulse + bg-muted).

#### Dashboard (`/dashboard`)
```
[circle]  [line ████████]
           [line ██████]

[card ████████████]  [card ████████████]  [card ████████████]
[████████████████]   [████████████████]   [████████████████]
```
- 1 greeting skeleton (circle + 2 lines)
- 3 card skeletons matching the grid layout

#### Clients (`/clients`)
```
[avatar] [line ████████]  [badge]  [badge]
[avatar] [line ██████]    [badge]
[avatar] [line ████████]  [badge]  [badge]
```
- 6 row skeletons with avatar circle + name line + 2 badge pills

#### Scripts (`/scripts`)
```
[line ████████████████████████]  [badge]
[line ██████████████]            [badge]
[line ████████████████████]      [badge]
```
- 8 row skeletons matching script list items

#### Vault (`/vault`)
```
[card ██████]  [card ██████]  [card ██████]
[████████████] [████████████] [████████████]
[██] [████]    [██] [████]    [██] [████]
```
- 6 card skeletons in a grid

#### Editing Queue (`/editing-queue`)
```
[████] [████████████████] [badge] [████]
[████] [████████████]     [badge] [████]
[████] [██████████████]   [badge] [████]
```
- 8 row skeletons matching the table structure

**Implementation pattern** for each page:
```tsx
if (loading) return <PageTransition><SkeletonView /></PageTransition>;
return <PageTransition><RealContent /></PageTransition>;
```

The skeleton is itself wrapped in `<PageTransition>` so it fades in smoothly, and when data loads, the real content also fades in via the route transition.

---

## Files Changed

| File | Change |
|---|---|
| `src/layouts/DashboardLayout.tsx` | Add AnimatePresence + motion.div + useLocation |
| `src/components/PageTransition.tsx` | **New file** |
| `src/pages/Dashboard.tsx` | Add PageTransition, skeleton, fix stagger |
| `src/pages/Clients.tsx` | Add PageTransition, skeleton, fix stagger |
| `src/pages/Scripts.tsx` | Add PageTransition, skeleton |
| `src/pages/Vault.tsx` | Add PageTransition, skeleton |
| `src/pages/EditingQueue.tsx` | Add PageTransition, skeleton |
| `src/pages/Checkout.tsx` | Add PageTransition, fix stagger |
| `src/pages/ClientDatabase.tsx` | Add PageTransition, fix stagger |
| All other ~23 page files | Add PageTransition wrapper only |

---

## Animation Values Summary

| Property | Old | New |
|---|---|---|
| Route fade duration | none | 0.15s |
| Page content rise | 0ms | 0.28s, y: 12→0 |
| Card stagger delay | `i × 0.08s` | `min(i × 0.04s, 0.2s)` |
| Card animation duration | 0.45s | 0.35s |

---

## Non-Goals

- No code splitting / lazy loading (separate concern, would require Suspense boundaries)
- No slide/directional transitions (user chose fade-up)
- No changes to public pages (only authenticated dashboard routes)
- No changes to animation logic inside modals or sheets
