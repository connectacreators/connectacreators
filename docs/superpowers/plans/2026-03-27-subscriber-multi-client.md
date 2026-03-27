# Subscriber Multi-Client Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow subscribers (starter/growth/enterprise) to manage multiple clients via a junction table, shared credit pool, and client selector dropdown.

**Architecture:** New `subscriber_clients` junction table links subscribers to multiple clients. Primary client (is_primary=true) holds all billing/credit fields. Edge functions look up primary client for credit deduction. Frontend gets a `usePrimaryClient()` hook and the existing client selector dropdown is extended to subscribers.

**Tech Stack:** Supabase (PostgreSQL, RLS, Edge Functions/Deno), React + TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-27-subscriber-multi-client-design.md`

---

## File Map

### New Files
- `supabase/migrations/20260327_subscriber_clients.sql` — Junction table, indexes, RLS, helper functions, backfill
- `src/hooks/usePrimaryClient.ts` — New hook replacing all `.eq("user_id").maybeSingle()` patterns

### Modified Files — Database/Backend
- `supabase/functions/transcribe-video/index.ts` — Credit lookup via primary client
- `supabase/functions/ai-assistant/index.ts` — Credit lookup via primary client
- `supabase/functions/batch-generate-scripts/index.ts` — Credit lookup via primary client
- `supabase/functions/transcribe-canvas-media/index.ts` — Credit lookup via primary client
- `supabase/functions/check-subscription/index.ts` — Target primary client only
- `supabase/functions/upgrade-subscription/index.ts` — Target primary client only
- `supabase/functions/stripe-webhook/index.ts` — Lookup via subscriber_clients
- `supabase/functions/create-subscriber-user/index.ts` — Create junction entry on signup

### Modified Files — Frontend
- `src/hooks/useSubscriptionGuard.ts` — Use usePrimaryClient
- `src/hooks/useCredits.ts` — Use usePrimaryClient
- `src/components/DashboardSidebar.tsx` — Enable selector for subscribers, dynamic nav
- `src/pages/Dashboard.tsx` — Remove subscriber lock, enable selector, use usePrimaryClient
- `src/pages/Scripts.tsx` — Replace .maybeSingle() client lookup
- `src/pages/LeadTracker.tsx` — Replace .maybeSingle() client lookup
- `src/pages/Clients.tsx` — Card layout for subscribers, junction table integration, plan-based limits

---

## Task 1: Database Migration — Junction Table + RLS + Backfill

**Files:**
- Create: `supabase/migrations/20260327_subscriber_clients.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260327_subscriber_clients.sql

-- 1. Create subscriber_clients junction table
CREATE TABLE IF NOT EXISTS subscriber_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscriber_user_id, client_id)
);

-- Only one primary per subscriber (partial unique index)
CREATE UNIQUE INDEX subscriber_clients_one_primary
  ON subscriber_clients (subscriber_user_id)
  WHERE is_primary = true;

CREATE INDEX subscriber_clients_user_idx ON subscriber_clients (subscriber_user_id);
CREATE INDEX subscriber_clients_client_idx ON subscriber_clients (client_id);

-- 2. Add client_limit to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS client_limit INTEGER NOT NULL DEFAULT 1;

-- 3. Helper functions

-- Check if current user owns a client via subscriber_clients
CREATE OR REPLACE FUNCTION is_subscriber_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE subscriber_user_id = auth.uid()
    AND client_id = _client_id
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- Get the primary client_id for the current user
CREATE OR REPLACE FUNCTION get_primary_client_id() RETURNS UUID AS $$
  SELECT client_id FROM subscriber_clients
  WHERE subscriber_user_id = auth.uid()
  AND is_primary = true
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if a client is someone's primary (used in DELETE protection)
CREATE OR REPLACE FUNCTION is_primary_client(_client_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM subscriber_clients
    WHERE client_id = _client_id
    AND is_primary = true
  )
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. RLS on subscriber_clients
ALTER TABLE subscriber_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_subscriber_clients" ON subscriber_clients
  FOR ALL USING (public.is_admin());

CREATE POLICY "subscriber_select_own" ON subscriber_clients
  FOR SELECT USING (subscriber_user_id = auth.uid());

CREATE POLICY "subscriber_insert_own" ON subscriber_clients
  FOR INSERT WITH CHECK (subscriber_user_id = auth.uid());

CREATE POLICY "subscriber_delete_own_non_primary" ON subscriber_clients
  FOR DELETE USING (subscriber_user_id = auth.uid() AND NOT is_primary);

-- 5. Update clients table RLS — add subscriber_clients access
-- Drop existing restrictive policies and recreate with subscriber support

-- Add subscriber SELECT access to clients
CREATE POLICY "subscriber_select_clients" ON clients
  FOR SELECT USING (public.is_subscriber_client(id));

-- Add subscriber UPDATE access to clients
CREATE POLICY "subscriber_update_clients" ON clients
  FOR UPDATE USING (public.is_subscriber_client(id));

-- Add subscriber INSERT access to clients (for creating new clients)
CREATE POLICY "subscriber_insert_clients" ON clients
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR auth.uid() IS NOT NULL
  );

-- Add subscriber DELETE for non-primary clients only
CREATE POLICY "subscriber_delete_non_primary_clients" ON clients
  FOR DELETE USING (public.is_subscriber_client(id) AND NOT public.is_primary_client(id));

