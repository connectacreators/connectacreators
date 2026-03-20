# Canvas Group Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add group/folder nodes to the canvas that let users organize nodes into visual containers with drag-to-add, select-to-group, and ungroup interactions.

**Architecture:** Custom `GroupNode` component using ReactFlow's native `parentId` system for parent-child relationships. Containment logic in `SuperPlanningCanvas.tsx` handles drag-to-add, drag-to-remove (threshold-based), context menu for group/ungroup, and serialization of parent-child state.

**Tech Stack:** React, TypeScript, @xyflow/react v12 (ReactFlow), lucide-react icons, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-canvas-group-nodes-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/canvas/GroupNode.tsx` | **NEW** — GroupNode component: glassmorphism container, editable label, folder icon, child count, NodeResizer, drop indicator |
| `src/pages/SuperPlanningCanvas.tsx` | **MODIFY** — Register groupNode type, add `onNodeDrag`/`onNodeDragStop` handlers, context menu state + handlers, custom group delete, update `addNode`/`serializeNodes`/`attachCallbacks`/`ensureParentOrder`, update AI context inventory |
| `src/components/canvas/CanvasToolbar.tsx` | **MODIFY** — Add `"groupNode"` to type union, add FolderPlus icon button |

---

### Task 1: GroupNode Component

**Files:**
- Create: `src/components/canvas/GroupNode.tsx`

This is the visual component — glassmorphism container with editable label, folder icon, child count badge, resize handles, and drop indicator.

- [ ] **Step 1: Create the GroupNode component**

Create `src/components/canvas/GroupNode.tsx`:

```tsx
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { Folder, X } from "lucide-react";

interface GroupNodeData {
  label?: string;
  childCount?: number;
  isDropTarget?: boolean;
  onUpdate?: (updates: Partial<GroupNodeData>) => void;
  onDelete?: () => void;
}

