# Script Toolbar Redesign — Design Spec

## Goal
Redesign the script list interactions so that: circle = selection checkbox (not grabado toggle), three-dots menu handles single/bulk actions smartly, and scripts can be dragged into folders or moved via toolbar dropdown.

## Decisions

- **Circle**: Always a selection checkbox. No longer toggles recorded status.
- **Recorded status**: Strikethrough title only. Toggled via ⋯ menu or bulk toolbar.
- **Selection toolbar**: Appears when ≥1 script selected. Shows: count badge, Select All, Deselect All, Move to folder (dropdown), Mark recorded, Delete.
- **Select All**: Selects all visible scripts after current filters (folder + grabado filter).
- **Three-dots smart context**: If clicked script is part of selection → actions apply to all selected (shows "N scripts" hint). If not selected → actions apply to that script only.
- **Drag-to-folder**: dnd-kit drag selected scripts onto folder cards. Folder highlights as drop target. Ghost overlay shows count.
- **Toolbar folder picker**: "Move to folder ▾" button in selection toolbar opens dropdown with folder list + "New folder" option. Fallback for non-drag users.
- **After bulk action completes**: Deselect all, exit selection mode.
- **Single unselected script**: Can also be dragged directly onto a folder.

## Three-Dots Menu Items
1. Edit (single only — hidden in bulk mode)
2. Move to folder
3. Mark as recorded / Unmark recorded
4. Review (admin only)
5. Delete

## Files to Modify
- `src/pages/Scripts.tsx` — main implementation (selection, toolbar, context menu, drag)
- `src/hooks/useScripts.ts` — bulk toggleGrabado, bulk delete helpers if needed

## No Changes To
- Folder data model (already supports `folder_id` on scripts)
- Filter tabs (All / Not Recorded / Recorded)
- Script viewing/editing flow
