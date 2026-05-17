// supabase/functions/backfill-user-submitted-stats/index.ts
//
// One-shot: finds user_submitted viral_videos rows that were inserted as
// empty stubs (views_count=0 OR channel_username='unknown' OR caption is
// null) and re-scrapes them via the VPS so they show real stats on the
// Viral Today page. Same enrichment logic as viral-video-resolve and
// transcribe-viral-video's enrichMetadataIfMissing — kept inline here so
// this function is callable from the dashboard without coupling to the
// transcribe flow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function scrapeOne(url: string) {
  try {
    const res = await fetch(`${VPS_SERVER}/scrape-single-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Optional query param ?limit=N (default 50, hard cap 200)
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 200);

  const { data: stubs, error: queryErr } = await admin
    .from("viral_videos")
    .select("id, video_url, views_count, channel_username, caption, thumbnail_url, outlier_score, posted_at")
    .eq("user_submitted", true)
    .or("views_count.eq.0,channel_username.eq.unknown,caption.is.null")
    .order("scraped_at", { ascending: false })
    .limit(limit);

  if (queryErr) return json({ error: "query_failed", message: queryErr.message }, 500);
  if (!stubs || stubs.length === 0) return json({ scanned: 0, updated: 0 }, 200);

  let updated = 0;
  const failures: Array<{ id: string; reason: string }> = [];
  for (const row of stubs) {
    const vps = await scrapeOne(row.video_url);
    if (!vps) {
      failures.push({ id: row.id, reason: "vps_timeout_or_empty" });
      continue;
    }

    const caption = String(vps.title ?? vps.caption ?? "").slice(0, 600) || null;
    const views = Number(vps.views) || 0;
    const likes = Number(vps.likes) || 0;
    const comments = Number(vps.comments) || 0;
    const engagementRate = views > 0
      ? Math.round(((likes + comments) / views) * 100 * 100) / 100
      : 0;
    const outlier = Number(vps.outlier_score) || 0;
    let postedAt: string | null = null;
    if (vps.posted_at) {
      const num = typeof vps.posted_at === "number" ? vps.posted_at : Number(vps.posted_at);
      if (!isNaN(num) && num > 0) {
        postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
      }
    }
    let thumb: string | null = (vps.thumbnail as string | undefined) ?? null;
    if (thumb && /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent/.test(thumb)) {
      try {
        const cacheRes = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
          body: JSON.stringify({ url: thumb, key: `backfill_${row.id}` }),
          signal: AbortSignal.timeout(10_000),
        });
        if (cacheRes.ok) {
          const { cached_url } = await cacheRes.json();
          if (cached_url) thumb = cached_url;
        }
      } catch { /* non-blocking */ }
    }
    const channelUsername = ((vps.owner_username as string | undefined) ?? "").replace(/^@/, "");

    // Only patch fields that are empty/zero — don't clobber existing data.
    const patch: Record<string, unknown> = {};
    if (!row.caption && caption) patch.caption = caption;
    if (!row.thumbnail_url && thumb) patch.thumbnail_url = thumb;
    if ((row.views_count ?? 0) === 0 && views > 0) {
      patch.views_count = views;
      if (likes > 0) patch.likes_count = likes;
      if (comments > 0) patch.comments_count = comments;
      if (engagementRate > 0) patch.engagement_rate = engagementRate;
    }
    if ((row.outlier_score ?? 0) === 0 && outlier > 0) patch.outlier_score = outlier;
    if (row.channel_username === "unknown" && channelUsername && channelUsername !== "unknown") {
      patch.channel_username = channelUsername;
    }
    if (!row.posted_at && postedAt) patch.posted_at = postedAt;
    patch.scraped_at = new Date().toISOString();

    if (Object.keys(patch).length === 1) {
      // Only scraped_at — VPS returned nothing useful for this row
      failures.push({ id: row.id, reason: "vps_returned_no_stats" });
      continue;
    }

    const { error: updErr } = await admin
      .from("viral_videos")
      .update(patch)
      .eq("id", row.id);
    if (updErr) {
      failures.push({ id: row.id, reason: updErr.message });
      continue;
    }
    updated++;
  }

  return json({ scanned: stubs.length, updated, failures }, 200);
});
