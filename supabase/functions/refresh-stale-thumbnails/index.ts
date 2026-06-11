// refresh-stale-thumbnails
//
// Batches through viral_videos rows whose stored thumbnail_url is unusable
// at runtime — signed Instagram/Facebook CDN URLs (always rotate) and TikTok
// CDN URLs whose x-expires has passed — and refreshes them by:
//   1. Re-resolving a fresh CDN URL via the existing fetch-thumbnail function
//   2. Self-hosting it on the VPS via /cache-thumbnail (returns a stable
//      connectacreators.com/thumb-cache/<platform>_<id>.jpg URL)
//   3. Updating viral_videos.thumbnail_url with the cached URL
//
// Idempotent: rows already on connectacreators.com are skipped. Designed to
// be run repeatedly (cron + manual) until all stale rows are clean.
//
// Auth: service_role only. Cron supplies it via pg_net; manual callers can
// also pass the service-role bearer.
//
// Body (all optional):
//   { limit?: 25, dry_run?: false }
//
// Response:
//   { processed, refreshed, failed, skipped, remaining, errors }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isTikTokExpired(url: string | null): boolean {
  if (!url) return false;
  if (!/tiktokcdn|tiktokv\.com/i.test(url)) return false;
  const m = url.match(/[?&]x-expires=(\d+)/);
  if (!m) return false;
  const exp = parseInt(m[1], 10);
  if (!Number.isFinite(exp)) return false;
  return exp * 1000 < Date.now();
}

function isRawTikTok(url: string | null): boolean {
  return !!url && /tiktokcdn|tiktokv\.com/i.test(url);
}

// A row "needs caching" if its thumbnail isn't already self-hosted and is
// either a rotating IG/FB CDN URL, ANY raw TikTok URL (valid OR expired), or
// null. Valid TikTok URLs are included on purpose: they still resolve right
// now, so we can self-host them directly before x-expires kills them, instead
// of waiting for them to break and hoping oEmbed can re-resolve them.
function isStale(url: string | null): boolean {
  if (!url) return true;
  if (url.includes("connectacreators.com")) return false;
  if (/cdninstagram\.com|fbcdn\.net|scontent[-.]|instagram\.f[a-z]{3}/.test(url)) return true;
  if (isRawTikTok(url)) return true;
  return false;
}

async function cacheToVPS(cdnUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url: cdnUrl, key }),
    });
    if (!res.ok) return null;
    const { cached_url } = await res.json();
    return cached_url || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let body: { limit?: number; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
  const dryRun = Boolean(body.dry_run);

  // Stale + has a source video_url we can resolve from. Already-self-hosted
  // rows excluded at the SQL layer.
  const { data: rows, error: selErr } = await admin
    .from("viral_videos")
    .select("id, video_url, thumbnail_url, platform, apify_video_id")
    .or(
      // PostgREST .or() can't do nested AND, so cast a wider net and filter
      // for actual staleness in JS via isStale().
      "thumbnail_url.is.null," +
      "thumbnail_url.ilike.%cdninstagram.com%," +
      "thumbnail_url.ilike.%fbcdn.net%," +
      "thumbnail_url.ilike.%scontent.%," +
      "thumbnail_url.ilike.%instagram.f%," +
      "thumbnail_url.ilike.%x-expires=%"
    )
    .not("video_url", "is", null)
    .not("thumbnail_url", "ilike", "%connectacreators.com%")
    .limit(limit * 2);
  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Drop TikTok rows whose x-expires is still in the future — they're fine.
  const targets = (rows ?? []).filter((r) => isStale(r.thumbnail_url)).slice(0, limit);

  let refreshed = 0;
  let failed = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  for (const row of targets) {
    if (dryRun) continue;
    try {
      // Fast path — a still-valid raw TikTok URL resolves right now, so
      // self-host it DIRECTLY without re-resolving via oEmbed (TikTok oEmbed
      // is unreliable from server IPs). This is how the bulk of TikTok rows
      // get fixed before they ever expire.
      if (isRawTikTok(row.thumbnail_url) && !isTikTokExpired(row.thumbnail_url) && row.apify_video_id) {
        const key = `${row.platform}_${row.apify_video_id}`;
        const cached = await cacheToVPS(row.thumbnail_url!, key);
        if (cached) {
          const { error: updErr } = await admin
            .from("viral_videos")
            .update({ thumbnail_url: cached })
            .eq("id", row.id);
          if (updErr) {
            failed++;
            errors.push({ id: row.id, reason: `update ${updErr.message}` });
          } else {
            refreshed++;
          }
          continue;
        }
        // Direct cache failed (VPS hiccup) — fall through to re-resolve below.
      }

      // Step 1 — re-resolve to a fresh CDN URL.
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-thumbnail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ url: row.video_url }),
      });
      if (!res.ok) {
        failed++;
        errors.push({ id: row.id, reason: `fetch-thumbnail ${res.status}` });
        continue;
      }
      const json = await res.json().catch(() => null);
      const fresh = json?.thumbnail_url as string | undefined;
      if (!fresh) {
        failed++;
        errors.push({ id: row.id, reason: "no thumbnail_url returned" });
        continue;
      }

      // Step 2 — self-host on VPS. Skip caching if no apify_video_id (key
      // would collide); fall back to storing the fresh CDN URL anyway —
      // at least it's fresh for an hour or so.
      let finalUrl = fresh;
      if (row.apify_video_id) {
        const key = `${row.platform}_${row.apify_video_id}`;
        const cached = await cacheToVPS(fresh, key);
        if (cached) finalUrl = cached;
      }

      // Step 3 — write back.
      const { error: updErr } = await admin
        .from("viral_videos")
        .update({ thumbnail_url: finalUrl })
        .eq("id", row.id);
      if (updErr) {
        failed++;
        errors.push({ id: row.id, reason: `update ${updErr.message}` });
        continue;
      }
      refreshed++;
    } catch (err) {
      failed++;
      errors.push({ id: row.id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Approx remaining count (wide query — overcounts TikTok rows whose
  // x-expires is still in the future, but good enough for cron pacing).
  const { count: remaining } = await admin
    .from("viral_videos")
    .select("id", { count: "exact", head: true })
    .or(
      "thumbnail_url.is.null," +
      "thumbnail_url.ilike.%cdninstagram.com%," +
      "thumbnail_url.ilike.%fbcdn.net%," +
      "thumbnail_url.ilike.%scontent.%," +
      "thumbnail_url.ilike.%instagram.f%," +
      "thumbnail_url.ilike.%x-expires=%"
    )
    .not("video_url", "is", null)
    .not("thumbnail_url", "ilike", "%connectacreators.com%");

  return new Response(
    JSON.stringify({
      processed: targets.length,
      refreshed,
      failed,
      skipped: (rows?.length ?? 0) - targets.length,
      remaining: remaining ?? null,
      dry_run: dryRun,
      errors: errors.slice(0, 5),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
