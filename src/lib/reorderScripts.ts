// Pure helper for drag-to-reorder in the script list.
//
// Given the current ordered ids of a *view* (the unfiled list, or one folder),
// the id(s) being dragged, and the id they were dropped onto, return the new
// ordered ids. The caller persists `sort_order = index` for the affected view.
//
// Single-item parity with @dnd-kit/sortable's arrayMove (so the committed order
// matches the live drag preview): dragging DOWN lands the item after the drop
// target, dragging UP lands it before. A multi-item selection moves as one
// contiguous block, preserving its internal order.
export function computeReorder(
  viewIds: string[],
  movingIds: string[],
  overId: string
): string[] {
  const movingSet = new Set(movingIds.filter((id) => viewIds.includes(id)));
  // Nothing valid to move, or dropped onto a member of the moving set → no-op.
  if (movingSet.size === 0 || movingSet.has(overId)) return viewIds.slice();

  const overIdxOrig = viewIds.indexOf(overId);
  if (overIdxOrig === -1) return viewIds.slice();

  const moving = viewIds.filter((id) => movingSet.has(id)); // preserve order
  const remaining = viewIds.filter((id) => !movingSet.has(id));

  let insertAt = remaining.indexOf(overId);
  // Direction-aware: if the block started above the drop target it lands after
  // it (drag down); otherwise before it (drag up). Matches arrayMove for n=1.
  const firstMovingIdx = viewIds.indexOf(moving[0]);
  if (firstMovingIdx < overIdxOrig) insertAt += 1;

  return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
}
