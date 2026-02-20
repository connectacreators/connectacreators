
# Reconfigure User Roles: Admin, User, Videographer, Client

## Summary
Introduce a new **"user"** role for paying subscribers who manage their own clients (up to 20). Rename the current default behavior (no role = client) to an explicit **"client"** role for people invited by users. Each role gets distinct access and navigation.

## Role Definitions

| Role | Who | Pays? | Access |
|------|-----|-------|--------|
| **Admin** | You (Roberto) | No | Everything, manage all clients, videographers |
| **Videographer** | Team members | No | Assigned clients only (scripts, leads, calendar, vault, booking) |
| **User** | Paying subscribers | Yes | Own clients (up to 20), scripts, leads, calendar, vault, booking, subscription |
| **Client** | Invited by a user | No | Own data only: Script Breakdown, Lead Tracker, Lead Calendar |

## What Changes

### 1. Database: Add "user" to the role enum
- `ALTER TYPE public.app_role ADD VALUE 'user';`
- Add `is_user()` security definer function (like `is_admin()`)
- Migrate existing paying subscribers: anyone in the `clients` table with an active subscription and no admin/videographer role gets the `user` role in `user_roles`

### 2. Database: Client ownership model
- Add `owner_user_id` column to the `clients` table -- this links a client record to the "user" who created/manages them (distinct from the client's own `user_id` which is the client's auth account)
- Add a `client_limit` check: users can create up to 20 clients
- Update RLS policies on `clients`, `scripts`, `script_lines`, `vault_templates`, `booking_settings`, etc. so that:
  - **User** role can manage clients where `owner_user_id = auth.uid()`
  - **Client** role can only read their own records (where `user_id = auth.uid()`)

### 3. Auth Context updates
- Add `"user"` to the `UserRole` type: `"admin" | "user" | "client" | "videographer"`
- Add `isUser` boolean to the context (for `role === "user"`)
- Update default fallback role from `"client"` to remain `"client"` (no role in DB = client)

### 4. Navigation: Role-based sidebar and dashboard

**Admin sidebar** (unchanged):
- Home, Clients, Videographers, Subscription, Settings

**User sidebar** (new -- similar to admin but scoped):
- Home, Clients (own), Script Breakdown, Vault, Lead Tracker, Lead Calendar, Public Booking, Subscription, Settings

**Videographer sidebar** (unchanged):
- Home, Clients (assigned), Subscription, Settings

**Client sidebar** (restricted):
- Home, Script Breakdown, Lead Tracker, Lead Calendar, Settings
- NO Vault, NO Public Booking, NO Subscription management

### 5. Dashboard cards per role

**Admin/Videographer**: "Clients" card (as now)

**User**: "Clients" card + direct tool cards (Scripts, Lead Tracker, Lead Calendar, Vault)

**Client**: Script Breakdown, Lead Tracker, Lead Calendar only

### 6. Subscription guard updates
- **Admin** and **Videographer**: bypass (as now)
- **User**: must have active subscription (as current "client" behavior)
- **Client**: bypass subscription check (they don't pay, their "user" owner pays)

### 7. Client management for "user" role
- The `/clients` page currently restricts to admin/videographer. Update to also allow "user" role, but only showing clients where `owner_user_id = auth.uid()`
- The "Add Client" flow: user creates a client record with `owner_user_id` set to their own user ID, limited to 20 clients
- `ClientDetail` page: allow "user" role access to their own clients

### 8. Signup flow adjustment
- The `handle_new_user()` trigger currently creates a `clients` row for every new signup
- Update: new signups still get a client row (for backward compat), but once they select a plan and pay, they get the `user` role assigned (via `check-subscription` edge function)
- When a user invites someone as a "client," that person signs up and gets linked to their client record (no role in `user_roles` = defaults to `client`)

---

## Technical Details

### Migration SQL
1. `ALTER TYPE public.app_role ADD VALUE 'user';`
2. Create `is_user()` function
3. Add `owner_user_id UUID` column to `clients` table
4. Update RLS policies across tables to account for user ownership
5. Migrate existing paying subscribers to `user` role

### Files to modify
- **`src/contexts/AuthContext.tsx`** -- Add `"user"` to UserRole, expose `isUser`
- **`src/hooks/useAuth.ts`** -- Re-export (no change needed)
- **`src/components/DashboardSidebar.tsx`** -- 4-way nav: admin, user, videographer, client
- **`src/pages/Dashboard.tsx`** -- Role-based tool cards for all 4 roles
- **`src/pages/Clients.tsx`** -- Allow "user" role, scope to `owner_user_id`
- **`src/pages/ClientDetail.tsx`** -- Allow "user" role for owned clients
- **`src/hooks/useSubscriptionGuard.ts`** -- Client role bypasses, user role checks
- **`src/hooks/useClients.ts`** -- Support user-scoped client fetching
- **`supabase/functions/check-subscription/index.ts`** -- Assign `user` role on subscription activation

### RLS policy updates (key tables)
- `clients`: User can CRUD where `owner_user_id = auth.uid()`
- `scripts`, `script_lines`: User can manage via owned client relationship
- `vault_templates`: User can manage via owned client relationship
- `booking_settings`: User can manage via owned client relationship

### New helper function
```sql
CREATE OR REPLACE FUNCTION public.is_owned_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id 
    AND owner_user_id = auth.uid()
  )
$$;
```
