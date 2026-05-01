# Mobile Canvas — AI Chat + Swipe-Up Node Drawer

## Summary
On screens < 768px, the Super Planning Canvas renders a mobile-optimized view instead of the desktop ReactFlow canvas. The mobile view uses an **AI Chat + Swipe-Up Node Drawer** pattern where the AI chat is the primary interface and nodes are accessible via a bottom drawer.

## Architecture

### Detection
- `window.matchMedia("(max-width: 767px)")` inside `CanvasInner`
- Renders `<MobileCanvasView>` instead of the desktop ReactFlow + toolbar

### Layout (top → bottom)
1. **Top bar** (48px): Back button, client name, session name, "Desktop view on PC" label
2. **AI Chat** (flex-1): Full `CanvasAIPanel` component, same as desktop
3. **Node Drawer** (fixed bottom): 3-state swipe drawer
4. **FAB** (+): Floating action button, positioned above drawer

### Node Drawer States
| State | Height | Content |
|-------|--------|---------|
| Collapsed | 48px | Handle bar + node count |
| Half | 120px | Horizontal scroll of node chips |
| Full | 60vh | Vertical list grouped by type |

Swipe up/down transitions between states (30px threshold). Tap handle to cycle.

### Node Detail Sheet
- Tapping a chip opens an 80vh bottom sheet
- Read-only view with type-specific content rendering
- "Send to AI" button injects content into chat via `window.__canvasAutoMessage`

### FAB Menu
- 6 most common node types: Video, Text Note, Research, Media, Hook, Instagram Profile
- Staggered animation (30ms per item)
- Calls `onAddNode()` from parent canvas (same function as desktop toolbar)

### AI Chat
- Uses `CanvasAIPanel` directly (same component as desktop)
- Separate chat namespace: `node_id = "__mobile_ai__"` for mobile-specific persistence
- Full context aggregation from all nodes (via `canvasContextRef`)

## Files
- **Created**: `src/components/canvas/MobileCanvasView.tsx` (~600 lines)
- **Modified**: `src/pages/SuperPlanningCanvas.tsx` (import + mobile detection + conditional render)

## Node Type Mapping
| Type | Icon | Color |
|------|------|-------|
| videoNode | Video | #f97316 |
| textNoteNode | StickyNote | #a78bfa |
| researchNoteNode | Search | #34d399 |
| hookGeneratorNode | Sparkles | #facc15 |
| brandGuideNode | Palette | #f472b6 |
| ctaBuilderNode | Megaphone | #fb923c |
| instagramProfileNode | Globe | #818cf8 |
| mediaNode | Image | #22d3ee |
| onboardingFormNode | ClipboardList | #22d3ee |
| annotationNode | Hash | #94a3b8 |
