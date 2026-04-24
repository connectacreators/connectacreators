# Canvas AI — Question Deck Picker

**Date:** 2026-04-23
**Status:** Design — ready for implementation plan
**Scope:** When the Canvas AI (Boby) wants to ask clarifying questions, replace the plain numbered-list text reply with an inline slide-through picker card. User answers by tapping chips or typing custom text, then all answers submit together.

---

## Why

Today the Canvas AI asks multi-question clarifications as a single markdown reply with a numbered list ([CanvasAIPanel.tsx](src/components/canvas/CanvasAIPanel.tsx) renders assistant messages as free-text). Users have to retype every answer in the chat input, referencing each numbered question by hand. It works but:

- Slow — retyping suggested phrasing (e.g. "$160k at 19") the AI already put in the message.
- No guided structure — users skip questions or answer in the wrong order.
- Suggested directions the AI already surfaced (the phrases in the numbered list) become dead text instead of one-tap options.

The picker turns the AI's existing suggestions into one-tap chips and adds a free-form input when the user wants a path the AI didn't propose.

## Out of scope (explicitly deferred)

- Multi-select per question (keep single-select chips + free-form input; if user wants to combine, they type it).
- Text-parsing fallback for ad-hoc AI replies — the AI has to opt in by emitting structured JSON.
- Modal/overlay placement. Picker is always inline in the chat flow.
- Changing how non-question AI replies render (they stay as markdown).
- Applying this pattern outside CanvasAIPanel (AIScriptWizard, ScriptDocEditor, etc.).

## Flow

Three states, end-to-end:

