# Credit Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Anthropic prompt caching on the canvas AI assistant, raise credit tiers 3–5×, and fix one hidden-cost free operation — giving users dramatically more usage while maintaining ≥45% profit margin.

**Architecture:** Three independent changes applied in order: (1) cache the system prompt + canvas context in `ai-assistant` by converting the `system` field from a plain string to a structured content array with `cache_control`, removing the now-redundant first-message context injection and Fix 3 reminder; (2) update `credits_monthly_cap` in `check-subscription` and `SelectPlan.tsx`; (3) charge 10 credits for `generate-script` in `ai-build-script`.

**Tech Stack:** Deno edge functions (Supabase), Anthropic Messages API with prompt caching beta, React/TypeScript frontend, Supabase SQL for DB migration.

---

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/ai-assistant/index.ts` | Add beta header; convert system to cached array for canvas; remove message injection blocks (lines 692–743) |
| `supabase/functions/check-subscription/index.ts` | Update `credits_monthly_cap` for all 6 product IDs |
| `supabase/functions/ai-build-script/index.ts` | Change `generate-script` from 0 to 10 credits |
| `src/pages/SelectPlan.tsx` | Update credit display strings |
| Supabase SQL editor | Run migration to top up existing subscribers |

---

## Task 1: Add prompt caching to canvas AI — system prompt

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts:848–871`

The `claudeBody` object currently sets `system: systemPrompt` as a plain string. For canvas mode with canvas context, replace this with a structured array containing two cached blocks: the system prompt and the canvas context. The beta header must be added to both the streaming and non-streaming Anthropic fetch calls.

- [ ] **Step 1: Update `claudeBody` system field**

Find this block (around line 848):
```typescript
const claudeBody: any = {
  model,
  max_tokens: model.includes("opus") ? 4096 : model.includes("sonnet") ? 2048 : 1024,
  system: systemPrompt,
  messages: apiMessages,
};
```

Replace with:
```typescript
const claudeBody: any = {
  model,
  max_tokens: model.includes("opus") ? 4096 : model.includes("sonnet") ? 2048 : 1024,
  system: (isCanvas && client_info?.canvas_context)
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
    : systemPrompt,
  messages: apiMessages,
};
```

- [ ] **Step 2: Add beta header to the streaming fetch call**

Find the streaming fetch (around line 863):
```typescript
const streamRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify(claudeBody),
});
```

Replace headers with:
```typescript
headers: {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "prompt-caching-2024-07-31",
  "content-type": "application/json",
},
```

- [ ] **Step 3: Add beta header to the non-streaming fetch call**

Find the non-streaming fetch (around line 923):
```typescript
const claudeRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify(claudeBody),
});
```

Replace headers with:
```typescript
headers: {
  "x-api-key": ANTHROPIC_API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "prompt-caching-2024-07-31",
  "content-type": "application/json",
},
```

- [ ] **Step 4: Verify the file looks correct — check system field**

Search for `system:` in `supabase/functions/ai-assistant/index.ts`. You should see the ternary expression assigning either an array (canvas mode) or the plain `systemPrompt` string (wizard mode). Confirm `cache_control` appears twice.

---

## Task 2: Remove redundant context injection from messages

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts:692–743`

With context now in the system prompt (cached), injecting it into the messages array is redundant and doubles the token cost. Remove both injection blocks.

- [ ] **Step 1: Remove the first-message context injection block**

Find and delete lines 692–743 entirely. This is the block:
```typescript
// Inject canvas context as a prefixed user message so the model pays attention to it
// (data in the first user message gets more attention than data buried in a long system prompt)
if (isCanvas && client_info?.canvas_context) {
  const contextMsg = `<canvas_data>\n${client_info.canvas_context}\n</canvas_data>...`;
  // Find the first user message and prepend context to it
  const firstUserIdx = apiMessages.findIndex((m: any) => m.role === "user");
  if (firstUserIdx >= 0) {
    apiMessages[firstUserIdx].content = contextMsg + "\n\n" + apiMessages[firstUserIdx].content;
  } else {
    apiMessages.unshift({ role: "user", content: contextMsg });
  }

  // Fix 3: Re-inject compact context reminder in long conversations
  ...
  // (the entire Fix 3 block through the closing `}` on line 743)
}
```

Delete from the comment `// Inject canvas context as a prefixed user message...` through the closing `}` at line 743 (inclusive). The next line should be `// Inject connected canvas images into last user message for Claude vision`.

- [ ] **Step 2: Verify the gap is clean**

After deletion, the code around line 690 should read:
```typescript
const apiMessages = messages.map((m: any) => ({ role: m.role, content: m.content }));

// Inject connected canvas images into last user message for Claude vision
if (isCanvas && Array.isArray(canvas_image_urls) && canvas_image_urls.length > 0) {
```

No canvas context injection block between those two lines.

---

