# Collaborative Script Editing — Phase 4 (Version-History Safety Net) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every script save leave a restorable snapshot, so any overwrite (including same-line last-write-wins) is recoverable in a click — with full block fidelity (headings + rich text) and bounded storage.

**Architecture:** `saveScriptBlocks` snapshots the current persisted state into `script_versions` *before* it writes, throttled to ≤1 snapshot / 2 min / script (tracked in an in-memory timestamp map — no per-keystroke DB hit), and prunes to the last 50 versions. Snapshots capture `block_kind` + `rich_text`. `restoreVersion` rebuilds blocks preserving those fields and bumps `scripts.revision` so peers re-sync.

**Tech Stack:** React + TypeScript, Supabase, Vitest. Builds on Phases 1-3. Spec: `docs/superpowers/specs/2026-06-20-collaborative-script-editing-design.md`.

## Global Constraints

- Editor lives on `origin/main`; work in a worktree off main.
- App-surface code uses `hsl(var(--...))` tokens, never raw palette hex.
- CI runs `vite build` only (no typecheck); verify `npx tsc --noEmit` exits 0; judge correctness by reading code.
- `script_versions.lines_snapshot` is `jsonb` → NO migration needed.
- Supabase project id: `hxojqrilwhhrvloiwmfo`.
- Existing: `saveVersionSnapshot` (useScripts.ts ~98), `restoreVersion`/`fetchVersions`/History dialog (Scripts.tsx). `saveVersionSnapshot` is currently called only from legacy save paths, NOT from `saveScriptBlocks`.

---

## Task 1: `shouldSnapshot` throttle helper + tests

**Files:**
- Create: `src/lib/versionSnapshotThrottle.ts`
- Test: `src/lib/versionSnapshotThrottle.test.ts`

