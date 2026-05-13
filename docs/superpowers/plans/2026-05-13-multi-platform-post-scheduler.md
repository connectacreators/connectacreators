# Multi-Platform Post Scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agency users autopost / schedule / save-as-draft a single 9:16 video from `EditingQueue` to Facebook Reels, Instagram Reels, TikTok, and YouTube Shorts. Beta-gated behind three off-switches so it can be developed and locally tested without affecting prod.

**Architecture:** Per-client OAuth (Metricool-style). Three new tables (`social_connections`, `scheduled_posts`, `scheduled_post_targets`). `pg_cron` polls every 60s → dispatcher edge function → fans out to per-platform publisher functions with `FOR UPDATE SKIP LOCKED`. Per-platform retry with exponential backoff. AES-GCM token encryption in the edge function layer (no plaintext at rest).

**Tech Stack:** Supabase (Postgres + pg_cron + Edge Functions/Deno), React + Vite + TypeScript, shadcn/ui, Tailwind. Existing `facebook-oauth` edge function is extended; `tiktok-oauth`, `youtube-oauth`, `publish-scheduled-posts`, `publish-to-meta`, `publish-to-tiktok`, `publish-to-youtube` are new.

**Scope of this plan:** Phase A (Foundation + Meta) in full detail. Phase B (TikTok) and Phase C (YouTube) outlined at the end — each warrants its own detailed planning session once their respective platform approvals land.

**Reference spec:** [docs/superpowers/specs/2026-05-13-multi-platform-post-scheduler-design.md](../specs/2026-05-13-multi-platform-post-scheduler-design.md)

---

## File map for Phase A

**New files**
- `supabase/migrations/20260513_a01_scheduler_kill_switch.sql`
- `supabase/migrations/20260513_a02_scheduler_user_opt_in.sql`
- `supabase/migrations/20260513_a03_social_connections.sql`
- `supabase/migrations/20260513_a04_scheduled_posts.sql`
- `supabase/migrations/20260513_a05_scheduled_post_targets.sql`
- `supabase/migrations/20260513_a06_rollup_trigger.sql`
- `supabase/migrations/20260513_a07_scheduler_cron.sql`
- `supabase/functions/_shared/encryption.ts`
- `supabase/functions/_shared/socialConnections.ts`
- `supabase/functions/publish-scheduled-posts/index.ts`
- `supabase/functions/publish-to-meta/index.ts`
- `src/lib/featureFlags.ts`
- `src/lib/hooks/useSocialConnections.ts`
- `src/lib/hooks/useScheduledPosts.ts`
- `src/components/scheduler/SocialAccountsTab.tsx`
- `src/components/scheduler/SocialAccountCard.tsx`
- `src/components/scheduler/PublishComposer.tsx`
- `src/components/scheduler/PostStatusBadge.tsx`
- `src/components/scheduler/PostDetailsModal.tsx`
- `src/components/scheduler/ReauthBanner.tsx`

**Modified files**
- `supabase/functions/facebook-oauth/index.ts` — add publish scopes + scheduler-connect action
- `src/pages/ClientDetail.tsx` — mount social accounts tab
- `src/pages/EditingQueue.tsx` — replace schedule modal with `PublishComposer`
- `src/pages/ContentCalendar.tsx` — status tabs, per-platform badges, details modal
- `src/pages/FacebookCallback.tsx` — handle scheduler-connect return path
- `.env.example` — document new env vars

---

# Phase A — Foundation + Meta

## Setup

### Task A0: Create feature branch

**Files:**
- None (git operation)

- [ ] **Step 1: Create and check out a feature branch**

```bash
git checkout -b feat/post-scheduler-phase-a
```

- [ ] **Step 2: Verify branch is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean`

---

### Task A1: Confirm local Supabase boot

**Files:**
- None (verifies tooling)

- [ ] **Step 1: Confirm Supabase CLI is installed**

Run: `supabase --version`
Expected: prints a version (e.g. `1.x.x` or `2.x.x`). If missing, run `brew install supabase/tap/supabase` and retry.

- [ ] **Step 2: Start local Supabase**

Run: `supabase start`
Expected: prints local API URL, anon key, service_role key, and DB URL. Note the DB URL (e.g. `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

- [ ] **Step 3: Verify pg_cron extension can be loaded**

Run: `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "CREATE EXTENSION IF NOT EXISTS pg_cron; SELECT extversion FROM pg_extension WHERE extname='pg_cron';"`
Expected: prints a version row. If error, stop and report — pg_cron must be available locally before continuing.

- [ ] **Step 4: Verify pgcrypto extension is present** (used for `gen_random_uuid()` in later migrations)

Run: `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; SELECT extversion FROM pg_extension WHERE extname='pgcrypto';"`
Expected: prints a version row.

---

## Wave 1 — Beta gating foundation

### Task A2: Backend kill-switch table

**Files:**
- Create: `supabase/migrations/20260513_a01_scheduler_kill_switch.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a01_scheduler_kill_switch.sql
-- Single-row app_settings table for runtime feature gating.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),  -- single-row enforced
  scheduler_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, scheduler_enabled) VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- Service role reads; only admins write (no RLS read policy needed -- service role bypasses).
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated reads (so frontend can show "scheduler is currently disabled" message if desired)
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Apply locally and verify**

```bash
supabase db reset --local
# OR if you don't want to lose data:
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a01_scheduler_kill_switch.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT * FROM app_settings;"
```
Expected: one row with `scheduler_enabled = false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513_a01_scheduler_kill_switch.sql
git commit -m "feat(scheduler): add app_settings kill-switch table"
```

---

### Task A3: Per-user opt-in column

**Files:**
- Create: `supabase/migrations/20260513_a02_scheduler_user_opt_in.sql`

- [ ] **Step 1: Check whether `user_settings` table already exists**

Run: `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\dt user_settings"`

- If exists: write the migration as an `ALTER TABLE ADD COLUMN` (Step 2a).
- If missing: write the migration to create it (Step 2b).

- [ ] **Step 2a: Migration if table exists**

```sql
-- 20260513_a02_scheduler_user_opt_in.sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS scheduler_beta_enabled boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2b: Migration if table missing**

```sql
-- 20260513_a02_scheduler_user_opt_in.sql
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduler_beta_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_owner ON public.user_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 3: Apply and verify**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a02_scheduler_user_opt_in.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\d user_settings"
```
Expected: `scheduler_beta_enabled boolean` column present, default false.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513_a02_scheduler_user_opt_in.sql
git commit -m "feat(scheduler): add scheduler_beta_enabled user opt-in"
```

---

### Task A4: Frontend feature flag utility

**Files:**
- Create: `src/lib/featureFlags.ts`
- Modify: `.env.example` (add new var documentation; create file if missing)

- [ ] **Step 1: Write the flag utility**

```typescript
// src/lib/featureFlags.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true when BOTH gates pass:
 *  - VITE_FEATURE_SCHEDULER is "true" at build time
 *  - The signed-in user has scheduler_beta_enabled = true in user_settings
 *
 * In dev (VITE_FEATURE_SCHEDULER=true) the env gate is open and only the
 * per-user opt-in matters. In prod, set the env to "false" to fully hide
 * the feature for everyone regardless of opt-in.
 */
export function useSchedulerEnabled(): { enabled: boolean; loading: boolean } {
  const envGate = import.meta.env.VITE_FEATURE_SCHEDULER === "true";
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(envGate);

  useEffect(() => {
    if (!envGate) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setEnabled(false); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("user_settings")
        .select("scheduler_beta_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setEnabled(Boolean(data?.scheduler_beta_enabled));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [envGate]);

  return { enabled, loading };
}

export const FEATURE_SCHEDULER_ENV = import.meta.env.VITE_FEATURE_SCHEDULER === "true";
```

- [ ] **Step 2: Add env var docs**

If `.env.example` exists, append:
```
# Multi-platform post scheduler (beta). When "true", users with
# user_settings.scheduler_beta_enabled=true see the scheduler UI.
VITE_FEATURE_SCHEDULER=false
```
If `.env.example` doesn't exist, create it with just that block.

- [ ] **Step 3: Set local env**

Edit your local `.env` (not committed) and add `VITE_FEATURE_SCHEDULER=true` so you see the UI while developing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/featureFlags.ts .env.example
git commit -m "feat(scheduler): add useSchedulerEnabled feature flag hook"
```

---

## Wave 2 — Token encryption + social_connections

### Task A5: Shared AES-GCM encryption utility (edge functions)

**Files:**
- Create: `supabase/functions/_shared/encryption.ts`

- [ ] **Step 1: Write the encryption utility**

```typescript
// supabase/functions/_shared/encryption.ts
// AES-GCM token encryption. Key is provided via SCHEDULER_TOKEN_KEY env var
// as a base64-encoded 32-byte (256-bit) random key. Generate one with:
//   openssl rand -base64 32
//
// Storage format (base64-encoded for jsonb-friendliness, hex-decoded by SQL bytea casts when needed):
//   <12 bytes IV>||<ciphertext>||<16 bytes auth tag>   -- all concatenated, then base64.
// Web Crypto's AES-GCM appends the auth tag to the ciphertext, so we just prepend the IV.

