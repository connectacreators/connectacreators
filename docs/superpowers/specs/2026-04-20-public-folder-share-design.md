# Public Folder Share — Design (v1)

**Date:** 2026-04-20
**Status:** Approved, pending implementation
**Scope:** v1 — Viewer-only folder sharing. Editor mode lives in the future-planning doc.

---

## Problem

Today, scripts live in a nested folder tree per client. Users can share individual scripts via `/s/:id`, but there's no way to share **a whole folder** (a "batch") with a client or stakeholder so they can browse multiple scripts at once on their phone.

## Goal

Reproduce the Google Drive share-folder experience:

- Click "Share" on any folder in the Scripts page → get a public URL
- Anyone with the URL can view **that folder and all its descendants** (subfolders + scripts), but **nothing outside that subtree**
- Mobile-first reader: preview feed → tap to detail
- Revoke at any time

## Non-goals (v1)

- Editor mode (anonymous write access) — future doc
- Password protection
- Expiry dates
- Email/user-based permissions
- Commenting/approvals in the reader (view-only)

## Scope Rule (Google Drive parity)

If the shared folder is `F`:

- Viewer sees `F` as the root of their view
- Viewer sees all folders/scripts where the path from root traverses through `F`
- Viewer does **not** see siblings of `F`, parents of `F`, or any folder/script outside the `F` subtree
- If someone shares `F` AND later shares a subfolder `F/Sub`, those are two separate links. Viewing the `F/Sub` link restricts to the `F/Sub` subtree.

## Data Model

New table: `script_folder_shares`

```sql
create table script_folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references script_folders(id) on delete cascade,
  token text not null unique,              -- opaque random slug, NOT the folder UUID
  permission text not null default 'viewer' check (permission in ('viewer','editor')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz                   -- null = active
);

create index script_folder_shares_token_idx on script_folder_shares (token) where revoked_at is null;
create index script_folder_shares_folder_idx on script_folder_shares (folder_id);
```

**Why opaque token, not UUID:** The folder UUID is also used internally; leaking it means anyone guessing URLs could probe. Random tokens are revocable and don't leak internal IDs.

**Why `revoked_at` instead of `deleted_at`:** We want to keep history (who shared what, when) even after revocation.

## Route & Page

New public route: `/f/:token`

New page: `src/pages/PublicFolderShare.tsx`

Behavior:
1. Look up share row by token; if missing/revoked → 404 page
2. Load folder tree scoped to `folder_id` and its descendants (recursive CTE or client-side filter)
3. Load all non-deleted scripts where `folder_id` is in the scoped subtree
4. Render preview feed (see Reader UX below)

## Reader UX (mobile-first)

**Landing view:**
- Header: folder name + script count ("Joe's April Batch · 5 scripts")
- Breadcrumb within the shared subtree only (never shows ancestors of the share root)
- Feed of cards, each card shows: title, first ~3 lines of content, length/type metadata, thumbnail if available
- Subfolders within the shared subtree appear as folder cards (tap to drill in — URL stays `/f/:token` with internal path state, or `/f/:token/:subPath` for linkability — pick simpler)

**Detail view:**
- Tap any script card → full-screen reader
- Large readable typography (16px+ body, generous line-height, paragraph spacing)
- Back button returns to feed, scroll position preserved
- Actions: Copy script text, open in new tab (desktop)
- No edit controls, no auth prompt

**Desktop:** Same layout, constrained to readable width (~720px).

## Sharing UI

On the Scripts page, each folder row gets a Share icon (next to the existing actions):

**Dialog contents (Google Drive style):**
- "People with the link" section
- Permission dropdown: `Viewer` (enabled) / `Editor` (disabled, with tooltip "Coming soon")
- Copy-link button → copies `https://connectacreators.com/f/{token}`
- If already shared: show the existing link + "Revoke access" button
- "Learn more" link → could point to help doc later

## Security / RLS

- `script_folder_shares` table: RLS allows reads only via the token (via an edge function or RPC that validates token + returns scoped data)
- Scripts read endpoint for public shares: edge function `get-shared-folder` that takes a token, validates it's active, and returns the scoped folder tree + scripts
- Client never queries the DB directly for a public share; all reads go through the edge function
- Rate limit the edge function (e.g., 60 req/min per IP) to prevent token brute-forcing — since tokens are 32+ char random slugs, brute force is impractical but rate limiting is cheap insurance

## Edge Function: `get-shared-folder`

Input: `{ token: string }`

Output:
```ts
{
  folder: { id, name },              // the share root
  descendants: {
    folders: [{ id, name, parent_id }],  // all folders in subtree
    scripts: [{ id, title, content, folder_id, created_at, length_seconds, formato }],
  },
  permission: 'viewer' | 'editor',
}
```

Errors: 404 if token invalid/revoked. 429 if rate-limited.

## Migration Concerns

Earlier exploration flagged that `script_folders` table and `folder_id` column on `scripts` may not be in the migrations folder even though the Scripts page uses them. **Before writing this migration, verify the current production schema** — if folders work today in prod, the tables exist even if they're not in the repo migrations. Add a migration only for `script_folder_shares`; leave the (missing-but-working) folder tables alone unless we decide to normalize them as part of this work.

## Implementation Order

1. Confirm `script_folders` + `folder_id` exist in production DB (via Supabase dashboard or select query)
2. Migration: `script_folder_shares` table + RLS
3. Edge function: `get-shared-folder`
4. Frontend: Share dialog on Scripts page (generate token, copy link, revoke)
5. Frontend: `/f/:token` route + `PublicFolderShare.tsx` page
6. Frontend: Reader feed + detail view (mobile-first, responsive)
7. Build + deploy to VPS

## Open Questions Resolved

- Batch formation → shared folder (subtree scope)
- Mobile reader → preview feed → tap to detail
- Permissions → Viewer only in v1
- Expiry → none; manual revoke
- Individual script sharing → already exists (`/s/:id`), no change

---

**Companion doc:** [2026-04-20-public-folder-share-future.md](./2026-04-20-public-folder-share-future.md) — phase 2 plans (Editor mode, permissions, comments, etc.)
