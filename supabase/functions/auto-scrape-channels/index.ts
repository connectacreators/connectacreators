import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_ACTOR_INSTAGRAM = "apidojo~instagram-scraper";
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "streamers~youtube-scraper";
const CRON_SECRET = "connectacreators-cron-2026";

// Apify STARTER plan allows max 5 concurrent actor runs.
// We process channels in batches of this size to avoid "too many concurrent runs" errors.
const APIFY_MAX_CONCURRENT = 5;

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
    // streamers~youtube-scraper: startUrls array + maxResults
    // Append /shorts to channel URL so the actor returns Shorts only
    const baseUrl = username.startsWith("UC")
      ? `https://www.youtube.com/channel/${username}`
      : `https://www.youtube.com/@${username}`;
    const shortsUrl = baseUrl + "/shorts";
    return {
      startUrls: [{ url: shortsUrl }],
      maxResults: safeLimit,
    };
  }
  // apidojo~instagram-scraper: maxItems is the actual limit field
  // (resultsLimit is silently ignored by this actor — must use maxItems)
  return {
    startUrls: [`https://www.instagram.com/${username}/`],
    maxItems: safeLimit,
  };
}

async function processChannel(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; username: string; platform: string | null },
  resultsLimit: number
) {
  const cleanUsername = channel.username.replace(/^@/, "").trim().toLowerCase();
  const actorId = getActorId(channel.platform ?? "instagram");

  // Fire Apify run with waitForFinish=120s
  const apifyRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=120`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildApifyInput(channel.platform ?? "instagram", cleanUsername, resultsLimit)),
    }
  );

  if (!apifyRes.ok) {
    const errText = await apifyRes.text();
    console.error(`Apify error for ${channel.username}: HTTP ${apifyRes.status} - ${errText.slice(0, 200)}`);
    return { channel: channel.username, newVideos: 0, error: `Apify HTTP ${apifyRes.status}` };
  }

  const runData = await apifyRes.json();
  const datasetId = runData?.data?.defaultDatasetId;
  let runStatus = runData?.data?.status;
  const runId = runData?.data?.id;

  // If still RUNNING after 120s, poll up to 4 more times (30s each = 120s extra)
  // Per-channel max wait: 120 + 4*30 = 240s
  if (runStatus === "RUNNING" && runId) {
    for (let poll = 0; poll < 4 && runStatus === "RUNNING"; poll++) {
      await new Promise((r) => setTimeout(r, 30_000));
      const pollRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        runStatus = pollData?.data?.status;
        console.log(`Channel ${channel.username}: Poll ${poll + 1} -> status ${runStatus}`);
      }
    }
  }

  if (runStatus !== "SUCCEEDED" || !datasetId) {
    console.log(`Channel ${channel.username}: Run status ${runStatus}, skipping`);
    return { channel: channel.username, newVideos: 0, error: `Run status: ${runStatus}` };
  }

  // Fetch dataset items
  const datasetRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&limit=200`
  );

  if (!datasetRes.ok) {
    return { channel: channel.username, newVideos: 0, error: "Failed to fetch dataset" };
  }

  const items: any[] = await datasetRes.json();

  if (!Array.isArray(items) || items.length === 0) {
    console.log(`Channel ${channel.username}: No videos returned`);
    await supabase
      .from("viral_channels")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0 };
  }

  // streamers~youtube-scraper returns all video items directly — no metadata wrapper to filter
  const processItems = items;

  // Parse and transform videos — apidojo~instagram-scraper field mapping
  const videos = processItems
    .map((item: any) => {
      // bernardo_bi~youtube-shorts-scraper: viewCount is already a number
      // apidojo: views are in item.video.playCount for video posts
      const views =
        (channel.platform === "youtube" ? (item.viewCount ?? parseYouTubeViewCount(item.viewCountText)) : null) ??
        item.video?.playCount ??
        item.videoViewCount ??
        item.videoPlayCount ??
        item.playsCount ??
        item.plays ??
        item.viewCount ??
        0;
      // apidojo: likeCount / commentCount (no trailing 's')
      const likes = item.likeCount ?? item.likesCount ?? item.diggCount ?? item.likes ?? 0;
      const comments = item.commentCount ?? item.commentsCount ?? item.comments ?? 0;
      const totalInteractions = likes + comments;
      const engagementRate = views > 0 ? (totalInteractions / views) * 100 : 0;

      // YouTube: videoId field; apidojo: code field (not shortCode)
      const videoId =
        item.videoId ??        // YouTube Shorts
        item.code ?? item.shortCode ?? item.id ?? item.pk ?? item.aweme_id ?? null;

      // YouTube: thumbnail (direct string) or thumbnails array fallback
      // apidojo: image is an object {url, width, height}
      const thumbnailUrl =
        item.thumbnail ??              // YouTube Shorts (direct string)
        item.thumbnails?.[0]?.url ??   // YouTube Shorts array fallback
        (typeof item.image === "object" ? item.image?.url : item.image) ??
        item.displayUrl ?? item.thumbnailUrl ?? item.coverUrl ?? item.cover ?? item.previewUrl ?? null;

      const videoUrl =
        item.shortUrl ??   // YouTube Shorts
        item.url ??
        item.webVideoUrl ??
        (item.code
          ? `https://www.instagram.com/p/${item.code}/`
          : item.shortCode
            ? `https://www.instagram.com/reel/${item.shortCode}/`
            : null) ??
        ((channel.platform === "tiktok") && (item.id ?? item.aweme_id)
          ? `https://www.tiktok.com/@${cleanUsername}/video/${item.id ?? item.aweme_id}`
          : null) ??
        null;

      let postedAt: string | null = null;
      // apidojo: createdAt is ISO string; fallback to legacy field names
      const rawTs = item.date ?? item.createdAt ?? item.timestamp ?? item.taken_at_timestamp ?? item.createTime ?? item.create_time;
      if (rawTs) {
        const num = typeof rawTs === "number" ? rawTs : Number(rawTs);
        if (!isNaN(num)) {
          postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
        } else if (typeof rawTs === "string") {
          postedAt = new Date(rawTs).toISOString();
        }
      }

      const caption = (
        item.title ??      // YouTube Shorts
        item.caption ?? item.captionText ?? item.text ?? item.desc ?? ""
      ).slice(0, 600);

      return {
        channel_id: channel.id,
        channel_username: channel.username,
        platform: channel.platform ?? "instagram",
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption,
        views_count: Number(views) || 0,
        likes_count: Number(likes) || 0,
        comments_count: Number(comments) || 0,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        outlier_score: 1,
        posted_at: postedAt,
        apify_video_id: videoId ? String(videoId) : null,
      };
    })
    .filter((v) => v.apify_video_id !== null && v.video_url !== null);

  if (videos.length > 0) {
    const totalViews = videos.reduce((sum, v) => sum + v.views_count, 0);
    const avgViews = totalViews / videos.length;

    const videosWithOutlier = videos.map((v) => ({
      ...v,
      outlier_score: avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
    }));

    // Upsert — updates thumbnail_url + stats on existing rows, inserts new ones
    const { error: upsertError } = await supabase
      .from("viral_videos")
      .upsert(videosWithOutlier, {
        onConflict: "platform,apify_video_id",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error(`Upsert error for ${channel.username}:`, upsertError);
      return { channel: channel.username, newVideos: 0, error: "Upsert failed" };
    }

    console.log(`Channel ${channel.username}: Upserted ${videos.length} videos`);
  } else {
    console.log(`Channel ${channel.username}: No videos after filtering`);
  }

  await supabase
    .from("viral_channels")
    .update({ last_scraped_at: new Date().toISOString() })
    .eq("id", channel.id);

  return { channel: channel.username, newVideos: videos.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate cron secret
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== CRON_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // mode: "delta" = fetch last 3 posts (fast, cheap, keeps thumbnails fresh every 2 days)
    //        "full"  = fetch last 100 posts (weekly full stats + outlier recalculation)
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "delta";
    const resultsLimit = mode === "full" ? 100 : 7;

    console.log(`Running in ${mode} mode (resultsLimit=${resultsLimit})`);

    // Fetch all channels that have been scraped before
    const { data: channels, error: channelsError } = await supabase
      .from("viral_channels")
      .select("id, username, platform")
      .eq("scrape_status", "done")
      .not("last_scraped_at", "is", null);

    if (channelsError) {
      console.error("Error fetching channels:", channelsError);
      return json({ error: "Failed to fetch channels" }, 500);
    }

    if (!channels || channels.length === 0) {
      return json({ success: true, processed: 0, new_videos: 0, errors: [] });
    }

    // Process YouTube channels last — if the 400s wall-clock limit is hit,
    // Instagram and TikTok (higher priority) have already been processed.
    const sortedChannels = [
      ...channels.filter((c: any) => c.platform !== "youtube"),
      ...channels.filter((c: any) => c.platform === "youtube"),
    ];

    let totalNewVideos = 0;
    const errors: string[] = [];
    const allResults: Array<{ channel: string; newVideos: number; error?: string }> = [];

    // Process channels in batches of APIFY_MAX_CONCURRENT (5) to respect Apify's
    // concurrent run limit. Within each batch, all channels run in parallel.
    // Batch timing: max 240s per batch (120s waitForFinish + 4*30s polling)
    // Total for 28 channels in batches of 5: ceil(28/5) = 6 batches * 240s = 1440s max
    // NOTE: This exceeds the 400s edge function wall-clock limit.
    // Solution: the function processes as many batches as possible within the time budget,
    // and the cron job runs daily (the channels not covered today will be covered next run).
    // With 5 batches of 5 = 25 channels in ~5 minutes, all 28 channels fit in 6 batches.
    // In practice each batch completes in 60-120s (Apify is fast for 200 items),
    // so 6 batches * 90s avg = ~9 minutes. Use pg_cron to trigger this function instead
    // of relying on the wall-clock limit — the function will return a partial result if it times out.

    for (let i = 0; i < sortedChannels.length; i += APIFY_MAX_CONCURRENT) {
      const batch = sortedChannels.slice(i, i + APIFY_MAX_CONCURRENT);
      console.log(`Processing batch ${Math.floor(i / APIFY_MAX_CONCURRENT) + 1}: ${batch.map(c => c.username).join(", ")}`);

      const batchResults = await Promise.all(
        batch.map((channel) => processChannel(supabase, channel, resultsLimit))
      );

      allResults.push(...batchResults);
    }

    // Tally results
    for (const r of allResults) {
      totalNewVideos += r.newVideos;
      if (r.error) errors.push(`${r.channel}: ${r.error}`);
    }

    return json({
      success: true,
      mode,
      processed: sortedChannels.length,
      new_videos: totalNewVideos,
      errors,
    });
  } catch (e: any) {
    console.error("auto-scrape-channels error:", e);
    return json({ error: e.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