const GroupNode = memo(({ data, selected }: NodeProps) => {
  const d = data as GroupNodeData;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(d.label || "New Group");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const saveLabel = useCallback(() => {
    const trimmed = editValue.trim() || "New Group";
    setEditValue(trimmed);
    d.onUpdate?.({ label: trimmed });
    setEditing(false);
  }, [editValue, d]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveLabel();
    if (e.key === "Escape") { setEditValue(d.label || "New Group"); setEditing(false); }
  }, [saveLabel, d.label]);

  return (
    <div
      className={`group relative w-full h-full rounded-xl border backdrop-blur-xl transition-colors ${
        d.isDropTarget
          ? "bg-purple-500/10 border-purple-500/50"
          : "bg-black/45 border-white/20"
      }`}
      style={{ minWidth: 200, minHeight: 150 }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={150}
        handleStyle={{ opacity: 0, width: 12, height: 12 }}
        lineStyle={{ opacity: 0 }}
        isVisible={selected}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md max-w-[80%]">
          <Folder className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          {editing ? (
            <input
              ref={inputRef}
              className="nodrag bg-transparent text-white/85 text-xs font-medium outline-none border-b border-purple-400/50 min-w-[60px] max-w-full"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveLabel}
            />
          ) : (
            <span
              className="text-white/85 text-xs font-medium truncate cursor-text"
              onDoubleClick={() => { setEditValue(d.label || "New Group"); setEditing(true); }}
            >
              {d.label || "New Group"}
            </span>
          )}
          {(d.childCount ?? 0) > 0 && (
            <span className="text-white/30 text-[10px] ml-1 flex-shrink-0">
              {d.childCount} node{(d.childCount ?? 0) !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Delete button */}
        <button
          className="nodrag ml-auto p-1 rounded-md text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          onClick={() => d.onDelete?.()}
          title="Delete group"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

GroupNode.displayName = "GroupNode";
export default GroupNode;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to GroupNode

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/GroupNode.tsx
git commit -m "feat(canvas): add GroupNode component with editable label and resize"
```

---

### Task 2: Toolbar Integration

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx` (lines 1-2 for imports, line 22 for type union, line 278 area for new button)

Add the FolderPlus button and update the type union.

- [ ] **Step 1: Update imports**

In `src/components/canvas/CanvasToolbar.tsx`, add `FolderPlus` to the lucide-react import on line 2:

```typescript
// Change:
import { Instagram, StickyNote, Search, ChevronLeft, ChevronDown, Plus, Minus, HelpCircle, Anchor, BookOpen, Target, TrendingUp, Pencil, Eraser, UserSearch, Trash2, Check, Paperclip } from "lucide-react";
// To:
import { Instagram, StickyNote, Search, ChevronLeft, ChevronDown, Plus, Minus, HelpCircle, Anchor, BookOpen, Target, TrendingUp, Pencil, Eraser, UserSearch, Trash2, Check, Paperclip, FolderPlus } from "lucide-react";
```

- [ ] **Step 2: Update the onAddNode type union**

On line 22, add `"groupNode"` to the `onAddNode` type:

```typescript
// Change:
onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "mediaNode") => void;
// To:
onAddNode: (type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "mediaNode" | "groupNode") => void;
```

- [ ] **Step 3: Add the Group button to the toolbar**

After the media button/storage indicator block (around line 283, after the closing `)}` for `sessionStorageUsed > 0`), add the Group button before the first divider:

```tsx
<IconBtn onClick={() => onAddNode("groupNode")} icon={FolderPlus} label="Add Group" accent />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Error about `addNode` in `SuperPlanningCanvas.tsx` not accepting `"groupNode"` — this is expected and will be fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/CanvasToolbar.tsx
git commit -m "feat(canvas): add Group button to canvas toolbar"
```

---

### Task 3: Register GroupNode + Update addNode + Serialization

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx`
  - Line 28 area: add import
  - Line 67-77: add to nodeTypes
  - Line 84-96: update serializeNodes
  - Line 222-246: update attachCallbacks
  - Line 824-855: update addNode

This task wires the GroupNode into the canvas — registration, creation, serialization, and restoration.

- [ ] **Step 1: Add GroupNode import**

After the MediaNode import (line 28), add:

```typescript
import GroupNode from "@/components/canvas/GroupNode";
```

- [ ] **Step 2: Register in nodeTypes**

Add `groupNode: GroupNode` to the `nodeTypes` map (line 67-77):

```typescript
const nodeTypes = {
  videoNode: VideoNode,
  textNoteNode: TextNoteNode,
  researchNoteNode: ResearchNoteNode,
  aiAssistantNode: AIAssistantNode,
  hookGeneratorNode: HookGeneratorNode,
  brandGuideNode: BrandGuideNode,
  ctaBuilderNode: CTABuilderNode,
  instagramProfileNode: InstagramProfileNode,
  mediaNode: MediaNode,
  groupNode: GroupNode,
};
```

- [ ] **Step 3: Add ensureParentOrder helper**

Add this helper function right after `serializeNodes` (around line 96):

```typescript
/** Reorder nodes so parent group nodes always precede their children (ReactFlow requirement) */
function ensureParentOrder(nodes: Node[]): Node[] {
  const groups = nodes.filter(n => n.type === "groupNode");
  const others = nodes.filter(n => n.type !== "groupNode");
  return [...groups, ...others];
}
```

- [ ] **Step 4: Update serializeNodes to persist parentId and expandParent**

In `serializeNodes` (lines 84-96), add `parentId` and `expandParent` fields:

```typescript
function serializeNodes(nodes: Node[]): any[] {
  return nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    width: n.width,
    height: n.height,
    deletable: n.deletable,
    parentId: n.parentId,
    expandParent: n.expandParent,
    data: Object.fromEntries(
      Object.entries(n.data || {}).filter(([k]) => !CALLBACK_KEYS.includes(k))
    ),
  }));
}
```

- [ ] **Step 5: Update attachCallbacks to preserve parentId/expandParent and handle groupNode**

In `attachCallbacks` (lines 222-246), the current code unconditionally sets `onUpdate` and `onDelete` AFTER spreading `...extra`, which means any `extra.onDelete` gets overwritten. For `groupNode`, we need to return early with completely custom handling. Restructure `attachCallbacks` so that `groupNode` gets its own return path.

Replace the entire `attachCallbacks` function body with this logic:

```typescript
const attachCallbacks = useCallback((nodeList: Node[]): Node[] => {
  return nodeList.map(n => {
    if (n.id === AI_NODE_ID) return n; // AI node gets callbacks separately
    const nodeId = n.id;

    // ── GroupNode: completely custom callbacks (no authToken/clientId needed) ──
    if (n.type === "groupNode") {
      return {
        ...n,
        data: {
          ...n.data,
          childCount: nodeList.filter(nd => nd.parentId === nodeId).length,
          onUpdate: (updates: any) =>
            setNodes(ns => ns.map(nd => nd.id === nodeId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
          onDelete: () => {
            setNodes(ns => {
              const groupPos = ns.find(nd => nd.id === nodeId)?.position ?? { x: 0, y: 0 };
              const childCount = ns.filter(nd => nd.parentId === nodeId).length;
              if (childCount > 0 && !window.confirm(`This group has ${childCount} node(s). Delete the group? (Nodes will be released)`)) return ns;
              const updated = ns.map(nd => {
                if (nd.parentId === nodeId) {
                  return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + groupPos.x, y: nd.position.y + groupPos.y } };
                }
                return nd;
              });
              return updated.filter(nd => nd.id !== nodeId);
            });
          },
        },
      };
    }

    // ── All other nodes: standard callbacks ──
    const extra: Record<string, any> = {};
    // MediaNode needs sessionId and nodeId for uploads
    if (n.type === "mediaNode") {
      extra.sessionId = activeSessionIdRef.current;
      extra.nodeId = nodeId;
    }
    return {
      ...n,
      data: {
        ...n.data,
        authToken,
        clientId: selectedClient.id,
        ...extra,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(nd => nd.id === nodeId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
        onDelete: () =>
          setNodes(ns => ns.filter(nd => nd.id !== nodeId)),
      },
    };
  });
}, [authToken, selectedClient.id, setNodes]);
```

**Key changes:**
- GroupNode gets an early-return path with custom `onDelete` (detach children, confirm if has children, then remove)
- GroupNode does NOT get `authToken`/`clientId` (unnecessary)
- Standard `onDelete` for other nodes remains unchanged
- The `onDelete` for groupNode includes `window.confirm()` when children exist (per spec requirement)

Also — after `attachCallbacks` is called in `switchSession` (line 315) and the initial `loadCanvas` (line 437), wrap with `ensureParentOrder`:

```typescript
// In switchSession (line 315):
const restoredNodes = ensureParentOrder(attachCallbacks((data.nodes as Node[]) || []));

// In loadCanvas (line 437):
const restoredNodes = ensureParentOrder(attachCallbacks(active.nodes as Node[]));
```

- [ ] **Step 6: Update addNode to handle groupNode**

In the `addNode` callback (lines 824-855), add `"groupNode"` to the type union and handle it:

Update the type union:
```typescript
const addNode = useCallback((type: "videoNode" | "textNoteNode" | "researchNoteNode" | "hookGeneratorNode" | "brandGuideNode" | "ctaBuilderNode" | "instagramProfileNode" | "mediaNode" | "groupNode") => {
```

In the `initialWidth` block, add the groupNode case:
```typescript
: type === "mediaNode" ? 280
: type === "groupNode" ? 400
: 288;
```

For the `newNode` creation, group nodes need different data and explicit height. Right after `const newNode: Node = {` block, add special handling. Replace the current newNode construction (lines 838-854) with:

```typescript
const isGroup = type === "groupNode";
const newNode: Node = {
  id: nodeId,
  type,
  position,
  width: initialWidth,
  ...(isGroup ? { height: 300, style: { width: 400, height: 300 } } : {}),
  data: isGroup
    ? {
        label: "New Group",
        childCount: 0,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () => {
          setNodes(ns => {
            const groupPos = ns.find(nd => nd.id === nodeId)?.position ?? { x: 0, y: 0 };
            const childCount = ns.filter(nd => nd.parentId === nodeId).length;
            if (childCount > 0 && !window.confirm(`This group has ${childCount} node(s). Delete the group? (Nodes will be released)`)) return ns;
            const updated = ns.map(nd => {
              if (nd.parentId === nodeId) {
                return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + groupPos.x, y: nd.position.y + groupPos.y } };
              }
              return nd;
            });
            return updated.filter(nd => nd.id !== nodeId);
          });
        },
      }
    : {
        authToken,
        clientId: selectedClient.id,
        nodeId,
        sessionId: activeSessionIdRef.current,
        onUpdate: (updates: any) =>
          setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
        onDelete: () =>
          setNodes(ns => ns.filter(n => n.id !== nodeId)),
      },
};
// Groups go to the front of the array for ordering
if (isGroup) {
  setNodes(prev => [newNode, ...prev]);
} else {
  setNodes(prev => [...prev, newNode]);
}
```

Remove the old `setNodes(prev => [...prev, newNode]);` at line 854 since it's now inside the if/else.

- [ ] **Step 7: Verify TypeScript compiles and build succeeds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Then: `npm run build 2>&1 | tail -10`
Expected: Clean compile and build

- [ ] **Step 8: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx src/components/canvas/GroupNode.tsx
git commit -m "feat(canvas): register GroupNode, update addNode/serialize/restore with parentId support"
```

---

### Task 4: Drag-to-Add and Drag-to-Remove Interactions

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` — add `onNodeDrag` and `onNodeDragStop` handlers, pass to `<ReactFlow>`

This is the core containment logic: dragging nodes onto groups and out of groups.

- [ ] **Step 1: Add getInternalNode and getIntersectingNodes to the useReactFlow destructure**

At line 857 (the `useReactFlow` destructure), add the new APIs:

```typescript
const { zoomIn, zoomOut, screenToFlowPosition, getInternalNode, getIntersectingNodes } = useReactFlow();
```

- [ ] **Step 2: Add the onNodeDrag handler (visual feedback + threshold tracking)**

Add this after the viewport line (around line 858), before the paste handler:

```typescript
// ─── Group drag-to-add/remove tracking ───
const dragOutThresholdRef = useRef<string | null>(null); // nodeId that's being dragged past threshold

const handleNodeDrag = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
  // Skip groups, AI node
  if (draggedNode.type === "groupNode" || draggedNode.id === AI_NODE_ID) {
    // Clear any drop targets
    setNodes(ns => ns.map(n => n.type === "groupNode" && (n.data as any).isDropTarget ? { ...n, data: { ...n.data, isDropTarget: false } } : n));
    return;
  }

  // Check if this child is being dragged out of its parent group
  if (draggedNode.parentId) {
    const parentNode = getInternalNode(draggedNode.parentId);
    if (parentNode) {
      const parentW = parentNode.measured?.width ?? (parentNode as any).width ?? 400;
      const parentH = parentNode.measured?.height ?? (parentNode as any).height ?? 300;
      const pos = draggedNode.position; // relative to parent
      const threshold = 50;
      const isOutside = pos.x < -threshold || pos.y < -threshold || pos.x > parentW + threshold || pos.y > parentH + threshold;
      dragOutThresholdRef.current = isOutside ? draggedNode.id : null;
    }
  }

  // Visual drop indicator for groups
  const intersecting = getIntersectingNodes(draggedNode);
  const targetGroup = intersecting
    .filter(n => n.type === "groupNode" && n.id !== draggedNode.parentId)
    .sort((a, b) => ((a.measured?.width ?? 400) * (a.measured?.height ?? 300)) - ((b.measured?.width ?? 400) * (b.measured?.height ?? 300)))[0];

  setNodes(ns => ns.map(n => {
    if (n.type !== "groupNode") return n;
    const shouldHighlight = targetGroup?.id === n.id;
    if ((n.data as any).isDropTarget !== shouldHighlight) {
      return { ...n, data: { ...n.data, isDropTarget: shouldHighlight } };
    }
    return n;
  }));
}, [getInternalNode, getIntersectingNodes, setNodes]);
```

- [ ] **Step 3: Add the onNodeDragStop handler (containment logic)**

Add right after `handleNodeDrag`:

```typescript
const handleNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
  // Clear all drop indicators
  setNodes(ns => ns.map(n => n.type === "groupNode" && (n.data as any).isDropTarget ? { ...n, data: { ...n.data, isDropTarget: false } } : n));

  // Skip groups, AI node
  if (draggedNode.type === "groupNode" || draggedNode.id === AI_NODE_ID) return;

  // ── CASE 1: Drag OUT of a group ──
  if (draggedNode.parentId && dragOutThresholdRef.current === draggedNode.id) {
    // Use getInternalNode for reliable absolute position (not manual sum)
    const nodeInternal = getInternalNode(draggedNode.id);
    const absPos = nodeInternal?.internals?.positionAbsolute ?? draggedNode.position;
    const oldParentId = draggedNode.parentId;

    setNodes(ns => {
      const updated = ns.map(n => {
        if (n.id === draggedNode.id) {
          return { ...n, parentId: undefined, expandParent: undefined, position: absPos };
        }
        // Update child count on the old parent
        if (n.id === oldParentId) {
          const newCount = ns.filter(nd => nd.parentId === oldParentId && nd.id !== draggedNode.id).length;
          return { ...n, data: { ...n.data, childCount: newCount } };
        }
        return n;
      });
      return updated;
    });
    dragOutThresholdRef.current = null;
    return;
  }
  dragOutThresholdRef.current = null;

  // ── CASE 2: Drag INTO a group ──
  const intersecting = getIntersectingNodes(draggedNode);
  const targetGroup = intersecting
    .filter(n => n.type === "groupNode" && n.id !== draggedNode.parentId)
    .sort((a, b) => ((a.measured?.width ?? 400) * (a.measured?.height ?? 300)) - ((b.measured?.width ?? 400) * (b.measured?.height ?? 300)))[0];

  if (!targetGroup) return;

  const groupInternal = getInternalNode(targetGroup.id);
  const nodeInternal = getInternalNode(draggedNode.id);
  if (!groupInternal || !nodeInternal) return;

  const groupAbsPos = groupInternal.internals?.positionAbsolute ?? targetGroup.position;
  const nodeAbsPos = nodeInternal.internals?.positionAbsolute ?? draggedNode.position;
  const relativePos = { x: nodeAbsPos.x - groupAbsPos.x, y: nodeAbsPos.y - groupAbsPos.y };

  setNodes(ns => {
    const updated = ns.map(n => {
      if (n.id === draggedNode.id) {
        return { ...n, parentId: targetGroup.id, expandParent: true, position: relativePos };
      }
      // Update child count on the target group
      if (n.id === targetGroup.id) {
        const newCount = ns.filter(nd => nd.parentId === targetGroup.id).length + 1;
        return { ...n, data: { ...n.data, childCount: newCount } };
      }
      // If moving from another group, update old group's count
      if (draggedNode.parentId && n.id === draggedNode.parentId) {
        const newCount = ns.filter(nd => nd.parentId === draggedNode.parentId && nd.id !== draggedNode.id).length;
        return { ...n, data: { ...n.data, childCount: newCount } };
      }
      return n;
    });
    return ensureParentOrder(updated);
  });
}, [getInternalNode, getIntersectingNodes, setNodes]);
```

- [ ] **Step 4: Wire handlers to ReactFlow component**

On the `<ReactFlow>` component (around line 1014), add the two new props:

```tsx
onNodeDrag={handleNodeDrag}
onNodeDragStop={handleNodeDragStop}
```

- [ ] **Step 5: Verify TypeScript compiles and build succeeds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Then: `npm run build 2>&1 | tail -10`
Expected: Clean

- [ ] **Step 6: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): add drag-to-add and drag-to-remove group interactions"
```