## Task 3: Add cache token logging to streaming path

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts:897–901`

Log cache token counts for monitoring. This helps verify caching is working in production without changing credit math.

- [ ] **Step 1: Update the `message_start` handler in the streaming loop**

Find (around line 897):
```typescript
} else if (ev.type === "message_start" && ev.message?.usage) {
  streamInputTokens = ev.message.usage.input_tokens ?? 0;
}
```

Replace with:
```typescript
} else if (ev.type === "message_start" && ev.message?.usage) {
  streamInputTokens = ev.message.usage.input_tokens ?? 0;
  const cacheCreate = ev.message.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = ev.message.usage.cache_read_input_tokens ?? 0;
  if (cacheCreate > 0 || cacheRead > 0) {
    console.log(`[ai-assistant] cache: create=${cacheCreate} read=${cacheRead} uncached_input=${streamInputTokens}`);
  }
}
```

- [ ] **Step 2: Commit Task 1–3 together**

```bash
git add supabase/functions/ai-assistant/index.ts
git commit -m "feat(ai-assistant): prompt caching for canvas system prompt + context"
```

---

## Task 4: Deploy ai-assistant and verify caching

**Files:**
- Deploy: `supabase/functions/ai-assistant`

- [ ] **Step 1: Deploy the function**

```bash
npx supabase functions deploy ai-assistant --project-ref hxojqrilwhhrvloiwmfo
```

Expected output:
```
Deployed Functions on project hxojqrilwhhrvloiwmfo: ai-assistant
```

- [ ] **Step 2: Open the app and send two canvas AI messages in the same session**

Go to the Super Planning Canvas. Connect at least one node (text note or video). Send any message to the AI assistant. Then send a follow-up message in the same conversation.

- [ ] **Step 3: Verify caching in Supabase function logs**

Go to Supabase Dashboard → Edge Functions → ai-assistant → Logs.

On the **first message** you should see:
```
[ai-assistant] cache: create=XXXX read=0 uncached_input=YYY
```

On the **second message** you should see:
```
[ai-assistant] cache: create=0 read=XXXX uncached_input=YYY
```

Where `read=XXXX` is larger than `uncached_input=YYY` (confirming the big context block is being read from cache, not re-sent).

If you see `create=0 read=0` on both messages, caching is not working — check that the beta header is present in the fetch call and that `canvas_context` is non-empty.

- [ ] **Step 4: Verify credits charged are lower on follow-up messages**

In the Supabase Dashboard → Table Editor → `credit_transactions`, look at the last two rows for your test. The second message should show a lower `cost` than the first (because `input_tokens` is smaller when context is cached).

---

## Task 5: Update credit caps in check-subscription

**Files:**
- Modify: `supabase/functions/check-subscription/index.ts:21–27`

- [ ] **Step 1: Update PRODUCT_PLAN_MAP credit caps**

Find lines 21–27:
```typescript
"prod_U8CMY29gkbO85Y": { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 10000, channel_scrapes_limit: 8  },
"prod_U8CMTfvyn4lvgv": { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 30000, channel_scrapes_limit: 15 },
"prod_U8CMxSv9ZoV1PF": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 75000, channel_scrapes_limit: 25 },
// Legacy products (grandfathered subscribers)
"prod_Tzx3VOK8V8gI11": { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 10000, channel_scrapes_limit: 8  },
"prod_Tzx4et0Y0iv6LI": { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 30000, channel_scrapes_limit: 15 },
"prod_Tzx4OBg3PpYuES": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 75000, channel_scrapes_limit: 25 },
```

Replace with:
```typescript
"prod_U8CMY29gkbO85Y": { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 50000,  channel_scrapes_limit: 8  },
"prod_U8CMTfvyn4lvgv": { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 100000, channel_scrapes_limit: 15 },
"prod_U8CMxSv9ZoV1PF": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 175000, channel_scrapes_limit: 25 },
// Legacy products (grandfathered subscribers)
"prod_Tzx3VOK8V8gI11": { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 50000,  channel_scrapes_limit: 8  },
"prod_Tzx4et0Y0iv6LI": { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 100000, channel_scrapes_limit: 15 },
"prod_Tzx4OBg3PpYuES": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 175000, channel_scrapes_limit: 25 },
```

- [ ] **Step 2: Commit and deploy**

```bash
git add supabase/functions/check-subscription/index.ts
git commit -m "feat(subscription): raise credit caps — starter 50K, growth 100K, pro 175K"
npx supabase functions deploy check-subscription --project-ref hxojqrilwhhrvloiwmfo
```

Expected output:
```
Deployed Functions on project hxojqrilwhhrvloiwmfo: check-subscription
```

---

## Task 6: Update SelectPlan.tsx display strings

**Files:**
- Modify: `src/pages/SelectPlan.tsx:17,36,55`

- [ ] **Step 1: Update credits display strings**

Find lines 17, 36, 55 (the `credits` field in each plan object):

Line 17 — change:
```typescript
credits: "10,000",
```
To:
```typescript
credits: "50,000",
```

Line 36 — change:
```typescript
credits: "30,000",
```
To:
```typescript
credits: "100,000",
```

Line 55 — change:
```typescript
credits: "75,000",
```
To:
```typescript
credits: "175,000",
```

- [ ] **Step 2: Build and deploy to VPS**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in X.XXs`