const KEY_ENV = "SCHEDULER_TOKEN_KEY";

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function bytesToB64(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get(KEY_ENV);
  if (!raw) throw new Error(`${KEY_ENV} env var is required for token encryption`);
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain))
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptToken(cipherB64: string): Promise<string> {
  const key = await getKey();
  const bundle = b64ToBytes(cipherB64);
  const iv = bundle.slice(0, 12);
  const ct = bundle.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
```

- [ ] **Step 2: Generate a local encryption key**

Run: `openssl rand -base64 32`
Copy the output, add to your local `.env` for edge functions (Supabase reads this when you run `supabase functions serve`):

```
SCHEDULER_TOKEN_KEY=<paste-output-here>
```

(File location: `supabase/.env` for local edge function env, NOT the Vite `.env`.)

- [ ] **Step 3: Smoke-test the utility via Deno REPL**

```bash
SCHEDULER_TOKEN_KEY=$(openssl rand -base64 32) deno eval '
  import { encryptToken, decryptToken } from "./supabase/functions/_shared/encryption.ts";
  const c = await encryptToken("hello-world");
  console.log("ciphertext:", c);
  console.log("decrypted:", await decryptToken(c));
'
```
Expected: prints a base64 ciphertext, then `decrypted: hello-world`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/encryption.ts
git commit -m "feat(scheduler): AES-GCM token encryption shared utility"
```

---

### Task A6: `social_connections` table

**Files:**
- Create: `supabase/migrations/20260513_a03_social_connections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a03_social_connections.sql
-- Per-client OAuth connections for publishing to social platforms.
-- access_token / refresh_token are stored as base64 strings of AES-GCM
-- ciphertext (see supabase/functions/_shared/encryption.ts). Only edge
-- functions with SCHEDULER_TOKEN_KEY can decrypt.

CREATE TABLE IF NOT EXISTS public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  account_label text NOT NULL,
  platform_account_id text NOT NULL,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','needs_reauth','revoked')),
  connected_by uuid REFERENCES auth.users(id),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_error text,
  UNIQUE (client_id, platform, platform_account_id)
);

CREATE INDEX idx_social_connections_client ON public.social_connections (client_id, platform, status);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Agency users who have access to the client can read/manage its connections.
-- This mirrors the existing pattern used for other client-scoped tables.
CREATE POLICY social_connections_client_access ON public.social_connections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = social_connections.client_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = social_connections.client_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  );
```

> **Note:** If the project uses different access-control tables than `client_members`, adapt the policy to match the existing pattern from `facebook_pages` (run `\d+ facebook_pages` to see how the existing RLS policies are written, copy the same approach). If you're unsure, do a quick grep — don't guess.

- [ ] **Step 2: Verify the existing clients-access RLS pattern**

Run: `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\d+ facebook_pages"`
Look for the policy definitions. If `facebook_pages` uses a different pattern (e.g. just `client_id IN (SELECT id FROM clients WHERE owner_id = auth.uid())`), update Step 1's policy to match before applying.

- [ ] **Step 3: Apply and verify**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a03_social_connections.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\d+ social_connections"
```
Expected: table exists with all columns, RLS enabled, index created.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513_a03_social_connections.sql
git commit -m "feat(scheduler): social_connections table"
```

---

### Task A7: Shared socialConnections helper (edge functions)

**Files:**
- Create: `supabase/functions/_shared/socialConnections.ts`

- [ ] **Step 1: Write the helper**

```typescript
// supabase/functions/_shared/socialConnections.ts
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "./encryption.ts";

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube";

export interface SocialConnection {
  id: string;
  client_id: string;
  platform: Platform;
  account_label: string;
  platform_account_id: string;
  access_token: string;          // decrypted
  refresh_token: string | null;  // decrypted, null if none
  token_expires_at: string | null;
  scopes: string[];
  status: "active" | "needs_reauth" | "revoked";
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function upsertConnection(
  sb: SupabaseClient,
  args: {
    client_id: string;
    platform: Platform;
    account_label: string;
    platform_account_id: string;
    access_token: string;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    scopes: string[];
    connected_by?: string | null;
  }
) {
  const access_token_enc = await encryptToken(args.access_token);
  const refresh_token_enc = args.refresh_token ? await encryptToken(args.refresh_token) : null;
  const { data, error } = await sb
    .from("social_connections")
    .upsert(
      {
        client_id: args.client_id,
        platform: args.platform,
        account_label: args.account_label,
        platform_account_id: args.platform_account_id,
        access_token_enc,
        refresh_token_enc,
        token_expires_at: args.token_expires_at ?? null,
        scopes: args.scopes,
        status: "active",
        connected_by: args.connected_by ?? null,
        last_error: null,
      },
      { onConflict: "client_id,platform,platform_account_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getConnection(sb: SupabaseClient, id: string): Promise<SocialConnection> {
  const { data, error } = await sb
    .from("social_connections")
    .select("id, client_id, platform, account_label, platform_account_id, access_token_enc, refresh_token_enc, token_expires_at, scopes, status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    client_id: data.client_id,
    platform: data.platform,
    account_label: data.account_label,
    platform_account_id: data.platform_account_id,
    access_token: await decryptToken(data.access_token_enc),
    refresh_token: data.refresh_token_enc ? await decryptToken(data.refresh_token_enc) : null,
    token_expires_at: data.token_expires_at,
    scopes: data.scopes ?? [],
    status: data.status,
  };
}

export async function markNeedsReauth(sb: SupabaseClient, id: string, reason: string) {
  await sb
    .from("social_connections")
    .update({ status: "needs_reauth", last_error: reason })
    .eq("id", id);
}

export async function recordUse(sb: SupabaseClient, id: string) {
  await sb.from("social_connections").update({ last_used_at: new Date().toISOString() }).eq("id", id);
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/socialConnections.ts
git commit -m "feat(scheduler): shared socialConnections edge fn helper"
```

---

### Task A8: Extend `facebook-oauth` for scheduler-connect

**Files:**
- Modify: `supabase/functions/facebook-oauth/index.ts`
- Modify: `src/pages/FacebookCallback.tsx`

- [ ] **Step 1: Inspect current state**

Run: `wc -l supabase/functions/facebook-oauth/index.ts`
Read the file fully so the surrounding code style is preserved.

- [ ] **Step 2: Add a new `connect_for_scheduling` action and a wider OAuth URL builder**

Replace the existing `scope` array in the `get_url` handler with the larger set (adds publish scopes), and accept a new `purpose` query param:

Locate this block:
```typescript
    const scope = [
      "pages_show_list",
      "leads_retrieval",
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_manage_ads",
    ].join(",");
```

Replace with:
```typescript
    const purpose = (url.searchParams.get("purpose") || "leads") as "leads" | "scheduler";

    const SCOPE_LEADS = [
      "pages_show_list",
      "leads_retrieval",
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_manage_ads",
    ];

    const SCOPE_SCHEDULER = [
      ...SCOPE_LEADS,
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ];

    const scope = (purpose === "scheduler" ? SCOPE_SCHEDULER : SCOPE_LEADS).join(",");
```

Also extend the `state` payload to carry the purpose:
Locate:
```typescript
    const state = btoa(
      JSON.stringify({
        client_id: clientId,
        return_path: returnPath,
        nonce: crypto.randomUUID(),
      })
    );
```

Replace with:
```typescript
    const state = btoa(
      JSON.stringify({
        client_id: clientId,
        return_path: returnPath,
        purpose,
        nonce: crypto.randomUUID(),
      })
    );
```

- [ ] **Step 3: Add a new `connect_for_scheduling` callback handler**

At the top of the file, add the imports:
```typescript
import { upsertConnection } from "../_shared/socialConnections.ts";
```

After the existing `callback` block (the one that upserts to `facebook_pages`), add this new action handler **before** the `// ─── ACTION: get_pages ────────` block:

```typescript
  // ─── ACTION: connect_for_scheduling ─────────────────────────────
  // Same code-exchange flow as `callback` but writes to social_connections
  // and also creates an instagram row if the Page has a linked IG Business
  // account. Used when the user OAuth's from the scheduler's "Connect" UI.
  if (action === "connect_for_scheduling") {
    const { code, client_id, state, page_id: requestedPageId } = body;
    if (!code || !client_id) return jsonError("Missing code or client_id", 400);

    try {
      // 1. Exchange code for short-lived user token
      const tokenRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({ client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code })
      );
      if (!tokenRes.ok) return jsonError("Token exchange failed", 400);
      const { access_token: shortLivedToken } = await tokenRes.json();

      // 2. Exchange for long-lived user token
      const longRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedToken,
          })
      );
      if (!longRes.ok) return jsonError("Long-lived token exchange failed", 400);
      const { access_token: longLivedUserToken } = await longRes.json();

      // 3. List pages
      const pagesRes = await fetch(
        `${FB_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedUserToken}`
      );
      if (!pagesRes.ok) return jsonError("Failed to fetch pages", 400);
      const pagesData = await pagesRes.json();
      const pages: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }> =
        pagesData.data || [];

      if (pages.length === 0) {
        return jsonError("No Facebook Pages found for this user.", 400);
      }

      // 4. If front-end picked a specific page, use it; otherwise return the
      //    list so the front-end can ask the user to pick.
      if (!requestedPageId) {
        return json({
          needs_page_pick: true,
          pages: pages.map((p) => ({
            page_id: p.id,
            page_name: p.name,
            has_instagram: Boolean(p.instagram_business_account?.id),
          })),
          // The user token must round-trip so the second call can pick the page
          // without re-doing OAuth. It's short-lived in practice and never stored.
          _continue_token: longLivedUserToken,
        });
      }

      const chosen = pages.find((p) => p.id === requestedPageId);
      if (!chosen) return jsonError("Chosen page not found in user's accounts", 400);

      // 5. Fetch IG Business account ID if linked
      let igAccountId: string | null = chosen.instagram_business_account?.id ?? null;
      let igUsername: string | null = null;
      if (igAccountId) {
        const igRes = await fetch(
          `${FB_API}/${igAccountId}?fields=username&access_token=${chosen.access_token}`
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          igUsername = igData.username || null;
        }
      }

      // 6. Resolve who connected (try Authorization header → JWT sub)
      let connectedBy: string | null = null;
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const jwt = authHeader.slice(7);
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          connectedBy = payload.sub ?? null;
        } catch { /* ignore */ }
      }

      // 7. Upsert Facebook connection
      await upsertConnection(supabase, {
        client_id,
        platform: "facebook",
        account_label: chosen.name,
        platform_account_id: chosen.id,
        access_token: chosen.access_token,
        token_expires_at: null,                     // Page tokens don't expire
        scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
        connected_by: connectedBy,
      });

      let igConnection = null;
      if (igAccountId) {
        igConnection = await upsertConnection(supabase, {
          client_id,
          platform: "instagram",
          account_label: igUsername ? `@${igUsername}` : `IG (${igAccountId})`,
          platform_account_id: igAccountId,
          access_token: chosen.access_token,        // Page token works for IG Graph
          token_expires_at: null,
          scopes: ["instagram_basic", "instagram_content_publish"],
          connected_by: connectedBy,
        });
      }

      return json({
        success: true,
        facebook: { page_id: chosen.id, page_name: chosen.name },
        instagram: igAccountId ? { ig_user_id: igAccountId, username: igUsername } : null,
        ig_warning: igAccountId ? null : "This Page isn't linked to an Instagram Business account.",
      });
    } catch (err) {
      console.error("connect_for_scheduling error:", err);
      return jsonError(String(err), 500);
    }
  }
```

- [ ] **Step 4: Update `FacebookCallback.tsx` to branch on purpose**

Locate `src/pages/FacebookCallback.tsx`. The current logic POSTs `{ action: 'callback', code, client_id, state }`. Update so it decodes `state`, reads `purpose`, and either:
- `purpose === 'scheduler'`: POST `{ action: 'connect_for_scheduling', code, client_id, state }` and handle the two-stage response (if `needs_page_pick`, show a page picker; else show success toast)
- else: existing behavior

Edit the existing handler body (find the `useEffect` that fires on mount). Replace it with:

```tsx
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) { setStatus("error"); setMessage("Missing code or state."); return; }

    let parsed: { client_id: string; return_path: string; purpose?: "leads" | "scheduler" };
    try { parsed = JSON.parse(atob(stateRaw)); }
    catch { setStatus("error"); setMessage("Invalid state."); return; }

    const purpose = parsed.purpose ?? "leads";

    (async () => {
      if (purpose === "scheduler") {
        // Stage 1: ask backend for pages list
        const { data, error } = await supabase.functions.invoke("facebook-oauth", {
          body: { action: "connect_for_scheduling", code, client_id: parsed.client_id, state: stateRaw },
        });
        if (error) { setStatus("error"); setMessage(error.message); return; }
        if (data?.needs_page_pick) {
          setPages(data.pages);
          setContinueToken(data._continue_token);
          setStatus("pick_page");
          return;
        }
        setStatus("success");
        setMessage(`Connected ${data.facebook.page_name}${data.instagram ? ` + ${data.instagram.username}` : ""}.`);
        setTimeout(() => navigate(parsed.return_path), 1500);
      } else {
        // Existing leads flow
        const { data, error } = await supabase.functions.invoke("facebook-oauth", {
          body: { action: "callback", code, client_id: parsed.client_id, state: stateRaw },
        });
        if (error) { setStatus("error"); setMessage(error.message); return; }
        setStatus("success");
        setMessage(`Connected ${data?.pages?.length ?? 0} pages.`);
        setTimeout(() => navigate(parsed.return_path), 1500);
      }
    })();
  }, []);
```

Add new state at the top of the component:
```tsx
const [pages, setPages] = useState<Array<{ page_id: string; page_name: string; has_instagram: boolean }>>([]);
const [continueToken, setContinueToken] = useState<string | null>(null);
const [status, setStatus] = useState<"loading" | "success" | "error" | "pick_page">("loading");
const [message, setMessage] = useState("");
```

(If existing state names differ, adapt — don't blindly overwrite.)

Add the page-pick render branch and its handler. Below the existing render JSX, add:

```tsx
{status === "pick_page" && (
  <div className="space-y-3 max-w-md mx-auto p-6">
    <h2 className="text-lg font-semibold">Pick a Facebook Page</h2>
    <p className="text-sm text-muted-foreground">
      This Page's content will be posted to. Pages with a linked Instagram Business account will connect both.
    </p>
    {pages.map((p) => (
      <Button
        key={p.page_id}
        variant="outline"
        className="w-full justify-between"
        onClick={async () => {
          const stateRaw = new URL(window.location.href).searchParams.get("state")!;
          const parsed = JSON.parse(atob(stateRaw));
          const code = new URL(window.location.href).searchParams.get("code")!;
          const { data, error } = await supabase.functions.invoke("facebook-oauth", {
            body: { action: "connect_for_scheduling", code, client_id: parsed.client_id, state: stateRaw, page_id: p.page_id },
          });
          if (error) { setStatus("error"); setMessage(error.message); return; }
          setStatus("success");
          setMessage(`Connected ${data.facebook.page_name}${data.instagram ? ` + ${data.instagram.username}` : ""}.`);
          setTimeout(() => navigate(parsed.return_path), 1500);
        }}
      >
        <span>{p.page_name}</span>
        {p.has_instagram && <span className="text-xs text-primary">+ Instagram</span>}
      </Button>
    ))}
  </div>
)}
```

- [ ] **Step 5: Local smoke test (manual)**

This requires a Meta dev app with the scheduler scopes added. If you don't have those scopes approved yet, skip the live test — return to it after Meta approval and proceed with the rest of the plan.

If you do have them:
1. `supabase functions serve facebook-oauth --env-file supabase/.env`
2. From the browser console on your local app:
   ```js
   const url = new URL("http://127.0.0.1:54321/functions/v1/facebook-oauth");
   url.searchParams.set("action", "get_url");
   url.searchParams.set("client_id", "<some-real-client-id>");
   url.searchParams.set("return_path", "/clients/<id>?tab=social");
   url.searchParams.set("purpose", "scheduler");
   const { url: oauth } = await (await fetch(url, { headers: { apikey: "<anon>" } })).json();
   window.location.href = oauth;
   ```
3. Complete OAuth, return to callback page, verify rows appear in `social_connections`:
   ```bash
   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT platform, account_label, status FROM social_connections WHERE client_id='<id>';"
   ```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/facebook-oauth/index.ts src/pages/FacebookCallback.tsx
git commit -m "feat(scheduler): facebook-oauth supports connect_for_scheduling"
```

---

## Wave 3 — Scheduled posts + targets + cron

### Task A9: `scheduled_posts` table

**Files:**
- Create: `supabase/migrations/20260513_a04_scheduled_posts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a04_scheduled_posts.sql
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  editing_queue_id uuid REFERENCES public.editing_queue(id) ON DELETE SET NULL,
  video_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  mode text NOT NULL CHECK (mode IN ('draft','scheduled','autopost')),
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','publishing','published','partial','failed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_posts_client_status ON public.scheduled_posts (client_id, status);
CREATE INDEX idx_scheduled_posts_due ON public.scheduled_posts (scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduled_posts_client_access ON public.scheduled_posts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = scheduled_posts.client_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = scheduled_posts.client_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_posts_touch
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] **Step 2: Apply and verify**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a04_scheduled_posts.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\d+ scheduled_posts"
```
Expected: table present, indexes + trigger created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513_a04_scheduled_posts.sql
git commit -m "feat(scheduler): scheduled_posts table"
```

---

### Task A10: `scheduled_post_targets` table

**Files:**
- Create: `supabase/migrations/20260513_a05_scheduled_post_targets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a05_scheduled_post_targets.sql
CREATE TABLE IF NOT EXISTS public.scheduled_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id uuid NOT NULL REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  social_connection_id uuid NOT NULL REFERENCES public.social_connections(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','published','failed')),
  platform_post_id text,
  platform_post_url text,
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheduled_post_id, platform)
);

CREATE INDEX idx_targets_dispatch
  ON public.scheduled_post_targets (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_targets_by_post ON public.scheduled_post_targets (scheduled_post_id);

ALTER TABLE public.scheduled_post_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY targets_via_parent ON public.scheduled_post_targets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scheduled_posts sp
      JOIN public.clients c ON c.id = sp.client_id
      WHERE sp.id = scheduled_post_targets.scheduled_post_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scheduled_posts sp
      JOIN public.clients c ON c.id = sp.client_id
      WHERE sp.id = scheduled_post_targets.scheduled_post_id
        AND (c.owner_id = auth.uid() OR c.id IN (
          SELECT client_id FROM public.client_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE TRIGGER scheduled_post_targets_touch
  BEFORE UPDATE ON public.scheduled_post_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] **Step 2: Apply and verify**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a05_scheduled_post_targets.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "\d+ scheduled_post_targets"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513_a05_scheduled_post_targets.sql
git commit -m "feat(scheduler): scheduled_post_targets table"
```

---

### Task A11: Rollup trigger

**Files:**
- Create: `supabase/migrations/20260513_a06_rollup_trigger.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a06_rollup_trigger.sql
-- Rolls up scheduled_post_targets statuses into the parent scheduled_posts.status.

CREATE OR REPLACE FUNCTION public.rollup_scheduled_post_status() RETURNS trigger AS $$
DECLARE
  c_in_flight int;
  c_published int;
  c_failed    int;
  c_total     int;
  parent_id   uuid;
BEGIN
  parent_id := COALESCE(NEW.scheduled_post_id, OLD.scheduled_post_id);

  SELECT
    count(*) FILTER (WHERE status IN ('pending','publishing')),
    count(*) FILTER (WHERE status = 'published'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*)
  INTO c_in_flight, c_published, c_failed, c_total
  FROM public.scheduled_post_targets WHERE scheduled_post_id = parent_id;

  UPDATE public.scheduled_posts
  SET status = CASE
    WHEN c_total = 0                                  THEN status
    WHEN c_in_flight > 0                              THEN 'publishing'
    WHEN c_failed = c_total                           THEN 'failed'
    WHEN c_published = c_total                        THEN 'published'
    WHEN c_published > 0 AND c_failed > 0             THEN 'partial'
    ELSE status
  END
  WHERE id = parent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheduled_post_targets_rollup
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.scheduled_post_targets
  FOR EACH ROW EXECUTE FUNCTION public.rollup_scheduled_post_status();
```

- [ ] **Step 2: Apply, then verify with a synthetic test**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a06_rollup_trigger.sql
```

Then run a synthetic test (replace `<client_id>` with a real one, or insert a fake one). Save this as a one-off `psql` block:

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' <<'SQL'
BEGIN;
-- Insert a fake scheduled_post + targets to exercise the rollup
WITH p AS (
  INSERT INTO scheduled_posts (id, client_id, video_url, caption, mode, status)
  VALUES (gen_random_uuid(), (SELECT id FROM clients LIMIT 1), 'https://example.com/v.mp4', 'test', 'scheduled', 'scheduled')
  RETURNING id
),
conn AS (
  INSERT INTO social_connections (client_id, platform, account_label, platform_account_id, access_token_enc, scopes)
  VALUES ((SELECT id FROM clients LIMIT 1), 'facebook', 'test', 'page_x', 'fake', '{}')
  RETURNING id
)
INSERT INTO scheduled_post_targets (scheduled_post_id, social_connection_id, platform, status)
SELECT p.id, conn.id, 'facebook', 'pending' FROM p, conn;

-- After insert, parent should still be 'scheduled' (we didn't transition target to publishing)
SELECT status FROM scheduled_posts WHERE id = (SELECT scheduled_post_id FROM scheduled_post_targets ORDER BY created_at DESC LIMIT 1);

-- Transition the target to published; parent should become 'published'
UPDATE scheduled_post_targets SET status = 'published'
WHERE id = (SELECT id FROM scheduled_post_targets ORDER BY created_at DESC LIMIT 1);

SELECT status FROM scheduled_posts WHERE id = (SELECT scheduled_post_id FROM scheduled_post_targets ORDER BY created_at DESC LIMIT 1);
ROLLBACK;
SQL
```
Expected: second SELECT prints `published`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513_a06_rollup_trigger.sql
git commit -m "feat(scheduler): rollup trigger for scheduled_post_targets"
```

---

### Task A12: pg_cron job (disabled by default via kill switch)

**Files:**
- Create: `supabase/migrations/20260513_a07_scheduler_cron.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260513_a07_scheduler_cron.sql
-- Register a pg_cron job that pings the dispatcher edge function every minute.
-- The dispatcher itself checks app_settings.scheduler_enabled and no-ops if false,
-- so this cron is safe to keep registered in prod even while gated.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function: fire the dispatcher. Uses Supabase function URL convention.
-- The URL is parameterized so this works in any environment via a setting:
--   ALTER DATABASE postgres SET app.scheduler_dispatch_url = 'https://<project>.supabase.co/functions/v1/publish-scheduled-posts';
--   ALTER DATABASE postgres SET app.scheduler_service_key  = '<service-role-key>';

CREATE OR REPLACE FUNCTION public.fire_scheduler_dispatch() RETURNS void AS $$
DECLARE
  dispatch_url text := current_setting('app.scheduler_dispatch_url', true);
  service_key  text := current_setting('app.scheduler_service_key',  true);
BEGIN
  IF dispatch_url IS NULL OR service_key IS NULL THEN
    -- Not configured for this environment; skip silently
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := dispatch_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('source', 'cron')
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule every minute. Idempotent: drops any prior registration first.
SELECT cron.unschedule('process-scheduled-posts') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-posts'
);
SELECT cron.schedule('process-scheduled-posts', '* * * * *', $$SELECT public.fire_scheduler_dispatch();$$);
```

- [ ] **Step 2: Apply and configure local settings**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a07_scheduler_cron.sql

# Configure the local cron to call your locally-served edge function:
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' <<SQL
ALTER DATABASE postgres SET app.scheduler_dispatch_url = 'http://host.docker.internal:54321/functions/v1/publish-scheduled-posts';
ALTER DATABASE postgres SET app.scheduler_service_key  = '<your local service role key from supabase status>';
SQL

psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT jobname, schedule FROM cron.job;"
```
Expected: `process-scheduled-posts` row with schedule `* * * * *`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513_a07_scheduler_cron.sql
git commit -m "feat(scheduler): pg_cron job for publish dispatcher"
```

---

## Wave 4 — Publish pipeline edge functions

### Task A13: Dispatcher edge function

**Files:**
- Create: `supabase/functions/publish-scheduled-posts/index.ts`

- [ ] **Step 1: Write the dispatcher**

```typescript
// supabase/functions/publish-scheduled-posts/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const PLATFORM_TO_FN: Record<string, string> = {
  facebook:  "publish-to-meta",
  instagram: "publish-to-meta",
  tiktok:    "publish-to-tiktok",
  youtube:   "publish-to-youtube",
};

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Kill-switch check
  const { data: settings } = await sb.from("app_settings").select("scheduler_enabled").maybeSingle();
  if (!settings?.scheduler_enabled) {
    return new Response(JSON.stringify({ skipped: "scheduler_disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Optional force-post override (used by autopost path to avoid waiting for cron)
  let forcePostId: string | null = null;
  if (req.method === "POST") {
    try { const body = await req.json(); forcePostId = body?.force_post_id ?? null; } catch { /* noop */ }
  }

  // 3. Atomically claim a batch of pending targets.
  //    Uses an UPDATE...RETURNING with a CTE that does FOR UPDATE SKIP LOCKED.
  //    pg-meta caveat: Postgres doesn't allow SKIP LOCKED inside a sub-SELECT
  //    of an UPDATE, so we issue this via supabase.rpc to a SQL function.
  const claimSql = `
    WITH due AS (
      SELECT t.id
      FROM public.scheduled_post_targets t
      JOIN public.scheduled_posts p ON p.id = t.scheduled_post_id
      WHERE t.status = 'pending'
        AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
        AND p.status IN ('scheduled','publishing')
        AND (p.scheduled_at <= now() OR p.mode = 'autopost')
        ${forcePostId ? "AND p.id = $1::uuid" : ""}
      ORDER BY t.next_attempt_at NULLS FIRST, t.created_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE OF t SKIP LOCKED
    )
    UPDATE public.scheduled_post_targets
    SET status = 'publishing', attempt_count = attempt_count + 1
    WHERE id IN (SELECT id FROM due)
    RETURNING id, scheduled_post_id, platform, attempt_count;
  `;

  // We use the underlying PostgREST rpc capability via raw query; since the
  // JS client doesn't expose arbitrary SQL, register this as a SQL function:
  //   public.claim_scheduler_batch(force_post_id uuid) RETURNS SETOF ...
  // (See migration step below.)
  const { data: claimed, error: claimErr } = await sb.rpc("claim_scheduler_batch", {
    p_force_post_id: forcePostId,
  });
  if (claimErr) {
    console.error("claim error", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = (claimed ?? []) as Array<{ id: string; scheduled_post_id: string; platform: string; attempt_count: number }>;

  // 4. Fan out
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  await Promise.all(targets.map(async (t) => {
    const fnName = PLATFORM_TO_FN[t.platform];
    if (!fnName) {
      await markFailed(sb, t.id, `Unsupported platform: ${t.platform}`, t.attempt_count);
      return;
    }
    try {
      await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_id: t.id }),
      });
      // Fire-and-forget — the publisher writes its own result back to the target row.
    } catch (err) {
      await markFailed(sb, t.id, `Dispatch error: ${String(err)}`, t.attempt_count);
    }
  }));

  return new Response(JSON.stringify({ dispatched: targets.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function markFailed(sb: any, id: string, reason: string, attempt: number) {
  const terminal = attempt >= MAX_ATTEMPTS;
  const backoffMin = [5, 15, 60, 240, 240][Math.min(attempt - 1, 4)]; // minutes
  await sb.from("scheduled_post_targets").update({
    status: terminal ? "failed" : "pending",
    last_error: reason,
    next_attempt_at: terminal ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
  }).eq("id", id);
}
```

- [ ] **Step 2: Add the `claim_scheduler_batch` SQL function migration**

The dispatcher relies on a SQL function. Create:

`supabase/migrations/20260513_a08_claim_fn.sql`

```sql
-- 20260513_a08_claim_fn.sql
CREATE OR REPLACE FUNCTION public.claim_scheduler_batch(p_force_post_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, scheduled_post_id uuid, platform text, attempt_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT t.id
    FROM public.scheduled_post_targets t
    JOIN public.scheduled_posts p ON p.id = t.scheduled_post_id
    WHERE t.status = 'pending'
      AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
      AND p.status IN ('scheduled','publishing')
      AND (p.scheduled_at <= now() OR p.mode = 'autopost')
      AND (p_force_post_id IS NULL OR p.id = p_force_post_id)
    ORDER BY t.next_attempt_at NULLS FIRST, t.created_at
    LIMIT 50
    FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.scheduled_post_targets t
  SET status = 'publishing', attempt_count = t.attempt_count + 1
  WHERE t.id IN (SELECT id FROM due)
  RETURNING t.id, t.scheduled_post_id, t.platform, t.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduler_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_scheduler_batch(uuid) TO service_role;
```

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -f supabase/migrations/20260513_a08_claim_fn.sql
```

- [ ] **Step 3: Smoke-test the dispatcher locally**

Make sure the kill-switch is OFF first; the dispatcher should no-op:
```bash
supabase functions serve publish-scheduled-posts --env-file supabase/.env
# In another terminal:
curl -X POST "http://127.0.0.1:54321/functions/v1/publish-scheduled-posts" \
  -H "Authorization: Bearer $(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'=' -f2)" \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `{"skipped":"scheduler_disabled"}`.

Flip kill-switch on, retry:
```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "UPDATE app_settings SET scheduler_enabled=true WHERE id=true;"
curl ... # same as above
```
Expected: `{"dispatched":0}` (no targets yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/publish-scheduled-posts/index.ts supabase/migrations/20260513_a08_claim_fn.sql
git commit -m "feat(scheduler): publish-scheduled-posts dispatcher + claim fn"
```

---

### Task A14: `publish-to-meta` edge function

**Files:**
- Create: `supabase/functions/publish-to-meta/index.ts`

- [ ] **Step 1: Write the publisher**

```typescript
// supabase/functions/publish-to-meta/index.ts
// Publishes a single scheduled_post_target to Instagram Reels OR Facebook Reels.
// Reads target_id from body, fetches target+parent+connection, calls Graph API.
// Writes outcome back to scheduled_post_targets.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getConnection, markNeedsReauth, recordUse, serviceClient } from "../_shared/socialConnections.ts";

const FB_API = "https://graph.facebook.com/v19.0";
const DRY_RUN = Deno.env.get("DRY_RUN_SCHEDULER") === "true";
const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  const { target_id } = await req.json();
  if (!target_id) return jsonError("Missing target_id", 400);

  const sb = serviceClient();

  // 1. Fetch target + parent post
  const { data: target, error: tErr } = await sb
    .from("scheduled_post_targets")
    .select("id, scheduled_post_id, social_connection_id, platform, status, platform_post_id, attempt_count, scheduled_posts(video_url, caption)")
    .eq("id", target_id)
    .single();
  if (tErr || !target) return jsonError("Target not found: " + tErr?.message, 404);

  // 2. Idempotency
  if (target.platform_post_id) {
    return ok({ already_published: true, platform_post_id: target.platform_post_id });
  }

  const parent = (target as any).scheduled_posts;
  if (!parent?.video_url) return await fail(sb, target_id, "Missing video_url on parent", target.attempt_count, false);

  // 3. Load connection
  let connection;
  try { connection = await getConnection(sb, target.social_connection_id); }
  catch (e) { return await fail(sb, target_id, "Connection not found: " + e, target.attempt_count, true); }

  if (connection.status !== "active") {
    return await fail(sb, target_id, `Connection status=${connection.status}`, target.attempt_count, true);
  }

  if (DRY_RUN) {
    console.log("[DRY_RUN] would publish", target.platform, "to", connection.account_label, "video:", parent.video_url);
    await sb.from("scheduled_post_targets").update({
      status: "published",
      platform_post_id: `dryrun-${target.id}`,
      platform_post_url: `https://dry-run.example/${target.platform}/${target.id}`,
      last_error: null,
      published_at: new Date().toISOString(),
    }).eq("id", target_id);
    return ok({ dry_run: true });
  }

  // 4. Branch on platform
  try {
    let post_id: string;
    let post_url: string;
    if (target.platform === "instagram") {
      ({ post_id, post_url } = await publishInstagramReel({
        igUserId: connection.platform_account_id,
        accessToken: connection.access_token,
        videoUrl: parent.video_url,
        caption: parent.caption ?? "",
      }));
    } else if (target.platform === "facebook") {
      ({ post_id, post_url } = await publishFacebookReel({
        pageId: connection.platform_account_id,
        accessToken: connection.access_token,
        videoUrl: parent.video_url,
        caption: parent.caption ?? "",
      }));
    } else {
      return await fail(sb, target_id, `publish-to-meta does not handle platform ${target.platform}`, target.attempt_count, true);
    }

    await sb.from("scheduled_post_targets").update({
      status: "published",
      platform_post_id: post_id,
      platform_post_url: post_url,
      last_error: null,
      published_at: new Date().toISOString(),
    }).eq("id", target_id);
    await recordUse(sb, connection.id);
    return ok({ platform_post_id: post_id, platform_post_url: post_url });

  } catch (err) {
    const msg = String(err?.message ?? err);

    // Token/scope errors → flip connection
    if (/OAuthException|access[_ ]?token|permissions|scope/i.test(msg)) {
      await markNeedsReauth(sb, connection.id, msg);
      return await fail(sb, target_id, msg, target.attempt_count, true);
    }

    // Hard format errors (don't retry)
    if (/Invalid media|unsupported format|file too large/i.test(msg)) {
      return await fail(sb, target_id, msg, target.attempt_count, true);
    }

    // Otherwise retry
    return await fail(sb, target_id, msg, target.attempt_count, false);
  }
});

// ─── IG Reels publish ────────────────────────────────────────────────
async function publishInstagramReel(args: { igUserId: string; accessToken: string; videoUrl: string; caption: string }) {
  // 1. Create container
  const createUrl = new URL(`${FB_API}/${args.igUserId}/media`);
  createUrl.searchParams.set("media_type", "REELS");
  createUrl.searchParams.set("video_url", args.videoUrl);
  createUrl.searchParams.set("caption", args.caption);
  createUrl.searchParams.set("access_token", args.accessToken);
  const cRes = await fetch(createUrl, { method: "POST" });
  if (!cRes.ok) throw new Error(`IG create container: ${cRes.status} ${await cRes.text()}`);
  const { id: containerId } = await cRes.json();

  // 2. Poll status (max 5 min)
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const sRes = await fetch(`${FB_API}/${containerId}?fields=status_code&access_token=${args.accessToken}`);
    if (!sRes.ok) throw new Error(`IG poll status: ${sRes.status} ${await sRes.text()}`);
    const s = await sRes.json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR")    throw new Error(`IG processing failed: ${JSON.stringify(s)}`);
    if (s.status_code === "EXPIRED")  throw new Error("IG container expired before publish");
  }

  // 3. Publish
  const pubUrl = new URL(`${FB_API}/${args.igUserId}/media_publish`);
  pubUrl.searchParams.set("creation_id", containerId);
  pubUrl.searchParams.set("access_token", args.accessToken);
  const pRes = await fetch(pubUrl, { method: "POST" });
  if (!pRes.ok) throw new Error(`IG publish: ${pRes.status} ${await pRes.text()}`);
  const { id: mediaId } = await pRes.json();

  // 4. Permalink
  const permRes = await fetch(`${FB_API}/${mediaId}?fields=permalink&access_token=${args.accessToken}`);
  let permalink = `https://www.instagram.com/reel/${mediaId}/`;
  if (permRes.ok) {
    const { permalink: p } = await permRes.json();
    if (p) permalink = p;
  }
  return { post_id: mediaId, post_url: permalink };
}