---

### Task 5: Context Menu — Group Selected + Ungroup

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` — add context menu state, handlers, and JSX

- [ ] **Step 1: Add lucide-react imports for context menu icons**

At the top of `SuperPlanningCanvas.tsx`, add `Folder` and `FolderOpen` imports from lucide-react:

```typescript
import { Folder, FolderOpen } from "lucide-react";
```

- [ ] **Step 2: Add context menu state**

Inside `CanvasInner`, add state for the context menu (after the `drawWidth` state, around line 138):

```typescript
// ─── Context menu for group/ungroup ───
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: "selection" | "group"; groupId?: string } | null>(null);
```

- [ ] **Step 3: Add context menu handlers**

Add these handlers after the `handleNodeDragStop` handler:

```typescript
// ─── Context menu handlers for group/ungroup ───
const handleSelectionContextMenu = useCallback((event: React.MouseEvent) => {
  event.preventDefault();
  const selectedNodes = nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID);
  if (selectedNodes.length < 2) return;
  setContextMenu({ x: event.clientX, y: event.clientY, type: "selection" });
}, []);

const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
  if (node.type !== "groupNode") return;
  event.preventDefault();
  setContextMenu({ x: event.clientX, y: event.clientY, type: "group", groupId: node.id });
}, []);

const handleGroupSelected = useCallback(() => {
  setContextMenu(null);
  const selectedNodes = nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID);
  if (selectedNodes.length < 2) return;

  // Calculate bounding box using absolute positions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of selectedNodes) {
    const internal = getInternalNode(n.id);
    const absPos = internal?.internals?.positionAbsolute ?? n.position;
    const w = n.measured?.width ?? (n as any).width ?? 200;
    const h = n.measured?.height ?? (n as any).height ?? 150;
    minX = Math.min(minX, absPos.x);
    minY = Math.min(minY, absPos.y);
    maxX = Math.max(maxX, absPos.x + w);
    maxY = Math.max(maxY, absPos.y + h);
  }

  const padding = 40;
  const groupX = minX - padding;
  const groupY = minY - padding;
  const groupW = maxX - minX + padding * 2;
  const groupH = maxY - minY + padding * 2;
  const groupId = `groupNode_${Date.now()}`;

  setNodes(ns => {
    const groupNode: Node = {
      id: groupId,
      type: "groupNode",
      position: { x: groupX, y: groupY },
      width: groupW,
      height: groupH,
      style: { width: groupW, height: groupH },
      data: {
        label: "New Group",
        childCount: selectedNodes.length,
        onUpdate: (updates: any) =>
          setNodes(nns => nns.map(nd => nd.id === groupId ? { ...nd, data: { ...nd.data, ...updates } } : nd)),
        onDelete: () => {
          setNodes(nns => {
            const gPos = nns.find(nd => nd.id === groupId)?.position ?? { x: 0, y: 0 };
            const updated = nns.map(nd => {
              if (nd.parentId === groupId) {
                return { ...nd, parentId: undefined, expandParent: undefined, position: { x: nd.position.x + gPos.x, y: nd.position.y + gPos.y } };
              }
              return nd;
            });
            return updated.filter(nd => nd.id !== groupId);
          });
        },
      },
    };

    // Set parentId on selected nodes, convert to relative positions
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const updated = ns.map(n => {
      if (selectedIds.has(n.id)) {
        const internal = getInternalNode(n.id);
        const absPos = internal?.internals?.positionAbsolute ?? n.position;
        return {
          ...n,
          parentId: groupId,
          expandParent: true,
          position: { x: absPos.x - groupX, y: absPos.y - groupY },
        };
      }
      return n;
    });

    return ensureParentOrder([groupNode, ...updated]);
  });
}, [getInternalNode, setNodes]);