**Interfaces:**
- Produces: `shouldSnapshot(lastMs: number | undefined, nowMs: number, thresholdMs?: number): boolean` — true when no prior snapshot (`lastMs` undefined) or `nowMs - lastMs >= thresholdMs` (default `120000`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/versionSnapshotThrottle.test.ts
import { describe, it, expect } from "vitest";
import { shouldSnapshot } from "./versionSnapshotThrottle";

describe("shouldSnapshot", () => {
  it("snapshots when there is no prior snapshot", () => {
    expect(shouldSnapshot(undefined, 1_000)).toBe(true);
  });
  it("does not snapshot within the threshold window", () => {
    expect(shouldSnapshot(1_000, 1_000 + 60_000)).toBe(false);
  });
  it("snapshots once the threshold has elapsed", () => {
    expect(shouldSnapshot(1_000, 1_000 + 120_000)).toBe(true);
  });
  it("honors a custom threshold", () => {
    expect(shouldSnapshot(1_000, 1_000 + 5_000, 5_000)).toBe(true);
    expect(shouldSnapshot(1_000, 1_000 + 4_999, 5_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/versionSnapshotThrottle.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

```ts
// src/lib/versionSnapshotThrottle.ts
/** Whether to write a new version snapshot, given the last snapshot time (ms epoch). */
export function shouldSnapshot(lastMs: number | undefined, nowMs: number, thresholdMs = 120_000): boolean {
  if (lastMs === undefined) return true;
  return nowMs - lastMs >= thresholdMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/versionSnapshotThrottle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/versionSnapshotThrottle.ts src/lib/versionSnapshotThrottle.test.ts
git commit -m "feat(scripts): shouldSnapshot throttle helper for version history"
```

---

## Task 2: Full-fidelity snapshot + throttle + prune, wired into `saveScriptBlocks`

**Files:**
- Modify: `src/hooks/useScripts.ts` (`saveVersionSnapshot` ~98-131; add module map + prune; call inside `saveScriptBlocks`)

**Interfaces:**
- Consumes: `shouldSnapshot` from `@/lib/versionSnapshotThrottle`.
- Produces: `saveVersionSnapshot` now (a) captures `block_kind` + `rich_text`, (b) self-throttles via a module-level `Map<scriptId, lastMs>`, (c) prunes to the last 50 versions. `saveScriptBlocks` calls `await saveVersionSnapshot(scriptId)` before its upsert/delete.

- [ ] **Step 1: Add the import + throttle map**

In `src/hooks/useScripts.ts`, add near the top imports:
```ts
import { shouldSnapshot } from "@/lib/versionSnapshotThrottle";
```
And near the other module-level state (e.g. after `const _locks = new Map...`):
```ts
// Last version-snapshot time per script (ms epoch) — throttles autosave snapshots.
const _lastSnapshotMs = new Map<string, number>();
```

- [ ] **Step 2: Rewrite `saveVersionSnapshot` (fidelity + throttle + prune)**

Replace the existing `saveVersionSnapshot` body with:

```ts
// Save a snapshot of the current persisted script lines into script_versions (history).
// Throttled to <=1 / 2min / script; prunes to the most recent 50 versions.
const saveVersionSnapshot = async (scriptId: string) => {
  try {
    const now = Date.now();
    if (!shouldSnapshot(_lastSnapshotMs.get(scriptId), now)) return;

    const { data: currentLines } = await supabase
      .from("script_lines")
      .select("line_number, line_type, section, text, rich_text, block_kind")
      .eq("script_id", scriptId)
      .order("line_number");
    if (!currentLines || currentLines.length === 0) return;

    // Mark snapshotted BEFORE the insert so concurrent autosaves don't double-write.
    _lastSnapshotMs.set(scriptId, now);

    const rawContent = currentLines.map((l) => l.text).join("\n");
    const { data: lastVersion } = await supabase
      .from("script_versions")
      .select("version_number")
      .eq("script_id", scriptId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (lastVersion?.version_number ?? 0) + 1;

    await supabase.from("script_versions").insert({
      script_id: scriptId,
      version_number: nextVersion,
      raw_content: rawContent,
      lines_snapshot: currentLines,
    });

    // Prune: keep only the most recent 50 versions.
    if (nextVersion > 50) {
      await supabase
        .from("script_versions")
        .delete()
        .eq("script_id", scriptId)
        .lte("version_number", nextVersion - 50);
    }
  } catch (e) {
    console.error("saveVersionSnapshot error:", e);
  }
};
```

- [ ] **Step 3: Call it inside `saveScriptBlocks` before writing**

In `saveScriptBlocks`, after the empty-document guard and after `const withIds = ...`, but BEFORE the `computeBlockDiff`/upsert, add:
```ts
    // Safety net: snapshot the pre-save state (throttled) so any overwrite is recoverable.
    await saveVersionSnapshot(scriptId);
```

- [ ] **Step 4: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): snapshot pre-save state into version history (throttled, pruned, full fidelity)"
```

---

## Task 3: Restore preserves block_kind/rich_text, reloads the editor, bumps revision

**Files:**
- Modify: `src/pages/Scripts.tsx` (`restoreVersion`, currently ~1135-1180)

**Interfaces:**
- Consumes: existing `getScriptBlocks`, `getScriptLines`, `withUids`, `buildBaseline`, and the Phase-1/3 refs (`baselineRef`, `savedOrderRef`, `removedIdsRef`, `revisionRef`, `skipNextAutoSaveRef`), supabase.
- Produces: `restoreVersion` rebuilds `script_lines` from the snapshot including `block_kind` (default `"line"`) and `rich_text`, reloads the open block document, resets the diff-save refs to the restored baseline, and bumps `scripts.revision` so other sessions re-sync.

- [ ] **Step 1: Replace the snapshot-insert row mapping (preserve fidelity)**

In `restoreVersion`, replace this exact block:

```ts
        const rows = version.lines_snapshot.map((l: any, i: number) => ({
          script_id: viewingScriptId,
          line_number: i + 1,
          line_type: l.line_type,
          section: l.section || "body",
          text: l.text,
        }));
        await supabase.from("script_lines").insert(rows);
```

with:

```ts
        const rows = version.lines_snapshot.map((l: any, i: number) => ({
          script_id: viewingScriptId,
          line_number: i + 1,
          line_type: l.line_type,
          section: l.section || "body",
          text: l.text,
          block_kind: l.block_kind ?? "line",
          ...(l.rich_text != null ? { rich_text: l.rich_text } : {}),
        }));
        await supabase.from("script_lines").insert(rows);
```

- [ ] **Step 2: Reload the editor block document + reset refs + bump revision**

Replace this exact block:

```ts
      // Reload from DB
      const result = await getScriptLines(viewingScriptId);
      if (result) {
        setParsedLines(result);
      }

      toast.success(tr({ en: "Script restored successfully", es: "Script restaurado correctamente" }, language));
      setShowHistory(false);
```

with:

```ts
      // Reload legacy line reads.
      const result = await getScriptLines(viewingScriptId);
      if (result) setParsedLines(result);

      // Reload the unified block document so the editor shows the restored content,
      // and reset the diff-save baseline to it (so the next save diffs against restored state).
      const restored = await getScriptBlocks(viewingScriptId);
      skipNextAutoSaveRef.current = true;
      setDocBlocks(withUids(restored));
      baselineRef.current = buildBaseline(restored.filter((b) => b.id) as any);
      savedOrderRef.current = restored.filter((b) => b.id).map((b) => b.id as string);
      removedIdsRef.current = new Set();

      // Bump revision so other open sessions re-sync to the restored content.
      const { data: revRow } = await supabase.from("scripts").select("revision").eq("id", viewingScriptId).maybeSingle();
      const nextRev = ((revRow?.revision as number) ?? 0) + 1;
      await supabase.from("scripts").update({ revision: nextRev }).eq("id", viewingScriptId);
      revisionRef.current = nextRev;

      toast.success(tr({ en: "Script restored successfully", es: "Script restaurado correctamente" }, language));
      setShowHistory(false);
```

- [ ] **Step 3: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "fix(scripts): restore version with full block fidelity, editor reload + revision bump"
```

---

## Task 4: Manual verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` — tsc 0; tests pass (minus pre-existing reorder file).
- [ ] **Step 2:** In-app: edit a script, wait, edit again over a few minutes → open History → see multiple versions with headings intact. Restore an older one → the script (including section headings + any bold/rich text) returns; a second open session re-syncs to the restored content.
- [ ] **Step 3:** DB spot-check: `select count(*) from script_versions where script_id='<TEST>'` grows but stays ≤ 50; `select lines_snapshot->0 from script_versions ... limit 1` shows `block_kind`/`rich_text` keys.

## Self-Review Notes

- Recoverability: snapshots now fire on the real (diff-save) path, throttled (≤1/2min) + pruned (≤50), with full fidelity → any overwrite is restorable. Closes the "script_versions was empty" gap from the incident.
- Restore preserves headings + rich text and bumps revision so peers converge.
- Out of scope: per-keystroke streaming (#3) and CRDT (#4) — later epics.
- No schema change (lines_snapshot is jsonb). No branding changes.
