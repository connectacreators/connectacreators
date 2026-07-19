# Vault — folders + interface refresh

**Date:** 2026-07-18 · **Approved:** drag-onto-folder + per-card move menu; per-client folders; mirror the Scripts page look.

## Problem
The Vault (saved viral videos from Viral Today) is a flat grid with a stats bar and a client filter — no way to organize. Users want folders and a cleaner, Scripts-consistent interface.

## Data model (applied to prod via Management API)
- **`vault_folders`**: `id, client_id (fk clients, cascade), name, sort_order, created_at, created_by`. Flat (no nesting — YAGNI).
- **`saved_videos.folder_id`** (nullable, fk vault_folders, `on delete set null`) — deleting a folder un-files its videos, never deletes saves.
- **RLS** mirrors `saved_videos`/`script_folders`: admin `is_admin()`, client `is_own_client(client_id)`, videographer SELECT `is_assigned_client(client_id)`.

## UI (mirror Scripts)
- **Header**: "Vault" + `New Folder` + `Add by URL`.
- **Toolbar**: search (caption/channel), sort (recently saved / most views / highest outlier).
- **Folder row**: folder cards (name + count), click to open, ⋯ menu (rename/delete), rename inline (once-select guard). Deleting confirms; videos un-file.
- **Video grid**: existing `SavedVideoCard`, wrapped draggable (dnd-kit, same pattern as Scripts `SortableScript`/`DroppableFolder`). Drop on a folder → `folder_id` set. Per-card `⋮ → Move to folder / Remove from folder` menu (touch-friendly).
- **Breadcrumb** when inside a folder ("Vault / Hooks", back to All). "Unfiled" view for `folder_id is null`.
- **Master mode**: folders are per selected client; with "All Clients" folders are hidden (flat grid) since a folder needs a client owner.

## Components
- `useVaultFolders(clientId)` hook: list/create/rename/delete + move-video helper.
- Vault.tsx reworked; small `DroppableVaultFolder` + `DraggableCard` wrappers mirroring Scripts. No unrelated refactor.

## Out of scope (YAGNI)
Nested folders, list-view toggle, cross-client folders, folder sharing.