// ─── FB Reels publish ────────────────────────────────────────────────
async function publishFacebookReel(args: { pageId: string; accessToken: string; videoUrl: string; caption: string }) {
  // 1. Start phase
  const startUrl = new URL(`${FB_API}/${args.pageId}/video_reels`);
  startUrl.searchParams.set("upload_phase", "start");
  startUrl.searchParams.set("access_token", args.accessToken);
  const startRes = await fetch(startUrl, { method: "POST" });
  if (!startRes.ok) throw new Error(`FB Reels start: ${startRes.status} ${await startRes.text()}`);
  const { video_id, upload_url } = await startRes.json();

  // 2. Upload by URL (Meta pulls the file). Body POSTed to upload_url with file_url header.
  const uploadRes = await fetch(upload_url, {
    method: "POST",
    headers: { "file_url": args.videoUrl, "Authorization": `OAuth ${args.accessToken}` },
  });
  if (!uploadRes.ok) throw new Error(`FB Reels upload: ${uploadRes.status} ${await uploadRes.text()}`);

  // 3. Finish phase
  const finishUrl = new URL(`${FB_API}/${args.pageId}/video_reels`);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_id", video_id);
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", args.caption);
  finishUrl.searchParams.set("access_token", args.accessToken);
  const finishRes = await fetch(finishUrl, { method: "POST" });
  if (!finishRes.ok) throw new Error(`FB Reels finish: ${finishRes.status} ${await finishRes.text()}`);

  return { post_id: video_id, post_url: `https://www.facebook.com/reel/${video_id}` };
}

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fail(sb: any, id: string, reason: string, attempt: number, terminal: boolean) {
  const isTerminal = terminal || attempt >= MAX_ATTEMPTS;
  const backoffMin = [5, 15, 60, 240, 240][Math.min(attempt - 1, 4)];
  await sb.from("scheduled_post_targets").update({
    status: isTerminal ? "failed" : "pending",
    last_error: reason,
    next_attempt_at: isTerminal ? null : new Date(Date.now() + backoffMin * 60_000).toISOString(),
  }).eq("id", id);
  return new Response(JSON.stringify({ error: reason, terminal: isTerminal }), {
    status: isTerminal ? 400 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: DRY-RUN smoke test**

```bash
# Enable dry-run locally:
echo "DRY_RUN_SCHEDULER=true" >> supabase/.env

supabase functions serve publish-to-meta --env-file supabase/.env
```

In another terminal, insert a fake post + target manually and POST to the function:

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' <<'SQL'
WITH p AS (
  INSERT INTO scheduled_posts (client_id, video_url, caption, mode, status)
  VALUES ((SELECT id FROM clients LIMIT 1), 'https://example.com/v.mp4', 'dry-run caption', 'autopost', 'scheduled')
  RETURNING id
),
conn AS (
  INSERT INTO social_connections (client_id, platform, account_label, platform_account_id, access_token_enc, scopes)
  VALUES ((SELECT id FROM clients LIMIT 1), 'instagram', 'test', 'ig_x', 'fake-ciphertext-wont-be-used-in-dryrun', '{}')
  RETURNING id
),
t AS (
  INSERT INTO scheduled_post_targets (scheduled_post_id, social_connection_id, platform)
  SELECT p.id, conn.id, 'instagram' FROM p, conn
  RETURNING id
)
SELECT id FROM t;
SQL
# Use returned target_id below:
TARGET_ID="<paste-from-above>"
curl -X POST "http://127.0.0.1:54321/functions/v1/publish-to-meta" \
  -H "Authorization: Bearer $(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'=' -f2)" \
  -H "Content-Type: application/json" \
  -d "{\"target_id\":\"$TARGET_ID\"}"
```

Expected: `{"dry_run":true}`. Then check the DB:

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT status, platform_post_id, platform_post_url FROM scheduled_post_targets WHERE id='$TARGET_ID';"
```
Expected: `published` / `dryrun-<id>` / `https://dry-run.example/...`.

- [ ] **Step 3: Verify rollup**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT id, status FROM scheduled_posts ORDER BY created_at DESC LIMIT 1;"
```
Expected: parent `status='published'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/publish-to-meta/index.ts
git commit -m "feat(scheduler): publish-to-meta (IG + FB Reels)"
```

---

## Wave 5 — Social Accounts UI

### Task A15: `useSocialConnections` hook

**Files:**
- Create: `src/lib/hooks/useSocialConnections.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/hooks/useSocialConnections.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SocialConnectionRow {
  id: string;
  client_id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  account_label: string;
  platform_account_id: string;
  status: "active" | "needs_reauth" | "revoked";
  scopes: string[];
  connected_at: string;
  last_used_at: string | null;
  last_error: string | null;
}

export function useSocialConnections(clientId: string | null) {
  return useQuery({
    queryKey: ["social_connections", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_connections")
        .select("id, client_id, platform, account_label, platform_account_id, status, scopes, connected_at, last_used_at, last_error")
        .eq("client_id", clientId!)
        .order("platform");
      if (error) throw error;
      return data as SocialConnectionRow[];
    },
  });
}

export function useDisconnectSocialConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, _id, ctx: any) => {
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
  });
}

