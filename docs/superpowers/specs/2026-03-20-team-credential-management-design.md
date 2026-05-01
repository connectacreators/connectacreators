# Team Member Credential Management — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Problem

Admin cannot manage team member credentials after creation. No way to:
- Reset passwords or create temp passwords for onboarding
- View account status (last login, email verified, disabled)
- Disable/enable accounts
- Force logout
- Ensure new members change their temp password on first login

Specific accounts needed: Dr Calvin's Clinic (`drcalvinsclinic@gmail.com`), Sarto Chiropractic, JB Frames, Rodrigo Gauna (existing), Axel (new).

## Approach

Expand the existing Team Members page (`Videographers.tsx`) with a management modal per member. Extend the existing `create-videographer` edge function (which already has a PUT method for password changes). Add a force-password-change flow for onboarding. New lightweight edge function for non-admin password flag clearing.

## Design

### 1. Member Management Modal

Triggered by a "Manage" button on each team member row in `Videographers.tsx`.

**Modal layout:**
- **Header:** Member name, email, role badge, created date
- **Credentials section:**
  - "Reset Password" button → generates random 12-char password via `crypto.getRandomValues`, sets it via edge function, copies to clipboard, shows once in a toast
  - Password reset automatically sets `force_password_change: true` in metadata
  - Note: After resetting an active user's password, admin should also click "Force Logout" so the user re-authenticates and gets a fresh JWT with the flag
- **Account Status section:**
  - Last sign-in timestamp (from Supabase auth user data)
  - Email verified indicator (green/red)
  - Account enabled/disabled toggle — show "Enabled" if `banned_until` is null or in the past, "Disabled" otherwise. Uses Supabase ban mechanism.
  - "Force Logout" button (revokes all sessions)
- **Loading/error states:** Spinner while fetching user details via GET, `toast.error()` on any failed action, `toast.success()` on success (matches existing codebase pattern with `sonner`)

### 2. Force Password Change Flow

**Trigger:** `user.user_metadata.force_password_change === true`

**Flow:**
1. AuthContext detects flag on login → sets `requiresPasswordChange: true`
2. DashboardLayout redirects to `/change-password`
3. ChangePassword page: new password + confirm fields only (no current password — user just authenticated with temp password, verifying again adds friction without security benefit)
4. On submit: calls `supabase.auth.updateUser({ password })`, then calls `clear-password-flag` edge function to remove metadata flag
5. Redirects to dashboard

**New file:** `src/pages/ChangePassword.tsx` (~100 lines)

**Route placement:** Inside the `<Route element={<DashboardLayout />}>` group in App.tsx so the redirect logic in DashboardLayout can gate it.

**AuthContext change:** Check metadata flag in auth state effect, expose `requiresPasswordChange` boolean.

**DashboardLayout change:** If `requiresPasswordChange && pathname !== '/change-password'`, redirect.

### 3. Edge Function Extensions

**Extend `supabase/functions/create-videographer/index.ts`:**

**New GET method:**
- `GET ?user_id=xxx` → returns auth user details via `auth.admin.getUserById()`
- Whitelist returned fields explicitly:
  ```ts
  const { id, email, last_sign_in_at, email_confirmed_at, banned_until, user_metadata, created_at } = userData.user;
  return { id, email, last_sign_in_at, email_confirmed_at, banned_until, user_metadata, created_at };
  ```
- Admin-only (verifies caller role)

**Expanded PUT method** (currently only handles password):
- `action: "reset_password"` — sets password + sets `user_metadata: { force_password_change: true }` via `updateUserById`
- `action: "toggle_ban"` — `ban_duration: "876000h"` (disable) or `"none"` (enable) via `updateUserById`
- `action: "force_logout"` — direct HTTP POST to `${SUPABASE_URL}/auth/v1/admin/users/${user_id}/logout` with service role key as Bearer token (the JS client's `auth.admin.signOut` with user_id param is not reliably available in supabase-js v2)

**New edge function `supabase/functions/clear-password-flag/index.ts`** (~20 lines):
- Only requires caller to be authenticated (no admin check)
- Clears `force_password_change` from the caller's own metadata only
- Uses service role client internally: `auth.admin.updateUserById(caller.id, { user_metadata: { force_password_change: null } })`
- Needed because `create-videographer` enforces admin role on all requests — adding conditional auth bypass would be fragile

### 4. Editor Role Verification

Audit existing restrictions:
- Sidebar nav: Home, Editing Queue, Content Calendar, Viral Today, Trainings, Settings (already correct)
- RLS on clients: only assigned via videographer_clients (already correct)
- RLS on video_edits: only assigned items (already correct)

**Verify during implementation:**
- Direct URL access to admin pages (`/team-members`, `/vault`, `/subscribers`, `/master-database`, `/clients`) is blocked for editors — currently sidebar hides links but no route-level guard exists. Add `isAdmin` checks to any admin-only pages missing them.
- Editing queue RLS filters correctly by assignee
- No RLS gaps on `clients`, `scripts`, `leads` tables for editor role

### 5. Account Setup

Create/verify these accounts during implementation:
- `drcalvinsclinic@gmail.com` — role: client (or connecta_plus if applicable)
- Sarto Chiropractic — verify existing account and role
- JB Frames — verify existing account and role
- Rodrigo Gauna — already registered, verify role
- Axel — create new account with temp password, assign appropriate role

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Videographers.tsx` | Add "Manage" button, management modal with all credential actions |
| `supabase/functions/create-videographer/index.ts` | Add GET method, expand PUT with action-based dispatch |
| `supabase/functions/clear-password-flag/index.ts` | **New** — lightweight auth-only function to clear own metadata flag |
| `src/contexts/AuthContext.tsx` | Check `force_password_change` metadata, expose `requiresPasswordChange` boolean |
| `src/layouts/DashboardLayout.tsx` | Redirect to `/change-password` when flag is set |
| `src/pages/ChangePassword.tsx` | **New** — force password change page |
| `src/App.tsx` | Add `/change-password` route inside DashboardLayout group |
| `supabase/config.toml` | Add `clear-password-flag` function entry |

## Existing Code to Reuse

- `create-videographer` PUT method already handles `auth.admin.updateUserById(user_id, { password })` — extend, don't rewrite
- `Videographers.tsx` already has Dialog/AlertDialog patterns for Add Member and Delete — follow same pattern for Manage modal
- `AuthContext.tsx` already reads `user.user_metadata` — just add the flag check
- Toast pattern: `toast.success()` / `toast.error()` from `sonner` used throughout codebase
- Random password: `crypto.getRandomValues` (browser API, no library needed)

## Verification Plan

1. **Create test member** with temp password via Add Member → verify `force_password_change` metadata is set
2. **Login as test member** → verify redirect to `/change-password`
3. **Change password** → verify redirect to dashboard, flag cleared
4. **Reset password** via Manage modal → verify new temp password works, flag re-set
5. **Disable account** → verify member cannot login (gets banned error)
6. **Enable account** → verify member can login again
7. **Force logout** → verify member's active session is terminated
8. **Editor URL test** → navigate directly to `/team-members`, `/vault`, `/subscribers` as editor → verify redirect/block
9. **Editor queue test** → verify editing queue only shows assigned items
10. **Account setup** → verify Dr Calvin's Clinic, Sarto, JB Frames, Rodrigo Gauna accounts exist with correct roles; create Axel's account
