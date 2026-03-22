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
- Old page fades out smoothly when navigating away
- New page content rises up as it fades in
- Cards animate in quickly and consistently
- While data loads, the page shows content-shaped skeletons instead of a spinner

---

## Architecture

### 1. Route-Level Exit Transition — `DashboardLayout.tsx`

Add `useLocation()` and wrap `<Outlet />` with `AnimatePresence`. The layout-level `motion.div` owns **only the exit animation** (fade out old page). Entry animation is owned by `PageTransition` inside each page. This prevents double-animation conflicts.

```tsx
const location = useLocation();

<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial={{ opacity: 1 }}   // no entry fade here — PageTransition owns entry
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.12, ease: "easeInOut" }}
    className="flex-1 flex flex-col min-h-0 overflow-hidden"
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

- `mode="wait"` — old page fully exits (0.12s) before new page mounts
- `initial={{ opacity: 1 }}` — wrapper does not animate on entry; only `PageTransition` inside the page does
- `overflow-hidden` — prevents scroll-jump artifact while old page fades out
- The `motion.div` inherits the same flex layout role as the current plain `<div>`

---

### 2. `PageTransition` Component — new file

Create `src/components/PageTransition.tsx`. This component owns the **entry animation** (fade-up) for every page.

```tsx
import { motion } from "framer-motion";

export default function PageTransition({
  children,
  className,
}: {
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

**Migration rule for every page:** Replace the outermost `<div className="...layout classes...">` with `<PageTransition className="...same layout classes...">`. The `className` passthrough ensures layout-critical classes (`flex-1 overflow-auto p-6` etc.) are preserved.

**Constraint:** Pages must never return `null` or a fragment before `PageTransition`. If a page has a top-level auth guard or error state that returns early, those returns must also be wrapped:
```tsx
if (error) return <PageTransition><ErrorView /></PageTransition>;
return <PageTransition className="flex-1 p-6"><RealContent /></PageTransition>;
```

**Scope:** All ~30 authenticated page files under `src/pages/` that render inside `DashboardLayout`.

---

### 3. Skeleton ↔ Content Swap

When data is loading, show a skeleton. When data arrives, swap to real content. Because React does not remount the same component type, a plain conditional would silently skip the animation. Use `AnimatePresence` with a `key` to force a proper mount/unmount cycle:

```tsx
<AnimatePresence mode="wait" initial={false}>
  {loading ? (
    <PageTransition key="skeleton" className="flex-1 p-6">
      <SkeletonView />
    </PageTransition>
  ) : (
    <PageTransition key="content" className="flex-1 p-6">
      <RealContent />
    </PageTransition>
  )}
</AnimatePresence>
```

- `initial={false}` — suppresses animation on the very first render of `AnimatePresence` (i.e., when the page first mounts showing the skeleton, no double fade)
- When `loading` flips to `false`, skeleton fades out 0.28s → content fades up 0.28s

---

### 4. Skeleton Loaders — 5 pages

Replace `<Loader2 className="animate-spin">` with content-shaped skeletons. Use the existing `Skeleton` component (`src/components/ui/skeleton.tsx`).

#### Dashboard
```
[circle w-9 h-9]  [h-4 w-32]   <- greeting
                  [h-3 w-24]

[card h-32 rounded-xl]  [card h-32]  [card h-32]   <- 3-col grid
```
3 card skeletons in a `grid grid-cols-1 sm:grid-cols-3 gap-6`. Each card has a `Skeleton` for icon circle, title line, and subtitle line.

#### Clients
```
[h-9 w-9 rounded-full]  [h-4 w-40]  [h-5 w-16 rounded-full]
```
6 row skeletons in `space-y-3`. Each row: avatar circle + name line + 1 badge pill.

#### Scripts
```
[h-4 w-3/4]  [h-5 w-20 rounded-full]
[h-3 w-1/2]
```
8 row skeletons in `space-y-3`. Each: title line + status badge + date line.

#### Vault
```
[h-36 rounded-xl]  [h-36 rounded-xl]  [h-36 rounded-xl]
[h-4 w-3/4]        [h-4 w-2/3]        [h-4 w-3/4]
```
6 card skeletons in a `grid grid-cols-2 sm:grid-cols-3 gap-4`.

#### Editing Queue
```
[h-4 w-32]  [h-4 w-48]  [h-5 w-20 rounded-full]  [h-4 w-24]
```
8 row skeletons matching the table column widths.

Each skeleton view is a small local component (e.g., `DashboardSkeleton`) defined in the same page file — no need for separate skeleton files.

---

### 5. Card Stagger Fix

**Files with stagger pattern to update:**
- `src/pages/Dashboard.tsx`
- `src/pages/Clients.tsx`
- `src/pages/Checkout.tsx`
- `src/pages/ClientDatabase.tsx`

Find via: `grep -r "delay: i \* 0.08" src/pages/`

**Replace:**
```tsx
transition: { delay: i * 0.08, duration: 0.45 }
```

**With:**
```tsx
transition: { delay: Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }
```

**Rationale:** Delay per item halves from 0.08s to 0.04s. Items beyond index 5 all start at the same 0.2s delay and animate simultaneously — this is intentional. With many items (10+), staggering every card produces a "slow waterfall" that feels sluggish. Capping ensures the grid fills in fast as a group after the initial few cards lead the eye.

| Items | Old total time | New total time |
|---|---|---|
| 3 cards | 0.69s | 0.43s |
| 6 cards | 1.05s | 0.55s |
| 10 cards | 1.25s | 0.55s |

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/layouts/DashboardLayout.tsx` | Add `useLocation`, `AnimatePresence`, keyed `motion.div` (exit only) |
| `src/components/PageTransition.tsx` | **New file** — entry fade-up wrapper |
| `src/pages/Dashboard.tsx` | `PageTransition` wrapper, `AnimatePresence` skeleton swap, stagger fix |
| `src/pages/Clients.tsx` | `PageTransition` wrapper, `AnimatePresence` skeleton swap, stagger fix |
| `src/pages/Scripts.tsx` | `PageTransition` wrapper, `AnimatePresence` skeleton swap |
| `src/pages/Vault.tsx` | `PageTransition` wrapper, `AnimatePresence` skeleton swap |
| `src/pages/EditingQueue.tsx` | `PageTransition` wrapper, `AnimatePresence` skeleton swap |
| `src/pages/Checkout.tsx` | `PageTransition` wrapper, stagger fix |
| `src/pages/ClientDatabase.tsx` | `PageTransition` wrapper, stagger fix |
| All other ~22 page files | `PageTransition` wrapper only (mechanical find-replace) |

---

## Animation Values Summary

| Property | Old | New |
|---|---|---|
| Route exit fade | none | 0.12s |
| Page content entry | none | 0.28s fade-up, y: 12→0 |
| Card stagger per item | `i × 0.08s` | `min(i × 0.04s, 0.2s)` |
| Card animation duration | 0.45s | 0.35s |
| Skeleton → content swap | instant | 0.28s crossfade |

---

## Non-Goals

- No code splitting / lazy loading (separate concern)
- No slide/directional transitions (user chose fade-up)
- No changes to public pages (only authenticated dashboard routes)
- No changes to animation inside modals, sheets, or drawers