export function useStartFacebookOAuth() {
  return useMutation({
    mutationFn: async (args: { clientId: string; returnPath: string }) => {
      // Hits the existing edge function with purpose=scheduler.
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const url = new URL(`${SUPABASE_URL}/functions/v1/facebook-oauth`);
      url.searchParams.set("action", "get_url");
      url.searchParams.set("client_id", args.clientId);
      url.searchParams.set("return_path", args.returnPath);
      url.searchParams.set("purpose", "scheduler");
      const res = await fetch(url, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
      });
      if (!res.ok) throw new Error(`Failed to start OAuth: ${res.status}`);
      const { url: oauthUrl } = await res.json();
      window.location.href = oauthUrl;
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hooks/useSocialConnections.ts
git commit -m "feat(scheduler): useSocialConnections hook"
```

---

### Task A16: `SocialAccountCard` component

**Files:**
- Create: `src/components/scheduler/SocialAccountCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/scheduler/SocialAccountCard.tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Link2Off } from "lucide-react";
import type { SocialConnectionRow } from "@/lib/hooks/useSocialConnections";

interface Props {
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  connection: SocialConnectionRow | null;
  onConnect: () => void;
  onReauth: () => void;
  onDisconnect: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

const LABELS: Record<Props["platform"], string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

export function SocialAccountCard({ platform, connection, onConnect, onReauth, onDisconnect, disabled, disabledReason }: Props) {
  const isConnected = connection && connection.status === "active";
  const needsReauth = connection && connection.status === "needs_reauth";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{LABELS[platform]}</span>
        {isConnected   && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {needsReauth   && <AlertCircle className="h-4 w-4 text-amber-600" />}
        {!connection   && <Link2Off className="h-4 w-4 text-muted-foreground" />}
      </div>

      {disabled && (
        <p className="text-xs text-muted-foreground">{disabledReason ?? "Coming soon"}</p>
      )}

      {!disabled && !connection && (
        <Button size="sm" onClick={onConnect} className="w-full">Connect {LABELS[platform]}</Button>
      )}

      {!disabled && isConnected && (
        <div className="space-y-2">
          <p className="text-sm">{connection.account_label}</p>
          <p className="text-xs text-muted-foreground">
            Connected {new Date(connection.connected_at).toLocaleDateString()}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReauth} className="flex-1">Reauth</Button>
            <Button size="sm" variant="ghost" onClick={onDisconnect} className="flex-1">Disconnect</Button>
          </div>
        </div>
      )}

      {!disabled && needsReauth && (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">Token expired — reconnect to keep scheduling.</p>
          <p className="text-xs text-muted-foreground">{connection.last_error}</p>
          <Button size="sm" onClick={onReauth} className="w-full">Reconnect</Button>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/scheduler/SocialAccountCard.tsx
git commit -m "feat(scheduler): SocialAccountCard component"
```

---

### Task A17: `SocialAccountsTab` component

**Files:**
- Create: `src/components/scheduler/SocialAccountsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/scheduler/SocialAccountsTab.tsx
import { useMemo } from "react";
import { useSocialConnections, useDisconnectSocialConnection, useStartFacebookOAuth, type SocialConnectionRow } from "@/lib/hooks/useSocialConnections";
import { SocialAccountCard } from "./SocialAccountCard";
import { toast } from "sonner";

interface Props { clientId: string; returnPath: string }

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

export function SocialAccountsTab({ clientId, returnPath }: Props) {
  const { data: conns = [], isLoading } = useSocialConnections(clientId);
  const disconnect = useDisconnectSocialConnection();
  const startFb = useStartFacebookOAuth();

  const byPlatform = useMemo(() => {
    const map: Partial<Record<typeof PLATFORMS[number], SocialConnectionRow>> = {};
    for (const c of conns) map[c.platform] = c;
    return map;
  }, [conns]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading connections…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
      {PLATFORMS.map((platform) => {
        const conn = byPlatform[platform] ?? null;
        const isFbOrIg = platform === "facebook" || platform === "instagram";
        const disabled = !isFbOrIg;  // Only Meta is wired in Phase A.

        return (
          <SocialAccountCard
            key={platform}
            platform={platform}
            connection={conn}
            disabled={disabled}
            disabledReason={
              platform === "tiktok"  ? "TikTok — pending TikTok app review" :
              platform === "youtube" ? "YouTube — pending Google project setup" :
              undefined
            }
            onConnect={() => {
              if (platform === "facebook" || platform === "instagram") {
                startFb.mutate({ clientId, returnPath });
              }
            }}
            onReauth={() => {
              if (platform === "facebook" || platform === "instagram") {
                startFb.mutate({ clientId, returnPath });
              }
            }}
            onDisconnect={async () => {
              if (!conn) return;
              if (!confirm(`Disconnect ${conn.account_label}? Scheduled posts using this account will fail.`)) return;
              try {
                await disconnect.mutateAsync(conn.id);
                // NOTE: Platform-side token revocation (Meta DELETE /me/permissions,
                // Google /oauth2/revoke) is deferred — local DB delete is sufficient
                // for the user-visible "disconnect" semantic. Add platform revoke as
                // a Phase A.1 follow-up if compliance requires it.
                toast.success(`Disconnected ${conn.account_label}`);
              } catch (e) {
                toast.error("Disconnect failed: " + String(e));
              }
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/scheduler/SocialAccountsTab.tsx
git commit -m "feat(scheduler): SocialAccountsTab component"
```

---

### Task A18: Mount social accounts tab in `ClientDetail`

**Files:**
- Modify: `src/pages/ClientDetail.tsx`

- [ ] **Step 1: Inspect existing tab structure**

Run: `grep -n "Tabs\|TabsTrigger\|TabsContent" src/pages/ClientDetail.tsx | head -30`
Note the existing tab pattern.

- [ ] **Step 2: Add the new tab behind the feature flag**

Near the top of the file, add imports:

```tsx
import { useSchedulerEnabled } from "@/lib/featureFlags";
import { SocialAccountsTab } from "@/components/scheduler/SocialAccountsTab";
```

Find the existing `<Tabs>` block. Add a `<TabsTrigger>` and matching `<TabsContent>`:

```tsx
const { enabled: schedulerEnabled } = useSchedulerEnabled();
// ...
{schedulerEnabled && (
  <TabsTrigger value="social">Social accounts</TabsTrigger>
)}
// ...
{schedulerEnabled && (
  <TabsContent value="social">
    <SocialAccountsTab
      clientId={clientId}
      returnPath={`/clients/${clientId}?tab=social`}
    />
  </TabsContent>
)}
```

(Adapt to existing TabsList ordering; place "Social accounts" wherever it reads best alongside existing tabs.)

- [ ] **Step 3: Manually verify**

```bash
npm run dev
# Open http://localhost:8081/clients/<some-id>?tab=social
# Confirm: 4 cards visible. TikTok and YouTube greyed-out. Facebook+Instagram show Connect buttons.
```

If `VITE_FEATURE_SCHEDULER` is not "true" in your local `.env`, you won't see the tab — that's by design.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClientDetail.tsx
git commit -m "feat(scheduler): mount SocialAccountsTab behind feature flag"
```

---

## Wave 6 — Publish composer

### Task A19: `PublishComposer` component skeleton

**Files:**
- Create: `src/components/scheduler/PublishComposer.tsx`

- [ ] **Step 1: Write the component skeleton with all UI**

```tsx
// src/components/scheduler/PublishComposer.tsx
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSocialConnections } from "@/lib/hooks/useSocialConnections";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  editingQueueId: string;
  videoUrl: string;
  initialCaption: string;
  /** Browser timezone, e.g. "America/New_York" */
  defaultTimezone?: string;
}

type Mode = "autopost" | "scheduled" | "draft";
type Plat = "facebook" | "instagram" | "tiktok" | "youtube";

const SUPPORTED_NOW: Plat[] = ["facebook", "instagram"];   // Phase A
const PLAT_LABEL: Record<Plat, string> = {
  facebook:  "Facebook Reels",
  instagram: "Instagram Reels",
  tiktok:    "TikTok",
  youtube:   "YouTube Shorts",
};

export function PublishComposer(p: Props) {
  const { data: conns = [] } = useSocialConnections(p.clientId);
  const [caption, setCaption] = useState(p.initialCaption);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Plat[]>([]);
  const [mode, setMode] = useState<Mode>("scheduled");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tz, setTz] = useState(p.defaultTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [submitting, setSubmitting] = useState(false);

  // Reset state when re-opened
  useEffect(() => {
    if (p.open) {
      setCaption(p.initialCaption);
      setSelectedPlatforms([]);
      setMode("scheduled");
      setDate(""); setTime("");
    }
  }, [p.open, p.initialCaption]);

  const connByPlatform = useMemo(() => {
    const m: Partial<Record<Plat, typeof conns[number]>> = {};
    for (const c of conns) if (c.status === "active") m[c.platform] = c;
    return m;
  }, [conns]);

  const togglePlatform = (plat: Plat) => {
    setSelectedPlatforms((prev) => prev.includes(plat) ? prev.filter((x) => x !== plat) : [...prev, plat]);
  };

  const buttonLabel = mode === "autopost" ? "Publish now" : mode === "scheduled" ? "Schedule" : "Save draft";

  const handleSubmit = async () => {
    if (selectedPlatforms.length === 0 && mode !== "draft") {
      toast.error("Select at least one platform"); return;
    }

    // Compute scheduled_at
    let scheduledAt: string | null = null;
    if (mode === "scheduled") {
      if (!date || !time) { toast.error("Pick a date and time"); return; }
      // Construct a Date in the user-picked tz. Easiest correct approach:
      // build an ISO local string and let `Date` parse it as local-browser,
      // then store as UTC. For exact tz handling we'd need a tz library —
      // for v1, accept browser-local as "best effort" and store tz string.
      const local = new Date(`${date}T${time}`);
      if (Number.isNaN(local.getTime())) { toast.error("Invalid date/time"); return; }
      if (local.getTime() <= Date.now())  { toast.error("Scheduled time must be in the future"); return; }
      scheduledAt = local.toISOString();
    } else if (mode === "autopost") {
      scheduledAt = new Date().toISOString();
    }

    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;

      // 1. Insert parent post
      const { data: post, error: postErr } = await supabase.from("scheduled_posts").insert({
        client_id: p.clientId,
        editing_queue_id: p.editingQueueId,
        video_url: p.videoUrl,
        caption,
        mode,
        scheduled_at: scheduledAt,
        timezone: tz,
        status: mode === "draft" ? "draft" : "scheduled",
        created_by: user?.id ?? null,
      }).select().single();
      if (postErr) throw postErr;

      // 2. Insert one target per selected platform (skipped for drafts)
      if (mode !== "draft" && selectedPlatforms.length > 0) {
        const targets = selectedPlatforms
          .map((plat) => {
            const conn = connByPlatform[plat];
            if (!conn) return null;
            return {
              scheduled_post_id: post.id,
              social_connection_id: conn.id,
              platform: plat,
              status: "pending",
            };
          })
          .filter(Boolean);
        const { error: tErr } = await supabase.from("scheduled_post_targets").insert(targets as any);
        if (tErr) throw tErr;
      }

      // 3. Autopost path: ping dispatcher
      if (mode === "autopost") {
        await supabase.functions.invoke("publish-scheduled-posts", {
          body: { force_post_id: post.id },
        });
      }

      toast.success(
        mode === "autopost" ? "Publishing started" :
        mode === "scheduled" ? "Scheduled" :
        "Saved as draft"
      );
      p.onClose();
    } catch (e: any) {
      toast.error("Submit failed: " + (e?.message ?? String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Publish</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Video preview */}
          <div className="aspect-[9/16] bg-black rounded overflow-hidden flex items-center justify-center">
            <video src={p.videoUrl} controls className="w-full h-full object-contain" />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="caption">Caption</Label>
              <Textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} />
              <p className="text-xs text-muted-foreground mt-1">{caption.length} characters</p>
            </div>

            <div className="space-y-2">
              <Label>Publish to</Label>
              {(["facebook","instagram","tiktok","youtube"] as Plat[]).map((plat) => {
                const conn = connByPlatform[plat];
                const supportedNow = SUPPORTED_NOW.includes(plat);
                const disabled = !supportedNow || !conn;
                return (
                  <div key={plat} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedPlatforms.includes(plat)}
                      disabled={disabled}
                      onCheckedChange={() => togglePlatform(plat)}
                    />
                    <span className={disabled ? "text-muted-foreground" : ""}>
                      {PLAT_LABEL[plat]}
                      {conn ? ` — ${conn.account_label}` : !supportedNow ? " — coming soon" : " — connect first ↗"}
                    </span>
                    {!conn && supportedNow && (
                      <a className="text-xs text-primary underline ml-auto" href={`/clients/${p.clientId}?tab=social`} target="_blank" rel="noreferrer">
                        Connect
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>When</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="autopost" id="m-now" />
                  <Label htmlFor="m-now">Post now</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="scheduled" id="m-sched" />
                  <Label htmlFor="m-sched">Schedule for…</Label>
                </div>
                {mode === "scheduled" && (
                  <div className="flex gap-2 pl-6">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    <Input value={tz} onChange={(e) => setTz(e.target.value)} className="w-40" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="draft" id="m-draft" />
                  <Label htmlFor="m-draft">Save as draft</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={p.onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{buttonLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/scheduler/PublishComposer.tsx
git commit -m "feat(scheduler): PublishComposer component"
```

---

### Task A20: Wire `PublishComposer` into `EditingQueue`

**Files:**
- Modify: `src/pages/EditingQueue.tsx`

- [ ] **Step 1: Inspect current schedule modal in EditingQueue**

Run: `grep -n "scheduleItem\|scheduleDate\|ScheduleDialog\|schedule_date" src/pages/EditingQueue.tsx`
This shows the existing state (`scheduleItem`, `scheduleDate`, …).

- [ ] **Step 2: Branch the schedule button on the feature flag**

Near top of `EditingQueue.tsx`, add imports:

```tsx
import { useSchedulerEnabled } from "@/lib/featureFlags";
import { PublishComposer } from "@/components/scheduler/PublishComposer";
```

Add state for composer:

```tsx
const { enabled: schedulerEnabled } = useSchedulerEnabled();
const [composerItem, setComposerItem] = useState<EditingQueueItem | null>(null);
```

Find the schedule-button click handler. Replace:

```tsx
onClick={() => { setScheduleItem(item); setScheduleDate(item.scheduledDate ?? ""); }}
```

With:

```tsx
onClick={() => {
  if (schedulerEnabled) setComposerItem(item);
  else { setScheduleItem(item); setScheduleDate(item.scheduledDate ?? ""); }
}}
```

(Exact text varies — find the existing onClick and wrap accordingly.)

Mount the new composer near the existing `<ScheduleDialog>` (or wherever the modal is rendered):

```tsx
{composerItem && schedulerEnabled && (
  <PublishComposer
    open={Boolean(composerItem)}
    onClose={() => setComposerItem(null)}
    clientId={composerItem.client_id /* adapt to actual field */}
    editingQueueId={composerItem.id}
    videoUrl={composerItem.file_submission ?? composerItem.storage_url ?? ""}
    // Caption priority per spec §9: editing_queue.caption first, fall back to
    // scripts.caption (already joined into the row as scripts.caption above).
    initialCaption={composerItem.caption ?? (composerItem as any).scripts?.caption ?? ""}
  />
)}
```

Verify against the actual `EditingQueueItem` interface (look at the type def in the same file) — the fields above match the `SELECT` columns shown earlier.

- [ ] **Step 3: Manually verify**

```bash
npm run dev
# Open EditingQueue page, click Schedule on a row with a video.
# Confirm: composer opens with video preview, caption pre-filled.
# Pick "Save as draft", submit, verify scheduled_posts row appears.
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT id, mode, status, scheduled_at FROM scheduled_posts ORDER BY created_at DESC LIMIT 3;"
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/EditingQueue.tsx
git commit -m "feat(scheduler): wire PublishComposer into EditingQueue"
```

---

## Wave 7 — ContentCalendar updates + UI surfacing

### Task A21: `useScheduledPosts` hook

**Files:**
- Create: `src/lib/hooks/useScheduledPosts.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/hooks/useScheduledPosts.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TargetRow {
  id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  status: "pending" | "publishing" | "published" | "failed";
  platform_post_url: string | null;
  last_error: string | null;
  attempt_count: number;
}

export interface ScheduledPostRow {
  id: string;
  client_id: string;
  video_url: string;
  caption: string;
  mode: "draft" | "scheduled" | "autopost";
  scheduled_at: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
  created_at: string;
  targets: TargetRow[];
}

export function useScheduledPosts(clientId: string | null, filter: "all" | "drafts" | "scheduled" | "published" | "failed" = "all") {
  return useQuery({
    queryKey: ["scheduled_posts", clientId, filter],
    enabled: Boolean(clientId),
    queryFn: async () => {
      let query = supabase
        .from("scheduled_posts")
        .select("id, client_id, video_url, caption, mode, scheduled_at, status, created_at, targets:scheduled_post_targets(id, platform, status, platform_post_url, last_error, attempt_count)")
        .eq("client_id", clientId!)
        .order("scheduled_at", { ascending: true, nullsFirst: false });

      if (filter === "drafts")    query = query.eq("status", "draft");
      if (filter === "scheduled") query = query.in("status", ["scheduled", "publishing"]);
      if (filter === "published") query = query.in("status", ["published", "partial"]);
      if (filter === "failed")    query = query.eq("status", "failed");

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledPostRow[];
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/hooks/useScheduledPosts.ts
git commit -m "feat(scheduler): useScheduledPosts hook"
```

---

### Task A22: `PostStatusBadge` component

**Files:**
- Create: `src/components/scheduler/PostStatusBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/scheduler/PostStatusBadge.tsx
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Youtube, Music2 } from "lucide-react";
import type { ScheduledPostRow, TargetRow } from "@/lib/hooks/useScheduledPosts";

const ICON: Record<TargetRow["platform"], typeof Facebook> = {
  facebook:  Facebook,
  instagram: Instagram,
  tiktok:    Music2,
  youtube:   Youtube,
};

const STATUS_COLOR: Record<TargetRow["status"], string> = {
  pending:    "text-muted-foreground",
  publishing: "text-amber-500",
  published:  "text-emerald-600",
  failed:     "text-red-600",
};

const STATUS_LABEL: Record<ScheduledPostRow["status"], { label: string; variant: any }> = {
  draft:      { label: "Draft",      variant: "secondary" },
  scheduled:  { label: "Scheduled",  variant: "outline" },
  publishing: { label: "Publishing", variant: "default" },
  published:  { label: "Published",  variant: "default" },
  partial:    { label: "Partial",    variant: "destructive" },
  failed:     { label: "Failed",     variant: "destructive" },
};

export function PostStatusBadge({ post }: { post: ScheduledPostRow }) {
  const s = STATUS_LABEL[post.status];
  return (
    <div className="flex items-center gap-2">
      <Badge variant={s.variant}>{s.label}</Badge>
      <div className="flex items-center gap-1">
        {post.targets.map((t) => {
          const Icon = ICON[t.platform];
          return <Icon key={t.id} className={`h-3.5 w-3.5 ${STATUS_COLOR[t.status]}`} />;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/scheduler/PostStatusBadge.tsx
git commit -m "feat(scheduler): PostStatusBadge component"
```

---

### Task A23: `PostDetailsModal` + retry button

**Files:**
- Create: `src/components/scheduler/PostDetailsModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/scheduler/PostDetailsModal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ScheduledPostRow } from "@/lib/hooks/useScheduledPosts";
import { useQueryClient } from "@tanstack/react-query";

interface Props { post: ScheduledPostRow | null; onClose: () => void }

export function PostDetailsModal({ post, onClose }: Props) {
  const qc = useQueryClient();
  if (!post) return null;

  const retryTarget = async (targetId: string) => {
    const { error } = await supabase.from("scheduled_post_targets").update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", targetId);
    if (error) { toast.error("Retry failed: " + error.message); return; }
    // Kick the dispatcher so we don't wait for the next cron tick.
    await supabase.functions.invoke("publish-scheduled-posts", { body: { force_post_id: post.id } });
    qc.invalidateQueries({ queryKey: ["scheduled_posts"] });
    toast.success("Retry queued");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{post.caption}</p>
          <div className="space-y-2">
            {post.targets.map((t) => (
              <div key={t.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <p className="font-medium capitalize">{t.platform}</p>
                  <p className="text-xs text-muted-foreground">Status: {t.status} · attempts: {t.attempt_count}</p>
                  {t.last_error && <p className="text-xs text-red-600 mt-1">{t.last_error}</p>}
                  {t.platform_post_url && (
                    <a href={t.platform_post_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      View live post
                    </a>
                  )}
                </div>
                {t.status === "failed" && (
                  <Button size="sm" onClick={() => retryTarget(t.id)}>Retry</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/scheduler/PostDetailsModal.tsx
git commit -m "feat(scheduler): PostDetailsModal with retry"
```

---

### Task A24: `ReauthBanner` + add status tabs to `ContentCalendar`

**Files:**
- Create: `src/components/scheduler/ReauthBanner.tsx`
- Modify: `src/pages/ContentCalendar.tsx`

- [ ] **Step 1: Write ReauthBanner**

```tsx
// src/components/scheduler/ReauthBanner.tsx
import { AlertCircle } from "lucide-react";
import { useSocialConnections } from "@/lib/hooks/useSocialConnections";

export function ReauthBanner({ clientId }: { clientId: string }) {
  const { data: conns = [] } = useSocialConnections(clientId);
  const stale = conns.filter((c) => c.status === "needs_reauth");
  if (stale.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 mt-0.5" />
      <div className="text-sm">
        <strong>Reconnect required: </strong>
        {stale.map((c) => c.account_label).join(", ")}
        {" — "}
        <a href={`/clients/${clientId}?tab=social`} className="underline">Reauth</a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modify ContentCalendar**

In `src/pages/ContentCalendar.tsx`, add imports:

```tsx
import { useSchedulerEnabled } from "@/lib/featureFlags";
import { useScheduledPosts } from "@/lib/hooks/useScheduledPosts";
import { PostStatusBadge } from "@/components/scheduler/PostStatusBadge";
import { PostDetailsModal } from "@/components/scheduler/PostDetailsModal";
import { ReauthBanner } from "@/components/scheduler/ReauthBanner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ScheduledPostRow } from "@/lib/hooks/useScheduledPosts";
```

Inside the component, add state + queries:

```tsx
const { enabled: schedulerEnabled } = useSchedulerEnabled();
const [filter, setFilter] = useState<"all" | "drafts" | "scheduled" | "published" | "failed">("all");
const { data: posts = [] } = useScheduledPosts(clientId, filter);
const [detailPost, setDetailPost] = useState<ScheduledPostRow | null>(null);
```

In the JSX, conditionally render the new section. Find a sensible spot (e.g., above the existing calendar grid) and add:

```tsx
{schedulerEnabled && (
  <div className="space-y-3 mb-6">
    <ReauthBanner clientId={clientId} />
    <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="drafts">Drafts</TabsTrigger>
        <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
        <TabsTrigger value="published">Published</TabsTrigger>
        <TabsTrigger value="failed">Failed</TabsTrigger>
      </TabsList>
    </Tabs>
    <div className="space-y-2">
      {posts.map((p) => (
        <button
          key={p.id}
          onClick={() => setDetailPost(p)}
          className="w-full text-left border rounded p-3 hover:bg-accent transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium truncate flex-1">{p.caption.slice(0, 80) || "(no caption)"}</span>
            <PostStatusBadge post={p} />
          </div>
          <p className="text-xs text-muted-foreground">
            {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}
          </p>
        </button>
      ))}
      {posts.length === 0 && (
        <p className="text-sm text-muted-foreground p-3">No posts.</p>
      )}
    </div>
    {detailPost && <PostDetailsModal post={detailPost} onClose={() => setDetailPost(null)} />}
  </div>
)}
```

- [ ] **Step 3: Manually verify**

```bash
npm run dev
# Open ContentCalendar for a client where you've created at least one scheduled_posts row.
# Confirm: tabs visible, the row shows with status badge and platform icons.
# Click a row -> details modal opens. If a target is failed, Retry button appears.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/scheduler/ReauthBanner.tsx src/pages/ContentCalendar.tsx
git commit -m "feat(scheduler): ContentCalendar status tabs + reauth banner"
```

---

## Wave 8 — End-to-end test + ship Phase A

### Task A25: End-to-end dry-run pipeline test

**Files:**
- None (verification only)

- [ ] **Step 1: Enable scheduler locally**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "UPDATE app_settings SET scheduler_enabled=true WHERE id=true;"
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "INSERT INTO user_settings (user_id, scheduler_beta_enabled) VALUES ('<your-user-id>', true) ON CONFLICT (user_id) DO UPDATE SET scheduler_beta_enabled = true;"
echo "DRY_RUN_SCHEDULER=true" >> supabase/.env
```

- [ ] **Step 2: Serve required edge functions**

```bash
supabase functions serve --env-file supabase/.env
```

- [ ] **Step 3: Walk the happy path through the UI**

1. Open ClientDetail → Social accounts tab. (FB/IG will show "Connect" — in DRY_RUN we can also manually insert fake `social_connections` rows for the test.)
2. If you don't have real Meta sandbox OAuth yet, insert two fake active connections:
   ```bash
   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' <<'SQL'
   INSERT INTO social_connections (client_id, platform, account_label, platform_account_id, access_token_enc, scopes, status)
   VALUES
     ((SELECT id FROM clients LIMIT 1), 'facebook',  'Test FB Page', 'page_test',  'fake', '{}', 'active'),
     ((SELECT id FROM clients LIMIT 1), 'instagram', '@test',        'ig_test',    'fake', '{}', 'active');
   SQL
   ```
3. Open EditingQueue → click Schedule on a row with a video.
4. Composer opens. Tick Facebook + Instagram. Mode = "Schedule for…", pick 1 minute from now.
5. Submit. Verify toast "Scheduled".
6. Wait 60-90s. The pg_cron job fires the dispatcher (or kick it manually):
   ```bash
   curl -X POST "http://127.0.0.1:54321/functions/v1/publish-scheduled-posts" \
     -H "Authorization: Bearer $(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'=' -f2)"
   ```
7. Verify in DB:
   ```bash
   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "SELECT p.status AS post_status, t.platform, t.status AS target_status, t.platform_post_url FROM scheduled_posts p JOIN scheduled_post_targets t ON t.scheduled_post_id=p.id ORDER BY p.created_at DESC LIMIT 5;"
   ```
   Expected: parent `published`, both targets `published` with `dryrun-*` URLs.
8. Open ContentCalendar → "Published" tab → row visible with green badge.
9. Open the row → details modal shows both targets published with "View live post" links.

- [ ] **Step 4: Walk the failure path**

1. Manually flip one target's status back to pending and pretend the publisher fails:
   ```bash
   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' <<'SQL'
   UPDATE scheduled_post_targets SET status='failed', last_error='Simulated failure', attempt_count=5, next_attempt_at=NULL
   WHERE id IN (SELECT id FROM scheduled_post_targets ORDER BY created_at DESC LIMIT 1);
   SQL
   ```
2. Refresh ContentCalendar → row shows partial/failed badge with one red icon.
3. Open details modal → Retry button appears → click. After ~60s the target should be re-attempted (dry-run will publish).

- [ ] **Step 5: Walk the kill-switch path**

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c "UPDATE app_settings SET scheduler_enabled=false WHERE id=true;"
curl -X POST "http://127.0.0.1:54321/functions/v1/publish-scheduled-posts" \
  -H "Authorization: Bearer $(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'=' -f2)"
```
Expected: `{"skipped":"scheduler_disabled"}`. No targets dispatched.

- [ ] **Step 6: Document outcome**

If everything passed, you're done with Phase A. Note any deviations in `docs/superpowers/specs/2026-05-13-multi-platform-post-scheduler-design.md` under "Implementation notes" (add the section if missing) before shipping.

---

### Task A26: Live test against Meta sandbox

**Files:**
- None (manual verification)

This task is **prerequisite-gated**: you need a Meta dev app with the scheduler scopes approved (or in Development mode with a test Page + test IG Business account).

- [ ] **Step 1: Disable dry-run**

```bash
# Remove DRY_RUN_SCHEDULER from supabase/.env or set to false
sed -i.bak '/^DRY_RUN_SCHEDULER=/d' supabase/.env
echo "DRY_RUN_SCHEDULER=false" >> supabase/.env
```

- [ ] **Step 2: Run real OAuth**

From the social-accounts tab, click Connect → complete Meta OAuth (your test user) → pick a Page that has a linked IG Business account → verify two `social_connections` rows appear (`facebook` + `instagram`).

- [ ] **Step 3: Upload a real 9:16 video**

To a Supabase Storage bucket. Note the public URL. (If your EditingQueue rows have real `file_submission` URLs, just use one of those.)

- [ ] **Step 4: Schedule a post 2 minutes out, wait, verify on Meta**

The post should appear in the test Page's Reels tab and the test IG account's Reels tab. Verify the `platform_post_id` and `platform_post_url` in `scheduled_post_targets` match the live posts.

- [ ] **Step 5: Document & ship**

If the live test passes:
- Push branch: `git push -u origin feat/post-scheduler-phase-a`
- Open PR titled "feat(scheduler): Phase A — Foundation + Meta (beta-gated)"
- In prod, leave `VITE_FEATURE_SCHEDULER=false` and `app_settings.scheduler_enabled=false` until you're ready to onboard beta testers.

---

## Phase A — Self-review checklist

After implementing all tasks above, confirm:

- [ ] All Phase A spec requirements covered? Walk Section 3 (data model), 4 (OAuth), 5 (composer), 6 (publish pipeline), 7 (errors/retry), 8 (beta gating) of the spec against the tasks above. List any gaps.
- [ ] No placeholder text in committed files (`TODO`, `FIXME` left over from copy-paste).
- [ ] Type names consistent: `SocialConnection`, `SocialConnectionRow`, `ScheduledPostRow`, `TargetRow`.
- [ ] Idempotency: `publish-to-meta` returns early if `platform_post_id` is already set.
- [ ] Backoff: `[5,15,60,240,240]` minutes in dispatcher and publisher match.
- [ ] All migrations applied via `supabase db reset --local` from a clean state (no manual fixups needed).

---

# Phase B — TikTok (outline)

**Status:** Blocked on TikTok Content Posting API approval. Plan in full detail once approved.

**Anticipated tasks (~8):**

1. New edge function `tiktok-oauth` mirroring the structure of `facebook-oauth` for scheduler purpose. Scopes: `user.info.basic`, `video.upload`, `video.publish`. Store both access and refresh token (24h / 365d TTLs) encrypted.
2. New page `src/pages/TiktokCallback.tsx` mirroring `FacebookCallback`.
3. Update `useStartFacebookOAuth` → split into a single `useStartOAuth(platform)` helper that branches per platform; add `tiktok` case.
4. Update `SocialAccountsTab`: remove `disabled` for TikTok.
5. New edge function `publish-to-tiktok`. Content Posting API PULL_FROM_URL → poll status (every 10s, 10-min cap) → success returns post ID. Build URL.
6. Add `tiktok` to dispatcher's `PLATFORM_TO_FN` map (already there — verify).
7. Lazy refresh helper: `refreshTikTokToken(connection)` called by `publish-to-tiktok` when `token_expires_at` is within 5 min of now.
8. Live test against TikTok sandbox app.

**New env vars:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.

# Phase C — YouTube (outline)

**Status:** Blocked on Google Cloud project + (optional) quota raise. Plan in full detail once project is set up.

**Anticipated tasks (~8):**

1. New edge function `youtube-oauth`. Google OAuth2 with scope `https://www.googleapis.com/auth/youtube.upload` (consider adding `youtube.readonly` to fetch channel name for `account_label`). Access token 1h / refresh long-lived. Stored encrypted.
2. New page `src/pages/YoutubeCallback.tsx`.
3. Extend `useStartOAuth` with `youtube` case.
4. Update `SocialAccountsTab`: remove `disabled` for YouTube.
5. New edge function `publish-to-youtube`. Resumable upload — POST metadata to `/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` → stream bytes to returned `Location` URL → success response includes video resource.
6. Title derivation: first line of caption (≤100 chars) → `snippet.title`; full caption → `snippet.description`. Document this choice in user-facing copy ("Your caption's first line becomes the YouTube title").
7. Lazy refresh helper for Google access tokens.
8. Quota monitoring: log `quota cost` per upload to a `scheduled_post_events` table or Function Logs; revisit if approaching daily cap.

**New env vars:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.

# Phase D — GA

After A/B/C are stable for ≥2 weeks of beta usage:

1. Flip `VITE_FEATURE_SCHEDULER=true` in prod.
2. Remove per-user `scheduler_beta_enabled` gate from `useSchedulerEnabled` (or keep it as a kill-switch for individual users with issues).
3. Keep `app_settings.scheduler_enabled` as the permanent runtime kill-switch.
4. Announcement in-app + docs update.
