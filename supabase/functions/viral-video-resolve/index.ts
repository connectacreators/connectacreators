// supabase/functions/viral-video-resolve/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = Deno.env.get("VPS_API_KEY") ?? "ytdlp_connecta_2026_secret";

// Best-effort: fetch caption + stats + channel from the VPS scraper.
// Returns null on any failure — caller must handle the empty case so the
// resolve flow never blocks on the network.
async function scrapeMetadata(url: string): Promise<{
  caption: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  comments: number;
  outlier: number;
  posted_at: string | null;
  channel_username: string | null;
} | null> {
  try {
    const res = await fetch(`${VPS_SERVER}/scrape-single-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const vps = await res.json();
    if (!vps) return null;
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
          body: JSON.stringify({ url: thumb, key: `submit_${Date.now()}` }),
          signal: AbortSignal.timeout(10_000),
        });
        if (cacheRes.ok) {
          const { cached_url } = await cacheRes.json();
          if (cached_url) thumb = cached_url;
        }
      } catch { /* non-blocking */ }
    }
    return {
      caption: String(vps.title ?? vps.caption ?? "").slice(0, 600) || null,
      thumbnail_url: thumb,
      views: Number(vps.views) || 0,
      likes: Number(vps.likes) || 0,
      comments: Number(vps.comments) || 0,
      outlier: Number(vps.outlier_score) || 0,
      posted_at: postedAt,
      channel_username: ((vps.owner_username as string | undefined) ?? "").replace(/^@/, "") || null,
    };
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Same shape as scrape-framework-url's regex — matches URLs that actually
// embed the username (e.g. /username/reel/SHORTCODE/) and deliberately does
// NOT match the bare /reel/SHORTCODE/ shape, which has no username to give.
function usernameFromRawUrl(rawUrl: string): string | null {
  const m =
    rawUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/(?:reels?|p)\//i) ??
    rawUrl.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/i);
  return m ? m[1] : null;
}

// Real outlier score: views ÷ the channel's trailing-90d median (same
// formula as recompute_channel_outliers). Needs ≥3 peer videos to be
// meaningful; falls back to 1 ("at channel average") otherwise — this path
// has no VPS-provided outlier to trust (the VPS always returns 0 for
// single-URL fetches, it's not computed there).
async function computeOutlierScore(
  admin: ReturnType<typeof createClient>,
  platform: string,
  channelUsername: string,
  postId: string,
  views: number,
): Promise<number> {
  if (!channelUsername || channelUsername === "unknown" || views <= 0) return 1;
  const { data: peers } = await admin
    .from("viral_videos")
    .select("views_count")
    .eq("platform", platform)
    .eq("channel_username", channelUsername)
    .gt("views_count", 0)
    .gte("posted_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .neq("apify_video_id", postId);
  const counts = (peers ?? []).map((p) => p.views_count as number).sort((a, b) => a - b);
  if (counts.length < 3) return 1;
  const mid = Math.floor(counts.length / 2);
  const median = counts.length % 2 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2;
  return median > 0 ? Math.round((views / median) * 100) / 100 : 1;
}

async function lookupChannelId(
  admin: ReturnType<typeof createClient>,
  platform: string,
  channelUsername: string,
): Promise<string | null> {
  if (!channelUsername || channelUsername === "unknown") return null;
  const { data } = await admin
    .from("viral_channels")
    .select("id")
    .eq("platform", platform)
    .eq("username", channelUsername.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

// A row counts as "incomplete" if it was born during a scraper outage —
// re-resolving it (rather than returning the stale stub forever) is how a
// user recovers from that just by pasting the same URL again.
function isIncomplete(row: Record<string, unknown>): boolean {
  return (
    !row.channel_username ||
    row.channel_username === "unknown" ||
    !row.views_count ||
    !row.outlier_score
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Auth: require user JWT.
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userResult } = await userClient.auth.getUser();
  const user = userResult?.user;
  if (!user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { url?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (!body.url) return jsonResponse({ error: "missing_url" }, 400);

  const canonical = canonicalizeVideoUrl(body.url);
  if (!canonical) return jsonResponse({ error: "unsupported_url" }, 400);

  // Find by (platform, apify_video_id).
  const { data: existing, error: findErr } = await admin
    .from("viral_videos")
    .select("*")
    .eq("platform", canonical.platform)
    .eq("apify_video_id", canonical.postId)
    .maybeSingle();
  if (findErr) return jsonResponse({ error: "db_error", message: findErr.message }, 500);
  // A row born during a scraper outage (unknown channel, no views, no
  // outlier) gets re-resolved rather than returned stale forever — this is
  // the only way a user can recover one just by pasting the URL again.
  if (existing && !isIncomplete(existing)) {
    return jsonResponse({ row: existing, created: false }, 200);
  }

  // Best-effort channel_username extraction from the raw URL, used only if
  // the VPS scrape below doesn't give us one directly.
  const regexUsername = usernameFromRawUrl(body.url);

  // Pull live stats from the VPS scraper BEFORE insert so the row is born
  // with views / likes / comments / channel / caption / thumb populated.
  // Best-effort: if VPS times out or errors we still create the stub row
  // (the user can hit "Analyze" later, which re-attempts the enrichment).
  const meta = await scrapeMetadata(canonical.normalizedUrl);
  const engagementRate =
    meta && meta.views > 0
      ? Math.round(((meta.likes + meta.comments) / meta.views) * 100 * 100) / 100
      : 0;
  const channelUsername = meta?.channel_username || regexUsername || "unknown";
  const views = meta?.views ?? 0;
  const [outlierScore, channelId] = await Promise.all([
    computeOutlierScore(admin, canonical.platform, channelUsername, canonical.postId, views),
    lookupChannelId(admin, canonical.platform, channelUsername),
  ]);

  const fields: Record<string, unknown> = {
    channel_username: channelUsername,
    channel_id: channelId,
    outlier_score: outlierScore,
    views_count: views,
    likes_count: meta?.likes ?? 0,
    comments_count: meta?.comments ?? 0,
    engagement_rate: engagementRate,
    caption: meta?.caption ?? null,
    thumbnail_url: meta?.thumbnail_url ?? null,
    posted_at: meta?.posted_at ?? null,
    scraped_at: new Date().toISOString(),
  };

  if (existing) {
    const { data: updated, error: updateErr } = await admin
      .from("viral_videos")
      .update(fields)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateErr) return jsonResponse({ error: "update_failed", message: updateErr.message }, 500);
    return jsonResponse({ row: updated, created: false }, 200);
  }

  // Insert pending stub.
  const insertPayload: Record<string, unknown> = {
    ...fields,
    platform: canonical.platform,
    apify_video_id: canonical.postId,
    video_url: canonical.normalizedUrl,
    analysis_status: "pending",
    user_submitted: true,
    submitted_by: user.id,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("viral_videos")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr) {
    // 23505 = unique violation; race with another resolver. Re-select.
    if (insertErr.code === "23505") {
      const { data: winner } = await admin
        .from("viral_videos")
        .select("*")
        .eq("platform", canonical.platform)
        .eq("apify_video_id", canonical.postId)
        .single();
      if (winner) return jsonResponse({ row: winner, created: false }, 200);
    }
    return jsonResponse({ error: "insert_failed", message: insertErr.message }, 500);
  }

  return jsonResponse({ row: inserted, created: true }, 201);
});
