# Change Account Type from the Manage Member modal

**Date:** 2026-06-10
**Status:** Approved (design)
**Branch base:** `origin/main` (worktree `change-account-type`)

## Problem

In the Team Members page (`/videographers`), the **Manage Member** modal shows a
member's account type (Videographer / Editor / Connecta+) as **read-only text**
([src/pages/Videographers.tsx:629-630](../../../src/pages/Videographers.tsx)). A
member's role is only ever set at creation time
([supabase/functions/create-videographer/index.ts:144](../../../supabase/functions/create-videographer/index.ts)).
There is no way to change it afterward — admins are stuck once a member is
established as Connecta+.

This is not a bug; the change-type capability was never built. This spec adds it.

## Goals

- Let an admin switch a member between **Videographer**, **Editor**, and
  **Connecta+** in **any direction**, from the existing Manage Member modal.
- Make the dangerous direction (leaving Connecta+) **non-destructive and
  reversible**.

## Non-Goals

- Touching the `subscriptions` table. `create-videographer` never wrote to it for
  these members; this feature won't either.
- Changing how members are *created*, or the Subscribers-side
  `convert-to-agency-client` flow.
- Multi-role members. Team members are treated as single-role in the UI; this
  feature only swaps the one team role.

## The critical constraint (why "preserve & deactivate")

A Connecta+ member owns a `clients` row (`plan_type='enterprise'`,
`subscription_status='active'`). **20+ tables foreign-key to `clients(id)` with
`ON DELETE CASCADE`** — scripts, folders, workflows, credentials, canvas,
content calendar, social connections, and more. Deleting a `clients` row
instantly and irreversibly destroys all of that member's content.

The current creation code deletes the `clients` row whenever a member is not
Connecta+ ([create-videographer/index.ts:175](../../../supabase/functions/create-videographer/index.ts)).
That is safe at creation (no data exists yet) but would be catastrophic if reused
for a downgrade.

**Core guarantee of this feature: no code path issues `DELETE` on `clients`.**
Leaving Connecta+ deactivates the row instead.

## Backend — new `change_role` management action

Add one action to `supabase/functions/create-videographer/index.ts`, alongside
`reset_password` / `toggle_ban` / `force_logout`, routed by
`_action: "manage"`, `action: "change_role"`.

**Request:** `{ _action: "manage", action: "change_role", user_id, new_role }`

**Logic:**

1. Auth: same admin check as the rest of the function (already enforced at the
   top of the handler).
2. Validate `new_role ∈ {videographer, editor, connecta_plus}` → 400 otherwise.
3. Read the member's current team role from `user_roles`
   (rows where `role IN ('videographer','editor','connecta_plus')`).
4. If `new_role` equals the current team role → return success (no-op).
5. **Roles:** delete the user's existing team-role row(s) in that set, then
   insert `{ user_id, role: new_role }`. Any non-team role (e.g. `admin`) is left
   untouched.
6. **Client record:**
   - **→ Connecta+:** reactivate an existing `clients` row if one exists
     (`plan_type='enterprise'`, `subscription_status='active'`,
     refresh `full_name`/`email` from the member); else `insert` a fresh one.
     Reactivation of a previously-deactivated row is what makes a
     downgrade → re-upgrade round-trip restore the member's content.
   - **Connecta+ → Videographer/Editor:** **never delete.** Set
     `subscription_status='inactive'` on the `clients` row; leave `plan_type` and
     all data in place.
   - **Videographer ↔ Editor:** no client changes.
7. `videographer_clients` assignments are left untouched (harmless and
   reversible).
8. Return `{ success: true }`.

### Access implications (verified safe)

Connecta+ feature access is gated on the **role**, not the `clients.subscription_status`
([src/hooks/useSubscriptionGuard.ts:58](../../../src/hooks/useSubscriptionGuard.ts)).
Once the role is no longer `connecta_plus`, the member loses Connecta+ access
regardless of the deactivated `clients` row. The admin client list keys off
`role='connecta_plus'` too, so a downgraded member correctly disappears from it.

## Frontend — Account Type control in the modal

In the Manage Member modal ([src/pages/Videographers.tsx](../../../src/pages/Videographers.tsx),
the Actions area around line 716), add an **Account Type** section:

- A `Select` listing the three roles, defaulting to the member's current role.
- A **Change Type** button, enabled only when the selection differs from current.
- On click, show an inline confirmation describing the effect. For the
  leaving-Connecta+ case, state explicitly: *"Their content is preserved and this
  is reversible by switching the type back to Connecta+."*
- On confirm: call `create-videographer` with the `change_role` payload, reusing
  the existing `manageActionLoading` spinner pattern with a new `"change_role"`
  key. On success: toast, refetch the member list (and assignments), update the
  badge, and clear the pending selection.
- On error: toast the returned message; leave the modal open.

Bilingual labels (en/es) consistent with the rest of the modal.

## Error handling

- Backend returns `{ error }` with appropriate 400/403/500 status; the frontend
  surfaces it via toast.
- No-op (same role) returns success silently.
- Caller is always an admin acting on another member; no self-demotion guard
  needed (team roles are not `admin`).

## Testing / Verification

Round-trip test against prod data via the running app + Supabase MCP:

1. Promote an **Editor → Connecta+**. Assert: `user_roles` row is `connecta_plus`,
   `clients` row exists with `subscription_status='active'`.
2. Create or locate a script owned by that client; note the count.
3. Downgrade **Connecta+ → Editor**. Assert: `user_roles` row is `editor`,
   `clients` row still exists with `subscription_status='inactive'`, **script
   count unchanged** (no cascade).
4. Re-promote **Editor → Connecta+**. Assert: same `clients` row reactivated
   (`active`), content intact.
5. Swap **Videographer ↔ Editor**. Assert: role flips, no `clients` row touched.

Confirm `tsc` exit code 0 before deploy (CI runs `vite build` only — no typecheck).

## Rollout

- Edge function: `supabase functions deploy create-videographer`.
- Frontend: push to `main` → GitHub Actions builds + deploys; purge Cloudflare
  cache manually.
- Build on the `change-account-type` worktree (off `origin/main`), never on the
  stale `feat/video-editor-phase-1` branch.
