# Canvas Group Nodes — Design Spec

## Overview

Add a "Group" tool to the Super Planning Canvas that lets users organize nodes into visual folder-like containers. Groups use ReactFlow's native `parentId` system for parent-child relationships, with a custom `GroupNode` component matching the existing glassmorphism aesthetic.

## User Stories

1. **Drag to add**: User drags an existing node onto a group — the node becomes a child of that group
2. **Select to group**: User selects multiple nodes, right-clicks → "Group Selected" to create a new group wrapping them
3. **Move together**: Moving a group moves all child nodes with it
4. **Drag to remove**: Dragging a child node outside the group boundary detaches it
5. **Ungroup**: Right-click a group → "Ungroup" releases all children and removes the group container
6. **Resize**: Groups auto-fit to contents by default, but can be manually resized larger via drag handles

## Architecture

### Approach: Custom GroupNode + ReactFlow `parentId`

ReactFlow v12 supports `parentId` and `expandParent` natively. Children with `parentId` set:
- Use coordinates relative to the parent
- Move with the parent automatically
- Can trigger parent expansion via `expandParent: true`

We create a custom `GroupNode` component (like all other canvas nodes) and wire up the containment logic in `SuperPlanningCanvas.tsx`.

### No Nesting

Groups are flat — one level only. A group cannot contain another group. The `onNodeDragStop` handler will skip containment checks when the dragged node is itself a group.

### Node Array Ordering Constraint

ReactFlow requires parent nodes to appear **before** their children in the `nodes` array. This must be enforced:
- When creating a group via "Group Selected": insert the group node before the child nodes in the array
- When restoring from DB: sort nodes so `groupNode` types come first before nodes that reference them via `parentId`
- Helper: `ensureParentOrder(nodes)` — reorders array so any node with `parentId` comes after its parent

## Component: GroupNode

**File**: `src/components/canvas/GroupNode.tsx`

### Visual Design
- Background: `bg-black/45 backdrop-blur-xl` (matches existing nodes)
- Border: `border border-white/20 rounded-xl`
- Header: folder icon (lucide `Folder`) + editable text label + child count badge
- Header background: subtle `bg-white/5 rounded-md` pill
- NodeResizer on all edges/corners for manual resize
- Default size: 400×300px
- Minimum size: 200×150px
- z-index: below children (ReactFlow handles this natively when using `parentId`)
- **Drop indicator**: When a node is being dragged over the group, show a highlighted border (e.g., `border-purple-500/50`) as visual feedback. Controlled via `data.isDropTarget` flag set during `onNodeDrag`.

### Props (via `node.data`)
- `label: string` — editable group name, default "New Group"
- `onUpdate: (updates) => void` — standard canvas node callback
- `onDelete: () => void` — standard canvas node callback (but with special handling — see Group Deletion)
- `isDropTarget?: boolean` — transient flag for drop highlight during drag

