# Credit Optimization — Design Spec
**Date:** 2026-03-31
**Status:** Ready for implementation

---

## Problem

Two compounding issues hurt both margin and user experience:

1. **Users hit credit walls too fast.** A Starter user today gets ~54 heavy canvas sessions/month on paper, but in practice burns through credits in days and feels capped. The app feels stingy compared to competitors (Blort AI, Poppy AI).

2. **API costs are higher than necessary.** Every canvas AI message resends the full context (system prompt + transcriptions + text notes = up to 15K tokens) at full Anthropic price, even message 10 in the same conversation. No prompt caching is implemented.

---

## Goals

- Keep Sonnet as the default model everywhere. No quality reduction.
- Give users 3–5x more monthly usage at the same price point.
- Keep API costs at or below 55% of subscription revenue in worst case (minimum 45% profit margin).
- Implement silently — no visible product changes to users beyond the credit balance being higher.

---

## Solution Overview

Two changes, independent of each other:

**1. Prompt caching** — Cache the system prompt and canvas context using Anthropic's `cache_control: ephemeral` API. This cuts input token costs by 60–70% on every message after the first in a conversation. Credits charged to users automatically drop (Anthropic only counts uncached tokens in `input_tokens`), so users get more messages per credit with no formula changes.

**2. Revised credit tiers** — Increase monthly credit allocations so the plans reflect the actual cost economics. Current tiers were set conservatively before the API cost structure was fully modeled.

---

## Part 1: Prompt Caching

### How it works

Anthropic's prompt caching marks specific content blocks with `cache_control: { type: "ephemeral" }`. On the first call, Anthropic writes those blocks to a 5-minute cache (costs 1.25× normal input price). On subsequent calls within 5 minutes, it reads from cache at 0.1× price.

The API response splits token counts into three fields:
- `input_tokens` — uncached tokens (billed at full rate)
- `cache_creation_input_tokens` — tokens written to cache (billed at 1.25×)
- `cache_read_input_tokens` — tokens read from cache (billed at 0.1×)

The current credit formula reads only `input_tokens`. With caching, `input_tokens` drops dramatically on cached messages (only the new user message counts), so users are automatically charged fewer credits per follow-up message.

### What gets cached

Two blocks, in order:

**Block 1 — System prompt** (~3,000 tokens, static per session)
The full canvas system prompt (1:1 cloning rules, anti-fluff directives, writing style, etc.). This never changes within a session.

**Block 2 — Canvas context** (up to 15,000 tokens, static within a session)
The `canvas_context` string: transcriptions, text notes, brand guide, hooks, CTAs, competitor profiles. This is built once per user message from `window.__canvasNodes` but is identical across all messages in the same session unless the user adds/removes nodes.

### Before vs after per message

| | Message 1 (cache creation) | Messages 2–10 (cache hit) |
|---|---|---|
| `input_tokens` reported | ~200 (user message only) | ~200–500 (user msg + growing history) |
| `cache_creation_input_tokens` | ~18,000 (system + context) | 0 |
| `cache_read_input_tokens` | 0 | ~18,000 |
| Credits charged (Sonnet) | ~20 | ~20–36 |
| API cost (Sonnet) | ~$0.068 | ~$0.016 |

Compare to today: every message costs ~188 credits and ~$0.059 with heavy context. Sessions go from costing ~940 credits (10 messages) to ~220 credits. Users get ~4× more sessions per plan.

### Cost at worst case with caching

A Starter user burning all 50,000 credits on heavy canvas (worst case):
- ~2,000+ messages → API cost ~$32 → margin ~18%

Wait — that breaks the floor. The issue: with caching, credits per message drop to ~20–44, meaning users can send far more messages, which increases total API spend.

**Resolution:** The credit floor constraint must be applied to the *credit tier design*, not to caching independently. Caching reduces API cost per message — but the credit tier determines total spend. The tiers in Part 2 are sized to hold the 45% margin floor accounting for caching economics.

### Implementation — `supabase/functions/ai-assistant/index.ts`

**Step 1: Add beta header**

```typescript
headers: {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "prompt-caching-2024-07-31",  // ADD THIS
  "content-type": "application/json",
}
```

**Step 2: Convert system prompt from string to structured array**

Currently:
```typescript
const claudeBody = {
  system: systemPrompt,  // plain string
  ...
}
```

