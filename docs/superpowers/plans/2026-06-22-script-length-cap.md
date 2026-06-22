# Script Length Cap (Phase 6 — CRDT prerequisite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cap the script body at 15,000 characters so a paste-bomb / runaway doc can't corrupt the editor or (future) CRDT sync — enforced live in the UI, in the client save path, and server-side in the atomic save RPC.

**Architecture:** A shared constant `SCRIPT_BODY_CHAR_LIMIT = 15000` + pure `scriptBodyLength(blocks)` (sum of content-line text, headings excluded). A live counter in the editor. `saveScriptBlocks` silently skips writing when over cap; the Save button shows a toast. The atomic RPC `save_script_blocks_atomic` raises (rolls back) if the persisted body exceeds the cap.

**Context:** Largest existing script body = 2,099 chars (avg 433, p95 1,506) across 98 scripts — nothing is near 15,000, so the cap locks no one out. Builds on Phases 1-5.

## Global Constraints

- Editor lives on `origin/main`; work in a worktree off main.
- App-surface code uses `hsl(var(--...))` tokens, never raw palette hex.
- CI runs `vite build` only; verify `npx tsc --noEmit` exits 0; judge correctness by reading code.
- Supabase project id: `hxojqrilwhhrvloiwmfo`. The atomic RPC `save_script_blocks_atomic(uuid, integer, jsonb, uuid[])` exists in prod (Phase 5).
- The server-side cap (Task 2) is applied to prod via MCP and tested BEFORE the client code that depends on it ships.

---

## Task 1: `scriptBodyLength` helper + `SCRIPT_BODY_CHAR_LIMIT` + tests

**Files:**
- Create: `src/lib/scriptLength.ts`
- Test: `src/lib/scriptLength.test.ts`

**Interfaces:**
- Produces: `SCRIPT_BODY_CHAR_LIMIT = 15000`; `scriptBodyLength(blocks: ScriptLine[]): number` — sum of `b.text` lengths for blocks where `block_kind !== "heading"` (treat missing block_kind as a content line). Null/undefined text counts as 0.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scriptLength.test.ts
import { describe, it, expect } from "vitest";
import { scriptBodyLength, SCRIPT_BODY_CHAR_LIMIT } from "./scriptLength";
import type { ScriptLine } from "@/hooks/useScripts";

const line = (text: string, over: Partial<ScriptLine> = {}): ScriptLine => ({
  line_number: 1, line_type: "actor", section: "body", text, block_kind: "line", ...over,
});

