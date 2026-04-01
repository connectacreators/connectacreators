import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_ACTOR_INSTAGRAM = "apidojo~instagram-scraper";
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "scrapesmith~youtube-shorts-scraper";

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

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

function getActorId(platform: string) {
  if (platform === "tiktok") return APIFY_ACTOR_TIKTOK;
  if (platform === "youtube") return APIFY_ACTOR_YOUTUBE;
  return APIFY_ACTOR_INSTAGRAM;
}

function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}

// HARD CAP: never scrape more than 100 posts per channel per run regardless of caller input.
// apidojo~instagram-scraper burned $60+ when resultsLimit was silently ignored and full
// profiles (10,000+ posts) were scraped. This cap is the last line of defense.
const MAX_RESULTS_PER_CHANNEL = 100;

function buildApifyInput(platform: string, username: string, resultsLimit: number) {
  const safeLimit = Math.min(resultsLimit, MAX_RESULTS_PER_CHANNEL);
  if (platform === "tiktok") {
    return {
      handles: [username],
      startUrls: [{ url: `https://www.tiktok.com/@${username}` }],
      resultsPerPage: safeLimit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    };
  }
  if (platform === "youtube") {
    // scrapesmith~youtube-shorts-scraper: channelUrls + maxShortsPerChannel
    // YouTube Shorts cap is 200 (cheap actor), other platforms stay at 100
    const channelUrl = username.startsWith("http") ? username : `https://www.youtube.com/@${username}`;
    const cleanUrl = channelUrl.replace(/\/(shorts|videos|playlists)\/?$/, "");
    return {
      channelUrls: [cleanUrl],
      maxShortsPerChannel: Math.min(resultsLimit, 200),
    };
  }
  // apidojo~instagram-scraper: maxItems is the actual limit field
  // (resultsLimit is silently ignored by this actor — must use maxItems)
  return {
    startUrls: [`https://www.instagram.com/${username}/`],
    maxItems: safeLimit,
  };
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
    // ── POST: handle both trigger and check actions ────────────────────────
    if (req.method === "POST") {
      const body = await req.json();

      // ── action: "check" — poll an existing run ───────────────────────────
      if (body.action === "check") {
        const { channelId, runId } = body;
        if (!channelId || !runId) return json({ error: "channelId and runId required" }, 400);

        const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
        const statusData = await statusRes.json();
        const runStatus = statusData?.data?.status;
        const datasetId = statusData?.data?.defaultDatasetId;

        if (runStatus === "SUCCEEDED" && datasetId) {
          const { data: channel } = await supabase
            .from("viral_channels").select("username, platform").eq("id", channelId).single();
          const count = await processDataset(supabase, channelId, channel?.username ?? "", channel?.platform ?? "instagram", datasetId);
          return json({ success: true, status: "done", videosStored: count });
        }

        if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
          await supabase.from("viral_channels")
            .update({ scrape_status: "error", scrape_error: `Run ${runStatus}` }).eq("id", channelId);
          return json({ success: false, status: "error", runStatus });
        }

        return json({ success: true, status: "running", runStatus });
      }

      // ── action: "trigger" (default) — start a new scrape ─────────────────
      const { channelId, username, platform = "instagram" } = body;

      if (!channelId || !username) {
        return json({ error: "channelId and username required" }, 400);
      }

      // Accept full URLs like https://www.instagram.com/username/, https://tiktok.com/@user, or @username
      const tiktokMatch = username.match(/tiktok\.com\/@?([^/?#\s]+)/i);
      const instaMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
      const ytHandleMatch = username.match(/youtube\.com\/@([^/?#\s]+)/i);
      const ytCustomMatch = username.match(/youtube\.com\/c\/([^/?#\s]+)/i);
      const ytChannelMatch = username.match(/youtube\.com\/channel\/([^/?#\s]+)/i);

      // Reject single YouTube video URLs before calling Apify
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

      // For YouTube, build full URL to pass to buildApifyInput
      const youtubeFullUrl =
        ytHandleMatch ? `https://youtube.com/@${cleanUsername}`
        : ytCustomMatch ? `https://youtube.com/c/${cleanUsername}`
        : ytChannelMatch ? `https://youtube.com/channel/${cleanUsername}`
        : `https://youtube.com/@${cleanUsername}`;

      // Pass full URL as "username" for youtube (buildApifyInput checks startsWith("http"))
      const apifyUsername = platform === "youtube" ? youtubeFullUrl : cleanUsername;

      const actorId = getActorId(platform);

      // Mark channel as running
      await supabase
        .from("viral_channels")
        .update({ scrape_status: "running", scrape_error: null, apify_run_id: null })
        .eq("id", channelId);

      // Trigger Apify actor run (wait up to 25s — stays within Supabase's 60s timeout)
      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=25`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildApifyInput(platform, apifyUsername, platform === "youtube" ? 200 : MAX_RESULTS_PER_CHANNEL)),
        }
      );

      if (!apifyRes.ok) {
        const errText = await apifyRes.text();
        await supabase
          .from("viral_channels")
          .update({ scrape_status: "error", scrape_error: `Apify error: ${errText.slice(0, 200)}` })
          .eq("id", channelId);
        return json({ error: "Apify request failed", details: errText }, 500);
      }

      const runData = await apifyRes.json();
      const runId = runData?.data?.id;
      const runStatus = runData?.data?.status;
      const datasetId = runData?.data?.defaultDatasetId;

      // Store run + dataset IDs
      await supabase
        .from("viral_channels")
        .update({ apify_run_id: runId, apify_dataset_id: datasetId })
        .eq("id", channelId);

      // If it completed within the wait window — process immediately
      if (runStatus === "SUCCEEDED" && datasetId) {
        const count = await processDataset(supabase, channelId, cleanUsername, platform, datasetId);
        return json({ success: true, status: "done", runId, videosStored: count });
      }

      // Still running — return so frontend can poll
      return json({ success: true, status: "running", runId, datasetId });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e: any) {
    console.error("scrape-channel error:", e);
    return json({ error: e.message }, 500);
  }
});

// ── Helper: store dataset items into viral_videos ──────────────────────────
async function processDataset(
  supabase: any,
  channelId: string,
  username: string,
  platform: string,
  datasetId: string
): Promise<number> {
  const res = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&limit=200`
  );

  if (!res.ok) {
    await supabase
      .from("viral_channels")
      .update({ scrape_status: "error", scrape_error: "Failed to fetch dataset" })
      .eq("id", channelId);
    return 0;
  }

  const items: any[] = await res.json();

  if (!Array.isArray(items) || items.length === 0) {
    await supabase
      .from("viral_channels")
      .update({ scrape_status: "done", last_scraped_at: new Date().toISOString() })
      .eq("id", channelId);
    return 0;
  }

  // streamers~youtube-scraper returns all video items — no metadata item to filter
  const processItems = items;

  // Parse each item — platform-specific field mapping
  const videos = processItems
    .map((item: any) => {
      let views: number, likes: number, comments: number, videoId: string | null;
      let thumbnailUrl: string | null, videoUrl: string | null;
      let postedAt: string | null = null;
      let caption: string;

      if (platform === "youtube") {
        // scrapesmith~youtube-shorts-scraper fields
        views = item.views ?? 0;
        likes = item.likes ?? 0;
        comments = item.comments ?? 0;
        videoId = item.video_id ?? null;
        thumbnailUrl = item.thumbnail ?? null;
        videoUrl = item.video_url ?? null;
        caption = (item.title ?? "").slice(0, 600);
        // date_posted format: "Mar 23, 2026"
        if (item.date_posted) {
          const parsed = new Date(item.date_posted);
          if (!isNaN(parsed.getTime())) postedAt = parsed.toISOString();
        }
      } else {
        // apidojo~instagram-scraper / tiktok field mapping
        views = item.video?.playCount ?? item.videoViewCount ?? item.videoPlayCount ??
          item.playsCount ?? item.plays ?? item.viewCount ?? 0;
        likes = item.likeCount ?? item.likesCount ?? item.diggCount ?? item.likes ?? 0;
        comments = item.commentCount ?? item.commentsCount ?? item.comments ?? 0;
        videoId = item.code ?? item.shortCode ?? item.id ?? item.pk ?? item.aweme_id ?? null;
        thumbnailUrl =
          (typeof item.image === "object" ? item.image?.url : item.image) ??
          item.displayUrl ?? item.thumbnailUrl ?? item.coverUrl ?? item.cover ?? null;
        videoUrl = item.url ??
          (item.code ? `https://www.instagram.com/p/${item.code}/` :
           item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : null) ??
          (platform === "tiktok" && (item.id ?? item.aweme_id)
            ? `https://www.tiktok.com/@${username}/video/${item.id ?? item.aweme_id}` : null) ??
          null;
        caption = (item.caption ?? item.captionText ?? item.text ?? item.desc ?? "").slice(0, 600);
        const rawTs = item.date ?? item.createdAt ?? item.timestamp ?? item.taken_at_timestamp ?? item.createTime;
        if (rawTs) {
          const num = typeof rawTs === "number" ? rawTs : Number(rawTs);
          if (!isNaN(num)) postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
          else if (typeof rawTs === "string") postedAt = new Date(rawTs).toISOString();
        }
      }

      const totalInteractions = likes + comments;
      const engagementRate = views > 0 ? (totalInteractions / views) * 100 : 0;

      return {
        channel_id: channelId,
        channel_username: username,
        platform,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption,
        views_count: Number(views) || 0,
        likes_count: Number(likes) || 0,
        comments_count: Number(comments) || 0,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        outlier_score: 1, // recalculated below
        posted_at: postedAt,
        apify_video_id: videoId ? String(videoId) : null,
      };
    })
    .filter((v) => v.apify_video_id !== null);

  // Drop posts older than 12 months (actor has no built-in date filter)
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

  // Calculate channel average views for outlier scoring (using only recent videos)
  const totalViews = recentVideos.reduce((sum, v) => sum + v.views_count, 0);
  const avgViews = totalViews / recentVideos.length;

  const videosWithOutlier = recentVideos.map((v) => ({
    ...v,
    outlier_score:
      avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
  }));

  // Cache expiring CDN thumbnails to VPS (Instagram/TikTok only)
  for (const v of videosWithOutlier) {
    if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
      const key = `${v.platform}_${v.apify_video_id}`;
      const cached = await cacheThumbnail(v.thumbnail_url!, key);
      if (cached) v.thumbnail_url = cached;
    }
  }

  // Upsert — update existing videos if re-scraped
  const { error } = await supabase
    .from("viral_videos")
    .upsert(videosWithOutlier, {
      onConflict: "platform,apify_video_id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("Upsert error:", error);
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