### Behavior
- Double-click label to edit (inline input, blur/Enter to save)
- Delete button in header (with confirmation if group has children — see Group Deletion section)
- No connection handles (groups don't connect to AI node or other nodes)

## Group Deletion

Deleting a group is NOT the standard `onDelete` pattern (which just filters out the node). Instead, the delete handler in `SuperPlanningCanvas.tsx` must:

1. Find all child nodes (`nodes.filter(n => n.parentId === groupId)`)
2. For each child: convert position from relative to absolute (using `getInternalNode(groupId)` to get the group's absolute position), clear `parentId` and `expandParent`
3. Remove the group node from the array
4. Edges connected to child nodes are preserved — they reference node IDs, not positions

The GroupNode's `onDelete` callback should trigger this custom handler rather than the simple filter pattern.

## Interaction: Drag to Add/Remove

**File**: `SuperPlanningCanvas.tsx` — new `onNodeDragStop` and `onNodeDrag` handlers

### Position Handling

**Critical**: In `onNodeDragStop`, the `node.position` is in relative coordinates (relative to parent if the node has a `parentId`). To get absolute canvas positions, use `getInternalNode(node.id)` from `useReactFlow()` which provides `internals.positionAbsolute`. All overlap detection must use absolute positions.

Use ReactFlow's `getIntersectingNodes(node)` API from `useReactFlow()` for overlap detection instead of manual bounding box math — it handles zoom, viewport offset, and relative coordinates correctly.

### Adding a node to a group
1. User finishes dragging a non-group node
2. `onNodeDragStop` fires — call `getIntersectingNodes(node)` to find overlapping nodes
3. Filter results to only `groupNode` types. If multiple groups overlap, use smallest by area (`width * height`)
4. If a group is found AND the dragged node is not already a child of that group:
   - Get the group's absolute position via `getInternalNode(groupId).internals.positionAbsolute`
   - Get the dragged node's absolute position via `getInternalNode(nodeId).internals.positionAbsolute`
   - Calculate relative position: `{ x: nodeAbsX - groupAbsX, y: nodeAbsY - groupAbsY }`
   - Update node: set `parentId`, `expandParent: true`, and the new relative position
   - Ensure node array ordering (parent before children)
5. If node already belongs to a different group, detach from old group first (convert to absolute), then attach to new group

### Removing a node from a group
Since `expandParent: true` causes the group to auto-expand to contain the child, we use a **threshold-based approach** instead of simple bounds checking:

1. During `onNodeDrag` (not just stop), track if a child node is being dragged significantly beyond the group's original bounds (e.g., >50px past any edge)
2. On `onNodeDragStop`: if the child was dragged past the threshold:
   - Get the group's absolute position
   - Calculate the child's intended absolute position: `childRelPos + groupAbsPos`
   - Clear `parentId` and `expandParent`
   - Set position to the calculated absolute position
3. This avoids the `expandParent` auto-expansion problem by using drag distance as the signal rather than containment bounds

### Visual Feedback During Drag
- `onNodeDrag` handler: check intersections in real-time
- When a non-group node overlaps a group, set `data.isDropTarget = true` on the group node
- When it leaves, clear the flag
- GroupNode renders highlighted border when `isDropTarget` is true

### Edge Cases
- Dragging a group node itself: skip containment check (no nesting)
- AI assistant node (`id === "ai-assistant"`): never add to groups — skip
- Multiple overlapping groups: use the smallest by area (`width * height`)

## Interaction: Select & Group

**File**: `SuperPlanningCanvas.tsx` — context menu via `onSelectionContextMenu` and `onNodeContextMenu`

### ReactFlow Callbacks
- `onSelectionContextMenu`: fires when user right-clicks a multi-selection → show "Group Selected"
- `onNodeContextMenu`: fires when user right-clicks a single node → show "Ungroup" if it's a group node

Both handlers receive `(event, ...)` — use `event.clientX/Y` for menu positioning, call `event.preventDefault()` to suppress browser menu.

Access current selection: `getNodes().filter(n => n.selected)` via `useReactFlow()`.

### Flow
1. User selects 2+ non-group nodes (ReactFlow multi-select with Shift+click or drag-select)
2. Right-click → context menu appears with "Group Selected" option (only when 2+ non-AI, non-group nodes selected)
3. On click:
   - Calculate bounding box of all selected nodes using absolute positions (via `getInternalNode`) plus node dimensions, with 40px padding
   - Create a new `groupNode` at bounding box origin with `width` and `height` set
   - Insert the group node **before** the selected nodes in the array (ordering constraint)
   - For each selected node: set `parentId` to the new group's ID, `expandParent: true`, convert position to relative (subtract group position)

### Context Menu Component
- Simple `div` absolutely positioned at right-click coordinates
- State: `{ visible: boolean, x: number, y: number, type: 'selection' | 'group', groupId?: string }`
- Shows "Group Selected" with folder icon when triggered via `onSelectionContextMenu`
- Shows "Ungroup" with folder-open icon when triggered via `onNodeContextMenu` on a group node
- Closes on click outside, Escape, or any canvas interaction

## Interaction: Ungroup

1. Right-click a group node → "Ungroup" option
2. On click:
   - Find all nodes with `parentId === group.id`
   - For each: get absolute position via `getInternalNode`, clear `parentId` and `expandParent`, set position to absolute
   - Delete the group node from array

## Toolbar Integration

**File**: `CanvasToolbar.tsx`

- Add `"groupNode"` to the `onAddNode` type union
- Add a new `IconBtn` with the `FolderPlus` icon (lucide) labeled "Group"
- Clicking creates an empty group node at the default position

**File**: `SuperPlanningCanvas.tsx` — `addNode` function

Add `"groupNode"` to the type union in the `addNode` callback. Group-specific handling:
- `initialWidth`: 400
- Node data: `{ label: "New Group", onUpdate, onDelete }` — no `authToken` or `clientId` needed
- Also set explicit `style: { width: 400, height: 300 }` for initial dimensions since groups need both width and height

## Serialization

**File**: `SuperPlanningCanvas.tsx` — `serializeNodes` function

Update to persist `parentId`, `expandParent`, `width`, and `height` on all nodes. Currently `serializeNodes` already saves `width` and `height`. Add `parentId` and `expandParent`:

```typescript
function serializeNodes(nodes: Node[]): any[] {
  return nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    width: n.width,
    height: n.height,
    deletable: n.deletable,
    parentId: n.parentId,        // NEW
    expandParent: n.expandParent, // NEW
    data: Object.fromEntries(
      Object.entries(n.data || {}).filter(([k]) => !CALLBACK_KEYS.includes(k))
    ),
  }));
}
```

### Restore from DB

Update `attachCallbacks` to preserve `parentId` and `expandParent` when restoring nodes. Also, after calling `attachCallbacks`, run `ensureParentOrder()` to guarantee parent nodes precede children in the array.

```typescript
function ensureParentOrder(nodes: Node[]): Node[] {
  const groups = nodes.filter(n => n.type === "groupNode");
  const others = nodes.filter(n => n.type !== "groupNode");
  return [...groups, ...others];
}
```

## AI Context Integration

Groups themselves don't contribute content to the AI context. Grouped nodes are still included in context as usual — the `canvasContext` builder works on node types regardless of parent.

Add group membership info to the node inventory for context:
```
VideoNode(@channel, transcription=true) [in group: "Research Phase"]
```

## Node Types Registration

Add to `nodeTypes` map:
```typescript
const nodeTypes = {
  // ...existing...
  groupNode: GroupNode,
};
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/canvas/GroupNode.tsx` | **NEW** — GroupNode component with resize, editable label, drop indicator |
| `src/pages/SuperPlanningCanvas.tsx` | Register groupNode, add onNodeDragStop/onNodeDrag, context menu, serialize parentId/expandParent, ensureParentOrder, custom group delete |
| `src/components/canvas/CanvasToolbar.tsx` | Add groupNode button with FolderPlus icon |

## Out of Scope

- Nested groups (groups inside groups)
- Group-level connections/edges to AI node
- Group colors/themes (all groups use same glassmorphism style)
- Collapsing/expanding groups
- Group-level operations beyond ungroup (e.g., duplicate group with contents)