-- 6. Update scripts table RLS — add subscriber access
CREATE POLICY "subscriber_select_scripts" ON scripts
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_scripts" ON scripts
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_scripts" ON scripts
  FOR UPDATE USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_delete_scripts" ON scripts
  FOR DELETE USING (public.is_subscriber_client(client_id));

-- 7. Update video_edits table RLS — add subscriber access
CREATE POLICY "subscriber_select_video_edits" ON video_edits
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_video_edits" ON video_edits
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_video_edits" ON video_edits
  FOR UPDATE USING (public.is_subscriber_client(client_id));

-- 8. Update leads table RLS — add subscriber access
CREATE POLICY "subscriber_select_leads" ON leads
  FOR SELECT USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_insert_leads" ON leads
  FOR INSERT WITH CHECK (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_update_leads" ON leads
  FOR UPDATE USING (public.is_subscriber_client(client_id));

CREATE POLICY "subscriber_delete_leads" ON leads
  FOR DELETE USING (public.is_subscriber_client(client_id));

-- 9. Backfill existing subscribers into junction table
-- Every existing client with user_id becomes a primary entry
INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
SELECT user_id, id, true FROM clients
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill extra clients created via owner_user_id (Clients.tsx)
INSERT INTO subscriber_clients (subscriber_user_id, client_id, is_primary)
SELECT owner_user_id, id, false FROM clients
WHERE owner_user_id IS NOT NULL
AND (user_id IS NULL OR owner_user_id != user_id)
ON CONFLICT DO NOTHING;

-- 10. Set client_limit based on plan
UPDATE subscriptions SET client_limit = CASE
  WHEN plan_type = 'starter' THEN 5
  WHEN plan_type = 'growth' THEN 10
  WHEN plan_type = 'enterprise' THEN 20
  ELSE 1
END;
```

- [ ] **Step 2: Apply migration to Supabase**

Run in Supabase Dashboard SQL Editor or via CLI:
```bash
npx supabase db push
```

Or copy the SQL and run it directly in the Supabase Dashboard SQL Editor.

- [ ] **Step 3: Verify migration**

Run these verification queries in the SQL Editor:
```sql
-- Check table exists with correct columns
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'subscriber_clients' ORDER BY ordinal_position;

-- Check backfill worked
SELECT count(*) as total, count(*) FILTER (WHERE is_primary) as primary_count
FROM subscriber_clients;

-- Check client_limit was set
SELECT plan_type, client_limit FROM subscriptions;

-- Test helper functions (as admin)
SELECT is_subscriber_client('some-client-id-here');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260327_subscriber_clients.sql
git commit -m "feat(db): add subscriber_clients junction table with RLS and backfill"
```

---

## Task 2: Shared Helper — getPrimaryClientId for Edge Functions

All edge functions need the same "look up primary client" logic. We'll create a shared utility pattern used by copy-paste into each edge function (Supabase edge functions don't share imports easily).

**Files:**
- This task defines the pattern. Tasks 3-6 apply it to each edge function.

- [ ] **Step 1: Document the shared pattern**

Every edge function that queries credits will use this pattern:

```typescript
// --- Primary client lookup (shared pattern) ---
async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
}
```

And the credit check becomes:
```typescript
async function deductCredits(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  cost: number
): Promise<{ error?: string }> {
  // Skip for admin
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleData?.role === "admin" || roleData?.role === "videographer") return {};

  // Look up primary client (holds all credits)
  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return { error: "No client record found" };

  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("id", primaryClientId)
    .single();

  if (fetchErr || !client) return { error: "Could not fetch credit balance" };
  if (client.credits_balance < cost) return { error: "Insufficient credits" };

  await adminClient.from("clients").update({
    credits_balance: client.credits_balance - cost,
    credits_used: (client.credits_used || 0) + cost,
  }).eq("id", primaryClientId);

  return {};
}
```

- [ ] **Step 2: No commit needed — this is a reference for the next tasks**

---

## Task 3: Fix transcribe-video Edge Function

**Files:**
- Modify: `supabase/functions/transcribe-video/index.ts:121-145`

- [ ] **Step 1: Add getPrimaryClientId helper**

Add this function near the top of the file (after imports, before the main handler):

```typescript
async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
}
```

- [ ] **Step 2: Replace the credit check block**

Replace the existing credit check (around lines 121-145) that does:
```typescript
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("user_id", userId)
  .maybeSingle();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(adminClient, userId);
if (!primaryClientId) {
  return new Response(JSON.stringify({ error: "No client record found" }), { status: 400 });
}
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("id", primaryClientId)
  .single();
```

Also update the credit deduction `.update().eq(...)` call later in the function to use `.eq("id", primaryClientId)` instead of `.eq("user_id", userId)` or `.eq("id", client.id)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/transcribe-video/index.ts
git commit -m "fix(transcribe-video): use primary client for credit lookup"
```

---

## Task 4: Fix ai-assistant Edge Function

**Files:**
- Modify: `supabase/functions/ai-assistant/index.ts:42-56` and `~439-441`

- [ ] **Step 1: Add getPrimaryClientId helper**

Same helper as Task 3, add near top of file:

```typescript
async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
}
```

- [ ] **Step 2: Replace first credit check (lines ~42-56)**

Replace:
```typescript
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("user_id", userId)
  .maybeSingle();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(adminClient, userId);
if (!primaryClientId) return null;
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("id", primaryClientId)
  .single();
