import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Dispatcher edge function. Two invocation paths:
//   1. pg_cron via net.http_post — body { source: "cron" }
//   2. Composer autopost path — body { force_post_id: "<uuid>" } to skip the time check
//
// On every call we first consult app_settings.scheduler_enabled (kill switch).
// Then we atomically claim a batch of due targets via the SQL function
// claim_scheduler_batch(), and fan out per-platform publish-* function calls.
// Publishers update their own rows, so this dispatcher is fire-and-forget.

const PLATFORM_TO_FN: Record<string, string> = {
  facebook:  "publish-to-meta",
  instagram: "publish-to-meta",
  tiktok:    "publish-to-tiktok",
  youtube:   "publish-to-youtube",
};

const MAX_ATTEMPTS = 5;
// Minutes between retries by attempt number. After MAX_ATTEMPTS the target
// goes to status='failed' permanently (manual retry only).
const BACKOFF_MIN = [5, 15, 60, 240, 240];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Kill switch
  const { data: settings } = await sb.from("app_settings").select("scheduler_enabled").maybeSingle();
  if (!settings?.scheduler_enabled) {
    return json({ skipped: "scheduler_disabled" });
  }

  // 2. Optional autopost override
  let forcePostId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      forcePostId = body?.force_post_id ?? null;
    } catch { /* noop */ }
  }

  // 3. Atomically claim a batch
  const { data: claimed, error: claimErr } = await sb.rpc("claim_scheduler_batch", {
    p_force_post_id: forcePostId,
  });
  if (claimErr) {
    console.error("claim error", claimErr);
    return json({ error: claimErr.message }, 500);
  }

  const targets =
    (claimed ?? []) as Array<{ id: string; scheduled_post_id: string; platform: string; attempt_count: number }>;

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
      // Fire and forget — the publisher writes its own outcome to the target row.
    } catch (err) {
      await markFailed(sb, t.id, `Dispatch error: ${String(err)}`, t.attempt_count);
    }
  }));

  return json({ dispatched: targets.length });
});

async function markFailed(sb: SupabaseClient, id: string, reason: string, attempt: number) {
  const terminal = attempt >= MAX_ATTEMPTS;
  const minutes = BACKOFF_MIN[Math.min(attempt - 1, BACKOFF_MIN.length - 1)];
  await sb.from("scheduled_post_targets").update({
    status: terminal ? "failed" : "pending",
    last_error: reason,
    next_attempt_at: terminal ? null : new Date(Date.now() + minutes * 60_000).toISOString(),
  }).eq("id", id);
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
