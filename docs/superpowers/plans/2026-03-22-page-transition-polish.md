# Page Transition & Loading Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard page navigation feel fast and fluid by adding fade-up route transitions and skeleton loaders.

**Architecture:** A new `PageTransition` component (framer-motion `motion.div`) wraps each page's content for the entry animation. `DashboardLayout` wraps `<Outlet />` with `AnimatePresence` keyed to the pathname for exit animation. Layout owns exit (0.12s fade out), page owns entry (0.28s fade-up). Five high-traffic pages get content-shaped skeleton loaders using the existing `Skeleton` component.

**Tech Stack:** React 18, React Router v6, framer-motion v12, TypeScript, Tailwind CSS, shadcn `Skeleton` at `src/components/ui/skeleton.tsx`

**Spec:** `docs/superpowers/specs/2026-03-22-page-transition-polish-design.md`

---

## File Map

| File | Action |
|---|---|
| `src/components/PageTransition.tsx` | **Create** — entry fade-up wrapper |
| `src/layouts/DashboardLayout.tsx` | Add AnimatePresence + keyed motion.div for exit |
| `src/pages/Dashboard.tsx` | PageTransition on `<main>` + skeleton + stagger fix |
| `src/pages/Clients.tsx` | PageTransition on `<main>` + skeleton for loadingClients |
| `src/pages/Scripts.tsx` | PageTransition on outermost `<div>` + skeleton |
| `src/pages/Vault.tsx` | PageTransition on all 3 return paths + skeleton |
| `src/pages/EditingQueue.tsx` | PageTransition on `<main>` + skeleton |
| `src/pages/ClientDatabase.tsx` | PageTransition + stagger fix |
| 19 remaining pages | PageTransition wrapper only (exact elements specified below) |

---

## Task 1: Create PageTransition Component

**Files:**
- Create: `src/components/PageTransition.tsx`

- [ ] **Create the file with this exact content:**

```tsx
import type { ReactNode } from "react";
import { motion } from "framer-motion";

export default function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
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

- [ ] **Verify:**

```bash
cat src/components/PageTransition.tsx
```

- [ ] **Commit:**

```bash
git add src/components/PageTransition.tsx
git commit -m "feat(transitions): add PageTransition entry animation component"
```

---

## Task 2: Route-Level Exit Transition in DashboardLayout

**Files:**
- Modify: `src/layouts/DashboardLayout.tsx`

**Current state:** `useLocation` is already imported (line 2). `<Outlet />` is on line 43, inside a plain `<div>` at line 41. `<FloatingCredits />` is at line 45, outside the replaced div — it must not be touched.

- [ ] **Add framer-motion import** after line 1 (`import { useState, useEffect } from "react";`):

```tsx
import { AnimatePresence, motion } from "framer-motion";
```

- [ ] **Replace lines 41–44 only.** Find this exact block:

```tsx
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {showChrome && <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />}
        <Outlet />
      </div>
```

Replace with (leave `{showChrome && <FloatingCredits />}` on line 45 untouched):

```tsx
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {showChrome && <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeInOut" }}
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
```

> `initial={{ opacity: 1 }}` is intentional — this wrapper must NOT animate on entry. Only `PageTransition` inside each page animates on entry. This wrapper only fades out on exit.

- [ ] **Verify the file still has `FloatingCredits` after the replaced block:**

```bash
grep -n "FloatingCredits" src/layouts/DashboardLayout.tsx
```

Expected: line ~47 (one line after the closing `</div>`).

- [ ] **Commit:**

```bash
git add src/layouts/DashboardLayout.tsx
git commit -m "feat(transitions): add AnimatePresence exit fade to DashboardLayout"
```

---

## Task 3: Dashboard — PageTransition + Skeleton + Stagger Fix

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Current state:**
- `motion` is already imported from framer-motion (add `AnimatePresence` to that import)
- Main return (line 308) is a `<>` fragment containing: SplashScreen, WelcomeModal, a credits banner IIFE, background orbs div, and `<main className="flex-1 flex flex-col min-h-screen relative">` at line 371
- Loading return is at lines 283–288
- Stagger formula is at line 23: `delay: i * 0.08, duration: 0.45`

- [ ] **Update framer-motion import** to add `AnimatePresence`:

```tsx
import { motion, AnimatePresence } from "framer-motion";
```

- [ ] **Add these imports** near the top:

```tsx
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Fix the stagger formula** at line 23. Find:

```tsx
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
```

Replace with:

```tsx
    transition: { delay: Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
```

- [ ] **Add `DashboardSkeleton`** directly above `export default function Dashboard()`:

```tsx
function DashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="max-w-3xl w-full">
        <div className="flex items-center gap-3 mb-10">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/50 p-5 space-y-3">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Replace the loading return** (lines 283–288). Find:

```tsx
  if (loading || subscriptionChecking) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }
