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

// The VPS scraper sometimes returns captions truncated mid-emoji, leaving an
// unpaired UTF-16 surrogate. Such a string serializes to invalid JSON, so the
// batch upsert is rejected by Postgres ("invalid input syntax for type json")
// and ONE poisoned caption drops every video for that channel. Strip unpaired
// surrogates (and NUL, which Postgres text also rejects) before insert.
function sanitizeText(s: string): string {
  return s.replace(/[\x00]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
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
  limit: number,
  timeoutMs = 50_000
): Promise<VpsResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
  resultsLimit: number,
  timeoutMs = 50_000
): Promise<{ channel: string; newVideos: number; error?: string }> {
  const platform = channel.platform ?? "instagram";
  const cleanUsername = channel.username.replace(/^@/, "").trim().toLowerCase();

  let vpsData: VpsResponse;
  try {
    vpsData = await scrapeProfile(platform, cleanUsername, resultsLimit, timeoutMs);
  } catch (e: any) {
    const msg = e.name === "AbortError" ? `VPS timeout (${Math.round(timeoutMs / 1000)}s)` : e.message;
    console.error(`VPS error for ${channel.username}: ${msg}`);
    // Rotate this channel to the BACK of the oldest-first queue even on
    // failure. Otherwise a handful of persistently-failing channels (e.g.
    // Instagram profiles whose shared login cookie has died) stay pinned at
    // the front of the `last_scraped_at ASC` queue, are retried first on
    // every single run, and burn the whole per-run time budget on 50s
    // timeouts — starving every healthy channel behind them. Record the
    // error so a real outage is still visible in the DB.
    await supabase
      .from("viral_channels")
      .update({ last_scraped_at: new Date().toISOString(), scrape_error: msg })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0, error: msg };
  }

  if (!vpsData.posts || vpsData.posts.length === 0) {
    console.log(`Channel ${channel.username}: No posts returned from VPS`);
    await supabase
      .from("viral_channels")
      .update({ last_scraped_at: new Date().toISOString(), scrape_error: null })
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
        caption: sanitizeText((post.title ?? "").slice(0, 600)),
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
      .update({ last_scraped_at: new Date().toISOString(), scrape_error: null })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0 };
  }

  // Provisional outlier score (mean over this scrape batch). This is only a
  // placeholder — after the upsert we call recompute_channel_outliers(), which
  // replaces it with the real per-video score: views / MEDIAN channel views
  // over the trailing 90 days (excluding the video itself), computed from the
  // channel's full stored history rather than this small scrape batch. The
  // batch mean is kept as a sane fallback if the RPC fails.
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
    // Rotate to back of queue + record error (see VPS-error branch above).
    await supabase
      .from("viral_channels")
      .update({
        last_scraped_at: new Date().toISOString(),
        scrape_error: `Upsert failed: ${upsertError.message ?? upsertError}`,
      })
      .eq("id", channel.id);
    return { channel: channel.username, newVideos: 0, error: "Upsert failed" };
  }

  console.log(`Channel ${channel.username}: Upserted ${videos.length} videos`);

  // Recompute real outlier scores for the whole channel from stored history:
  // views / MEDIAN channel views over the trailing 90 days (exclude self),
  // falling back to the all-time channel median when the 90-day window is
  // sparse. This overwrites the provisional batch-mean set above. Delta mode
  // only fetches ~7 posts, so this MUST run against the DB, not the batch.
  const { error: outlierErr } = await supabase.rpc("recompute_channel_outliers", {
    p_channel_id: channel.id,
  });
  if (outlierErr) {
    console.error(`Outlier recompute failed for ${channel.username}: ${outlierErr.message}`);
  }

  // Compute true row count from viral_videos — videos.length is only the
  // number of posts in THIS scrape (e.g. 7 in delta mode), not the total
  // stored for the channel. Setting video_count = videos.length was making
  // the UI display 4-7 even when the channel actually had 200+ rows.
  const { count: totalVideoCount } = await supabase
    .from("viral_videos")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channel.id);

  // Update channel stats
  await supabase
    .from("viral_channels")
    .update({
      last_scraped_at: new Date().toISOString(),
      avg_views: Math.round(avgViews),
      video_count: totalVideoCount ?? videos.length,
      scrape_error: null,
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
    //        "full"  = fetch last 50 posts (weekly full stats + outlier recalculation)
    // Note: 100 posts/channel takes ~50s per VPS call, right at the per-call
    // timeout boundary. 50 posts finishes in ~25-30s with plenty of headroom.
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "full" ? "full" : body.mode === "facebook" ? "facebook" : "delta";
    const resultsLimit = mode === "full" ? 50 : mode === "facebook" ? 12 : 7;

    console.log(`Running in ${mode} mode (limit=${resultsLimit})`);

    // Fetch all channels that have been scraped before, oldest-stale first.
    // Sorting by last_scraped_at ASC means if we run out of wall-clock time,
    // the most-stale channels are always refreshed first — so every channel
    // eventually gets updated across consecutive cron runs.
    const { data: channels, error: channelsError } = await supabase
      .from("viral_channels")
      .select("id, username, platform, last_scraped_at")
      .eq("scrape_status", "done")
      .not("last_scraped_at", "is", null)
      .order("last_scraped_at", { ascending: true });

    if (channelsError) {
      console.error("Error fetching channels:", channelsError);
      return json({ error: "Failed to fetch channels" }, 500);
    }

    if (!channels || channels.length === 0) {
      return json({ success: true, mode, processed: 0, new_videos: 0, errors: [] });
    }

    const sortedChannels = channels;

    let totalNewVideos = 0;
    let processedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Wall-clock budget: stop scheduling new batches once we estimate the
    // next batch would push us past Supabase's 150s edge-function timeout.
    // A batch can take up to 50s (per-VPS-call abort), so we stop at 90s
    // — worst-case total = 90 + 50 + cleanup ≈ 145s.
    const startMs = Date.now();

    if (mode === "facebook") {
      // ── Facebook-only lane ────────────────────────────────────────────────
      // FB is scraped with a headless browser per reel (reactions/comments
      // aren't in yt-dlp), so one FB channel takes ~40-60s — it always times out
      // inside the 6-way concurrent batch used for IG/TikTok/YT. So FB runs on
      // its OWN cron (mode=facebook): one channel at a time, a longer per-call
      // timeout, oldest-stale first, with the whole budget to itself. The
      // regular delta/full runs skip FB entirely (below).
      const fbChannels = sortedChannels.filter((c: any) => (c.platform ?? "") === "facebook");
      // One FB scrape (dual-tab enumerate + browser-per-reel) runs ~60-90s, and
      // Supabase kills the edge function at 150s. So only START a channel while
      // there's room for its FULL timeout: budget 40s + timeout 90s + cleanup
      // headroom ≈ 140s worst case. In practice ~1 FB channel per run; oldest
      // first, so they rotate across runs.
      const FB_TIMEOUT_MS = 90_000;
      const FB_BUDGET_MS = 40_000;
      const FB_LIMIT = Math.min(resultsLimit, 12);
      for (let i = 0; i < fbChannels.length; i++) {
        if (Date.now() - startMs > FB_BUDGET_MS) {
          skippedCount = fbChannels.length - i;
          console.log(`FB budget hit after ${i} channels; ${skippedCount} skipped (next run)`);
          break;
        }
        const result = await processChannel(supabase, fbChannels[i], FB_LIMIT, FB_TIMEOUT_MS);
        totalNewVideos += result.newVideos;
        processedCount += 1;
        if (result.error) errors.push(`${result.channel}: ${result.error}`);
      }
    } else {
      // ── Fast lane (delta/full): everyone EXCEPT Facebook ──────────────────
      const otherChannels = sortedChannels.filter((c: any) => (c.platform ?? "") !== "facebook");
      const BUDGET_MS = 90_000;
      // VPS reports maxHeavy=8 concurrent jobs, but in practice 8 parallel
      // requests trigger occasional connection resets. 6 keeps headroom for
      // manual scrapes and avoids the reset-by-peer errors.
      const BATCH_SIZE = 6;
      for (let i = 0; i < otherChannels.length; i += BATCH_SIZE) {
        if (Date.now() - startMs > BUDGET_MS) {
          skippedCount = otherChannels.length - i;
          console.log(`Time budget hit after ${i} channels; ${skippedCount} skipped (will be picked up next run)`);
          break;
        }
        const batch = otherChannels.slice(i, i + BATCH_SIZE);
        console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((c: any) => c.username).join(", ")}`);

        const results = await Promise.all(
          batch.map((channel: any) => processChannel(supabase, channel, resultsLimit))
        );
        for (const result of results) {
          totalNewVideos += result.newVideos;
          processedCount += 1;
          if (result.error) errors.push(`${result.channel}: ${result.error}`);
        }
      }
    }

    // ── Cleanup: delete videos scraped more than 6 months ago ─────────────
    // Skipped in the FB lane — that run is already near the wall-clock budget
    // and the delta/full runs handle cleanup.
    let cleanedUp = 0;
    if (mode !== "facebook") try {
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
      total: sortedChannels.length,
      processed: processedCount,
      skipped: skippedCount,
      new_videos: totalNewVideos,
      errors,
      cleaned_up: cleanedUp,
      duration_ms: Date.now() - startMs,
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