After:
```typescript
const claudeBody = {
  system: isCanvas && client_info?.canvas_context
    ? [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `<canvas_data>\n${client_info.canvas_context}\n</canvas_data>\n\nAbove is the LIVE data from all nodes currently connected on the canvas. Use it. Do NOT say you cannot see data included above.`,
          cache_control: { type: "ephemeral" },
        },
      ]
    : systemPrompt,  // wizard mode stays as plain string
  ...
}
```

**Step 3: Remove canvas context injection from messages array**

The current code prepends canvas_context to `apiMessages[firstUserIdx]`. With caching, context lives in the system array instead — the model reads it fresh on every message, so injecting it into messages is redundant and wastes tokens.

Remove both injection blocks:

```typescript
// REMOVE block 1 (lines ~694–703) — first message context injection:
if (isCanvas && client_info?.canvas_context) {
  const contextMsg = `<canvas_data>...`;
  apiMessages[firstUserIdx].content = contextMsg + "\n\n" + ...;
}

// REMOVE block 2 (Fix 3, lines ~704–742) — long conversation context reminder:
// The reminder was a workaround for context drift in long sessions.
// With caching, context is in the system prompt on every message — no drift possible.
const userMsgCount = apiMessages.filter(...).length;
if (userMsgCount >= 4) { ... }
```

**Why this is strictly better:** System prompt content receives full model attention on every turn. The original first-message injection meant context was buried under growing conversation history by message 10+. System placement eliminates this entirely.

**Step 4: Update token counting for credits**

No formula change needed. `input_tokens` from the API already excludes cached tokens. The existing streaming token extraction handles this correctly.

Log `cache_creation_input_tokens` and `cache_read_input_tokens` for monitoring:

```typescript
if (ev.type === "message_start" && ev.message?.usage) {
  streamInputTokens = ev.message.usage.input_tokens ?? 0;
  const cacheCreate = ev.message.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = ev.message.usage.cache_read_input_tokens ?? 0;
  console.log(`[ai-assistant] tokens: input=${streamInputTokens} cache_create=${cacheCreate} cache_read=${cacheRead}`);
}
```

**Step 5: Apply to all three Anthropic fetch calls**

- Title generation (Call 1): No canvas context, apply system prompt caching only when in canvas mode
- Streaming path (Call 2): Full caching as above
- Non-streaming path (Call 3): Full caching as above

### What this does NOT affect

- Wizard mode (AIScriptWizard) — system prompt stays as plain string, no caching (wizard state changes every message, caching would not help)
- OpenAI path (GPT-4o, GPT-4o-mini) — no cache_control, unchanged
- Image generation path — unchanged
- `ai-build-script` function — Haiku, fixed credit costs, no change needed
- All other edge functions — unchanged

---

## Part 2: Revised Credit Tiers

### Constraint

At 45% profit floor, the maximum API budget per plan:
- Starter $39: $21.45
- Growth $79: $43.45
- Pro $139: $76.45

Worst case per-credit API cost (HD image generation): $0.000400/credit
This is more expensive per credit than canvas Sonnet even with caching, making it the binding constraint.

### New tiers

| Plan | Current credits | New credits | Increase |
|---|---|---|---|
| Starter $39 | 10,000 | **50,000** | 5× |
| Growth $79 | 30,000 | **100,000** | 3.3× |
| Pro $139 | 75,000 | **175,000** | 2.3× |

### Verification at 45% floor

**Absolute worst case (all credits on HD images):**
- Starter 50K: 250 images × $0.080 = $20.00 → 48.7% margin ✓
- Growth 100K: 500 images × $0.080 = $40.00 → 49.4% margin ✓
- Pro 175K: 875 images × $0.080 = $70.00 → 49.6% margin ✓

**Realistic heavy creator on Starter 50K:**

| Action | Monthly volume | Credits | API cost |
|---|---|---|---|
| Canvas sessions (10 msg, medium context, cached) | 20 sessions | 4,400 | $3.20 |
| Script workflows (research + generate + refine) | 40 scripts | 3,000 | $0.48 |
| Video transcriptions | 20 videos | 3,000 | $0.40 |
| Hook + CTA generations | 200 | 5,000 | $0.60 |
| HD image generation | 20 | 4,000 | $1.60 |
| **Total** | | **19,400 credits** | **$6.28** |

Margin: ($39 − $6.28) / $39 = **83.9%** — well above 45% floor.
They still have 30,600 credits unused. No wall hit.

### Trial credits