```

- [ ] **Step 3: Replace second credit check (lines ~439-441)**

Find the second `.eq("user_id", userId)` on clients around line 441 and replace with the same primary client lookup pattern. Use the already-resolved `primaryClientId` if in scope, or call `getPrimaryClientId` again.

- [ ] **Step 4: Update all credit deduction .update() calls**

Ensure any `.from("clients").update(...).eq(...)` uses `.eq("id", primaryClientId)` instead of `.eq("user_id", userId)`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-assistant/index.ts
git commit -m "fix(ai-assistant): use primary client for credit lookup"
```

---

## Task 5: Fix batch-generate-scripts and transcribe-canvas-media

**Files:**
- Modify: `supabase/functions/batch-generate-scripts/index.ts:89-103`
- Modify: `supabase/functions/transcribe-canvas-media/index.ts:25-40`

- [ ] **Step 1: Fix batch-generate-scripts**

Add `getPrimaryClientId` helper (same as Task 3). Replace lines ~99-100:
```typescript
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("user_id", userId)
  .maybeSingle();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(adminClient, userId);
if (!primaryClientId) return null;
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("id", primaryClientId)
  .single();
```

Update any subsequent `.update().eq(...)` to use `.eq("id", primaryClientId)`.

- [ ] **Step 2: Fix transcribe-canvas-media**

Add `getPrimaryClientId` helper (same as Task 3). Replace lines ~36-37:
```typescript
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("user_id", userId)
  .maybeSingle();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(adminClient, userId);
if (!primaryClientId) {
  return new Response(JSON.stringify({ error: "No client record found" }), { status: 400 });
}
const { data: client, error: fetchErr } = await adminClient
  .from("clients")
  .select("id, credits_balance, credits_used")
  .eq("id", primaryClientId)
  .single();
```

Update any subsequent `.update().eq(...)` to use `.eq("id", primaryClientId)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/batch-generate-scripts/index.ts supabase/functions/transcribe-canvas-media/index.ts
git commit -m "fix(edge-functions): use primary client for credit lookup in batch-generate and canvas-media"
```

---

## Task 6: Fix check-subscription, upgrade-subscription, stripe-webhook

**Files:**
- Modify: `supabase/functions/check-subscription/index.ts:173-289`
- Modify: `supabase/functions/upgrade-subscription/index.ts:62-128`
- Modify: `supabase/functions/stripe-webhook/index.ts:62-68`

- [ ] **Step 1: Fix check-subscription**

Add `getPrimaryClientId` helper. Then:

Replace line ~176 SELECT:
```typescript
const { data: clientRow } = await supabaseClient
  .from("clients")
  .select("id, credits_balance")
  .eq("user_id", user.id)
  .maybeSingle();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(adminClient, user.id);
const { data: clientRow } = primaryClientId
  ? await supabaseClient.from("clients").select("id, credits_balance").eq("id", primaryClientId).maybeSingle()
  : { data: null };
```

Replace line ~214 UPDATE (and line ~289 if similar):
```typescript
.from("clients").update(clientUpdate).eq("user_id", user.id)
```

With:
```typescript
.from("clients").update(clientUpdate).eq("id", primaryClientId)
```

This is the critical fix — prevents bulk-updating ALL clients.

- [ ] **Step 2: Fix upgrade-subscription**

Add `getPrimaryClientId` helper. Then:

Replace line ~65 SELECT (uses `.single()` which will crash):
```typescript
const { data: clientData, error: clientError } = await supabaseClient
  .from("clients")
  .select("stripe_customer_id, plan_type")
  .eq("user_id", user.id)
  .single();
```

With:
```typescript
const primaryClientId = await getPrimaryClientId(supabaseClient, user.id);
if (!primaryClientId) {
  throw new Error("No client record found for this user");
}
const { data: clientData, error: clientError } = await supabaseClient
  .from("clients")
  .select("stripe_customer_id, plan_type")
  .eq("id", primaryClientId)
  .single();
```

Replace line ~128 UPDATE:
```typescript
.from("clients").update({...}).eq("user_id", user.id)
```

With:
```typescript
.from("clients").update({...}).eq("id", primaryClientId)
```

Also update the `client_limit` on subscriptions when plan changes:
```typescript
// After successful Stripe subscription update, also set client_limit
const CLIENT_LIMITS: Record<string, number> = {
  starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
};
await supabaseClient.from("subscriptions")
  .update({ client_limit: CLIENT_LIMITS[new_plan_type] || 1 })
  .eq("user_id", user.id);
```

- [ ] **Step 3: Fix stripe-webhook**

Add `getPrimaryClientId` helper. Replace `getClientBySubscription` function (lines ~62-68):

```typescript
async function getClientBySubscription(
  adminClient: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
): Promise<string | null> {
  // Primary: metadata.supabase_user_id → subscriber_clients → primary client
  const userId = sub.metadata?.supabase_user_id;
  if (userId) {
    const { data: link } = await adminClient
      .from("subscriber_clients")
      .select("client_id")
      .eq("subscriber_user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (link?.client_id) return link.client_id;

    // Fallback: direct user_id match on clients (for legacy data)
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Fallback: stripe_customer_id
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}
```

Also, where `subscription.created` handler sets up client_limit:
```typescript
// After upserting subscriptions record, set client_limit
const CLIENT_LIMITS: Record<string, number> = {
  starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
};
await adminClient.from("subscriptions")
  .update({ client_limit: CLIENT_LIMITS[planType] || 1 })
  .eq("user_id", userId);
```

