import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

// ── Thumbnail caching ────────────────────────────────────────────────────────

async function cacheThumbnail(cdnUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url: cdnUrl, key }),
    });
    if (!res.ok) return null;
    const { cached_url } = await res.json();
    return cached_url || null;
  } catch { return null; }
}

function shouldCacheThumbnail(url: string | null): boolean {
  if (!url) return false;
  return /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent|tiktokcdn\.com/.test(url);
}

// ── YouTube view count parser (kept for safety — VPS returns numeric) ────────

function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}

// HARD CAP: never scrape more than 100 posts per channel (150 for YouTube).
const MAX_RESULTS_PER_CHANNEL = 100;
const MAX_RESULTS_YOUTUBE = 150;

// ── VPS retry helper: retry up to `retries` times on 503 (server busy) ──────
async function fetchVpsWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  delayMs = 6000,
): Promise<Response> {
  let res = await fetch(url, init);
  while (res.status === 503 && retries-- > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url, init);
  }
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();

    // ── action: "check" — just read DB status (no more Apify polling) ──────
    if (body.action === "check") {
      const { channelId } = body;
      if (!channelId) return json({ error: "channelId required" }, 400);

      const { data: channel, error: chErr } = await supabase
        .from("viral_channels")
        .select("scrape_status, scrape_error, video_count")
        .eq("id", channelId)
        .single();

      if (chErr || !channel) {
        return json({ error: "Channel not found" }, 404);
      }

      if (channel.scrape_status === "done") {
        return json({ success: true, status: "done", videosStored: channel.video_count ?? 0 });
      }
      if (channel.scrape_status === "error") {
        return json({ success: false, status: "error", error: channel.scrape_error });
      }

      // Still running or other status
      return json({ success: true, status: channel.scrape_status ?? "running" });
    }

    // ── action: "trigger" (default) — call VPS synchronously ───────────────
    const { channelId, username, platform = "instagram" } = body;

    if (!channelId || !username) {
      return json({ error: "channelId and username required" }, 400);
    }

    // ── Parse/clean username from URLs ─────────────────────────────────────
    const tiktokMatch = username.match(/tiktok\.com\/@?([^/?#\s]+)/i);
    const instaMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
    const ytHandleMatch = username.match(/youtube\.com\/@([^/?#\s]+)/i);
    const ytCustomMatch = username.match(/youtube\.com\/c\/([^/?#\s]+)/i);
    const ytChannelMatch = username.match(/youtube\.com\/channel\/([^/?#\s]+)/i);

    // Reject single YouTube video URLs
    if (platform === "youtube" && /youtube\.com\/shorts\/[^/]+\/?$/.test(username)) {
      await supabase.from("viral_channels")
        .update({ scrape_status: "error", scrape_error: "Paste a YouTube channel URL, not a single video URL" })
        .eq("id", channelId);
      return json({ error: "Paste a YouTube channel URL, not a single video URL" }, 400);
    }

    const cleanUsername =
      tiktokMatch ? tiktokMatch[1].replace(/\/$/, "").toLowerCase()
      : instaMatch ? instaMatch[1].replace(/\/$/, "").toLowerCase()
      : ytHandleMatch ? ytHandleMatch[1].replace(/\/$/, "")
      : ytCustomMatch ? ytCustomMatch[1].replace(/\/$/, "")
      : ytChannelMatch ? ytChannelMatch[1].replace(/\/$/, "")
      : username.replace(/^@/, "").trim();

    const limit = platform === "youtube" ? MAX_RESULTS_YOUTUBE : MAX_RESULTS_PER_CHANNEL;

    // ── Mark channel as running ────────────────────────────────────────────
    await supabase
      .from("viral_channels")
      .update({ scrape_status: "running", scrape_error: null, apify_run_id: "vps-sync" })
      .eq("id", channelId);

    // ── Call VPS /scrape-profile (retries on 503 busy up to 2×) ───────────
    let vpsRes: Response;
    try {
      vpsRes = await fetchVpsWithRetry(
        `${VPS_SERVER}/scrape-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
          body: JSON.stringify({ platform, username: cleanUsername, limit }),
        },
      );
    } catch (fetchErr: any) {
      const errMsg = `VPS unreachable: ${fetchErr.message ?? "connection failed"}`;
      await supabase.from("viral_channels")
        .update({ scrape_status: "error", scrape_error: errMsg })
        .eq("id", channelId);
      return json({ error: errMsg }, 502);
    }

    // VPS still busy after retries — reset channel to idle so user can retry
    if (vpsRes.status === 503) {
      await supabase.from("viral_channels")
        .update({ scrape_status: "idle", scrape_error: null })
        .eq("id", channelId);
      return json({ server_busy: true, message: "Server busy, please try again in ~30 seconds" });
    }

    if (!vpsRes.ok) {
      const errText = await vpsRes.text();
      const errMsg = `VPS error ${vpsRes.status}: ${errText.slice(0, 300)}`;
      await supabase.from("viral_channels")
        .update({ scrape_status: "error", scrape_error: errMsg })
        .eq("id", channelId);
      return json({ error: errMsg }, 502);
    }

    const vpsData = await vpsRes.json();
    const posts: any[] = vpsData.posts ?? [];

    // ── Save profile picture if VPS returned one ─────────────────────────
    const profilePicUrl = vpsData.profilePicUrl ?? null;
    if (profilePicUrl) {
      // Cache to VPS so CDN URLs don't expire
      const avatarKey = `${platform}_${cleanUsername}`;
      const cachedAvatar = await cacheThumbnail(profilePicUrl, `avatar_${avatarKey}`);
      const finalAvatar = cachedAvatar || profilePicUrl;
      await supabase.from("viral_channels")
        .update({ avatar_url: finalAvatar })
        .eq("id", channelId);
    }

    // ── Process posts into viral_videos rows ───────────────────────────────
    const count = await processPosts(supabase, channelId, cleanUsername, platform, posts);
    return json({ success: true, status: "done", runId: "vps-sync", videosStored: count });

  } catch (e: any) {
    console.error("scrape-channel error:", e);
    return json({ error: e.message }, 500);
  }
});

// ── Helper: map VPS posts into viral_videos and upsert ──────────────────────

async function processPosts(
  supabase: any,
  channelId: string,
  username: string,
  platform: string,
  posts: any[]
): Promise<number> {
  if (!Array.isArray(posts) || posts.length === 0) {
    await supabase
      .from("viral_channels")
      .update({ scrape_status: "done", last_scraped_at: new Date().toISOString() })
      .eq("id", channelId);
    return 0;
  }

  // Map VPS post fields → DB fields
  const videos = posts
    .map((post: any) => {
      const videoId = post.id ?? post.shortcode ?? null;
      if (!videoId) return null; // Drop posts with no id — would fail dedup constraint

      let views = typeof post.views === "number" ? post.views
        : typeof post.views === "string" ? parseYouTubeViewCount(post.views)
        : 0;
      const likes = Number(post.likes) || 0;
      const comments = Number(post.comments) || 0;

      // Engagement rate: prefer VPS value, fallback to manual calculation
      let engagementRate = Number(post.engagement_rate) || 0;
      if (!engagementRate && views > 0) {
        engagementRate = ((likes + comments) / views) * 100;
      }

      // Parse posted_at — VPS may return ISO string or unix timestamp
      let postedAt: string | null = null;
      if (post.posted_at) {
        const raw = post.posted_at;
        const num = typeof raw === "number" ? raw : Number(raw);
        if (!isNaN(num) && num > 0) {
          postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
        } else if (typeof raw === "string") {
          const parsed = new Date(raw);
          if (!isNaN(parsed.getTime())) postedAt = parsed.toISOString();
        }
      }

      return {
        channel_id: channelId,
        channel_username: username,
        platform,
        video_url: post.url ?? null,
        thumbnail_url: post.thumbnail ?? null,
        caption: (post.title ?? "").slice(0, 600),
        views_count: views,
        likes_count: likes,
        comments_count: comments,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        outlier_score: 1, // recalculated below
        posted_at: postedAt,
        apify_video_id: String(videoId),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  // Drop posts older than 12 months
  const twelveMonthsAgo = Date.now() - 365 * 86_400_000;
  const recentVideos = videos.filter(
    (v) => !v.posted_at || new Date(v.posted_at).getTime() >= twelveMonthsAgo
  );

  if (recentVideos.length === 0) {
    await supabase
      .from("viral_channels")
      .update({ scrape_status: "done", last_scraped_at: new Date().toISOString() })
      .eq("id", channelId);
    return 0;
  }

  // Calculate channel average views for outlier scoring
  const totalViews = recentVideos.reduce((sum, v) => sum + v.views_count, 0);
  const avgViews = totalViews / recentVideos.length;

  const videosWithOutlier = recentVideos.map((v) => ({
    ...v,
    outlier_score:
      avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
  }));

  // Cache expiring CDN thumbnails to VPS (Instagram/TikTok)
  for (const v of videosWithOutlier) {
    if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
      const key = `${v.platform}_${v.apify_video_id}`;
      const cached = await cacheThumbnail(v.thumbnail_url!, key);
      if (cached) v.thumbnail_url = cached;
    }
  }

  // Upsert — update existing videos if re-scraped
  const { data: inserted, error } = await supabase
    .from("viral_videos")
    .upsert(videosWithOutlier, {
      onConflict: "platform,apify_video_id",
      ignoreDuplicates: false,
    })
    .select("id, outlier_score, views_count");

  if (error) {
    console.error("Upsert error:", error);
  }

  // Trigger analyze-viral-video for qualifying rows (fire-and-forget background job)
  if (inserted && Array.isArray(inserted)) {
    for (const row of inserted) {
      if (row && Number(row.outlier_score ?? 0) >= 5 && Number(row.views_count ?? 0) >= 500000) {
        void fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-viral-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ video_id: row.id }),
        }).catch((e) => console.warn("[scrape-channel] analyze-viral-video trigger failed:", (e as Error).message));
      }
    }
  }

  // Update channel stats
  await supabase
    .from("viral_channels")
    .update({
      scrape_status: "done",
      last_scraped_at: new Date().toISOString(),
      avg_views: Math.round(avgViews),
      video_count: recentVideos.length,
    })
    .eq("id", channelId);

  return recentVideos.length;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