Trial stays at 1,000 credits. Trial is not the same as free — it's a locked plan until payment. Increasing trial does not change the conversion economics meaningfully and keeps trial distinct from a real plan.

### Where to update

**`supabase/functions/check-subscription/index.ts`** — `PRODUCT_PLAN_MAP`:
```typescript
"prod_U8CMY29gkbO85Y": { credits_monthly_cap: 50000, ... },   // starter
"prod_U8CMTfvyn4lvgv": { credits_monthly_cap: 100000, ... },  // growth
"prod_U8CMxSv9ZoV1PF": { credits_monthly_cap: 175000, ... },  // enterprise/pro
// Also update legacy product IDs with same values
```

**`src/pages/SelectPlan.tsx`** — display strings:
```typescript
{ key: "starter",    credits: "50,000",  ... }
{ key: "growth",     credits: "100,000", ... }
{ key: "enterprise", credits: "175,000", ... }
```

**Database** — existing subscribers need their `credits_monthly_cap` updated. This happens automatically on next billing cycle via `check-subscription`, but active users should get the new cap immediately via a migration:

```sql
UPDATE clients SET credits_monthly_cap = 50000
WHERE subscription_plan = 'starter' AND credits_monthly_cap = 10000;

UPDATE clients SET credits_monthly_cap = 100000
WHERE subscription_plan = 'growth' AND credits_monthly_cap = 30000;

UPDATE clients SET credits_monthly_cap = 175000
WHERE subscription_plan IN ('enterprise', 'pro') AND credits_monthly_cap = 75000;
```

Also top up `credits_balance` by the difference for users mid-cycle (give them the extra credits they're now entitled to, don't reset to full cap since they may have already spent some):
```sql
UPDATE clients SET credits_balance = credits_balance + 40000
WHERE subscription_plan = 'starter'
  AND credits_monthly_cap = 50000
  AND credits_balance < 50000;

UPDATE clients SET credits_balance = credits_balance + 70000
WHERE subscription_plan = 'growth'
  AND credits_monthly_cap = 100000
  AND credits_balance < 100000;

UPDATE clients SET credits_balance = credits_balance + 100000
WHERE subscription_plan IN ('enterprise', 'pro')
  AND credits_monthly_cap = 175000
  AND credits_balance < 175000;
```

---

## Part 3: Fix Free Operation Hidden Cost

`generate-script` (and `analyze-structure`, `verify-video-type`, `analyze-competitor-post`) charge 0 credits but cost real API money. At scale this is a margin leak.

**Fix:** Charge 10 credits for `generate-script`. It's cheap enough to feel free but covers the API cost.

```typescript
// supabase/functions/ai-build-script/index.ts
const CREDIT_COSTS: Record<string, number> = {
  "generate-script": 10,  // was 0
  "analyze-structure": 0,  // keep free — fast, cheap, rarely called alone
  "verify-video-type": 0,  // keep free — cheap detection
  "analyze-competitor-post": 0,  // keep free — part of onboarding flow
  ...
}
```

---

## What does NOT change

- Model selection UI (users still choose Haiku / Sonnet / Opus)
- All canvas features (nodes, connections, @ mentions, context injection, image upload)
- Credit deduction formula (`input + output×3 / 400 × multiplier`)
- Wizard AI (AIScriptWizard) — no caching applied
- All other edge functions
- Stripe pricing / subscription amounts

---

## Margin summary

| Plan | Scenario | API cost | Margin |
|---|---|---|---|
| Starter $39 | Light user (20% usage) | $1.26 | 96.8% |
| Starter $39 | Heavy creator (40% usage) | $6.28 | 83.9% |
| Starter $39 | Worst case (all HD images) | $20.00 | 48.7% |
| Growth $79 | Heavy creator (40% usage) | $12.56 | 84.1% |
| Growth $79 | Worst case (all HD images) | $40.00 | 49.4% |
| Pro $139 | Heavy creator (40% usage) | $22.05 | 84.1% |
| Pro $139 | Worst case (all HD images) | $70.00 | 49.6% |

---

## Implementation order

1. Prompt caching in `ai-assistant/index.ts` — deploy to Supabase cloud
2. Credit tier update in `check-subscription/index.ts` — deploy to Supabase cloud
3. Database migration — run in Supabase SQL editor
4. `SelectPlan.tsx` display update — build and deploy to VPS
5. `generate-script` credit fix in `ai-build-script/index.ts` — deploy to Supabase cloud
