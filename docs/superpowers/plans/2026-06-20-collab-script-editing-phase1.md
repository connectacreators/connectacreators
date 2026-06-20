# Collaborative Script Editing — Phase 1 (Non-destructive Save) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make concurrent edits to the same script impossible to silently overwrite, by replacing the editor's delete-all-then-reinsert save with a diff-based save that writes only the blocks this session actually changed and deletes only blocks the user explicitly removed.

**Architecture:** Each editor block carries the stable `script_lines.id` (uuid). A pure `computeBlockDiff` compares the current document against a per-session baseline and emits only changed-block upserts + explicit deletes. The data-layer `saveScriptBlocks` becomes diff-based and conditionally bumps a new `scripts.revision` counter as a convergence backstop. `Scripts.tsx` tracks the baseline, explicit removals, and the loaded revision.

**Tech Stack:** React + TypeScript, Supabase JS client, Vitest. Spec: `docs/superpowers/specs/2026-06-20-collaborative-script-editing-design.md`.

## Global Constraints

- Editor lives on `origin/main`; this work is in a worktree off main. Do not target `feat/video-editor-phase-1`.
- Branding: app-surface code uses `hsl(var(--...))` tokens, never palette hex (pre-commit hook blocks hex).
- CI runs `vite build` only (no typecheck). Verify `npx tsc --noEmit` exits 0 before any deploy.
- DB migrations applied via Supabase MCP `apply_migration`; verify in prod before shipping code that reads new columns. Never bulk `db push`.
- `script_lines.line_type` CHECK allows only `filming | actor | editor | text_on_screen` (headings store one of these too).
- Supabase project id: `hxojqrilwhhrvloiwmfo`.

---

## Task 1: DB migration — drop line_number unique constraint, add scripts.revision

**Files:**
- DB only (applied via MCP `apply_migration`, migration name `collab_script_editing_phase1`).

**Interfaces:**
- Produces: `scripts.revision integer not null default 0`; removes UNIQUE `(script_id, line_number)` so diff-upserts that reorder rows do not collide. Identity is the `id` PK; `line_number` becomes an ordering hint.

- [ ] **Step 1: Apply the migration**

Apply via MCP `apply_migration` (project `hxojqrilwhhrvloiwmfo`, name `collab_script_editing_phase1`):

```sql
alter table public.script_lines
  drop constraint if exists script_lines_script_id_line_number_unique;

alter table public.scripts
  add column if not exists revision integer not null default 0;
```

- [ ] **Step 2: Verify in prod**

Run via MCP `execute_sql`:

```sql
select
  (select count(*) from pg_constraint
     where conrelid='public.script_lines'::regclass
       and conname='script_lines_script_id_line_number_unique') as unique_constraint_remaining,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='scripts' and column_name='revision') as revision_col;
```

Expected: `unique_constraint_remaining = 0`, `revision_col = 1`.

- [ ] **Step 3: Commit a tracking migration file (record only)**

Create `supabase/migrations/20260620_collab_script_editing_phase1.sql` containing the same SQL as Step 1 (for repo history; prod already applied via MCP).

```bash
git add supabase/migrations/20260620_collab_script_editing_phase1.sql
git commit -m "feat(scripts): drop line_number unique constraint + add scripts.revision"
```

---

## Task 2: `computeBlockDiff` pure function + tests

**Files:**
- Create: `src/lib/scriptBlockDiff.ts`
- Test: `src/lib/scriptBlockDiff.test.ts`

