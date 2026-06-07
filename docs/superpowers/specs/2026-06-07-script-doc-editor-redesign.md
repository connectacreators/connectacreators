# Script Doc Editor — Notion-style Redesign

**Date:** 2026-06-07
**Status:** Approved (design), implementing
**Surface:** `/clients/:id/scripts` → Doc Editor + Card View

## Goal

Turn the script editor into a free-form, Notion-like document editor with **no
restrictions and no bugs**, while keeping the `hook / body / cta` structure that
the rest of the product depends on. Section headers become editable, renamable,
addable, reorderable heading blocks; everything on the page is freely editable.

## Direction (decided)

- **A · Flexible & Compatible** — sections become editable heading blocks but keep
  an underlying *role* (`hook/body/cta`, or a custom slug) so AI generation,
  teleprompter, PDF export, public share, and canvas keep working.
- Section headings render **bold**, bound to **theme tokens** (`font-serif` +
  `text-foreground` / `hsl(var(--ink))`) — never hardcoded font or hex.
- v1 includes all Notion affordances: drag-to-reorder, slash menu, markdown shortcuts.

## Data model — "everything is a block," roles preserved

The script is one ordered list of `script_lines` rows. Two kinds:

| field | heading row | content row |
|-------|-------------|-------------|
| `block_kind` | `'heading'` | `'line'` |
| `section` | the role (`hook`/`body`/`cta`/custom slug) | role of nearest heading above |
| `text` / `rich_text` | the heading **label** | the line content |
| `line_type` | unused | `filming`/`actor`/`editor`/`text_on_screen` |

- **Migration (additive, low-risk):** `ALTER TABLE script_lines ADD COLUMN
  block_kind text NOT NULL DEFAULT 'line';` (existing rows backfill to `'line'`).
  Ensure `rich_text` column exists.
- **Backfill is lazy, not big-bang:** when the editor opens a script that has no
  heading rows, it synthesizes them in memory from the distinct `section` values
  (canonical order: hook, body, cta, then any custom). They persist on next save.
  No mass mutation of production data; fully reversible (delete heading rows).
- **Stable identity:** the editor assigns in-memory `uid`s to every block so React
  keys are stable (this is the root-cause fix for the duplicate-line bug, already
  shipped as a content-sync stopgap; the block rewrite makes it structural).

## Read/write paths (the key to zero breakage)

- **`getScriptLines` (legacy, unchanged signature):** now filters
  `block_kind = 'line'`, returns content rows only with correct `section`. Every
  existing consumer (AI, teleprompter, PDF, public, canvas) is untouched.
- **`getScriptBlocks` (new, editor only):** returns all rows ordered, headings
  included.
- **Save:** delete-all + reinsert (existing pattern) writing both kinds; each line's
  `section` recomputed from the nearest heading; custom roles fall back to `body`
  for legacy consumers; AI still targets hook/body/cta.

## Components

- **`ScriptDocEditor.tsx` (rewrite):** renders the block list. Click-to-type, Enter
  = new line, Backspace merge/delete, double-click heading to rename, ＋ Add section,
  delete section, empty sections always visible with "click to add a line", keep the
  colored line-type bar + picker. Stable uid keys. Theme-token headings.
- **Notion affordances:** drag-to-reorder (lines & sections), slash menu (`/` →
  insert line type or section), markdown shortcuts (`# ` → heading).
- **`Scripts.tsx` (Card View):** group content rows under their heading; save via the
  block path; **i18n fix** for hardcoded `"Nueva línea"` / `"Haz clic para agregar
  una línea…"` (route through `tr({en,es}, language)`).
- **`useScripts.ts`:** `ScriptLine` type gains `block_kind`, optional `uid`; add
  `getScriptBlocks`; update save.

## Bugs fixed

1. Doc Editor hiding empty Hook/CTA → every section is a real heading row, always rendered.
2. Hardcoded Spanish strings in Card View → i18n.
3. (Already shipped) duplicate-line on edit → structural via stable block keys.

## Phasing

- **Phase 1 — data model:** migration + `getScriptLines` filter + `getScriptBlocks`
  + lazy backfill + type changes. Verify: `tsc`. Legacy surfaces unaffected.
- **Phase 2 — editor core:** ScriptDocEditor rewrite over blocks; bold theme
  headings; empty sections; rename/add/delete sections; click-to-add; i18n + Card
  View wiring. Verify: `tsc` + `vite build`.
- **Phase 3 — Notion affordances:** slash menu, markdown shortcuts, drag reorder.
  Verify: `tsc` + `vite build`.

## Out of scope / risks

- Final "no bugs" requires in-app browser testing (TipTap can't be unit-tested in
  jsdom); we verify compilation here and test the live editor after deploy.
- No unrelated refactors; tokenization limited to the editor surface being rewritten.
