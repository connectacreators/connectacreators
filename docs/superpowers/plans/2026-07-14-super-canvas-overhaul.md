# Super Planning Canvas Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Super Planning Canvas reliable (saves never silently drop), live (two browsers see each other's edits), smooth (drag/draw at 60fps), and visually coherent (one shell system, no contrast failures), plus a modern editorial video player for VideoNode and Viral Today detail.

**Architecture:** All fixes are client-side except none — prod DB verified: `canvas_states` is in `supabase_realtime` publication with `REPLICA IDENTITY FULL`, RLS policies in place. Work is ordered as 7 sequential phases, each an independent commit on `main`.

**Tech Stack:** React 18, @xyflow/react 12.10.1, Supabase JS 2.95 (broadcast + postgres_changes), Tailwind + Connecta branding tokens (`--ink-on-cream`, `--cream`, `--aqua`, `--honey`).

## Global Constraints

- Branding tokens only in app surfaces: `hsl(var(--ink-on-cream))`, `bg-background`, etc. Pre-commit hook blocks palette hex (#EAE6DC, #1A1A1A, #141414, #8FD0D5).
- Stage only files touched by each phase; never stage the untracked iCloud `"* 2"` duplicate files.
- CI has no typecheck: run `npx tsc --noEmit` and check EXIT CODE before deploy.
- Deploy from main only, via `./deploy-expect.sh` (CI's VPS step times out).
- No DB schema changes in this plan (verified none needed).

---

## Phase 1 — Save reliability (`SuperPlanningCanvas.tsx`, `canvasMediaService.ts`)

The root cause of "leaving the page doesn't save": `beaconSave` (line ~1414-1441) sends `Authorization: Bearer ${VITE_SUPABASE_PUBLISHABLE_KEY}` (the anon key) → RLS rejects every write, silently. And SPA unmount only calls this broken path.

### Task 1.1: Fix beaconSave auth
- Keep a `authTokenRef` (already exists via `authToken` state at ~350) and send `Authorization: Bearer ${authTokenRef.current}`; bail early (and fall back to nothing) if the token is empty. Keep `apikey: VITE_SUPABASE_PUBLISHABLE_KEY`.
- `keepalive: true` stays (needed for tab close).

### Task 1.2: Flush on SPA unmount + visibility
- Unmount cleanup (~1513): call `saveCanvas(true)` (async is fine on SPA nav — page survives) in addition to beacon.
- `visibilitychange → hidden`: call beacon (fixed) AND `saveCanvas(true)`.
- Verify the debounced autosave path (~1470-1481) actually flushes trailing edits when the user goes idle; remove the `IDLE_TIMEOUT` gate from the 2s debounce (keep it for the 30s interval).

### Task 1.3: Honest save indicator
- When the dirty effect fires (~1444-1447), set `saveStatus("unsaved")` unless already "saving". Add an "Unsaved" (amber outline) state to `CanvasToolbar.tsx:351-360`.
- On save error: `toast.error("Canvas save failed — retrying")` once per failure streak + auto-retry with backoff (retry after 5s, max 3).

### Task 1.4: tusUpload stale-token guard (`canvasMediaService.ts:139-153`)
- Mirror the fixed pattern from the footage tusUpload bug: attempt `supabase.auth.getSession()`, if `!session?.access_token` call `supabase.auth.refreshSession()` and re-read; throw a clear error if still empty.

### Task 1.5: Stop orphaning draft scripts
- `handleSaveScript` (~819-850) must pass `existingScriptId: draftIdRef.current` into `directSave` so the "Connecta AI — In Progress" placeholder is promoted instead of orphaned (see `useScripts.ts:293-316` promote branch).

**Verify:** tsc exit 0; grep that no anon-key Bearer remains; manual reasoning trace of unmount path. Commit: `fix(canvas): saves no longer silently dropped on leave (beacon auth + unmount flush + honest indicator)`

---

## Phase 2 — Realtime sync (`SuperPlanningCanvas.tsx`, `useRealtimeCanvasSync.ts`)

Prod publication verified enabled. Client bugs to fix:

### Task 2.1: Kill the 3s coarse echo window
- ~2591: `if (Date.now() - lastSaveAtRef.current < 3000) return;` — delete. Keep only the precise `recentSaveUpdatedAtsRef` check (~2585-2588). During active editing on two devices, this window was discarding nearly all remote saves.

### Task 2.2: Don't clobber dirty local state on remote reload
- In the postgres_changes handler (~2595-2602): if `isDirtyRef.current`, don't wholesale-replace; schedule a re-check after the next save completes (store `pendingRemoteRef = payload` and apply after save if still newer). Prevents remote blob replace from wiping in-progress typing.

### Task 2.3: Broadcast completeness
- Add broadcast events in `useRealtimeCanvasSync.ts`: `nodes-added` (serialized nodes), `nodes-removed` (ids), `draw-paths` (full array, ≤100KB guard).
- Sender: hook into `addNode`/node factories and `onNodesDelete`/delete callbacks; drawPaths effect broadcasts (throttled 500ms).
- Receiver: insert via `attachCallbacks` (so remote-created nodes get working callbacks AND future data-update broadcasts), remove by id, replace drawPaths when not actively drawing.
- Fix freshly-created nodes not broadcasting data updates: route ALL node creation through a helper that installs the same broadcast-aware `onUpdate` that `attachCallbacks` builds (~657-658).

### Task 2.4: Realtime auth refresh
- In `onAuthStateChange` (~350-360): call `supabase.realtime.setAuth(session.access_token)` on TOKEN_REFRESHED/SIGNED_IN so long-lived tabs keep authorized postgres_changes.

**Verify:** tsc; two-tab manual smoke after deploy (drag + add node + draw in tab A appears in tab B). Commit: `feat(canvas): live cross-browser sync — adds/deletes/drawings broadcast, echo window fixed`

---

## Phase 3 — Interaction performance (`SuperPlanningCanvas.tsx`)

### Task 3.1: Remove hot-path logging + lazy canvasContext
- Delete `console.log`s at ~1540 and ~1761.
- `canvasContext` useMemo (~1522-1753, deps `[nodes, edges]`) recomputes every drag frame. It already feeds `canvasContextRef` — convert to a debounced effect (300ms) or compute-on-demand function so drags never pay for it.

### Task 3.2: Cheap onNodeDrag
- `handleNodeDrag` (~2003-2033): early-return unless a `groupNode` exists; only `setNodes` when an `isDropTarget` flag actually flips; return the SAME array reference otherwise.

### Task 3.3: Drawing at 60fps
- `handleDrawPointerMove` (~2363-2372): coalesce points via rAF; skip points < 2px apart.
- Split the render SVG layer (~2802-2831) into a memoized `<DrawPathsLayer paths={drawPaths}/>` (only re-renders when paths change) + a separate current-stroke layer; memoize `pathToSvgD` per path.
- Throttle eraser hover (~2505-2516) to rAF and only while eraser tool active.

### Task 3.4: React Flow feel
- Add `nodeDragThreshold={4}` to `<ReactFlow>` (~2755) so text selection/clicks don't start accidental drags.

**Verify:** tsc; drag a node with Performance profiler reasoning (no per-frame context recompute). Commit: `perf(canvas): 60fps drag + draw — hot-path recompute, per-frame setNodes, rAF drawing`

---

## Phase 4 — Annotation & text UX (`AnnotationNode.tsx`, `TextNoteNode.tsx`, toolbar/page)

### Task 4.1: Canva-style annotation drag/edit
- AnnotationNode (~422-448): `contentEditable` only in `editing` state. Not editing → whole node drags (remove `nodrag` from the content div), single click selects, **double-click enters edit** (focus + caret at click point). Blur/Escape exits edit.
- Keep grip but make it a visible affordance on hover; remove the height-0 collapse (~293-297).
- Selected state: visible dashed border already exists when `active` — make hover show a faint outline too.

### Task 4.2: Click-to-place Type tool
- Toolbar Type button (~CanvasToolbar.tsx:403) arms a `placing: "annotation"` mode (crosshair cursor on pane). Next `onPaneClick` creates the annotation at `screenToFlowPosition(click)` and enters edit immediately; Escape or second toolbar click cancels. (Keep old click-the-button-drops-at-center as fallback if mode not supported on mobile.)

### Task 4.3: TextNote drag target
- TextNoteNode: make the whole card draggable except the TipTap editor content and toolbar buttons (drop the header-only restriction); replace the `zoom: nodeScale` scaling (~165) with font-size scaling to eliminate pointer-math desync in resize handlers (~88-158).

**Verify:** tsc + interaction reasoning. Commit: `feat(canvas): annotations drag like Canva — edit on double-click, click-to-place, full-card drag`

---

## Phase 5 — Media & video nodes (`VideoNode.tsx`, `MediaNode.tsx`)

### Task 5.1: VideoNode never collapses
- `img onError` (~895-897): replace `display:none` hack with `setThumbnailUrl(null)` → falls through to the existing aspect-ratio placeholder (~945-971). Also try one `fetch-thumbnail` re-fetch before giving up (self-heal expired IG CDN URLs).
- Move `aspectRatio` style from the `<img>` to the hero wrapper div (~869) with `img` as `w-full h-full object-cover`; add `minHeight: 120` on the wrapper.

### Task 5.2: MediaNode free resize + plain-image mode
- Add `<NodeResizer minWidth={160} keepAspectRatio={d.fileType==="image"}>`; root `width: "100%"` instead of hard-coded 280 (mirror VideoNode ~775-794).
- Add `data.minimal` toggle (image nodes default true): hides the file-info footer, keeps image + root `<Handle>`s + delete overlay on hover + a small expand button. AI connectivity is edge/data-based (verified safe: handles live at root ~920-931).
- Fix `signedUrlCreatedAt` init (~112): initialize 0 so mounted URLs always verify.

**Verify:** tsc. Commit: `fix(canvas): video nodes keep shape on thumbnail loss; images resize freely w/ minimal mode`

---

## Phase 6 — Visual consistency (all canvas components + `index.css`)

### Task 6.1: One radius, real selection feedback
- `index.css` ~1209-1218: set `.react-flow .glass-card` radius to 16px (matches the `rounded-2xl` every node declares — kills the 14/16 mismatch with inner `overflow-hidden rounded-2xl` wrappers).
- Add ONE tokenized selection rule: `.react-flow__node.selected .glass-card, .react-flow__node.selected > [data-node-shell]` → `box-shadow: 3px 3px 0 hsl(var(--ink-on-cream)), 0 0 0 2px hsl(var(--aqua))`. Remove per-node dead inline selected rings (VideoNode ~782-786).

### Task 6.2: Bring outlier nodes onto the shell
- GroupNode, ScriptBatchNode, CompetitorFolderNode: `rounded-xl` → `rounded-2xl`; ScriptBatchNode `shadow-lg` → the hard-offset shadow; CompetitorProfileNode `bg-card` → glass-card; InstagramProfileNode: add border + offset shadow; QuestionDeckCard: radius 16.
- Extract the copy-pasted header string into `src/components/canvas/NodeHeader.tsx` (icon slot, label, actions slot) and use it in the 7 form nodes (BrandGuide, CTA, Hook, Research, TextNote, Media, OnboardingForm).

### Task 6.3: Contrast guards
- New `src/lib/contrast.ts`: export `hexLuminance` (promote from PublicLandingPage.tsx:119-131) + `readableOn(bgHex): "ink"|"cream"`.
- AnnotationNode: when text color ≈ container/canvas luminance, auto-add a contrasting text-shadow halo; swap `#ffffff` swatch default behavior to always readable.
- EditableEdge: white swatch gets an ink outline halo; default edge color → `hsl(var(--ink-on-cream)/0.6)` to match base CSS.
- CompetitorProfileNode ~383: white-on-aqua → `hsl(var(--ink-on-cream))` on aqua.
- ScriptBatchNode ~97-98: merge the duplicate `style` props (bug — second wins).
- Toolbar `bg-white`/`#ffffff` literals → `bg-card`/token equivalents (CanvasToolbar ~385 et al.).

**Verify:** tsc + pre-commit hook passes (no palette hex). Commit: `style(canvas): unified node shell — one radius/shadow/selection system, contrast guards`

---

## Phase 7 — Modern editorial video player (VideoNode + Viral Today detail)

Both surfaces already render the same custom component: `src/components/video/ViralVideoPlayer.tsx` (379 lines; honey/ink editorial skin, used by VideoNode:870-876, ViralVideoDetail:615-620, plus 3 companion embeds). Upgrade it in place — one change modernizes every surface.

### Task 7.1: Minimal control anatomy (ViralVideoPlayer.tsx) — USER DIRECTION: simple shapes, minimalistic, NOT the hand-drawn editorial doodle
- Replace the hand-drawn honey doodle play overlay with a simple geometric one: frosted dark circle (`bg-black/55 backdrop-blur-sm`, 56px) with a plain white triangle (lucide `Play` filled), subtle 150ms scale/fade.
- Bottom gradient scrim (black/60 → transparent), auto-hide on idle (1.8s), always visible on pause.
- Thin scrub bar: 3px track `white/25`, buffered range `white/40`, played fill plain white; drag with pointer capture; 14px invisible hit area; simple circular 10px knob appears on hover/drag. No tooltips, no decoration.
- Control row (compact, 32px): play/pause, mute, time `m:ss / m:ss` (tabular-nums, white/90 text-xs), spacer, speed cycle (1x→1.25x→1.5x→2x, plain text button), fullscreen. Plain white icons (lucide, stroke), 70%→100% opacity on hover. No honey accents, no sticker shadows, no borders — the video frame itself stays clean with just the container's rounded corners.
- Buffering: simple thin white spinner (waiting/stalled events).
- Keyboard when focused: Space toggle, ←/→ seek 5s, M mute, F fullscreen.
- Keep API back-compat: `src, fallbackProxyUrl, aspectRatio, compact, onExpired` (+ existing callbacks) unchanged; `compact` mode = center button + scrub only.
- Container: drop the `6px 6px 0` sticker shadow + ink border from the player itself; corners inherit from parent (rounded overflow-hidden). Neutral in both canvas and detail contexts.

**Verify:** tsc + build; player renders in canvas node and detail page. Commit: `feat(video): modern editorial playback — scrub anatomy, speed, keyboard, buffering`

---

## Phase 8 — Verify & deploy

1. `npx tsc --noEmit` — exit code MUST be 0.
2. `npm run build` — must succeed.
3. Push to main; CI will build but its VPS deploy step times out — deploy manually per `project_cicd_pipeline` memory (`./deploy-expect.sh` from a clean main build).
4. Post-deploy: two-browser smoke test on the live canvas (drag/add/draw sync, leave-page save, image resize).
