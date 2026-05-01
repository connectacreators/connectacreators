# Winning Idea — Visual Promotion

**Date:** 2026-04-21 (amended 2026-04-22)
**Status:** Approved, ready for implementation
**Scope:** v1 — promote the existing `idea_ganadora` field across 4 key surfaces. No schema changes. No scoring. No score badge yet.

## 2026-04-22 amendments

Roberto reviewed the shipped v1 and noticed that a static `WINNING IDEA` label on every card is redundant — the teal glow already signals the idea's importance, and the label carries no per-card information. Three refinements:

1. **Label text:** replace the fixed `WINNING IDEA` label with the script's uppercased `formato` (e.g. `TALKING HEAD`, `SPLIT SCREEN`, `VOICEOVER`). Keeps the same small-caps teal styling. Fallback to `SCRIPT` when `formato` is missing or when there's no curated idea (was previously the only fallback case).
2. **Duplicate chip removal:** the `Format: …` chip in the editor-surface metadata row is redundant once the label carries it — drop it from the editor variant. The public share page keeps the chip (different audience, label-as-format change there is decorative rather than navigational).
3. **Target chip truncation:** long target strings blow out the chip row on first render. Truncate display to ~40 characters with an ellipsis; clicking the chip expands it inline (grows the pill, wraps the text, pushes siblings down); clicking again collapses. Full text stays in the DOM for screen readers and copy-paste.

Ranking / score badge remains deferred (see "Out of scope" below).

---

## Why

Today the winning idea (stored as `scripts.idea_ganadora`) is treated as a secondary subtitle next to the script's auto-generated `title`. Roberto's thesis: the winning idea is the single most important part of a script, and the UI should reflect that hierarchy. External-viral-evidence-based validation (scoring, reference linking, audience universality, vault) is planned as a follow-up — this spec is purely the *visual promotion*.

## Out of scope (explicitly deferred)

- Idea score badge / number (the "● 82" pill shown in mocks is a placeholder and not shipped in this spec)
- AI scoring of ideas
- Viral reference carousel / links
- Audience universality meter
- Idea vault per client
- Winning Idea canvas node

## What changes

Four surfaces. Same visual pattern in each — a "soft-glow card" built from:

- Container: `border: 1px solid rgba(34,211,238,0.35)`, `border-radius: 16px`, `padding: 20px 22px`
- Background: `radial-gradient(ellipse at top left, rgba(34,211,238,0.12), rgba(34,211,238,0.02) 60%)`
- Inset shadow: `box-shadow: 0 0 40px rgba(34,211,238,0.05) inset`
- Label row: small-caps "WINNING IDEA", tracking 1.5px, 10px, color `rgba(34,211,238,0.7)`, weight 700
- Idea text: 17–22px (surface-dependent), weight 700, line-height 1.3, white
- Metadata chips below: small pills, `rgba(255,255,255,0.05)` background, label-value format

**No icon.** Label is text-only.

### Surface 1: Scripts list card — `src/pages/Scripts.tsx`

Each card's primary text becomes the winning idea; the auto-title + date drop to a muted subline.

- If `idea_ganadora` is empty → fall back to `title` (graceful)
- Card gets a subtle teal left-accent via a 1px border-left tinted with the glow color
- Existing action menu (three-dot, edit, delete) unchanged

### Surface 2: Public script page — `src/pages/PublicScript.tsx`

The existing "SCRIPT · READ-ONLY" tab stays. Below it, replace the plain title + metadata block with the soft-glow card:

- Label row: "WINNING IDEA"
- Big idea headline (~22px)
- Chips: Target, Format, Inspiration URL (if present)
- `script.title` becomes a tiny caption below the idea ("<title> · <created date>")

### Surface 3: Script Doc Editor metadata — `src/components/ScriptDocEditor.tsx` / the viewing-metadata block inside `Scripts.tsx`

The current metadata block renders three inline label:value rows (Idea Ganadora / Target / Formato). Replace with the soft-glow card:

- Top: the idea headline (17–19px)
- Bottom: chips for Target / Format
- Inline-edit behavior on the idea stays — clicking the idea text opens the existing inline rename flow (already wired to update both `title` and `idea_ganadora`)

### Surface 4: Script node on the canvas — `src/components/canvas/ScriptNode.tsx` (or wherever Script nodes render)

Keep compact (canvas real estate is tight):

- Label row with "SCRIPT" (no score, no icon)
- Body text: idea first, auto-title as 9px muted caption beneath
- Teal left border accent, no background gradient (nodes are already dense)

## Fallback behavior

For scripts where `idea_ganadora` is empty or null (legacy data):

- Render the `title` in the idea slot
- Do NOT show the "WINNING IDEA" label (since there isn't a curated idea yet); instead show the regular "SCRIPT" label
- The soft-glow treatment still applies so the visual consistency holds

## Accessibility

- Label is a `<span>` with `text-transform: uppercase` + `letter-spacing` — keep raw text "Winning Idea" in the DOM (not stylistic all-caps), so screen readers read it correctly.
- Idea text uses `<h2>` or `<h3>` semantics in the Public share and Script Doc Editor (was already h1/h2 before, just swapping what fills the element).

## Files touched

| File | Change |
|---|---|
| `src/pages/Scripts.tsx` | Script list card renders idea as primary, title as subline |
| `src/pages/PublicScript.tsx` | New soft-glow header block; idea-first layout |
| `src/components/ScriptDocEditor.tsx` | Metadata block replaced with soft-glow card |
| `src/components/canvas/ScriptNode.tsx` | Node renders idea as the main line |
| `src/components/scripts/WinningIdeaBlock.tsx` (NEW) | Shared component — renders the soft-glow card; used by surfaces 2–4; accepts `idea`, `target`, `format`, `variant` (`detail` / `node` / `editor`) props |

## Component API

```tsx
<WinningIdeaBlock
  idea={script.idea_ganadora || script.title}
  target={script.target}
  format={script.formato}
  inspirationUrl={script.inspiration_url}
  variant="detail" // "detail" | "editor" | "node"
  hasIdea={!!script.idea_ganadora}  // controls whether to show "WINNING IDEA" vs "SCRIPT" label
/>
```

Three `variant` sizes for the three surfaces that use this component (list cards stay bespoke since the card shell differs).

## Deployment

1. Build
2. `scp` to VPS
3. Cloudflare purge

No DB migration. No edge function changes. No plan checkpoint needed.

## Future (separate specs)

- Scoring + badge (add-on A)
- Viral reference proof carousel (add-on B)
- Audience universality meter (add-on C)
- Idea vault per client (add-on D)
- Winning Idea canvas node
- Idea isolation tool when pasting viral references