1. **Deck opens.** AI preamble renders as a normal assistant message. Below it, a single picker card shows **Q1 / N** with suggested chips + a free-form input + `← / Next →` buttons + progress dots.
2. **User slides.** Each answer is kept in local state. `Next →` advances to Q2 (which replaces Q1 in the card — same card, just new content). Dots fill. User can go back with `←` and change prior answers before finishing.
3. **Done.** On the last card, `Next →` becomes `Done ✓`. Tapping it:
   - Composes the answers into a single user-side **summary bubble** (one row per question: `Q1  Lost dad at 4`, typed answers rendered italic), with an `Edit ▸` affordance.
   - Sends the composed text to the AI as a normal user message (so the AI's turn continues naturally; no new API surface needed on the AI side for submission).
   - The AI replies below — typing indicator shows while generating.

Tapping `Edit ▸` on the summary bubble re-opens the deck at Q1 with the previously chosen answers pre-filled. Changes re-submit the full summary.

## The JSON contract

The AI opts into deck mode by emitting a fenced block the client parses. The edge function prompt is updated to instruct the AI: *"When you need clarifying answers before proceeding, emit a deck as shown. Otherwise reply normally."*

```json
{
  "type": "questions_deck",
  "preamble": "Exactly. We have a lot of Jay's story but we need to pick the right thread. Here are my questions:",
  "questions": [
    {
      "id": "q1_opening",
      "label": "Opening hardship",
      "question": "Which hits hardest as the opener?",
      "body": "Jay lost his dad at 4, 5 years in special needs, lost multiple people.",
      "chips": ["Lost dad at 4", "5 years special needs", "Lost multiple people"]
    }
  ]
}
```

**Rendering rules:**

- The client detects `{"type":"questions_deck", ...}` at the start of the assistant's message content (optionally wrapped in ` ```json ` fences) and parses it.
- If parsing fails for any reason, the raw text falls back to normal markdown rendering — no user-visible error.
- `preamble` is optional; when present, renders as a normal assistant bubble above the picker card.
- `chips` can be empty (free-form-only question). `body` is optional context under the title.
- `id` is stable per question; used as the key in the summary bubble and to carry answers back.

**On submit, the client composes the user message as:**

```
Q1 — Opening hardship: Lost dad at 4
Q2 — Rock bottom before sales: Darker one — 36 days no sales, crying in his car
Q3 — Flip moment number: $160k at 19
Q4 — Emotional core: His late dad
Q5 — Length: 90s
```

Plus a hidden structured payload appended to message metadata (not to the visible content) so the AI can re-identify questions if needed in its reply (`message.meta.deck_answers = [{id, answer}]`).

## Components

| New | File | Responsibility |
|---|---|---|
| new | `src/components/canvas/QuestionDeckCard.tsx` | The slide-through picker UI. Props: `preamble`, `questions`, `onSubmit(answers)`, `initialAnswers?`. Owns local state (current index, per-question answer value, typed vs chip source). |
| new | `src/components/canvas/DeckSummaryBubble.tsx` | The collapsed user-side bubble. Props: `questions`, `answers`, `onEdit()`. |
| new | `src/lib/parseDeck.ts` | Pure function: `(raw: string) => { deck: DeckPayload } \| null`. Extracts the JSON (with or without fences), validates minimal shape, returns typed payload or null. |
| modified | `src/components/canvas/CanvasAIPanel.tsx` | In the assistant-message renderer, call `parseDeck(m.content)`; if it returns a deck, render `QuestionDeckCard` instead of the markdown body. On submit, push a new user message with the composed text + `meta.deck_answers`, then trigger the existing send-to-AI flow. Hold `editingDeckForMessageId` state so tapping `Edit ▸` reopens the same card with previous answers. |
| modified | `supabase/functions/ai-assistant/index.ts` | Add one paragraph to the system prompt instructing the AI to emit a `questions_deck` JSON block when it needs structured answers before proceeding. Include the schema in the prompt so the model knows the shape. |

The current `CanvasAIPanel.tsx` is already large. Keep the deck-specific logic in `QuestionDeckCard.tsx` and only add ~30-line integration points to the panel — don't grow the panel further than necessary.

## Visual spec

Matches the existing Canvas AI styling (teal accent, dark surface):

- Card container: `border: 1px solid rgba(34,211,238,0.35)`, `border-radius: 14px`, `padding: 12px 14px`, soft inner glow `inset 0 0 40px rgba(34,211,238,0.08)`, gradient from `rgba(34,211,238,0.08)` to `rgba(8,145,178,0.04)`.
- Label row: `Q{n} / {total} · {label}` in 9px uppercase teal, tracking 1.4px. `Skip` link on the right.
- Title: 13px bold white.
- Body: 11px muted slate.
- Chip: unselected `border: 1px solid rgba(148,163,184,0.25)` on faint white background; selected `border-color: rgba(34,211,238,0.7), background: rgba(34,211,238,0.15), color: #22d3ee`.
- Input row: 7px rounded, focus-tinted teal border when typing.
- Nav buttons: small square `←`, primary `Next →` pill (last card becomes `Done ✓`).
- Progress dots: 1 per question, filled teal as completed, half-teal for active, muted gray for untouched.

Summary bubble:

- User-side alignment, slate background, teal-tinted border.
- One row per question: `Qn` tabular-numeric muted column, then the answer (italic when typed, plain when chip-picked).
- Footer: `{answered} / {total} answered` left, `Edit ▸` right (teal).

## Accessibility

- Chips are `<button>` elements with `aria-pressed` reflecting selection.
- `←` / `Next →` are keyboard-activatable; `Enter` inside the input also advances.
- Progress dots have `aria-label="Question {n} of {total}"` on the container.
- Summary bubble rows use a `<dl><dt>Q1</dt><dd>Lost dad at 4</dd></dl>` structure for screen-reader semantics.

## Edge cases

- **AI emits a deck with `questions: []`** → treat as a normal (broken) response; fall back to raw text rendering.
- **User advances without picking a chip or typing** → the `Next →` button is enabled (skipping is allowed), but the summary row for that question shows `—` and the composed message line is `Qn — {label}: (skipped)`.
- **User sends a new chat message while the deck is open** → submitting the chat message closes the deck as-is (whatever's been answered), the partial summary bubble is inserted, then their new message follows.
- **User hits `Edit ▸` after the AI has already responded to the deck** → the edited submission replaces the old summary bubble but does NOT remove the AI's intermediate response (the conversation has moved on). Re-answering means the AI gets a new user message with the updated answers, as a follow-up.
- **Streaming** — if the AI response is streamed, we don't know it's a deck until the JSON is complete. Render nothing until the closing `}` is received; show a muted "Boby is preparing questions…" placeholder.

## Files touched

```
src/components/canvas/QuestionDeckCard.tsx       (new)
src/components/canvas/DeckSummaryBubble.tsx      (new)
src/lib/parseDeck.ts                             (new)
src/components/canvas/CanvasAIPanel.tsx          (integration)
supabase/functions/ai-assistant/index.ts         (prompt update + schema doc)
```

## Deployment

1. Deploy edge function (`supabase functions deploy ai-assistant`) — the prompt change is a no-op for old clients (they just see the JSON block as text, which is ugly but not broken).
2. Build + deploy frontend.
3. Cloudflare purge.
4. No DB migration.

## Future (separate specs)

- Multi-select per question (with a "combine up to N" hint).
- Apply the pattern to AIScriptWizard's own question stage.
- Dependent questions — AI receives answer to Q1 and dynamically reshapes Q2 (conversational flow, flagged as scope B in brainstorming).
- Analytics on which chips get picked vs typed — informs prompt tuning.