```bash
expect -c '
spawn bash -c "scp -r /Users/admin/Desktop/connectacreators/dist/* root@72.62.200.145:/var/www/connectacreators/"
expect {
  "password:" { send "Loqueveoloveo290802#\r"; exp_continue }
  "yes/no" { send "yes\r"; exp_continue }
  eof
}
'
```

Then reload nginx:
```bash
expect -c '
spawn ssh root@72.62.200.145 "nginx -s reload"
expect {
  "password:" { send "Loqueveoloveo290802#\r"; exp_continue }
  eof
}
'
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/SelectPlan.tsx
git commit -m "feat(plans): update credit display — 50K/100K/175K"
```

- [ ] **Step 4: Verify on live site**

Open `https://connectacreators.com/select-plan` (or the SelectPlan route in the app). Confirm the three paid plan cards show 50,000 / 100,000 / 175,000 credits respectively.

---

## Task 7: DB migration — top up existing subscribers

**Files:**
- Run in: Supabase Dashboard → SQL Editor

This gives existing paying subscribers the new credit amounts immediately rather than waiting for their next billing cycle. It adds the difference to their current balance (doesn't reset — they keep any unused credits they already have).

- [ ] **Step 1: Run the migration in Supabase SQL editor**

Go to Supabase Dashboard → SQL Editor → New query. Paste and run:

```sql
-- Step 1: Update monthly caps for all active subscribers
UPDATE clients SET credits_monthly_cap = 50000
WHERE subscription_plan = 'starter'
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 10000;

UPDATE clients SET credits_monthly_cap = 100000
WHERE subscription_plan = 'growth'
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 30000;

UPDATE clients SET credits_monthly_cap = 175000
WHERE subscription_plan IN ('enterprise', 'pro')
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 75000;

-- Step 2: Top up balances by the difference (don't reset — add the delta)
UPDATE clients SET credits_balance = LEAST(credits_balance + 40000, 50000)
WHERE subscription_plan = 'starter'
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 50000;

UPDATE clients SET credits_balance = LEAST(credits_balance + 70000, 100000)
WHERE subscription_plan = 'growth'
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 100000;

UPDATE clients SET credits_balance = LEAST(credits_balance + 100000, 175000)
WHERE subscription_plan IN ('enterprise', 'pro')
  AND subscription_status IN ('active', 'trialing')
  AND credits_monthly_cap = 175000;
```

- [ ] **Step 2: Verify the migration**

Run this query and confirm the counts and new balances look right:

```sql
SELECT subscription_plan, credits_monthly_cap, AVG(credits_balance)::int as avg_balance, COUNT(*) as users
FROM clients
WHERE subscription_status IN ('active', 'trialing')
GROUP BY subscription_plan, credits_monthly_cap
ORDER BY credits_monthly_cap;
```

Expected: starter rows show `credits_monthly_cap = 50000`, growth shows `100000`, enterprise/pro shows `175000`.

---

## Task 8: Fix generate-script hidden cost

**Files:**
- Modify: `supabase/functions/ai-build-script/index.ts:78`

`generate-script` costs Anthropic ~$0.006 per call but charges users 0 credits. At scale this is a margin leak.

- [ ] **Step 1: Update CREDIT_COSTS**

Find line 78:
```typescript
"generate-script": 0,
```

Change to:
```typescript
"generate-script": 10,
```

- [ ] **Step 2: Commit and deploy**

```bash
git add supabase/functions/ai-build-script/index.ts
git commit -m "fix(credits): charge 10 credits for generate-script (was free, leaked API cost)"
npx supabase functions deploy ai-build-script --project-ref hxojqrilwhhrvloiwmfo
```

Expected output:
```
Deployed Functions on project hxojqrilwhhrvloiwmfo: ai-build-script
```

- [ ] **Step 3: Verify in the app**

Open the Script Generator. Go through Steps 1–4 and trigger script generation (Step 5). Check `credit_transactions` in Supabase — a row with `action = 'generate-script'` and `cost = 10` should appear.

---

## Self-Review

**Spec coverage check:**
- ✅ Prompt caching on system prompt + canvas context → Tasks 1–4
- ✅ Remove first-message injection and Fix 3 reminder → Task 2
- ✅ Cache token logging for monitoring → Task 3
- ✅ New credit tiers in check-subscription → Task 5
- ✅ SelectPlan.tsx display update → Task 6
- ✅ DB migration for existing subscribers → Task 7
- ✅ generate-script credit fix → Task 8
- ✅ Wizard mode unaffected (ternary keeps plain string for non-canvas) → Task 1

**Placeholder scan:** No TBDs. All code blocks contain exact diffs.

**Type consistency:** `claudeBody.system` is typed `any`, so the array assignment is valid without type changes. `cache_control` shape matches Anthropic's documented API (`{ type: "ephemeral" }`).

**One risk to note:** Anthropic's prompt caching beta requires the cached content to be at least 1,024 tokens to be eligible for caching. The system prompt alone is ~3,000 tokens so it qualifies. If a user has no canvas context connected (empty `canvas_context`), the ternary falls back to the plain string path — no caching, no issue.
