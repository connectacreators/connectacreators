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

### Props (via `node.data`)
- `label: string` — editable group name, default "New Group"
- `onUpdate: (updates) => void` — standard canvas node callback
- `onDelete: () => void` — standard canvas node callback

### Behavior
- Double-click label to edit (inline input, blur/Enter to save)
- Delete button in header (with confirmation if group has children — removes group only, children become free nodes)
- No connection handles (groups don't connect to AI node or other nodes)

## Interaction: Drag to Add/Remove

**File**: `SuperPlanningCanvas.tsx` — new `onNodeDragStop` handler

### Adding a node to a group
1. User finishes dragging a non-group node
2. `onNodeDragStop` fires — check if the node's absolute position overlaps any group node's bounding box
3. If overlap found AND node doesn't already have a `parentId` AND the target is a `groupNode`:
   - Set `node.parentId = groupNode.id`
   - Set `node.expandParent = true`
   - Convert position from absolute to relative (subtract group's position)
4. If node already belongs to a different group, remove from old group first

### Removing a node from a group
1. User finishes dragging a child node
2. `onNodeDragStop` fires — check if the node's absolute position is outside its parent group's bounds
3. If outside:
   - Clear `node.parentId` and `node.expandParent`
   - Convert position from relative to absolute (add former parent's position)

### Edge Cases
- Dragging a group node itself: skip containment check (no nesting)
- AI assistant node (`id === "ai-assistant"`): never add to groups — skip
- Multiple overlapping groups: use the smallest (most specific) group

## Interaction: Select & Group

**File**: `SuperPlanningCanvas.tsx` — context menu handler

### Flow
1. User selects 2+ non-group nodes (ReactFlow multi-select with Shift+click or drag-select)
2. Right-click → context menu appears with "Group Selected" option (only when 2+ non-AI nodes selected)
3. On click:
   - Calculate bounding box of all selected nodes (with padding of 40px)
   - Create a new `groupNode` at bounding box origin
   - Set `width` and `height` on the group node to bounding box dimensions
   - For each selected node: set `parentId`, `expandParent: true`, convert position to relative

### Context Menu
- Simple `div` absolutely positioned at right-click coordinates
- Shows "Group Selected" with folder icon when 2+ non-AI nodes are selected
- Shows "Ungroup" with folder-open icon when a group node is right-clicked
- Closes on click outside or Escape

## Interaction: Ungroup

1. Right-click a group node → "Ungroup" option
2. On click:
   - Find all nodes with `parentId === group.id`
   - For each: convert relative position to absolute, clear `parentId` and `expandParent`
   - Delete the group node

## Toolbar Integration

**File**: `CanvasToolbar.tsx`

- Add `"groupNode"` to the `onAddNode` type union
- Add a new `IconBtn` with the `FolderPlus` icon (lucide) labeled "Group"
- Clicking creates an empty group node at the default position

## Serialization

**File**: `SuperPlanningCanvas.tsx` — `serializeNodes` function

Update to persist `parentId`, `expandParent`, `width`, and `height` on group nodes (and any child nodes). Currently `serializeNodes` already saves `width` and `height`. Add `parentId` and `expandParent`:

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

Also update `attachCallbacks` to preserve `parentId` and `expandParent` when restoring nodes from DB.

## AI Context Integration

Groups themselves don't contribute content to the AI context. However, grouped nodes should still be included in context as usual. The `canvasContext` builder already works on node types regardless of parent — no changes needed.

Optionally, add group membership info to the node inventory:
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
| `src/components/canvas/GroupNode.tsx` | **NEW** — GroupNode component |
| `src/pages/SuperPlanningCanvas.tsx` | Register groupNode, add onNodeDragStop, context menu, serialize parentId/expandParent |
| `src/components/canvas/CanvasToolbar.tsx` | Add groupNode button with FolderPlus icon |

## Out of Scope

- Nested groups (groups inside groups)
- Group-level connections/edges to AI node
- Group colors/themes (all groups use same glassmorphism style)
- Collapsing/expanding groups
- Group-level operations beyond ungroup (e.g., duplicate group with contents)