const handleUngroup = useCallback(() => {
  const groupId = contextMenu?.groupId;
  setContextMenu(null);
  if (!groupId) return;

  setNodes(ns => {
    const groupNode = ns.find(n => n.id === groupId);
    const groupPos = groupNode?.position ?? { x: 0, y: 0 };
    const updated = ns.map(n => {
      if (n.parentId === groupId) {
        return { ...n, parentId: undefined, expandParent: undefined, position: { x: n.position.x + groupPos.x, y: n.position.y + groupPos.y } };
      }
      return n;
    });
    return updated.filter(n => n.id !== groupId);
  });
}, [contextMenu, setNodes]);
```

- [ ] **Step 4: Close context menu on canvas interactions**

Add an effect to close the context menu on click/escape. Right after the handlers:

```typescript
// Close context menu on click outside or escape
useEffect(() => {
  if (!contextMenu) return;
  const handleClick = () => setContextMenu(null);
  const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
  window.addEventListener("click", handleClick);
  window.addEventListener("keydown", handleKey);
  return () => { window.removeEventListener("click", handleClick); window.removeEventListener("keydown", handleKey); };
}, [contextMenu]);
```

- [ ] **Step 5: Wire context menu callbacks to ReactFlow**

On the `<ReactFlow>` component, add:

```tsx
onSelectionContextMenu={handleSelectionContextMenu}
onNodeContextMenu={handleNodeContextMenu}
```

- [ ] **Step 6: Add context menu JSX**

After the `<CanvasTutorial>` component (around line 1088), add the context menu:

```tsx
{/* Context menu for Group/Ungroup */}
{contextMenu && (
  <div
    className="fixed z-50 min-w-[160px] rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-xl py-1"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onClick={e => e.stopPropagation()}
  >
    {contextMenu.type === "selection" && (
      <>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
          {nodesRef.current.filter(n => n.selected && n.type !== "groupNode" && n.id !== AI_NODE_ID).length} nodes selected
        </div>
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-purple-500/15 transition-colors"
          onClick={handleGroupSelected}
        >
          <Folder className="w-4 h-4 text-purple-400" />
          Group Selected
        </button>
      </>
    )}
    {contextMenu.type === "group" && (
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-orange-500/15 transition-colors"
        onClick={handleUngroup}
      >
        <FolderOpen className="w-4 h-4 text-orange-400" />
        Ungroup
      </button>
    )}
  </div>
)}
```

- [ ] **Step 7: Verify TypeScript compiles and build succeeds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Then: `npm run build 2>&1 | tail -10`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): add context menu for Group Selected and Ungroup"
```