describe("scriptBodyLength", () => {
  it("sums content-line text lengths", () => {
    expect(scriptBodyLength([line("hello"), line("world!")])).toBe(11);
  });
  it("excludes heading rows", () => {
    expect(scriptBodyLength([line("Hook", { block_kind: "heading" }), line("abc")])).toBe(3);
  });
  it("treats missing block_kind as content", () => {
    expect(scriptBodyLength([{ line_number: 1, line_type: "actor", section: "body", text: "abcd" } as ScriptLine])).toBe(4);
  });
  it("handles empty/missing text as 0", () => {
    expect(scriptBodyLength([line(""), { ...line("x"), text: undefined as any }])).toBe(0);
  });
  it("exposes a 15000 limit", () => {
    expect(SCRIPT_BODY_CHAR_LIMIT).toBe(15000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scriptLength.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

```ts
// src/lib/scriptLength.ts
import type { ScriptLine } from "@/hooks/useScripts";

/** Max characters allowed in a script body (content lines, headings excluded). */
export const SCRIPT_BODY_CHAR_LIMIT = 15000;

/** Total characters across content-line text (heading rows don't count). */
export function scriptBodyLength(blocks: ScriptLine[]): number {
  let total = 0;
  for (const b of blocks) {
    if ((b.block_kind ?? "line") === "heading") continue;
    total += (b.text ?? "").length;
  }
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scriptLength.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scriptLength.ts src/lib/scriptLength.test.ts
git commit -m "feat(scripts): scriptBodyLength helper + SCRIPT_BODY_CHAR_LIMIT"
```

---

## Task 2: Server-side cap in the atomic RPC (done by orchestrator via MCP)

**Files:**
- Create: `supabase/migrations/20260622_script_length_cap.sql` (record only; applied to prod via MCP)

**Interfaces:**
- Produces: `save_script_blocks_atomic` raises `script body exceeds character limit` (rolling back the whole save) when the persisted content-line text for the script exceeds 15000 chars.

> NOTE: The orchestrator applies + tests this migration via MCP before the client guard ships. The implementer's job for this task is ONLY to write the migration file for repo history (matching what was applied).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260622_script_length_cap.sql` with the full `create or replace function ...` body identical to `supabase/migrations/20260621_script_atomic_save.sql`, plus — inserted immediately AFTER the `update public.scripts set revision = v_current + 1 where id = p_script_id;` line and BEFORE the `return query` — this block:

```sql
  if (select coalesce(sum(length(text)), 0)
        from public.script_lines
       where script_id = p_script_id and block_kind is distinct from 'heading') > 15000 then
    raise exception 'script body exceeds character limit';
  end if;
```

(Copy the rest of the function verbatim from the 20260621 migration so the file is a complete, runnable `create or replace`.)

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260622_script_length_cap.sql
git commit -m "feat(scripts): server-side 15000-char body cap in atomic save RPC"
```

---

## Task 3: `saveScriptBlocks` skips writing when over cap

**Files:**
- Modify: `src/hooks/useScripts.ts` (`saveScriptBlocks`)

**Interfaces:**
- Consumes: `scriptBodyLength`, `SCRIPT_BODY_CHAR_LIMIT` from `@/lib/scriptLength`.
- Produces: `saveScriptBlocks` returns `{ blocks: <current>, revision: <current>, conflicted: false, wrote: false }` WITHOUT writing when `scriptBodyLength(normalized) > SCRIPT_BODY_CHAR_LIMIT` (silent — the UI counter is the feedback; avoids autosave toast spam).

- [ ] **Step 1: Add the import**

In `src/hooks/useScripts.ts`:
```ts
import { scriptBodyLength, SCRIPT_BODY_CHAR_LIMIT } from "@/lib/scriptLength";
```

- [ ] **Step 2: Add the guard**

In `saveScriptBlocks`, right after the `const normalized = normalizeBlocks(blocks);` line and the empty-doc guard (i.e., after the `if (!hasContentLine) {...}` block), add:

```ts
    // Length cap: never persist/sync a body over the limit (paste-bomb / runaway guard).
    // Silent here — the editor's live counter is the user-facing feedback; the Save button
    // surfaces a toast on explicit save.
    if (scriptBodyLength(normalized) > SCRIPT_BODY_CHAR_LIMIT) {
      return { blocks: await getScriptBlocks(scriptId), revision: await getScriptRevision(scriptId), conflicted: false, wrote: false };
    }
```

- [ ] **Step 3: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run` (all pass except the pre-existing `scriptBlocks.reorder.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useScripts.ts
git commit -m "feat(scripts): saveScriptBlocks skips writing when body over cap"
```

---

## Task 4: Live counter + Save-button toast in Scripts.tsx

**Files:**
- Modify: `src/pages/Scripts.tsx`

**Interfaces:**
- Consumes: `scriptBodyLength`, `SCRIPT_BODY_CHAR_LIMIT`, existing `docBlocks`, `language`, `tr`.

- [ ] **Step 1: Add the import**

In `src/pages/Scripts.tsx`:
```ts
import { scriptBodyLength, SCRIPT_BODY_CHAR_LIMIT } from "@/lib/scriptLength";
```

- [ ] **Step 2: Add the live counter above the editor**

Find the `ScriptDocEditor` mount (`<ScriptDocEditor` with `embedded`, ~line 3648) and its preceding comment block. Immediately BEFORE that comment/`<ScriptDocEditor`, insert a counter row:

```tsx
            {(() => {
              const bodyLen = scriptBodyLength(docBlocks);
              const over = bodyLen > SCRIPT_BODY_CHAR_LIMIT;
              const near = !over && bodyLen > SCRIPT_BODY_CHAR_LIMIT * 0.9;
              return (
                <div className="flex justify-end mb-1">
                  <span
                    className="text-[11px] tabular-nums"
                    style={{ color: over ? "hsl(var(--destructive))" : near ? "hsl(var(--honey))" : "hsl(var(--bone) / 0.45)" }}
                  >
                    {bodyLen.toLocaleString()} / {SCRIPT_BODY_CHAR_LIMIT.toLocaleString()}
                    {over ? ` · ${tr({ en: "over limit — trim to save", es: "excede el límite — recorta para guardar" }, language)}` : ""}
                  </span>
                </div>
              );
            })()}
```

(If `hsl(var(--destructive))` / `hsl(var(--honey))` are not defined tokens in this codebase, use `hsl(var(--aqua))` for `near` and a defined red token; verify the token names exist in `src/index.css`/landing.css before relying on them — substitute an existing token if needed.)

- [ ] **Step 3: Add the Save-button over-cap toast**

In the Save button `onClick` handler, right after `if (!sid || savingScript) return;`, add:

```ts
                    if (scriptBodyLength(docBlocks) > SCRIPT_BODY_CHAR_LIMIT) {
                      toast.error(tr({ en: "Script is too long. Trim it to 15,000 characters to save.", es: "El script es demasiado largo. Recórtalo a 15,000 caracteres para guardar." }, language));
                      return;
                    }
```

- [ ] **Step 4: Verify compile + tests**

Run: `npx tsc --noEmit` (exit 0) and `npx vitest run`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): live length counter + over-cap save toast"
```

---

## Task 5: Manual verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` — tsc 0; tests pass (minus the pre-existing reorder file).
- [ ] **Step 2:** In-app: type/paste a body over 15,000 chars → counter turns red, autosave silently doesn't persist, Save button shows the toast; trim under → saves normally. A normal short script shows a muted counter and saves as usual.
- [ ] **Step 3:** Server backstop: confirm (via a direct RPC call on a test script) that an over-cap upsert raises and rolls back, leaving the script unchanged.

## Self-Review Notes

- Three enforcement layers: live counter (visibility), client save guard (no autosave spam), server RPC (authoritative; protects the future CRDT projection).
- Cap excludes heading rows; counts content-line text only.
- Safe: no existing script is near 15,000, so nothing is locked.
- Out of scope: caption cap (separate field, lower risk), per-keystroke paste interception (the save guard + counter cover the corruption goal).
