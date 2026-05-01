# Post-Payment Redirect Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent new subscribers from being bounced to `/select-plan` immediately after completing payment, by skipping the Dashboard subscription gate when the user just paid.

**Architecture:** A `useRef` flag (`justPaidRef`) is set by the existing welcome modal `useEffect` when `connecta_just_paid` is present in localStorage. The subscription check `useEffect` reads this ref and returns early, skipping the DB query and redirect. A ref is used instead of reading localStorage directly because the welcome modal effect (declared first) removes the flag in the same React render flush before the subscription check effect would read it.

**Tech Stack:** React 18 (`useRef`, `useEffect`), React Router `navigate`

---

## Chunk 1: Dashboard.tsx — justPaidRef guard

### Task 1: Add `justPaidRef` guard to Dashboard subscription check

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Context for the implementer:**

`Dashboard.tsx` has two relevant `useEffect` hooks declared in this order:

1. **Welcome modal effect** (line 44, `deps: []`):
```tsx
useEffect(() => {
  const paid = localStorage.getItem("connecta_just_paid");
  if (paid) {
    setWelcomePlan(paid);
    setShowWelcome(true);
    localStorage.removeItem("connecta_just_paid");
  }
}, []);
```

2. **Subscription check effect** (line 93, identified by comment `// Subscription check (for non-admin/videographer/editor/connectaPlus client roles)`, `deps: [user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, role, navigate]`):
```tsx
useEffect(() => {
  if (loading || !user) return;
  if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;
  supabase
    .from("clients")
    .select("plan_type, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (!data || !data.plan_type) {
        navigate("/select-plan");
      } else if (
        data.subscription_status !== "active" &&
        data.subscription_status !== "trialing" &&
        data.subscription_status !== "trial" &&
        data.subscription_status !== "pending_contact" &&
        data.subscription_status !== "canceling" &&
        data.subscription_status !== "connecta_plus"
      ) {
        navigate("/select-plan");
      }
    });
}, [user, loading, isAdmin, isVideographer, isEditor, isConnectaPlus, role, navigate]);
```

React runs `useEffect` hooks in declaration order in the same post-render flush. By the time the subscription check effect runs, the welcome modal effect has already called `localStorage.removeItem("connecta_just_paid")`. Reading localStorage in the subscription check would always return `null`. A `useRef` set by the welcome modal effect is readable by the subscription check effect in the same flush.

- [ ] **Step 1: Add `useRef` to the React import**

Find line 11 in `src/pages/Dashboard.tsx`:
```tsx
import { useState, useEffect } from "react";
```

Change it to:
```tsx
import { useState, useEffect, useRef } from "react";
```

- [ ] **Step 2: Declare `justPaidRef` inside the component**

Find lines 40–41 — the last two `useState` declarations in the component:
```tsx
const [showWelcome, setShowWelcome] = useState(false);
const [welcomePlan, setWelcomePlan] = useState("starter");
```

Add the ref declaration immediately after line 41:
```tsx
const [showWelcome, setShowWelcome] = useState(false);
const [welcomePlan, setWelcomePlan] = useState("starter");
const justPaidRef = useRef(false);   // ← new line
```

- [ ] **Step 3: Set the ref in the welcome modal effect**

Find the welcome modal `useEffect` starting at line 44 (the one with `deps: []` that reads `connecta_just_paid`). Add `justPaidRef.current = true;` as the **first line** inside the `if (paid)` block, before `setWelcomePlan`:

Before:
```tsx
useEffect(() => {
  const paid = localStorage.getItem("connecta_just_paid");
  if (paid) {
    setWelcomePlan(paid);
    setShowWelcome(true);
    localStorage.removeItem("connecta_just_paid");
  }
}, []);
```

After:
```tsx
useEffect(() => {
  const paid = localStorage.getItem("connecta_just_paid");
  if (paid) {
    justPaidRef.current = true;        // ← new line
    setWelcomePlan(paid);
    setShowWelcome(true);
    localStorage.removeItem("connecta_just_paid");
  }
}, []);
```

- [ ] **Step 4: Add early-return guard in the subscription check effect**

Find the subscription check `useEffect` (identified by the comment `// Subscription check (for non-admin/videographer/editor/connectaPlus client roles)`). Add `if (justPaidRef.current) return;` as the **very first line** of the effect body, before the `loading || !user` guard:

Before:
```tsx
// Subscription check (for non-admin/videographer/editor/connectaPlus client roles)
useEffect(() => {
  if (loading || !user) return;
  if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;
  supabase
    .from("clients")
```

After:
```tsx
// Subscription check (for non-admin/videographer/editor/connectaPlus client roles)
useEffect(() => {
  if (justPaidRef.current) return;     // ← new line
  if (loading || !user) return;
  if (isAdmin || isVideographer || isEditor || isConnectaPlus) return;
  supabase
    .from("clients")
```

- [ ] **Step 5: Verify the logic mentally**

Trace through three scenarios to confirm correctness:

**Scenario A — new user just paid (the bug being fixed):**
1. `PaymentSuccess` sets `localStorage.connecta_just_paid = "starter"`, then navigates to `/dashboard`
2. Dashboard mounts → both effects run in the same post-render flush, in declaration order
3. Welcome modal effect runs first: reads `"starter"`, sets `justPaidRef.current = true`, removes the localStorage key, sets `showWelcome = true`
4. Subscription check effect runs next: reads `justPaidRef.current === true` → returns early → no Supabase query → no redirect ✓
5. User sees dashboard + welcome modal ✓

**Scenario B — existing user with no subscription:**
1. No `connecta_just_paid` in localStorage
2. Dashboard mounts → welcome modal effect finds nothing, `justPaidRef.current` stays `false`
3. Subscription check effect: `justPaidRef.current === false` → proceeds → queries `clients` → no `plan_type` → navigates to `/select-plan` ✓

**Scenario C — page refresh after welcome modal dismissed:**
1. `useRef(false)` resets to `false` on every fresh component mount (refs do not persist across unmount/remount)
2. No `connecta_just_paid` in localStorage (removed on first mount)
3. Subscription check queries DB → by now the Stripe webhook has updated `clients.subscription_status = "active"` → user stays on dashboard ✓

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "$(cat <<'EOF'
fix(dashboard): skip subscription gate when user just completed payment

Uses a justPaidRef to detect the post-payment landing without reading
localStorage directly (which is removed by the welcome modal effect in
the same React render flush before the subscription check effect runs).
EOF
)"
```