**Interfaces:**
- Consumes: `ScriptLine` from `@/hooks/useScripts`.
- Produces:
  - `blockSignature(b): string`
  - `buildBaseline(blocks: (ScriptLine & { id: string })[]): Map<string, string>`
  - `computeBlockDiff(nextBlocks: (ScriptLine & { id: string })[], baseline: Map<string,string>, removedIds: string[]): { upserts: BlockRow[]; deleteIds: string[] }`
  - `BlockRow = { id: string; line_number: number; line_type: string; section: string; text: string; rich_text: string | null; block_kind: "line" | "heading" }`
  - Contract: a block whose signature matches `baseline` is **omitted** from `upserts` (so an unchanged block is never re-written, preventing clobber of another session's edit to it). `deleteIds` is the de-duplicated `removedIds` minus any id still present in `nextBlocks`. Callers must pass **already-normalized** blocks (line_number = index+1).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scriptBlockDiff.test.ts
import { describe, it, expect } from "vitest";
import { computeBlockDiff, buildBaseline, blockSignature } from "./scriptBlockDiff";
import type { ScriptLine } from "@/hooks/useScripts";

const blk = (id: string, n: number, text: string, over: Partial<ScriptLine> = {}): ScriptLine & { id: string } => ({
  id, line_number: n, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("computeBlockDiff", () => {
  it("treats a block with no baseline entry as a new upsert", () => {
    const next = [blk("a", 1, "hello")];
    const { upserts, deleteIds } = computeBlockDiff(next, new Map(), []);
    expect(upserts.map((u) => u.id)).toEqual(["a"]);
    expect(deleteIds).toEqual([]);
  });

  it("omits an unchanged block from upserts (prevents clobber)", () => {
    const next = [blk("a", 1, "hello")];
    const baseline = buildBaseline(next);
    const { upserts } = computeBlockDiff(next, baseline, []);
    expect(upserts).toEqual([]);
  });

  it("upserts only the block whose content changed", () => {
    const loaded = [blk("a", 1, "hello"), blk("b", 2, "world")];
    const baseline = buildBaseline(loaded);
    const next = [blk("a", 1, "hello"), blk("b", 2, "WORLD!")];
    const { upserts } = computeBlockDiff(next, baseline, []);
    expect(upserts.map((u) => u.id)).toEqual(["b"]);
  });

  it("deletes only explicitly removed ids that are gone", () => {
    const next = [blk("a", 1, "hello")];
    const baseline = buildBaseline([blk("a", 1, "hello"), blk("b", 2, "world")]);
    const { deleteIds } = computeBlockDiff(next, baseline, ["b", "b"]);
    expect(deleteIds).toEqual(["b"]);
  });

  it("never deletes an id that is still present (re-added)", () => {
    const next = [blk("a", 1, "hello"), blk("b", 2, "back")];
    const { deleteIds } = computeBlockDiff(next, new Map(), ["b"]);
    expect(deleteIds).toEqual([]);
  });

  it("normalizes rich_text undefined and missing block_kind in the signature", () => {
    expect(blockSignature(blk("a", 1, "x"))).toEqual(
      blockSignature({ id: "a", line_number: 1, line_type: "actor", section: "body", text: "x", rich_text: null } as any),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scriptBlockDiff.test.ts`
Expected: FAIL — cannot resolve `./scriptBlockDiff`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scriptBlockDiff.ts
import type { ScriptLine } from "@/hooks/useScripts";

export interface BlockRow {
  id: string;
  line_number: number;
  line_type: string;
  section: string;
  text: string;
  rich_text: string | null;
  block_kind: "line" | "heading";
}

export interface BlockDiff {
  upserts: BlockRow[];
  deleteIds: string[];
}

/** Stable content signature: any field that must persist if changed. */
export function blockSignature(b: {
  line_number: number; line_type: string; section: string; text: string;
  rich_text?: string | null; block_kind?: string;
}): string {
  return JSON.stringify([
    b.line_number, b.line_type, b.section, b.text,
    b.rich_text ?? null, b.block_kind ?? "line",
  ]);
}

export function buildBaseline(blocks: (ScriptLine & { id: string })[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of blocks) m.set(b.id, blockSignature(b));
  return m;
}

export function computeBlockDiff(
  nextBlocks: (ScriptLine & { id: string })[],
  baseline: Map<string, string>,
  removedIds: string[],
): BlockDiff {
  const nextIds = new Set(nextBlocks.map((b) => b.id));
  const upserts: BlockRow[] = [];
  for (const b of nextBlocks) {
    if (baseline.get(b.id) !== blockSignature(b)) {
      upserts.push({
        id: b.id,
        line_number: b.line_number,
        line_type: b.line_type,
        section: b.section,
        text: b.text,
        rich_text: b.rich_text ?? null,
        block_kind: (b.block_kind ?? "line") as "line" | "heading",
      });
    }
  }
  const deleteIds = Array.from(new Set(removedIds)).filter((id) => !nextIds.has(id));
  return { upserts, deleteIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scriptBlockDiff.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scriptBlockDiff.ts src/lib/scriptBlockDiff.test.ts
git commit -m "feat(scripts): add pure computeBlockDiff for non-destructive saves"
```

---

## Task 3: Add stable `id` to the block model + return it from `getScriptBlocks`

**Files:**
- Modify: `src/hooks/useScripts.ts` (ScriptLine type ~6-18; `getScriptBlocks` ~468-486)

**Interfaces:**
- Produces: `ScriptLine.id?: string` (the persisted `script_lines.id`); `getScriptBlocks` returns each block with `id` populated.

- [ ] **Step 1: Add `id` to the ScriptLine type**

In `src/hooks/useScripts.ts`, the `ScriptLine` type, add after `uid?: string;`:

```ts
  // Stable DB identity (script_lines.id, a uuid). Present for persisted blocks;
  // assigned client-side (crypto.randomUUID()) for blocks created in the editor.
  id?: string;
```

- [ ] **Step 2: Select and return `id` in `getScriptBlocks`**

Change the select to include `id`:

```ts
      .select("id, line_number, line_type, section, text, rich_text, block_kind")
```

And add `id` to the mapped object:

```ts
    return (data || []).map((d: any) => ({
      id: d.id,
      line_number: d.line_number,
      line_type: d.line_type,
      section: d.section || "body",
      text: d.text,
      rich_text: d.rich_text ?? undefined,
      block_kind: (d.block_kind as "line" | "heading") ?? "line",
    })) as ScriptLine[];
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0 (no new errors).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): carry stable script_lines.id on editor blocks"
```

---

## Task 4: Rewrite `saveScriptBlocks` to diff-based + add `getScriptRevision`

**Files:**
- Modify: `src/hooks/useScripts.ts` (`saveScriptBlocks` ~496-522; export list ~886-892; add helper near other helpers)
- Imports: add `computeBlockDiff` from `@/lib/scriptBlockDiff`

**Interfaces:**
- Consumes: `computeBlockDiff`, `normalizeBlocks`, supabase.
- Produces:
  - `getScriptRevision(scriptId: string): Promise<number>`
  - `saveScriptBlocks(scriptId: string, blocks: ScriptLine[], opts?: { baseline?: Map<string,string>; removedIds?: string[]; expectedRevision?: number | null }): Promise<{ blocks: ScriptLine[]; revision: number; conflicted: boolean }>`
  - Note the **return type changed** from `ScriptLine[]` to `{ blocks, revision, conflicted }`. Task 5 updates both call sites.

- [ ] **Step 1: Add the import**

At the top of `src/hooks/useScripts.ts`, add:

```ts
import { computeBlockDiff } from "@/lib/scriptBlockDiff";
```

- [ ] **Step 2: Add `getScriptRevision` helper**

Add near the other module helpers (e.g. after `replaceAllLines`):

```ts
const getScriptRevision = async (scriptId: string): Promise<number> => {
  const { data } = await supabase
    .from("scripts")
    .select("revision")
    .eq("id", scriptId)
    .maybeSingle();
  return (data?.revision as number) ?? 0;
};
```

- [ ] **Step 3: Replace the `saveScriptBlocks` body**

Replace the existing `saveScriptBlocks` (the `const saveScriptBlocks = async ...` block) with:

```ts
  // Non-destructive block save. Upserts ONLY blocks whose content differs from the
  // caller-supplied baseline, and deletes ONLY ids the user explicitly removed —
  // so a concurrent session editing other blocks is never clobbered. Conditionally
  // bumps scripts.revision as a convergence signal.
  const saveScriptBlocks = async (
    scriptId: string,
    blocks: ScriptLine[],
    opts: { baseline?: Map<string, string>; removedIds?: string[]; expectedRevision?: number | null } = {},
  ): Promise<{ blocks: ScriptLine[]; revision: number; conflicted: boolean }> => {
    const normalized = normalizeBlocks(blocks);
    // SAFETY: never let an empty document wipe a script.
    const hasContentLine = normalized.some((b) => (b.block_kind ?? "line") === "line");
    if (!hasContentLine) {
      return { blocks: await getScriptBlocks(scriptId), revision: await getScriptRevision(scriptId), conflicted: false };
    }
    // Ensure every block has a stable uuid id (new blocks created in the editor).
    const withIds = normalized.map((b) => ({ ...b, id: b.id ?? crypto.randomUUID() })) as (ScriptLine & { id: string })[];

    const { upserts, deleteIds } = computeBlockDiff(withIds, opts.baseline ?? new Map(), opts.removedIds ?? []);

    if (upserts.length > 0) {
      const rows = upserts.map((b) => ({
        id: b.id,
        script_id: scriptId,
        line_number: b.line_number,
        line_type: b.line_type,
        section: b.section,
        text: b.text,
        block_kind: b.block_kind,
        rich_text: b.rich_text,
      }));
      const { error } = await supabase.from("script_lines").upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("saveScriptBlocks upsert error:", error);
        toast.error("Error saving script");
        throw new Error("Failed to save script blocks");
      }
    }
    if (deleteIds.length > 0) {
      await supabase.from("script_lines").delete().in("id", deleteIds);
    }

    // Revision backstop: conditional bump signals concurrent edits without blocking the save.
    let conflicted = false;
    let revision: number;
    const expected = opts.expectedRevision;
    if (expected != null) {
      const { data: bumped } = await supabase
        .from("scripts")
        .update({ revision: expected + 1 })
        .eq("id", scriptId)
        .eq("revision", expected)
        .select("revision")
        .maybeSingle();
      if (bumped) {
        revision = bumped.revision as number;
      } else {
        conflicted = true;
        revision = await getScriptRevision(scriptId);
      }
    } else {
      revision = await getScriptRevision(scriptId);
    }

    return { blocks: await getScriptBlocks(scriptId), revision, conflicted };
  };
```

- [ ] **Step 4: Export `getScriptRevision`**

In the hook's returned object (~line 886-892, where `getScriptBlocks, saveScriptBlocks` are exported), add `getScriptRevision,`.

- [ ] **Step 5: Verify types compile (call sites will error — expected)**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/pages/Scripts.tsx` at the two `saveScriptBlocks` call sites (return type changed). No errors in `useScripts.ts`. These call sites are fixed in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): diff-based non-destructive saveScriptBlocks + revision backstop"
```

---

## Task 5: Wire `Scripts.tsx` — baseline, explicit removals, revision, conflict toast

**Files:**
- Modify: `src/pages/Scripts.tsx`
  - block load effect (~1584-1597) and `handleViewScript` (~1535-1561)
  - autosave effect (~1603-1609)
  - Save button onClick (~3352-3361)
  - the editor's `onBlocksChange` (~3448)

**Interfaces:**
- Consumes: `saveScriptBlocks(...) => { blocks, revision, conflicted }`, `buildBaseline` from `@/lib/scriptBlockDiff`.
- Produces: in-component refs `baselineRef`, `removedIdsRef`, `revisionRef`; `handleBlocksChange` that assigns ids to new blocks and records removals.

- [ ] **Step 1: Add import + refs**

Add import near the other lib imports:

```ts
import { buildBaseline } from "@/lib/scriptBlockDiff";
```

Add refs next to `skipNextAutoSaveRef` (~1578):

```ts
  // Per-session save state for non-destructive diff saves.
  const baselineRef = useRef<Map<string, string>>(new Map());
  const removedIdsRef = useRef<Set<string>>(new Set());
  const revisionRef = useRef<number | null>(null);
```

- [ ] **Step 2: Seed baseline + revision on block load**

In the block-load effect (~1584), after `setDocBlocks(next);`, seed the per-session state from the freshly loaded, id-bearing blocks:

```ts
      skipNextAutoSaveRef.current = true;
      setDocBlocks(next);
      baselineRef.current = buildBaseline(next.filter((b) => b.id) as any);
      removedIdsRef.current = new Set();
```

In `handleViewScript` (~1560, near `setViewingScriptId(script.id);`), capture the loaded revision:

```ts
      revisionRef.current = (script as any).revision ?? 0;
```

(`fetchScriptsByClient` already selects `*`, so `script.revision` is present once Task 1 ran.)

- [ ] **Step 3: Add `handleBlocksChange` (id assignment + removal tracking)**

Add this callback (near other handlers, after the refs):

```ts
  // User edits flow through here (NOT load-driven setDocBlocks): assign uuids to
  // newly created blocks and record explicit removals for the diff save.
  const handleBlocksChange = useCallback((next: ScriptLine[]) => {
    setDocBlocks((prev) => {
      const withIds = next.map((b) => (b.id ? b : { ...b, id: crypto.randomUUID() }));
      const nextIds = new Set(withIds.map((b) => b.id));
      prev.forEach((b) => { if (b.id && !nextIds.has(b.id)) removedIdsRef.current.add(b.id); });
      return withIds;
    });
  }, []);
```

- [ ] **Step 4: Point the editor at `handleBlocksChange`**

At the unified editor (~3448), change `onBlocksChange={setDocBlocks}` to `onBlocksChange={handleBlocksChange}`.

- [ ] **Step 5: Update the autosave effect**

Replace the autosave timeout body (~1607) so it passes session state and updates baseline/revision after success (without disrupting typing — does NOT call setDocBlocks):

```ts
    const t = setTimeout(() => {
      saveScriptBlocks(sid, docBlocks, {
        baseline: baselineRef.current,
        removedIds: Array.from(removedIdsRef.current),
        expectedRevision: revisionRef.current,
      }).then((res) => {
        baselineRef.current = buildBaseline(res.blocks.filter((b) => b.id) as any);
        removedIdsRef.current = new Set();
        revisionRef.current = res.revision;
        if (res.conflicted) {
          toast.info(tr({ en: "Synced changes from another session", es: "Se sincronizaron cambios de otra sesión" }, language));
        }
      }).catch(() => {});
    }, 900);
```

(Add `language` to the effect's dependency array if lint requires it.)

- [ ] **Step 6: Update the Save button onClick**

In the Save button handler (~3356), replace:

```ts
                      const saved = await saveScriptBlocks(sid, docBlocks);
                      setDocBlocks(withUids(saved));
```

with:

```ts
                      const res = await saveScriptBlocks(sid, docBlocks, {
                        baseline: baselineRef.current,
                        removedIds: Array.from(removedIdsRef.current),
                        expectedRevision: revisionRef.current,
                      });
                      setDocBlocks(withUids(res.blocks));
                      baselineRef.current = buildBaseline(res.blocks.filter((b) => b.id) as any);
                      removedIdsRef.current = new Set();
                      revisionRef.current = res.revision;
```

- [ ] **Step 7: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors anywhere).

- [ ] **Step 8: Run the full unit suite**

Run: `npx vitest run`
Expected: all tests pass (including `scriptBlockDiff.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): wire diff-based save (baseline, removals, revision) into editor"
```

---

## Task 6: Manual two-session verification

**Files:** none (verification).

- [ ] **Step 1: Build check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 2: Two-tab manual test (against a non-critical test script)**

Open the same script in two browser tabs. Then:
1. In tab A edit line 1; in tab B edit a *different* line (line 3). Wait ~2s each. Reload both.
   Expected: **both** edits survive (no overwrite).
2. In tab A and tab B edit the **same** line; reload.
   Expected: last save wins (acceptable per spec), no crash, no lost *other* lines.
3. In tab A delete a line; reload both.
   Expected: the deleted line stays deleted; other lines intact.
4. Add a new line in tab A; reload.
   Expected: it persists once (no duplicate rows).

- [ ] **Step 3: DB spot-check (no duplicate/orphan rows)**

Via MCP `execute_sql` on the test script id:

```sql
select line_number, count(*) from script_lines
where script_id = '<TEST_SCRIPT_ID>' group by line_number having count(*) > 1;
```

Expected: 0 rows (no duplicate line_numbers from concurrent upserts).

---

## Self-Review Notes

- **Spec coverage:** Layer 1 (stable id) → Tasks 3 + 5 step 3. Layer 2 (diff save) → Tasks 2 + 4. Revision backstop → Tasks 1 + 4 + 5. Empty-doc safety preserved → Task 4 step 3. Phases 2 (presence) and 3 (live sync) are **out of scope for this plan** (separate plans).
- **Conservative-delete rule:** enforced in `computeBlockDiff` (deletes only `removedIds`) and fed by `handleBlocksChange` (records only user removals). A block missing locally but never removed is never deleted.
- **Different-block protection without live sync:** guaranteed by upserting only blocks that differ from baseline (Task 2 + Task 4), so an unchanged block is never rewritten with a stale copy.
- **Known Phase-1 limitation (documented, fixed in Phase 3):** if two sessions reorder/delete concurrently, a stale session's save may resurrect a remotely-deleted block or a reorder may carry a stale neighbor — never a silent content loss of edited text. Caption co-editing is Phase 3.
- **Type consistency:** `saveScriptBlocks` returns `{ blocks, revision, conflicted }` everywhere; both call sites updated in Task 5.
