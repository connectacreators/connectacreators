import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";
const CRON_SECRET = "connectacreators-cron-2026";

// Posts older than 12 months are dropped
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Thumbnail caching — CDN URLs for IG/TikTok expire quickly, so we proxy
// them through VPS to get a stable URL.
// ---------------------------------------------------------------------------

function shouldCacheThumbnail(url: string | null): boolean {
  if (!url) return false;
  return /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent|tiktokcdn\.com/.test(url);
}

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
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// VPS /scrape-profile call with 50s timeout
// ---------------------------------------------------------------------------

interface VpsPost {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;
  thumbnail: string | null;
  posted_at: string | null;
  url: string;
  duration: number | null;
}

interface VpsResponse {
  posts: VpsPost[];
  username: string;
  platform: string;
  totalPosts: number;
  profilePicUrl: string | null;
  followers: number;
}

async function scrapeProfile(
  platform: string,
  username: string,
  limit: number
): Promise<VpsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    const res = await fetch(`${VPS_SERVER}/scrape-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({ platform, username, limit }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`VPS HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Process a single channel
// ---------------------------------------------------------------------------

async function processChannel(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; username: string; platform: string | null },
  resultsLimit: number
): Promise<{ channel: string; newVideos: number; error?: string }> {
  const platform = channel.platform ?? "instagram";
  const cleanUsername = channel.username.replace(/^@/, "").trim().toLowerCase();

  let vpsData: VpsResponse;
  try {
    vpsData = await scrapeProfile(platform, cleanUsername, resultsLimit);
  } catch (e: any) {
    const msg = e.name === "AbortError" ? "VPS timeout (50s)" : e.message;
    console.error(`VPS error for ${channel.username}: ${msg}`);
    return { channel: channel.username, newVideos: 0, error: msg };
  }

  if (!vpsData.posts || vpsData.posts.length === 0) {
    console.log(`Channel ${channel.username}: No posts returned from VPS`);
    await supabase
      .from("viral_channels")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0 };
  }

  const now = Date.now();
  const cutoff = now - MAX_AGE_MS;

  // Transform VPS posts into viral_videos rows
  const videos = vpsData.posts
    .map((post) => {
      // Drop posts older than 12 months
      let postedAt: string | null = null;
      if (post.posted_at) {
        const d = new Date(post.posted_at);
        if (!isNaN(d.getTime())) {
          if (d.getTime() < cutoff) return null; // too old
          postedAt = d.toISOString();
        }
      }

      const views = Number(post.views) || 0;
      const likes = Number(post.likes) || 0;
      const comments = Number(post.comments) || 0;
      const totalInteractions = likes + comments;
      const engagementRate = views > 0 ? (totalInteractions / views) * 100 : 0;

      return {
        channel_id: channel.id,
        channel_username: channel.username,
        platform,
        video_url: post.url || null,
        thumbnail_url: post.thumbnail || null,
        caption: (post.title ?? "").slice(0, 600),
        views_count: views,
        likes_count: likes,
        comments_count: comments,
        engagement_rate: Math.round(engagementRate * 100) / 100,
        outlier_score: 1, // recalculated below
        posted_at: postedAt,
        apify_video_id: post.id ? String(post.id) : null,
      };
    })
    .filter(
      (v): v is NonNullable<typeof v> =>
        v !== null && v.apify_video_id !== null && v.video_url !== null
    );

  if (videos.length === 0) {
    console.log(`Channel ${channel.username}: No videos after filtering`);
    await supabase
      .from("viral_channels")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0 };
  }

  // Calculate outlier scores based on channel average views
  const totalViews = videos.reduce((sum, v) => sum + v.views_count, 0);
  const avgViews = totalViews / videos.length;

  const videosWithOutlier = videos.map((v) => ({
    ...v,
    outlier_score: avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
  }));

  // Cache expiring CDN thumbnails to VPS (Instagram/TikTok only)
  for (const v of videosWithOutlier) {
    if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
      const key = `${v.platform}_${v.apify_video_id}`;
      const cached = await cacheThumbnail(v.thumbnail_url!, key);
      if (cached) v.thumbnail_url = cached;
    }
  }

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

  // Update channel stats
  await supabase
    .from("viral_channels")
    .update({
      last_scraped_at: new Date().toISOString(),
      avg_views: Math.round(avgViews),
      video_count: videos.length,
    })
    .eq("id", channel.id);

  return { channel: channel.username, newVideos: videos.length };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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

    // mode: "delta" = fetch last 7 posts (fast daily update, keeps thumbnails fresh)
    //        "full"  = fetch last 100 posts (weekly full stats + outlier recalculation)
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : "delta";
    const resultsLimit = mode === "full" ? 100 : 7;

    console.log(`Running in ${mode} mode (limit=${resultsLimit})`);

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
      return json({ success: true, mode, processed: 0, new_videos: 0, errors: [] });
    }

    // Process IG/TikTok first (higher priority), YouTube last.
    // If the edge function hits its wall-clock limit, at least the
    // high-priority channels have already been processed.
    const sortedChannels = [
      ...channels.filter((c: any) => c.platform === "instagram"),
      ...channels.filter((c: any) => c.platform === "tiktok"),
      ...channels.filter((c: any) => c.platform === "youtube"),
      ...channels.filter((c: any) => !["instagram", "tiktok", "youtube"].includes(c.platform ?? "")),
    ];

    let totalNewVideos = 0;
    const errors: string[] = [];

    // Process channels ONE AT A TIME (sequential) to be gentle on VPS resources
    for (const channel of sortedChannels) {
      console.log(`Processing: ${channel.username} (${channel.platform})`);

      const result = await processChannel(supabase, channel, resultsLimit);
      totalNewVideos += result.newVideos;
      if (result.error) errors.push(`${result.channel}: ${result.error}`);
    }

    // ── Cleanup: delete videos scraped more than 6 months ago ─────────────
    let cleanedUp = 0;
    try {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleRows, error: deleteErr } = await supabase
        .from("viral_videos")
        .delete()
        .lt("scraped_at", sixMonthsAgo)
        .select("channel_id", { count: "exact", head: true });

      cleanedUp = staleRows ? (staleRows as any).length ?? 0 : 0;
      if (deleteErr) {
        console.error("Cleanup delete error:", deleteErr);
      } else if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} stale videos (scraped > 6 months ago)`);
        // Recalculate video_count for all channels
        const { data: channelCounts } = await supabase
          .from("viral_videos")
          .select("channel_id")
          .not("channel_id", "is", null);

        if (channelCounts) {
          const counts: Record<string, number> = {};
          for (const row of channelCounts) {
            if (row.channel_id) counts[row.channel_id] = (counts[row.channel_id] || 0) + 1;
          }
          for (const [chId, count] of Object.entries(counts)) {
            await supabase.from("viral_channels").update({ video_count: count }).eq("id", chId);
          }
        }
      }
    } catch (cleanupErr: any) {
      console.error("Cleanup error:", cleanupErr.message);
    }

    return json({
      success: true,
      mode,
      processed: sortedChannels.length,
      new_videos: totalNewVideos,
      errors,
      cleaned_up: cleanedUp,
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