And ensure the junction entry exists for new subscribers:
```typescript
// Ensure subscriber_clients entry exists
await adminClient.from("subscriber_clients").upsert({
  subscriber_user_id: userId,
  client_id: clientId,
  is_primary: true,
}, { onConflict: "subscriber_user_id,client_id" });
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/check-subscription/index.ts supabase/functions/upgrade-subscription/index.ts supabase/functions/stripe-webhook/index.ts
git commit -m "fix(edge-functions): target primary client in subscription and webhook handlers"
```

---

## Task 7: Fix create-subscriber-user Edge Function

**Files:**
- Modify: `supabase/functions/create-subscriber-user/index.ts:158-159`

- [ ] **Step 1: Add junction table entry after client creation**

After the existing client upsert (around line 158), add:

```typescript
// Create subscriber_clients junction entry
await adminClient.from("subscriber_clients").upsert({
  subscriber_user_id: userId,
  client_id: clientRecord.id,
  is_primary: true,
}, { onConflict: "subscriber_user_id,client_id" });
```

Where `clientRecord` is the result of the existing client insert/upsert. You may need to capture the client ID from the upsert result. Check the existing code — if it uses `.select()` after upsert, use that ID. If not, add `.select("id").single()` to capture it.

Also set `client_limit` on the subscription record:
```typescript
const CLIENT_LIMITS: Record<string, number> = {
  starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
};
// After creating/updating subscription record
await adminClient.from("subscriptions")
  .update({ client_limit: CLIENT_LIMITS[plan_type] || 1 })
  .eq("email", email);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-subscriber-user/index.ts
git commit -m "feat(create-subscriber-user): create junction table entry on subscriber signup"
```

---

## Task 8: New Hook — usePrimaryClient

**Files:**
- Create: `src/hooks/usePrimaryClient.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";

interface PrimaryClient {
  id: string;
  name: string;
  plan_type: string | null;
  subscription_status: string | null;
  credits_balance: number;
  credits_used: number;
  credits_monthly_cap: number;
  scripts_used: number;
  script_limit: number;
  channel_scrapes_used: number;
  channel_scrapes_limit: number;
  trial_ends_at: string | null;
  credits_reset_at: string | null;
  stripe_customer_id: string | null;
}

export function usePrimaryClient() {
  const { user } = useAuth();
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const [primaryClient, setPrimaryClient] = useState<PrimaryClient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchPrimary() {
      // Try junction table first
      const { data: link } = await supabase
        .from("subscriber_clients")
        .select("client_id, clients(id, name, plan_type, subscription_status, credits_balance, credits_used, credits_monthly_cap, scripts_used, script_limit, channel_scrapes_used, channel_scrapes_limit, trial_ends_at, credits_reset_at, stripe_customer_id)")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();

      if (link?.client_id && link.clients) {
        setPrimaryClientId(link.client_id);
        setPrimaryClient(link.clients as unknown as PrimaryClient);
        setLoading(false);
        return;
      }

      // Fallback: direct user_id lookup (for users without junction entry yet)
      const { data: fallback } = await supabase
        .from("clients")
        .select("id, name, plan_type, subscription_status, credits_balance, credits_used, credits_monthly_cap, scripts_used, script_limit, channel_scrapes_used, channel_scrapes_limit, trial_ends_at, credits_reset_at, stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fallback) {
        setPrimaryClientId(fallback.id);
        setPrimaryClient(fallback as PrimaryClient);
      }
      setLoading(false);
    }

    fetchPrimary();
  }, [user]);

  const refetch = async () => {
    if (!user) return;
    setLoading(true);
    const { data: link } = await supabase
      .from("subscriber_clients")
      .select("client_id, clients(id, name, plan_type, subscription_status, credits_balance, credits_used, credits_monthly_cap, scripts_used, script_limit, channel_scrapes_used, channel_scrapes_limit, trial_ends_at, credits_reset_at, stripe_customer_id)")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    if (link?.client_id && link.clients) {
      setPrimaryClientId(link.client_id);
      setPrimaryClient(link.clients as unknown as PrimaryClient);
    }
    setLoading(false);
  };

  return { primaryClientId, primaryClient, loading, refetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePrimaryClient.ts
git commit -m "feat: add usePrimaryClient hook for junction table lookups"
```

---

## Task 9: Fix useSubscriptionGuard

**Files:**
- Modify: `src/hooks/useSubscriptionGuard.ts:49-87`

- [ ] **Step 1: Replace .maybeSingle() client lookups**

Import and use the primary client approach. Replace lines ~49-53:

```typescript
const { data, error } = await supabase
  .from("clients")
  .select("subscription_status, plan_type")
  .eq("user_id", user.id)
  .maybeSingle();
```

With:

```typescript
// Try junction table first (primary client holds subscription data)
let data: { subscription_status: string | null; plan_type: string | null } | null = null;
let error: any = null;

const { data: link } = await supabase
  .from("subscriber_clients")
  .select("client_id")
  .eq("subscriber_user_id", user.id)
  .eq("is_primary", true)
  .maybeSingle();

if (link?.client_id) {
  const result = await supabase
    .from("clients")
    .select("subscription_status, plan_type")
    .eq("id", link.client_id)
    .single();
  data = result.data;
  error = result.error;
} else {
  // Fallback: direct user_id lookup
  const result = await supabase
    .from("clients")
    .select("subscription_status, plan_type")
    .eq("user_id", user.id)
    .maybeSingle();
  data = result.data;
  error = result.error;
}
```