```

Replace with:

```tsx
  if (loading || subscriptionChecking) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <DashboardSkeleton />
      </PageTransition>
    );
  }
```

- [ ] **Wrap only the `<main>` element** at line 371. The outer `<>` fragment and all siblings (SplashScreen, WelcomeModal, background div) stay unchanged. Only the `<main>` tag changes:

Find:
```tsx
      <main className="flex-1 flex flex-col min-h-screen relative">
```

Replace with:
```tsx
      <PageTransition className="flex-1 flex flex-col min-h-screen relative">
```

And its closing `</main>` → `</PageTransition>`.

- [ ] **TypeScript check:**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit:**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(transitions): Dashboard - PageTransition, skeleton loader, stagger fix"
```

---

## Task 4: Clients — PageTransition + Skeleton

**Files:**
- Modify: `src/pages/Clients.tsx`

**Current state:**
- Auth loading early return at lines 121–125 (bare Loader2)
- Main return at line 144 is `<>` fragment containing a `<Dialog>` and `<main className="flex-1 flex flex-col min-h-screen">`
- Inner `loadingClients` spinner is a conditional at line 181 **inside the main return**, not an early return

- [ ] **Add imports:**

```tsx
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Add `ClientsSkeleton`** above `export default function Clients()`:

```tsx
function ClientsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50">
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Wrap the auth loading return** (lines 121–125). Find:

```tsx
  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }
```

Replace with:

```tsx
  if (loading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          <ClientsSkeleton />
        </div>
      </PageTransition>
    );
  }
```

- [ ] **Wrap `<main>` in the main return.** The outer `<>` fragment and the `<Dialog>` sibling stay unchanged. Only the `<main>` tag changes:

