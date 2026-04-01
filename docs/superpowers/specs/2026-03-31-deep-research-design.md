# Deep Research — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Overview

Add a "Deep Research" capability to the Canvas AI panel. When triggered, the AI performs real-time web searches using OpenAI's native `web_search_preview` tool, then synthesizes results with Claude Sonnet into a structured research report. Output streams into chat and can be saved to the canvas as a ResearchNote node.

**Credit cost:** 100 credits flat per research query.
**Target response time:** 10–15 seconds.

---

## Triggers

Two ways to activate deep research:

1. **Natural language detection** — `CanvasAIPanel` scans the user's message for research intent keywords before sending. If detected, routes to `deep-research` instead of `ai-assistant`.
   - Keywords: `"research"`, `"look up"`, `"find data"`, `"what are the latest"`, `"search for"`, `"find studies"`, `"find stats"`, `"find trends"`
   - Case-insensitive, partial match

2. **Research toggle button** — a 🔍 icon in the AI panel toolbar. When active (`isResearchMode = true`), all messages route to `deep-research` regardless of content. A subtle indigo banner below the toolbar indicates the mode is active: _"Deep Research mode — 100 credits per query"_.

---

## Architecture

**Approach:** Dedicated Supabase edge function `deep-research`. Keeps `ai-assistant` unchanged.

```
User message
    │
    ▼
CanvasAIPanel.tsx
  ├─ keyword detection OR isResearchMode toggle
  └─ POST /functions/v1/deep-research (with canvas context)
         │
         ▼
  deep-research/index.ts
    1. Pre-flight: check 100 credits, deduct upfront
    2. Query generation: GPT-4o generates 3 search queries from topic
    3. Parallel web search: Promise.all() — 3× OpenAI web_search_preview
    4. Claude Sonnet synthesis: structured report, streamed via SSE
         │
         ▼
  CanvasAIPanel.tsx
    ├─ Renders streaming response with "Deep Research" label + source count
    └─ Shows "📌 Save to Canvas" button after stream completes
         │
         ▼
  ResearchNote node created on canvas (on button click)
```

---

## Edge Function: `deep-research`

**File:** `supabase/functions/deep-research/index.ts`

### Input (POST body)
```json
{
  "topic": "neuropathy treatment trends 2026",
  "canvas_context": "...",
  "client_id": "uuid",
  "user_id": "uuid"
}
```

### Step 1 — Pre-flight
- Look up `credits_balance` for client via `subscriber_clients` junction table (same pattern as `ai-assistant`)
- If `credits_balance < 100`, return `402` with `{ error: "Insufficient credits" }`
- Deduct 100 credits immediately: `UPDATE clients SET credits_balance = credits_balance - 100`
- Log to `credit_transactions`: `{ action: 'deep-research', credits: 100, client_id, user_id }`
- Admin/videographer/editor roles bypass credit check (same as `ai-assistant`)

### Step 2 — Query generation (~1-2s)
- Call GPT-4o (no streaming) with prompt:
  ```
  Generate 3 targeted web search queries for researching: "{topic}"
  Return as JSON array of strings. Focus on recent data, statistics, and trends.
  ```
- Parse JSON response → array of 3 query strings

### Step 3 — Parallel web search (~5-8s)
- `Promise.all()` with 3 OpenAI Responses API calls, each using the `web_search_preview` tool
- Model: `gpt-4o` with `tools: [{ type: "web_search_preview" }]`
- Each call returns result text + citations (URLs, titles)
- Collect all results into a single context block

### Step 4 — Claude synthesis (streamed, ~3-5s)
- Call Claude Sonnet (`claude-sonnet-4-6`) with streaming enabled
- System prompt instructs it to produce a structured report:
  ```
  You are a research assistant for content creators. Synthesize the following web search
  results into a clear, structured report. Format:

  ## [Topic]

  **Key Findings**
  • [bullet points with most important data points]

  **Trends**
  • [emerging patterns]

  **Content Angles**
  • [how a creator could use this for video content]

  **Sources**
  [numbered list of source URLs]

  Be concise. Prioritize data with numbers, percentages, and citations.
  ```
- Stream via SSE: `data: { delta: string, sources?: string[] }`
- On stream complete, send final event: `data: { done: true, source_count: N, query_count: 3 }`

### Error handling
- If OpenAI web search fails for a query, skip it and continue with remaining results
- If all 3 searches fail, return the 100 credits and send error message in chat
- Timeout: abort after 20 seconds, return partial results if synthesis has started

---

## Frontend Changes: `CanvasAIPanel.tsx`

### New state
```ts
const [isResearchMode, setIsResearchMode] = useState(false)
```

### Toolbar addition
- Add 🔍 icon button next to existing toolbar icons
- Active state: indigo gradient background + glow shadow
- Mode banner renders below toolbar when `isResearchMode = true`

### `sendMessage()` modification
```ts
const isResearch = isResearchMode || RESEARCH_KEYWORDS.some(kw =>
  message.toLowerCase().includes(kw)
)

if (isResearch) {
  return sendResearchMessage(message)
}
// existing ai-assistant flow continues unchanged
```

### `sendResearchMessage()`
- POST to `/functions/v1/deep-research` with `{ topic: message, canvas_context, client_id, user_id }`
- Same SSE streaming handler as existing `sendMessage()` — reads `data: {delta}` chunks
- Message renders with "Deep Research" label (indigo dot + text) + source count + elapsed time
- After `done: true` event received, show "📌 Save to Canvas" button below the message

### "Save to Canvas" button
- On click: calls existing canvas node creation flow with type `research_note`
- Node title: the user's original topic/message
- Node body: the full synthesis text (markdown, as returned by Claude) stored in the node's `content` field
- Source URLs appended as a simple list at the bottom of the node body
- Node appears on canvas near the AI assistant node (offset by ~200px so it doesn't overlap)

---

## Credit Display

The existing credits display in the panel already shows balance. No changes needed — the 100-credit deduction will reflect immediately after research completes.

---

## Research Output Format (in chat)

```
● Deep Research  · 3 sources · 11s

## Neuropathy Treatment Trends 2026

**Key Findings**
• Spinal cord stimulation adoption up 34% YoY (JAMA 2025)
• 67% of patients prefer non-pharmaceutical approaches
• Low-level laser therapy gaining traction in clinical settings

**Trends**
• Shift toward combination therapies
• Telemedicine-based pain management growing 28% annually

**Content Angles**
• "5 things your doctor won't tell you about neuropathy"
• "The non-drug treatment 67% of patients prefer"

**Sources**
1. https://...
2. https://...
3. https://...

[📌 Save to Canvas]
```

---

## What Is Not In Scope

- No user-configurable search depth (always 3 queries)
- No search history or previous research accessible from panel
- No image search
- No scheduling or automated research runs
- ResearchNote node editing after save is handled by existing node UI (no changes)