Do the same for the second fetch around lines ~86-87 if it exists (after reconciliation).

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSubscriptionGuard.ts
git commit -m "fix(useSubscriptionGuard): use primary client via junction table"
```

---

## Task 10: Fix useCredits Hook

**Files:**
- Modify: `src/hooks/useCredits.ts:39-43`

- [ ] **Step 1: Replace .maybeSingle() client lookup**

Replace lines ~39-43:

```typescript
const { data: clientData, error: clientError } = await supabase
  .from("clients")
  .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at")
  .eq("user_id", user.id)
  .maybeSingle();
```

With:

```typescript
// Look up primary client via junction table
const { data: link } = await supabase
  .from("subscriber_clients")
  .select("client_id")
  .eq("subscriber_user_id", user.id)
  .eq("is_primary", true)
  .maybeSingle();

let clientData: any = null;
let clientError: any = null;

if (link?.client_id) {
  const result = await supabase
    .from("clients")
    .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at")
    .eq("id", link.client_id)
    .single();
  clientData = result.data;
  clientError = result.error;
} else {
  // Fallback: direct user_id lookup
  const result = await supabase
    .from("clients")
    .select("id, credits_balance, credits_used, credits_monthly_cap, credits_reset_at, channel_scrapes_used, channel_scrapes_limit, plan_type, subscription_status, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();
  clientData = result.data;
  clientError = result.error;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCredits.ts
git commit -m "fix(useCredits): use primary client via junction table"
```

---

## Task 11: Fix Dashboard.tsx — Enable Multi-Client for Subscribers

**Files:**
- Modify: `src/pages/Dashboard.tsx:100, 103-111, 124-134, 137-146`

- [ ] **Step 1: Update showClientSelector**

Change line ~100 from:
```typescript
const showClientSelector = isAdmin || isVideographer;
```
To:
```typescript
const showClientSelector = isAdmin || isVideographer || isUser;
```

- [ ] **Step 2: Remove subscriber viewMode reset**

Delete or comment out lines ~103-111:
```typescript
// REMOVED: subscribers can now switch between clients
// useEffect(() => {
//   if (isUser && !isAdmin && !isVideographer && !isEditor) {
//     const stored = localStorage.getItem("dashboard_viewMode");
//     if (stored && stored !== "master" && stored !== "me") {
//       localStorage.setItem("dashboard_viewMode", "master");
//       setViewMode("master");
//     }
//   }
// }, [isUser, isAdmin, isVideographer, isEditor]);
```

- [ ] **Step 3: Update ownClientId fetch to use junction table**

Replace lines ~124-134:
```typescript
useEffect(() => {
  if (!user) return;
  supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data) setOwnClientId(data.id);
    });
}, [user]);
```

With:
```typescript
useEffect(() => {
  if (!user) return;
  // Look up primary client via junction table
  supabase
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle()
    .then(({ data }) => {
      if (data?.client_id) {
        setOwnClientId(data.client_id);
      } else {
        // Fallback: direct user_id lookup
        supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data: fallback }) => {
            if (fallback) setOwnClientId(fallback.id);
          });
      }
    });
}, [user]);
```

- [ ] **Step 4: Update client list fetch for subscribers**

Replace lines ~137-146. The existing `showClientSelector` guard now includes `isUser`, so the fetch will run for subscribers. But subscribers should fetch via junction table:

```typescript
useEffect(() => {
  if (!user || !showClientSelector) return;

  if (isUser) {
    // Subscribers: fetch via junction table
    supabase
      .from("subscriber_clients")
      .select("client_id, is_primary, clients(id, name)")
      .eq("subscriber_user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at")
      .then(({ data }) => {
        if (data) {
          setClients(data.map((d: any) => ({
            id: d.clients.id,
            name: d.clients.name,
            is_primary: d.is_primary,
          })));
        }
      });
  } else {
    // Admin/videographer: existing fetch
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setClients(data);
      });
  }
}, [user, showClientSelector, isUser]);
```

- [ ] **Step 5: Fix free-tier init fetches (lines ~172-176, ~201-206)**

Replace both `.eq("user_id", user.id).maybeSingle()` calls with the junction table pattern:
```typescript
// Use primaryClientId if already resolved, or look up via junction table
const lookupId = ownClientId;
if (lookupId) {
  const { data: existing } = await supabase
    .from("clients")
    .select("id, plan_type")
    .eq("id", lookupId)
    .maybeSingle();
  // ... rest of logic using existing
}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): enable multi-client selector and junction table lookups for subscribers"
```

---

## Task 12: Fix DashboardSidebar.tsx — Subscriber Selector + Dynamic Nav

**Files:**
- Modify: `src/components/DashboardSidebar.tsx:34, 61-83, 194-206, 249+`

- [ ] **Step 1: Update showClientSelector**

Change line ~34 from:
```typescript
const showClientSelector = isAdmin || isVideographer;
```
To:
```typescript
const showClientSelector = isAdmin || isVideographer || isUser;
```

- [ ] **Step 2: Update ownClientId fetch to use junction table**

Replace lines ~61-71:
```typescript
useEffect(() => {
  if (!user) return;
  supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data) setOwnClientId(data.id);
    });
}, [user]);
```

With:
```typescript
useEffect(() => {
  if (!user) return;
  supabase
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle()
    .then(({ data }) => {
      if (data?.client_id) {
        setOwnClientId(data.client_id);
      } else {
        // Fallback
        supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle()
          .then(({ data: fb }) => { if (fb) setOwnClientId(fb.id); });
      }
    });
}, [user]);
```

- [ ] **Step 3: Update client list fetch for subscribers**

Replace lines ~74-83. Same pattern as Dashboard — subscribers fetch via junction table:
```typescript
useEffect(() => {
  if (!user || !showClientSelector) return;

  if (isUser) {
    supabase
      .from("subscriber_clients")
      .select("client_id, is_primary, clients(id, name)")
      .eq("subscriber_user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at")
      .then(({ data }) => {
        if (data) {
          setClients(data.map((d: any) => ({
            id: d.clients.id,
            name: d.clients.name,
          })));
        }
      });
  } else {
    supabase.from("clients").select("id, name").order("name")
      .then(({ data }) => { if (data) setClients(data); });
  }
}, [user, showClientSelector, isUser]);
```

- [ ] **Step 4: Update subscriber nav items — dynamic selectedClientId**

Replace the `isUser` nav block (lines ~194-206). Compute `selectedClientId` from viewMode:

```typescript
if (isUser) {
  const selectedClientId = viewMode === "master" ? null : viewMode === "me" ? ownClientId : viewMode;
  return [
    { label: tr(t.dashboard.home, language), icon: Home, path: "/dashboard" },
    { label: language === "en" ? "My Clients" : "Mis Clientes", icon: Users, path: "/clients" },
    { label: "Connecta AI", icon: Bot, path: selectedClientId ? `/clients/${selectedClientId}/scripts?view=canvas` : "/scripts?view=canvas" },
    { label: tr(t.dashboard.scripts, language), icon: FileText, path: selectedClientId ? `/clients/${selectedClientId}/scripts` : "/scripts" },
    { label: "Editing Queue", icon: Clapperboard, path: selectedClientId ? `/clients/${selectedClientId}/editing-queue` : "/editing-queue" },
    { label: "Content Calendar", icon: Calendar, path: selectedClientId ? `/clients/${selectedClientId}/content-calendar` : "/content-calendar" },
    ...(selectedClientId ? [{ label: "Booking", icon: Clock, path: `/clients/${selectedClientId}/booking-settings` }] : []),
    { label: tr(t.dashboard.leadTracker, language), icon: Target, path: selectedClientId ? `/clients/${selectedClientId}/leads` : "/leads" },
    { label: "Viral Today", icon: Flame, path: "/viral-today" },
    { label: tr(t.subscription.navLabel, language), icon: CreditCard, path: "/subscription" },
    { label: tr(t.dashboard.settings, language), icon: Settings, path: "/settings" },
  ];
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(sidebar): enable client selector and dynamic nav for subscribers"
```

---

## Task 13: Subscriber Dropdown Enhancements — Count Badge, PRIMARY Label, Add Client

**Files:**
- Modify: `src/components/DashboardSidebar.tsx:249+` (client selector dropdown area)

The existing client selector dropdown (rendered in the `{showClientSelector && ...}` block starting around line 249) needs subscriber-specific additions. Admin/videographer dropdown stays unchanged — these additions are conditional on `isUser`.

- [ ] **Step 1: Add state for client limit and inline add mode**

Add to the component's state section:
```typescript
const [clientLimit, setClientLimit] = useState(5);
const [addingClient, setAddingClient] = useState(false);
const [newClientName, setNewClientName] = useState("");
```

Add a useEffect to fetch the client limit:
```typescript
useEffect(() => {
  if (!user || !isUser) return;
  supabase
    .from("subscriptions")
    .select("client_limit")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data?.client_limit) setClientLimit(data.client_limit);
    });
}, [user, isUser]);
```

- [ ] **Step 2: Add count badge to selector trigger button**

In the client selector trigger button (around line 252-256), add a count badge for subscribers. Find the button that shows `selectedClientName` and add:

```tsx
{/* After the selectedClientName span, add count badge for subscribers */}
{isUser && (
  <span style={{ fontSize: 10, color: '#888', marginLeft: 'auto', marginRight: 4 }}>
    {clients.length}/{clientLimit}
  </span>
)}
```

- [ ] **Step 3: Add PRIMARY label to "Me" entry in dropdown**

In the dropdown list where "Me" is rendered (around line 390), add a PRIMARY badge:

```tsx
{/* Inside the "Me" option div */}
<span className="flex-1 text-left truncate text-[#cccccc]">
  Me {isUser && <span style={{ fontSize: 9, color: '#22d3ee', marginLeft: 4 }}>PRIMARY</span>}
