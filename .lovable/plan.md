
# Reconfigure User Roles: Admin, User, Videographer, Client

## Status: ✅ IMPLEMENTED

## Summary
Introduced a new **"user"** role for paying subscribers who manage their own clients (up to 20). The default behavior (no role = client) remains as the **"client"** role for people invited by users. Each role gets distinct access and navigation.

## Role Definitions

| Role | Who | Pays? | Access |
|------|-----|-------|--------|
| **Admin** | Roberto | No | Everything, manage all clients, videographers |
| **Videographer** | Team members | No | Assigned clients only (scripts, leads, calendar, vault, booking) |
| **User** | Paying subscribers | Yes | Own clients (up to 20), scripts, leads, calendar, vault, booking, subscription |
| **Client** | Invited by a user | No | Own data only: Script Breakdown, Lead Tracker, Lead Calendar |

## What Was Changed

### Database
- Added `'user'` to the `app_role` enum
- Added `owner_user_id` column to `clients` table
- Created `is_user()` and `is_owned_client()` security definer functions
- Added RLS policies for `user` role across: clients, scripts, script_lines, vault_templates, booking_settings, scheduled_posts, social_accounts

### Frontend
- **AuthContext**: Added `"user"` to UserRole type, exposed `isUser` boolean
- **DashboardSidebar**: 4-way navigation (admin, user, videographer, client)
- **Dashboard**: Role-based tool cards for all 4 roles
- **Clients page**: Allows `user` role, scoped to `owner_user_id`
- **ClientDetail**: Allows `user` role for owned clients
- **useSubscriptionGuard**: Client role bypasses subscription check
- **useClients**: Supports user-scoped client fetching

### Edge Function
- **check-subscription**: Assigns `user` role automatically on subscription activation (if not already admin/videographer)