Find: `<main className="flex-1 flex flex-col min-h-screen">`
Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`
And closing `</main>` → `</PageTransition>`.

- [ ] **Replace the inner `loadingClients` conditional** (around line 181). This is inside the main JSX, not an early return. Find:

```tsx
          {loadingClients ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
```

Replace with:

```tsx
          {loadingClients ? (
            <ClientsSkeleton />
```

- [ ] **Build check and commit:**

```bash
npx tsc --noEmit 2>&1 | head -20
git add src/pages/Clients.tsx
git commit -m "feat(transitions): Clients - PageTransition + skeleton loader"
```

---

## Task 5: Scripts — PageTransition + Skeleton

**Files:**
- Modify: `src/pages/Scripts.tsx`

**Current state:**
- Auth loading early return at lines 738–742 (check exact variable name: `authLoading`)
- Main return at line 930 — outermost element is `<div className="flex-1 flex flex-col overflow-hidden">` (no `<main>` tag in this file)
- `motion` already imported — add `AnimatePresence`

- [ ] **Add imports:**

```tsx
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Add `ScriptsSkeleton`** above `export default function Scripts()`:

```tsx
function ScriptsSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-3 max-w-4xl mx-auto w-full">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/50">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Wrap the auth loading return.** Find (around line 738):

```tsx
  if (authLoading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }
```

Replace with:

```tsx
  if (authLoading) {
    return (
      <PageTransition className="flex-1 flex flex-col overflow-hidden">
        <ScriptsSkeleton />
      </PageTransition>
    );
  }
```

- [ ] **Wrap the main return.** The outermost element is `<div className="flex-1 flex flex-col overflow-hidden">` at line 931 (first line inside `return (`). This is NOT a `<main>` — it is a plain `<div>`.

Find: `<div className="flex-1 flex flex-col overflow-hidden">` (the one that is the very first element inside `return (`)
Replace with: `<PageTransition className="flex-1 flex flex-col overflow-hidden">`
Closing `</div>` (matching the outermost) → `</PageTransition>`.

> There are nested `<div className="flex-1 ...">` elements inside. Only change the outermost one at the very start of the return block.

- [ ] **Build check and commit:**

```bash
npx tsc --noEmit 2>&1 | head -20
git add src/pages/Scripts.tsx
git commit -m "feat(transitions): Scripts - PageTransition + skeleton loader"
```

---

## Task 6: Vault — PageTransition + Skeleton

**Files:**
- Modify: `src/pages/Vault.tsx`

**Current state:** Vault has **three separate return paths** in the main export — all must be handled:
1. Auth loading return (~line 194): `<div className="flex items-center justify-center h-64">` with Loader2
2. Staff/admin path (~line 210): `<main className="flex-1 flex flex-col min-h-screen">`
3. Regular user path (~line 238): another `<main className="flex-1 flex flex-col min-h-screen">`

Inner `loadingTemplates` spinner exists inside path 2 and/or 3.

- [ ] **Add imports:**

```tsx
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Add `VaultSkeleton`** above `export default function Vault()`:

```tsx
function VaultSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card/50 overflow-hidden">
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Replace path 1 (auth loading return).** Find:

```tsx
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
```

Replace with:

```tsx
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <VaultSkeleton />
      </PageTransition>
    );
```

- [ ] **Wrap path 2 and path 3 `<main>` tags.** Both use `<main className="flex-1 flex flex-col min-h-screen">`. For each:

Find: `<main className="flex-1 flex flex-col min-h-screen">`
Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`
Closing `</main>` → `</PageTransition>`

- [ ] **Replace `loadingTemplates` Loader2** inside the rendered content. Find the conditional that shows `<Loader2>` when `loadingTemplates` is true and replace the spinner div with `<VaultSkeleton />`.

- [ ] **Build check and commit:**

```bash
npx tsc --noEmit 2>&1 | head -20
git add src/pages/Vault.tsx
git commit -m "feat(transitions): Vault - PageTransition + skeleton loader"
```

---

## Task 7: EditingQueue — PageTransition + Skeleton

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

**Current state:**
- Auth loading return at lines 405–408 (Loader2)
- Main return at line 455: `<>` fragment containing `<main className="flex-1 flex flex-col min-h-screen">` at line 458
- Inner queue loading Loader2 at line 488

- [ ] **Add imports:**

```tsx
import PageTransition from "@/components/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
```

- [ ] **Add `EditingQueueSkeleton`** above `export default function EditingQueue()`:

```tsx
function EditingQueueSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-8 py-8 max-w-7xl mx-auto w-full space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50">
          <Skeleton className="h-4 w-32 flex-shrink-0" />
          <Skeleton className="h-4 w-48 flex-1" />
          <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
          <Skeleton className="h-4 w-24 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Replace auth loading return** (lines 405–408). Find:

```tsx
  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }
```

Replace with:

```tsx
  if (loading) {
    return (
      <PageTransition className="flex-1 flex flex-col min-h-screen">
        <EditingQueueSkeleton />
      </PageTransition>
    );
  }
```

- [ ] **Wrap `<main>` in the main return.** The outer `<>` fragment stays. Only the `<main>` tag changes:

Find: `<main className="flex-1 flex flex-col min-h-screen">`
Replace: `<PageTransition className="flex-1 flex flex-col min-h-screen">`
Closing `</main>` → `</PageTransition>`.

- [ ] **Replace inner loading Loader2** (line 488) with `<EditingQueueSkeleton />`.

- [ ] **Build check and commit:**

```bash
npx tsc --noEmit 2>&1 | head -20
git add src/pages/EditingQueue.tsx
git commit -m "feat(transitions): EditingQueue - PageTransition + skeleton loader"
```

---

## Task 8: ClientDatabase — PageTransition + Stagger Fix

**Files:**
- Modify: `src/pages/ClientDatabase.tsx`

**Current state:** Stagger formula exists inside `fadeUp` variant object (search for `delay: i * 0.08`). Main return outermost element is a `<div>` or `<main>`.

- [ ] **Add import:**

```tsx
import PageTransition from "@/components/PageTransition";
```

- [ ] **Fix stagger formula.** Find:

```bash
grep -n "delay: i \* 0.08" src/pages/ClientDatabase.tsx
```

At the found line, replace:

```tsx
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
```

With:

```tsx
    transition: { delay: Math.min(i * 0.04, 0.2), duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
```

- [ ] **Wrap main return's outermost element** with `PageTransition`, keeping all className props.

- [ ] **Commit:**

```bash
git add src/pages/ClientDatabase.tsx
git commit -m "feat(transitions): ClientDatabase - PageTransition + stagger fix"
```

---

## Task 9: Remaining 19 Pages — PageTransition Wrapper

For each file, add `import PageTransition from "@/components/PageTransition";` and replace the outermost element of the main export's return with `<PageTransition className="...same classes...">` / `</PageTransition>`.

The exact outermost element for each file is listed below. Where the return is a `<>` fragment, wrap the first meaningful child (the `<main>` or root `<div>`), leaving the fragment in place.

**Files:**

- [ ] **`src/pages/AIFollowUpBuilder.tsx`**
  - Main return outermost: `<div className="flex h-screen bg-gray-950 text-white overflow-hidden">`
  - Replace with: `<PageTransition className="flex h-screen bg-gray-950 text-white overflow-hidden">`

- [ ] **`src/pages/BookingSettings.tsx`**
  - Main return outermost: `<main className="flex-1 flex flex-col min-h-screen">`
  - Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`

- [ ] **`src/pages/ChangePassword.tsx`**
  - Main return outermost: `<div className="flex-1 flex items-center justify-center p-6">`
  - Replace with: `<PageTransition className="flex-1 flex items-center justify-center p-6">`

- [ ] **`src/pages/ClientDetail.tsx`**
  - Return is `<>` fragment. Wrap inner `<main className="flex-1 flex flex-col min-h-screen">` with PageTransition.

- [ ] **`src/pages/ClientFollowUpAutomation.tsx`**
  - Main return outermost: `<main className="flex-1 flex flex-col min-h-screen">`
  - Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`

- [ ] **`src/pages/ContentCalendar.tsx`**
  - Find the `export default function ContentCalendar()` function and locate its `return (` statement. The outermost element is `<>` fragment. Wrap the first `<main>` or root `<div>` child with PageTransition.

- [ ] **`src/pages/LandingPageBuilder.tsx`**
  - Main return outermost: `<main className="flex-1 flex flex-col min-h-screen">`
  - Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`

- [ ] **`src/pages/LeadCalendar.tsx`**
  - Main return outermost: `<div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "Arial, sans-serif" }}>`
  - Replace with: `<PageTransition className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "Arial, sans-serif" }}>`

- [ ] **`src/pages/LeadTracker.tsx`**
  - Return is `<>` fragment. Wrap inner `<main className="flex-1 overflow-y-auto">` with PageTransition.

- [ ] **`src/pages/MasterDatabase.tsx`**
  - Return is `<>` fragment. Wrap inner `<main className="flex-1 flex flex-col min-h-screen">` with PageTransition.

- [ ] **`src/pages/MasterEditingQueue.tsx`**
  - Return is nested `<><>` fragments. Wrap inner `<main className="flex-1 flex flex-col min-h-screen">` with PageTransition.

- [ ] **`src/pages/Settings.tsx`**
  - Main return outermost: `<main className="flex-1 overflow-y-auto">`
  - Replace with: `<PageTransition className="flex-1 overflow-y-auto">`

- [ ] **`src/pages/Subscribers.tsx`**
  - Return is `<>` fragment. Wrap inner `<div className="flex-1 flex flex-col min-w-0 overflow-hidden">` with PageTransition.

- [ ] **`src/pages/Subscription.tsx`**
  - Main return outermost: `<div className="max-w-[800px] mx-auto px-4 py-8 space-y-10">`
  - Replace with: `<PageTransition className="max-w-[800px] mx-auto px-4 py-8 space-y-10">`

- [ ] **`src/pages/Trainings.tsx`**
  - Find the `export default function Trainings()` function (there are sub-components above it). Its return's outermost element is `<main className="flex-1 flex flex-col min-h-screen">`.
  - Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen">`

- [ ] **`src/pages/Videographers.tsx`**
  - Return is `<>` fragment. Wrap inner `<main className="flex-1 flex flex-col min-h-screen">` with PageTransition.

- [ ] **`src/pages/VideographerDetail.tsx`**
  - Return is `<>` fragment. Wrap inner `<main className="flex-1 flex flex-col min-h-screen">` with PageTransition.

- [ ] **`src/pages/ViralToday.tsx`**
  - Main return outermost: `<main className="flex-1 flex flex-col min-h-screen overflow-hidden">`
  - Replace with: `<PageTransition className="flex-1 flex flex-col min-h-screen overflow-hidden">`

- [ ] **`src/pages/ViralVideoDetail.tsx`**
  - Main return outermost: `<div className="min-h-screen bg-background">`
  - Replace with: `<PageTransition className="min-h-screen bg-background">`

- [ ] **TypeScript check — catch any unclosed tags:**

```bash
npx tsc --noEmit 2>&1 | grep "error" | head -20
```

Fix any errors before committing.

- [ ] **Commit all 19 files:**

```bash
git add \
  src/pages/AIFollowUpBuilder.tsx \
  src/pages/BookingSettings.tsx \
  src/pages/ChangePassword.tsx \
  src/pages/ClientDetail.tsx \
  src/pages/ClientFollowUpAutomation.tsx \
  src/pages/ContentCalendar.tsx \
  src/pages/LandingPageBuilder.tsx \
  src/pages/LeadCalendar.tsx \
  src/pages/LeadTracker.tsx \
  src/pages/MasterDatabase.tsx \
  src/pages/MasterEditingQueue.tsx \
  src/pages/Settings.tsx \
  src/pages/Subscribers.tsx \
  src/pages/Subscription.tsx \
  src/pages/Trainings.tsx \
  src/pages/Videographers.tsx \
  src/pages/VideographerDetail.tsx \
  src/pages/ViralToday.tsx \
  src/pages/ViralVideoDetail.tsx
git commit -m "feat(transitions): add PageTransition wrapper to all remaining dashboard pages"
```

---

## Task 10: Build, Smoke Test & Deploy

- [ ] **Full production build:**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built in X.XXs` with no TypeScript or module errors. Chunk size warnings are OK.

- [ ] **Smoke test on dev server:**

```bash
npm run dev
```

Navigate to `http://localhost:8082` and verify all of the following:

- [ ] Dashboard → Clients: old page fades out 0.12s, new page content rises up 0.28s
- [ ] Clients → Scripts: smooth fade transition, no layout jump
- [ ] Scripts → Vault: no double-animation flash
- [ ] Sidebar and TopBar stay fixed — only the content area animates
- [ ] Dashboard shows skeleton cards (not spinner) while auth/subscription checks run
- [ ] Clients list shows skeleton rows while loadingClients
- [ ] Card stagger on Dashboard feels snappy (not slow waterfall)
- [ ] No console errors about framer-motion or AnimatePresence

- [ ] **Deploy to VPS:**

```bash
tar -czf /tmp/dist.tar.gz dist/

expect << 'EOF'
spawn scp /tmp/dist.tar.gz root@72.62.200.145:/tmp/dist.tar.gz
expect "password:" { send "Loqueveoloveo290802#\r" }
expect eof
EOF

expect << 'EOF'
spawn ssh root@72.62.200.145 "tar -xzf /tmp/dist.tar.gz -C /var/www/connectacreators/ && nginx -s reload && echo DONE"
expect "password:" { send "Loqueveoloveo290802#\r" }
expect "DONE"
EOF
```

- [ ] **Final commit:**

```bash
git add -A
git commit -m "feat(transitions): page transition & skeleton polish — complete"
```