</span>
```

- [ ] **Step 4: Add "+ Add Client" button at bottom of dropdown**

After the client list map (around line 425), add the inline add-client section for subscribers:

```tsx
{isUser && !addingClient && clients.length < clientLimit && (
  <button
    onClick={(e) => { e.stopPropagation(); setAddingClient(true); }}
    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
    style={{ color: '#22d3ee' }}
  >
    <span style={{ fontSize: 16 }}>+</span>
    <span className="flex-1 text-left">{language === "en" ? "Add Client" : "Agregar Cliente"}</span>
    <span style={{ fontSize: 10, color: '#666' }}>{clientLimit - clients.length} left</span>
  </button>
)}

{isUser && addingClient && (
  <div className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
    <input
      autoFocus
      value={newClientName}
      onChange={(e) => setNewClientName(e.target.value)}
      placeholder={language === "en" ? "Client name..." : "Nombre del cliente..."}
      className="w-full px-2 py-1.5 rounded-md text-sm text-white bg-[rgba(255,255,255,0.08)] border border-[rgba(34,211,238,0.3)] outline-none"
      onKeyDown={async (e) => {
        if (e.key === "Enter" && newClientName.trim()) {
          const { data: newClient, error } = await supabase
            .from("clients")
            .insert({ name: newClientName.trim(), owner_user_id: user!.id })
            .select("id")
            .single();
          if (!error && newClient) {
            await supabase.from("subscriber_clients").insert({
              subscriber_user_id: user!.id,
              client_id: newClient.id,
              is_primary: false,
            });
            // Switch to new client
            handleViewModeChange(newClient.id);
            setNewClientName("");
            setAddingClient(false);
            // Re-fetch client list
            supabase
              .from("subscriber_clients")
              .select("client_id, is_primary, clients(id, name)")
              .eq("subscriber_user_id", user!.id)
              .order("is_primary", { ascending: false })
              .order("created_at")
              .then(({ data }) => {
                if (data) setClients(data.map((d: any) => ({ id: d.clients.id, name: d.clients.name })));
              });
          }
        }
        if (e.key === "Escape") {
          setNewClientName("");
          setAddingClient(false);
        }
      }}
    />
    <div className="flex gap-1 mt-1">
      <button
        onClick={async () => {
          if (!newClientName.trim()) return;
          const { data: newClient, error } = await supabase
            .from("clients")
            .insert({ name: newClientName.trim(), owner_user_id: user!.id })
            .select("id")
            .single();
          if (!error && newClient) {
            await supabase.from("subscriber_clients").insert({
              subscriber_user_id: user!.id,
              client_id: newClient.id,
              is_primary: false,
            });
            handleViewModeChange(newClient.id);
            setNewClientName("");
            setAddingClient(false);
          }
        }}
        className="flex-1 py-1 text-xs font-semibold rounded-md"
        style={{ background: '#22d3ee', color: 'black' }}
      >
        {language === "en" ? "Create" : "Crear"}
      </button>
      <button
        onClick={() => { setNewClientName(""); setAddingClient(false); }}
        className="flex-1 py-1 text-xs rounded-md"
        style={{ background: 'rgba(255,255,255,0.08)', color: '#888' }}
      >
        {language === "en" ? "Cancel" : "Cancelar"}
      </button>
    </div>
  </div>
)}