---

### Task 6: AI Context Integration

**Files:**
- Modify: `src/pages/SuperPlanningCanvas.tsx` — update the `nodeInventory` builder in the `canvasContext` useMemo

Add group membership info to node inventory entries so the AI knows about organizational structure.

- [ ] **Step 1: Update nodeInventory builder**

In the `canvasContext` useMemo (around line 688-708), update each inventory entry to include group info. Add a helper at the top of the useMemo:

```typescript
// Helper to get group label for a node
const getGroupLabel = (nodeId: string): string | null => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node?.parentId) return null;
  const group = nodes.find(n => n.id === node.parentId);
  return (group?.data as any)?.label || null;
};
const groupSuffix = (nodeId: string) => {
  const label = getGroupLabel(nodeId);
  return label ? ` [in group: "${label}"]` : "";
};
```

Then append `groupSuffix(n.id)` to each inventory line. For example, the videoNodes map:

```typescript
...videoNodes.map(n => {
  const d = n.data as any;
  const hasTranscript = !!d.transcription;
  const hasAnalysis = !!d.videoAnalysis;
  const username = d.channel_username ? `@${d.channel_username}` : null;
  const label = username || (d.url ? "video" : "video node");
  if (hasTranscript || hasAnalysis) return `VideoNode(${label}, transcription=${hasTranscript}, visual_analysis=${hasAnalysis})${groupSuffix(n.id)}`;
  return `VideoNode(${label}, status=loading_or_empty)${groupSuffix(n.id)}`;
}),
```

Apply the same `${groupSuffix(n.id)}` pattern to textNoteNodes, researchNodes, hookNodes, brandNodes, ctaNodes, instagramProfileNodes, and mediaNodes entries.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/pages/SuperPlanningCanvas.tsx
git commit -m "feat(canvas): include group membership in AI context node inventory"
```

---

### Task 7: Final Integration Test + Build

**Files:** None — verification only

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -50`
Expected: No errors

- [ ] **Step 2: Production build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Deploy to VPS**

Use SCP to upload the built `dist/` folder to the VPS at `/var/www/connectacreators/`:

```bash
# Build locally
npm run build

# SCP dist to VPS
scp -r dist/* root@72.62.200.145:/var/www/connectacreators/

# Reload nginx
ssh root@72.62.200.145 "nginx -s reload"
```

(Adapt to the expect script pattern used in this project for SSH/SCP.)

- [ ] **Step 4: Commit any final fixes**

If any fixes were needed, commit them.
