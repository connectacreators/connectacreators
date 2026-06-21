# Collaborative Script Editing — Phase 3 (Near-Live Sync) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make script edits appear in other open sessions within ~1s (block-level + caption), without ever overwriting a block the local user is editing.

**Architecture:** After a session's debounced diff-save persists changes, it broadcasts a lightweight "saved" ping on a Supabase broadcast channel `script-sync:<scriptId>`. Other sessions re-fetch the script's blocks + caption and **merge non-destructively**: a block is replaced with the remote version only if the local user has not edited it since their last save (reusing the Phase 1 baseline to detect "dirty" blocks); locally-edited and locally-new blocks are preserved. This yields the ~1s feel (autosave debounce is 900ms) while making same-block clobber impossible.

**Tech Stack:** React + TypeScript, Supabase Realtime broadcast, Vitest. Spec: `docs/superpowers/specs/2026-06-20-collaborative-script-editing-design.md`. Builds on Phase 1 (`src/lib/scriptBlockDiff.ts` exports `blockSignature`/`buildBaseline`; `saveScriptBlocks` is diff-based and returns `{ blocks, revision, conflicted }`; `Scripts.tsx` has `baselineRef`/`removedIdsRef`/`revisionRef`/`handleBlocksChange`).

## Global Constraints

- Editor lives on `origin/main`; this work is in a worktree off main.
- App-surface code uses `hsl(var(--...))` tokens, never raw palette hex (pre-commit hook blocks hex).
- CI runs `vite build` only; tsconfig is NON-STRICT (won't catch type/null mismatches). Verify `npx tsc --noEmit` exits 0 and judge correctness by reading code.
- Supabase project id: `hxojqrilwhhrvloiwmfo`. Broadcast channels need no realtime-publication changes.
- Model the new hook on the existing `src/hooks/useRealtimeCanvasSync.ts` (broadcast + tabId self-guard + cleanup on roomId change).

---

## Task 1: `saveScriptBlocks` reports whether it wrote anything

**Files:**
- Modify: `src/hooks/useScripts.ts` (`saveScriptBlocks`)

**Interfaces:**
- Produces: `saveScriptBlocks(...)` return type gains `wrote: boolean` → `{ blocks, revision, conflicted, wrote }`. `wrote` is true iff this call upserted or deleted at least one row. Existing call sites destructure `blocks`/`revision` and are unaffected.

- [ ] **Step 1: Compute and return `wrote`**

In `src/hooks/useScripts.ts`, in `saveScriptBlocks`:

1. Update the return type annotation to:
```ts
  ): Promise<{ blocks: ScriptLine[]; revision: number; conflicted: boolean; wrote: boolean }> => {
```

2. In the empty-document early return, add `wrote: false`:
```ts
    if (!hasContentLine) {
      return { blocks: await getScriptBlocks(scriptId), revision: await getScriptRevision(scriptId), conflicted: false, wrote: false };
    }
```

3. Track whether anything was written. After computing `{ upserts, deleteIds }`, add:
```ts
    const wrote = upserts.length > 0 || deleteIds.length > 0;
```

4. In the final return, add `wrote`:
```ts
    return { blocks: await getScriptBlocks(scriptId), revision, conflicted, wrote };
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0 (call sites in Scripts.tsx ignore the extra field; non-strict tsconfig).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): saveScriptBlocks reports whether it wrote (for sync ping)"
```

---

## Task 2: `mergeRemoteBlocks` pure reducer + tests

**Files:**
- Create: `src/lib/scriptRemoteMerge.ts`
- Test: `src/lib/scriptRemoteMerge.test.ts`

**Interfaces:**
- Consumes: `ScriptLine` from `@/hooks/useScripts`.
- Produces: `mergeRemoteBlocks(local: ScriptLine[], remote: ScriptLine[], dirtyIds: Set<string>): ScriptLine[]`
  - Order follows `remote`. For each remote block `r`: if `dirtyIds` has `r.id` AND a local block with that id exists → keep the LOCAL block (preserve the user's unsaved edit); else take `r` (carrying the local block's `uid` if one exists, so React keys stay stable). Then append any local blocks whose id is NOT in remote and IS in `dirtyIds` (locally-created/edited blocks the other session hasn't seen). Local blocks that are clean and absent from remote are dropped (remotely deleted). Blocks without an `id` are treated as local-only and preserved at the end.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scriptRemoteMerge.test.ts
import { describe, it, expect } from "vitest";
import { mergeRemoteBlocks } from "./scriptRemoteMerge";
import type { ScriptLine } from "@/hooks/useScripts";

const b = (id: string, text: string, over: Partial<ScriptLine> = {}): ScriptLine => ({
  id, uid: "uid-" + id, line_number: 1, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("mergeRemoteBlocks", () => {
  it("takes the remote version of a block the local user has not edited", () => {
    const local = [b("a", "old")];
    const remote = [b("a", "new")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.text)).toEqual(["new"]);
  });

  it("keeps the local version of a block the user is editing (dirty)", () => {
    const local = [b("a", "my edit")];
    const remote = [b("a", "their edit")];
    const out = mergeRemoteBlocks(local, remote, new Set(["a"]));
    expect(out.map((x) => x.text)).toEqual(["my edit"]);
  });

  it("adds a remotely-added block, following remote order", () => {
    const local = [b("a", "a")];
    const remote = [b("a", "a"), b("c", "c")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("drops a clean local block that was deleted remotely", () => {
    const local = [b("a", "a"), b("b", "b")];
    const remote = [b("a", "a")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("preserves a locally-created block not yet known remotely (dirty)", () => {
    const local = [b("a", "a"), b("z", "new local")];
    const remote = [b("a", "a")];
    const out = mergeRemoteBlocks(local, remote, new Set(["z"]));
    expect(out.map((x) => x.id)).toEqual(["a", "z"]);
  });

  it("carries the local uid onto a taken-remote block so keys stay stable", () => {
    const local = [b("a", "old")];
    const remote = [{ ...b("a", "new"), uid: undefined } as ScriptLine];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out[0].uid).toBe("uid-a");
  });

  it("follows remote order even when local order differs", () => {
    const local = [b("b", "b"), b("a", "a")];
    const remote = [b("a", "a"), b("b", "b")];
    const out = mergeRemoteBlocks(local, remote, new Set());
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scriptRemoteMerge.test.ts`
Expected: FAIL — cannot resolve `./scriptRemoteMerge`.

- [ ] **Step 3: Implement**

```ts
// src/lib/scriptRemoteMerge.ts
import type { ScriptLine } from "@/hooks/useScripts";

/**
 * Merge a freshly-fetched remote block list into the local document without
 * overwriting blocks the local user is actively editing.
 *
 * - Order follows `remote`.
 * - A remote block replaces the local one UNLESS its id is in `dirtyIds`
 *   (the user changed it since their last save) — then the local edit is kept.
 * - Local blocks that are dirty but absent from remote (just created locally)
 *   are appended. Clean local blocks absent from remote were deleted remotely
 *   and are dropped.
 * - The local `uid` is carried onto taken-remote blocks so React keys are stable.
 */
export function mergeRemoteBlocks(
  local: ScriptLine[],
  remote: ScriptLine[],
  dirtyIds: Set<string>,
): ScriptLine[] {
  const localById = new Map<string, ScriptLine>();
  for (const l of local) if (l.id) localById.set(l.id, l);

  const remoteIds = new Set<string>();
  const out: ScriptLine[] = [];

  for (const r of remote) {
    if (!r.id) { out.push(r); continue; }
    remoteIds.add(r.id);
    const localMatch = localById.get(r.id);
    if (localMatch && dirtyIds.has(r.id)) {
      out.push(localMatch); // preserve the user's unsaved edit
    } else {
      out.push({ ...r, uid: localMatch?.uid ?? r.uid });
    }
  }

  // Append local-only blocks the user created/edited that remote hasn't seen.
  for (const l of local) {
    if (!l.id) { out.push(l); continue; }
    if (!remoteIds.has(l.id) && dirtyIds.has(l.id)) out.push(l);
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scriptRemoteMerge.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scriptRemoteMerge.ts src/lib/scriptRemoteMerge.test.ts
git commit -m "feat(scripts): mergeRemoteBlocks non-destructive remote merge reducer"
```

---

## Task 3: `useRealtimeScriptSync` broadcast hook

**Files:**
- Create: `src/hooks/useRealtimeScriptSync.ts`

**Interfaces:**
- Produces: `useRealtimeScriptSync({ roomId, onRemoteSaved }: { roomId: string; onRemoteSaved: () => void }): { broadcastSaved: () => void }`
  - Subscribes to broadcast channel `script-sync:<roomId>`; on a `"saved"` event from another tab (tabId guard), calls the latest `onRemoteSaved`. `broadcastSaved()` sends a `"saved"` event `{ tabId }`. No-op when `roomId` is empty. Cleans up on roomId change/unmount.

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useRealtimeScriptSync.ts
import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

function getTabId(): string {
  let id = sessionStorage.getItem("presence_tab_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("presence_tab_id", id);
  }
  return id;
}

interface Options {
  /** e.g. "script:<scriptId>" — empty string disables the hook */
  roomId: string;
  /** Called when another session reports it just saved this script. */
  onRemoteSaved: () => void;
}

/**
 * Lightweight save-ping sync. After a session persists changes it calls
 * broadcastSaved(); peers receive it and re-fetch + merge. Broadcast is
 * ephemeral — the DB remains the source of truth.
 */
export function useRealtimeScriptSync({ roomId, onRemoteSaved }: Options): { broadcastSaved: () => void } {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const tabId = useRef(getTabId());
  const savedCb = useRef(onRemoteSaved);
  savedCb.current = onRemoteSaved;

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`script-sync:${roomId}`)
      .on("broadcast", { event: "saved" }, ({ payload }) => {
        if (payload?.tabId === tabId.current) return;
        savedCb.current();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId]);

  const broadcastSaved = useCallback(() => {
    channelRef.current?.send({
      type: "broadcast",
      event: "saved",
      payload: { tabId: tabId.current },
    });
  }, []);

  return { broadcastSaved };
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRealtimeScriptSync.ts
git commit -m "feat(scripts): useRealtimeScriptSync broadcast hook (saved ping)"
```

---

## Task 4: Wire near-live sync into Scripts.tsx

**Files:**
- Modify: `src/pages/Scripts.tsx`
  - imports
  - add `savedCaptionRef`; seed it on load (~1568) and update after caption saves (~3403, ~3432)
  - add `handleRemoteSaved` + mount `useRealtimeScriptSync`
  - call `broadcastSaved()` after a write in the autosave `.then` (~1656-1663) and the Save button (~3422-3430)

**Interfaces:**
- Consumes: `useRealtimeScriptSync`, `mergeRemoteBlocks`, `blockSignature` (from `@/lib/scriptBlockDiff`), existing `getScriptBlocks`, `baselineRef`, `revisionRef`, `skipNextAutoSaveRef`, `withUids`, `viewingScriptId`, `viewingCaption`/`setViewingCaption`, `docBlocks`/`setDocBlocks`, `supabase`.

- [ ] **Step 1: Add imports**

Add to existing imports:
```ts
import { blockSignature } from "@/lib/scriptBlockDiff";
import { mergeRemoteBlocks } from "@/lib/scriptRemoteMerge";
import { useRealtimeScriptSync } from "@/hooks/useRealtimeScriptSync";
```
(`buildBaseline` is already imported from `@/lib/scriptBlockDiff`; add `blockSignature` to that existing import or as shown.)

- [ ] **Step 2: Add `savedCaptionRef`**

Next to `revisionRef` (~line 1604):
```ts
  const savedCaptionRef = useRef<string>("");
```

- [ ] **Step 3: Seed `savedCaptionRef` on load**

In `handleViewScript`, right after `setViewingCaption(script.caption ?? "");` (~line 1568):
```ts
    savedCaptionRef.current = script.caption ?? "";
```

- [ ] **Step 4: Add the remote-saved handler + mount the sync hook**

Add after the refs / near `handleBlocksChange` (the handler reads current state via the functional updaters, so it needs no deps):

```ts
  const handleRemoteSaved = useCallback(async () => {
    const sid = viewingScriptId;
    if (!sid) return;
    const remoteBlocks = await getScriptBlocks(sid);
    const { data } = await supabase.from("scripts").select("caption, revision").eq("id", sid).maybeSingle();

    skipNextAutoSaveRef.current = true; // the merge-driven setDocBlocks must not re-trigger a save
    setDocBlocks((prev) => {
      const dirty = new Set(
        prev.filter((bl) => bl.id && baselineRef.current.get(bl.id) !== blockSignature(bl)).map((bl) => bl.id as string),
      );
      const merged = mergeRemoteBlocks(prev, remoteBlocks, dirty);
      // Blocks we accepted from remote are now the persisted baseline.
      merged.forEach((bl) => { if (bl.id && !dirty.has(bl.id)) baselineRef.current.set(bl.id, blockSignature(bl)); });
      return withUids(merged);
    });

    if (data) {
      revisionRef.current = (data as any).revision ?? revisionRef.current;
      const remoteCaption = (data as any).caption ?? "";
      // Only adopt the remote caption if the user hasn't edited theirs since last save.
      setViewingCaption((prev) => {
        if (prev === savedCaptionRef.current) { savedCaptionRef.current = remoteCaption; return remoteCaption; }
        return prev;
      });
    }
  }, [viewingScriptId]);

  const { broadcastSaved } = useRealtimeScriptSync({
    roomId: viewingScriptId ? `script:${viewingScriptId}` : "",
    onRemoteSaved: handleRemoteSaved,
  });
```

- [ ] **Step 5: Broadcast after autosave writes**

In the autosave `.then((res) => { ... })` block (~1661-1663), after `revisionRef.current = res.revision;` add:
```ts
        if (res.wrote) broadcastSaved();
```

- [ ] **Step 6: Broadcast after the Save button writes + sync `savedCaptionRef`**

In the Save button handler, after `revisionRef.current = res.revision;` (~3430) add:
```ts
                      if (res.wrote) broadcastSaved();
```
And after the caption update line `await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", sid);` (~3432) add:
```ts
                      savedCaptionRef.current = viewingCaption;
                      broadcastSaved();
```

- [ ] **Step 7: Sync `savedCaptionRef` after the caption onBlur save**

In the caption Textarea `onBlur` handler, after the successful update `await supabase.from("scripts").update({ caption: viewingCaption || null }).eq("id", viewingScriptId);` and its video_edits sync (~3397-3403), add (inside the success branch):
```ts
                      savedCaptionRef.current = viewingCaption;
                      broadcastSaved();
```

- [ ] **Step 8: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts` "No test suite found").

- [ ] **Step 9: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): near-live block + caption sync between sessions"
```

---

## Task 5: Manual two-session verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` — tsc exit 0; tests pass (minus the pre-existing reorder file).
- [ ] **Step 2:** Two-tab test on a non-critical script:
  1. Tab A edits line 1; within ~1-2s Tab B shows the change (B was not editing). ✅
  2. Both edit DIFFERENT lines simultaneously; after both settle, both lines survive in both tabs. ✅
  3. Both edit the SAME line at once; last save wins, the other sees it update live; no crash. ✅
  4. Tab A adds a line / deletes a line / reorders; Tab B reflects it within ~1-2s. ✅
  5. Edit the caption in Tab A; Tab B (caption not focused) shows it within ~1-2s; if B is mid-typing its caption, B's text is preserved. ✅
  6. Leave both idle for 30s — confirm no save/broadcast ping-pong (network tab quiet). ✅
- [ ] **Step 3:** DB spot-check: no duplicate line_numbers and the block count matches the UI.
```sql
select line_number, count(*) from script_lines where script_id = '<TEST_SCRIPT_ID>' group by line_number having count(*) > 1;
```
Expected: 0 rows.

## Self-Review Notes

- Spec Layer 3b (near-live block + caption sync) → Tasks 1-4. Block-edit + structure both handled by re-fetch + `mergeRemoteBlocks` (order follows remote → covers add/remove/reorder). Caption via re-read gated on local-dirty.
- No-overwrite preserved: dirty (locally-edited) blocks and the in-progress caption are never replaced; same-block conflicts resolve last-write-wins, visible live.
- Ping-pong prevention: `broadcastSaved()` fires only when `res.wrote` (a merge-driven no-op save doesn't write), and the merge sets `skipNextAutoSaveRef` so it doesn't trigger its own save.
- Out of scope: per-keystroke streaming and remote cursors (not required by the chosen near-live level).
- Branding: no UI/color changes in this phase.