{isUser && clients.length >= clientLimit && (
  <div className="px-3 py-2 text-xs text-center" style={{ color: '#888' }}>
    {language === "en" ? "Client limit reached — " : "Límite alcanzado — "}
    <a href="/subscription" style={{ color: '#22d3ee' }}>
      {language === "en" ? "upgrade" : "mejorar plan"}
    </a>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardSidebar.tsx
git commit -m "feat(sidebar): add subscriber dropdown enhancements — count badge, PRIMARY label, inline add client"
```

---

## Task 14: Fix Scripts.tsx and LeadTracker.tsx

**Files:**
- Modify: `src/pages/Scripts.tsx:454-455`
- Modify: `src/pages/LeadTracker.tsx:116-125`

- [ ] **Step 1: Fix Scripts.tsx client name lookup**

Replace lines ~454-455:
```typescript
const [{ data: profile }, { data: client }] = await Promise.all([
  supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
  supabase.from("clients").select("name").eq("user_id", user.id).maybeSingle(),
]);
```

With:
```typescript
// Profiles lookup stays the same (profiles are per-user, not per-client)
const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();

// Client name: use junction table
const { data: link } = await supabase
  .from("subscriber_clients")
  .select("client_id, clients(name)")
  .eq("subscriber_user_id", user.id)
  .eq("is_primary", true)
  .maybeSingle();
const client = link?.clients ? { name: (link.clients as any).name } : null;

// Fallback if no junction entry
if (!client) {
  const { data: fb } = await supabase.from("clients").select("name").eq("user_id", user.id).maybeSingle();
  // use fb as client
}
```

Also update the client name update call (line ~482) to use the primary client ID instead of `.eq("user_id", user.id)`.

- [ ] **Step 2: Fix LeadTracker.tsx client lookup**

Replace lines ~116-125:
```typescript
supabase
  .from("clients")
  .select("id, plan_type")
  .eq("user_id", user.id)
  .maybeSingle()
  .then(({ data }) => {
    if (data) {
      setOwnClientId(data.id);
      const pt = data.plan_type;
      setIsSubscriber(pt === "starter" || pt === "growth" || pt === "enterprise");
    }
  });
```

With:
```typescript
// Junction table lookup
supabase
  .from("subscriber_clients")
  .select("client_id, clients(id, plan_type)")
  .eq("subscriber_user_id", user.id)
  .eq("is_primary", true)
  .maybeSingle()
  .then(({ data }) => {
    if (data?.client_id && data.clients) {
      const c = data.clients as any;
      setOwnClientId(c.id);
      const pt = c.plan_type;
      setIsSubscriber(pt === "starter" || pt === "growth" || pt === "enterprise");
    } else {
      // Fallback: direct lookup
      supabase.from("clients").select("id, plan_type").eq("user_id", user.id).maybeSingle()
        .then(({ data: fb }) => {
          if (fb) {
            setOwnClientId(fb.id);
            const pt = fb.plan_type;
            setIsSubscriber(pt === "starter" || pt === "growth" || pt === "enterprise");
          }
        });
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Scripts.tsx src/pages/LeadTracker.tsx
git commit -m "fix(scripts,leads): use primary client via junction table"
```

---

## Task 15: Update Clients.tsx — Subscriber Card View + Junction Table

**Files:**
- Modify: `src/pages/Clients.tsx:62-127`

- [ ] **Step 1: Update MAX_CLIENTS to be plan-based**

Replace line ~64:
```typescript
const MAX_CLIENTS = 20;
```

With:
```typescript
const [clientLimit, setClientLimit] = useState(5);

// Fetch client limit from subscriptions table
useEffect(() => {
  if (!user || !isUser) return;
  supabase
    .from("subscriptions")
    .select("client_limit")
    .eq("user_id", user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data?.client_limit) setClientLimit(data.client_limit);
    });
}, [user, isUser]);
```

- [ ] **Step 2: Update handleAddClient to use junction table**

Replace the existing handleAddClient (lines ~66-91). After inserting the client, also insert into `subscriber_clients`:

```typescript
const handleAddClient = async () => {
  if (!newClientName.trim() || !user) return;
  if (isUser && clients.length >= clientLimit) {
    toast.error(language === "en"
      ? `You've reached your ${clientLimit}-client limit. Upgrade your plan for more.`
      : `Has alcanzado el límite de ${clientLimit} clientes. Mejora tu plan para más.`);
    return;
  }
  setAdding(true);
  const insertData: any = {
    name: newClientName.trim(),
    email: newClientEmail.trim() || null,
  };
  if (isUser) {
    insertData.owner_user_id = user.id;
  }
  const { data: newClient, error } = await supabase.from("clients").insert(insertData).select("id").single();

  if (!error && newClient && isUser) {
    // Create junction table entry (non-primary)
    await supabase.from("subscriber_clients").insert({
      subscriber_user_id: user.id,
      client_id: newClient.id,
      is_primary: false,
    });
  }

  if (error) {
    toast.error(language === "en" ? "Failed to create client" : "Error al crear cliente");
  } else {
    toast.success(language === "en" ? "Client created!" : "¡Cliente creado!");
    setNewClientName("");
    setNewClientEmail("");
    fetchClients();
  }
  setAdding(false);
};
```

- [ ] **Step 3: Update subscriber client fetch to use junction table**

Replace lines ~120-127:
```typescript
} else if (isUser) {
  const { data } = await supabase
    .from("clients")
    .select("id, name, email, user_id")
    .eq("owner_user_id", user.id)
    .order("name");
  setClients(data || []);
}
```

With:
```typescript
} else if (isUser) {
  const { data } = await supabase
    .from("subscriber_clients")
    .select("client_id, is_primary, clients(id, name, email, created_at)")
    .eq("subscriber_user_id", user.id)
    .order("is_primary", { ascending: false })
    .order("created_at");
  if (data) {
    setClients(data.map((d: any) => ({
      id: d.clients.id,
      name: d.clients.name,
      email: d.clients.email,
      is_primary: d.is_primary,
      created_at: d.clients.created_at,
    })));
  }
}
```

- [ ] **Step 4: Update client limit check in UI**

Update the limit display text and "Add Client" button disabled state to use `clientLimit` instead of the old `MAX_CLIENTS`. Show `{clients.length} of {clientLimit} client slots used`.

- [ ] **Step 5: Add delete handler with primary protection**

```typescript
const handleDeleteClient = async (clientId: string, isPrimary: boolean) => {
  if (isPrimary) return; // Can't delete primary
  if (!confirm(language === "en" ? "Delete this client and all their data?" : "¿Eliminar este cliente y todos sus datos?")) return;

  // Delete junction entry (CASCADE will handle client record too, or delete both)
  await supabase.from("subscriber_clients")
    .delete()
    .eq("subscriber_user_id", user!.id)
    .eq("client_id", clientId);
  await supabase.from("clients").delete().eq("id", clientId);

  toast.success(language === "en" ? "Client deleted" : "Cliente eliminado");
  fetchClients();
};
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Clients.tsx
git commit -m "feat(clients): junction table integration, plan-based limits, delete protection"
```

---

## Task 16: Build and Deploy

**Files:**
- All modified files

- [ ] **Step 1: Build the frontend**

```bash
npm run build
```

Fix any TypeScript errors that come up. Common issues:
- Type mismatches on the junction table join results (cast with `as any` or proper typing)
- Missing imports for new hooks

- [ ] **Step 2: Deploy edge functions**

Deploy all modified edge functions:
```bash
npx supabase functions deploy transcribe-video
npx supabase functions deploy ai-assistant
npx supabase functions deploy batch-generate-scripts
npx supabase functions deploy transcribe-canvas-media
npx supabase functions deploy check-subscription
npx supabase functions deploy upgrade-subscription
npx supabase functions deploy stripe-webhook
npx supabase functions deploy create-subscriber-user
```

- [ ] **Step 3: Deploy frontend to VPS**

SCP the built files to VPS and reload nginx:
```bash
scp -r dist/* root@72.62.200.145:/var/www/connectacreators/
ssh root@72.62.200.145 'nginx -s reload'
```

- [ ] **Step 4: Smoke test**

1. Log in as admin — verify existing behavior unchanged
2. Log in as a subscriber — verify:
   - Client selector appears in sidebar
   - "My Clients" page shows primary client
   - Can add a new client (name only)
   - New client appears in dropdown
   - Can switch between clients
   - Scripts/Calendar/Queue pages load for selected client
   - Credits display shows primary client balance
   - Can delete non-primary client
   - Can't delete primary client

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: subscriber multi-client management — complete implementation"
```
