import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";
const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";
const BATCH = 10;
const MAX_ATTEMPTS = 3;

/**
 * How long a claim holds a row before another tick may take it. A full batch
 * paces 10 profiles ~5s apart, so ~50-70s is normal; the lease has to clear
 * that comfortably or a slow-but-healthy tick would have its own rows stolen
 * mid-flight. It also has to EXPIRE, so an invocation killed by the platform
 * releases its rows instead of stranding them as permanently-claimed.
 */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Ceiling on the VPS call. Must stay under both the edge invocation budget and
 * the 60s cron cadence: an unbounded fetch is what let a batch outlive its own
 * tick, which is what let the next tick double-claim the same rows.
 */
const VPS_TIMEOUT_MS = 35_000;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Claim: read candidates, then bump attempts with a compare-and-swap. The
  // UPDATE's .eq("enrichment_attempts", c.enrichment_attempts) only succeeds
  // if the row's attempts count still matches what we just read — if another
  // overlapping tick already bumped it between our SELECT and our UPDATE,
  // this UPDATE affects zero rows and we skip it. This closes the race for
  // every attempt (not just the final 2->3 one, where the plain `< MAX`
  // filter alone happens to already exclude a concurrently-bumped row).
  const leaseCutoff = new Date(Date.now() - CLAIM_LEASE_MS).toISOString();
  const { data: candidates, error: selErr } = await supabase
    .from("ig_prospects")
    .select("id, username, enrichment_attempts")
    .eq("enrichment_status", "pending")
    .lt("enrichment_attempts", MAX_ATTEMPTS)
    // Skip rows another tick is still working. The CAS below stops two ticks
    // claiming in the same instant; this stops the NEXT tick claiming a row
    // that is mid-scrape, which is the common case at ~50s/batch on a 60s cron.
    .or(`claimed_at.is.null,claimed_at.lt.${leaseCutoff}`)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (selErr) return json({ error: selErr.message }, 500);
  if (!candidates || candidates.length === 0) {
    return json({ claimed: 0, enriched: 0, failed: 0, rolled_back: 0, sessions_exhausted: false });
  }

  const claimed: typeof candidates = [];
  for (const c of candidates) {
    const { data, error } = await supabase
      .from("ig_prospects")
      .update({ enrichment_attempts: c.enrichment_attempts + 1, claimed_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("enrichment_attempts", c.enrichment_attempts) // CAS: only if unchanged since our SELECT
      .select("id");
    if (!error && data && data.length > 0) claimed.push(c);
    // else: another tick already claimed this row between our SELECT and UPDATE — skip it.
  }

  if (claimed.length === 0) {
    return json({ claimed: 0, enriched: 0, failed: 0, rolled_back: 0, sessions_exhausted: false });
  }

  const usernames = claimed.map((c) => c.username);
  let profiles: Record<string, Record<string, unknown>> = {};
  let sessionsExhausted = false;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), VPS_TIMEOUT_MS);
  try {
    const res = await fetch(`${VPS_SERVER}/ig-profile-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ usernames }),
      signal: ac.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (res.status === 503) {
      sessionsExhausted = true;
    } else if (!res.ok) {
      sessionsExhausted = false;
    } else {
      profiles = payload.profiles ?? {};
      sessionsExhausted = !!payload.sessionsExhausted;
    }
  } catch {
    // Includes the abort. Leaving `profiles` empty routes every claimed row
    // down the rollback path below, which is what we want: a timeout is an
    // infrastructure failure, not evidence that any handle is bad.
    sessionsExhausted = false;
  } finally {
    clearTimeout(timer);
  }

  let enriched = 0, failed = 0, rolledBack = 0;

  for (const c of claimed) {
    const p = profiles[c.username];
    // Every release below is CAS'd on the attempts value THIS tick wrote. If
    // the row no longer carries it, our lease expired and another tick owns the
    // row now — our write would clobber fresher work, so it lands on zero rows
    // instead. Without this a slow tick could flip a row another tick had
    // already enriched back to 'pending', or reset attempts below its claim and
    // remove the retry ceiling entirely.
    const mine = c.enrichment_attempts + 1;

    // No answer at all (batch aborted, scraper unreachable, timed out, sessions
    // down): give the attempt back and release the lease, so an Instagram
    // outage cannot burn a row's retries.
    if (!p) {
      await supabase
        .from("ig_prospects")
        .update({ enrichment_attempts: c.enrichment_attempts, claimed_at: null })
        .eq("id", c.id)
        .eq("enrichment_attempts", mine);
      rolledBack++;
      continue;
    }

    // A throttle is the egress being rate-limited, not the handle being bad —
    // treat it like no answer so it can't march a real prospect to 'failed'.
    if (p.error === "throttled") {
      await supabase
        .from("ig_prospects")
        .update({ enrichment_attempts: c.enrichment_attempts, claimed_at: null })
        .eq("id", c.id)
        .eq("enrichment_attempts", mine);
      rolledBack++;
      continue;
    }

    if (p.error) {
      const exhausted = mine >= MAX_ATTEMPTS;
      await supabase
        .from("ig_prospects")
        .update({
          enrichment_error: String(p.error),
          enrichment_status: exhausted ? "failed" : "pending",
          claimed_at: null,
        })
        .eq("id", c.id)
        .eq("enrichment_attempts", mine);
      if (exhausted) failed++;
      continue;
    }

    await supabase
      .from("ig_prospects")
      .update({
        ig_user_id: p.ig_user_id ?? null,
        full_name: p.full_name ?? null,
        biography: p.biography ?? null,
        external_url: p.external_url ?? null,
        category: p.category ?? null,
        is_business: p.is_business ?? null,
        media_count: p.media_count ?? null,
        follower_count: p.follower_count ?? null,
        following_count: p.following_count ?? null,
        public_email: p.public_email ?? null,
        public_phone: p.public_phone ?? null,
        city_name: p.city_name ?? null,
        is_private: !!p.is_private,
        is_verified: !!p.is_verified,
        enrichment_status: "done",
        enrichment_error: null,
        enriched_at: new Date().toISOString(),
        claimed_at: null,
      })
      .eq("id", c.id)
      .eq("enrichment_attempts", mine);
    enriched++;
  }

  console.log(`[ig-prospect-enrich] claimed=${claimed.length} enriched=${enriched} failed=${failed} rolled_back=${rolledBack} exhausted=${sessionsExhausted}`);

  return json({
    claimed: claimed.length,
    enriched,
    failed,
    rolled_back: rolledBack,
    sessions_exhausted: sessionsExhausted,
  });
});
