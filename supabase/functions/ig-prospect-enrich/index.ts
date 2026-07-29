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

  // Claim: read candidates, then bump attempts. Bumping BEFORE the scrape is
  // what stops two overlapping cron ticks from processing the same row — the
  // second tick's filter (attempts < MAX) plus the changed value means it
  // selects a different set.
  const { data: candidates, error: selErr } = await supabase
    .from("ig_prospects")
    .select("id, username, enrichment_attempts")
    .eq("enrichment_status", "pending")
    .lt("enrichment_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (selErr) return json({ error: selErr.message }, 500);
  if (!candidates || candidates.length === 0) {
    return json({ claimed: 0, enriched: 0, failed: 0, rolled_back: 0, sessions_exhausted: false });
  }

  for (const c of candidates) {
    await supabase
      .from("ig_prospects")
      .update({ enrichment_attempts: c.enrichment_attempts + 1 })
      .eq("id", c.id);
  }

  const usernames = candidates.map((c) => c.username);
  let profiles: Record<string, Record<string, unknown>> = {};
  let sessionsExhausted = false;

  try {
    const res = await fetch(`${VPS_SERVER}/ig-profile-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ usernames }),
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
    sessionsExhausted = false;
  }

  let enriched = 0, failed = 0, rolledBack = 0;

  for (const c of candidates) {
    const p = profiles[c.username];

    // No answer at all (batch aborted, scraper unreachable, sessions down):
    // give the attempt back so an Instagram outage cannot burn a row's retries.
    if (!p) {
      await supabase
        .from("ig_prospects")
        .update({ enrichment_attempts: c.enrichment_attempts })
        .eq("id", c.id);
      rolledBack++;
      continue;
    }

    if (p.error) {
      const attempts = c.enrichment_attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("ig_prospects")
        .update({
          enrichment_error: String(p.error),
          enrichment_status: exhausted ? "failed" : "pending",
        })
        .eq("id", c.id);
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
      })
      .eq("id", c.id);
    enriched++;
  }

  console.log(`[ig-prospect-enrich] claimed=${candidates.length} enriched=${enriched} failed=${failed} rolled_back=${rolledBack} exhausted=${sessionsExhausted}`);

  return json({
    claimed: candidates.length,
    enriched,
    failed,
    rolled_back: rolledBack,
    sessions_exhausted: sessionsExhausted,
  });
});
