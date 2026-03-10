import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_TASK_ID = "connectacreators/instagram-reel-scraper-task";

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

      // Accept full URLs like https://www.instagram.com/username/ or @username
      const urlMatch = username.match(/instagram\.com\/([^/?#\s]+)/i);
      const cleanUsername = urlMatch
        ? urlMatch[1].replace(/\/$/, "").toLowerCase()
        : username.replace(/^@/, "").trim().toLowerCase();

      // Mark channel as running
      await supabase
        .from("viral_channels")
        .update({ scrape_status: "running", scrape_error: null, apify_run_id: null })
        .eq("id", channelId);

      // Trigger Apify task run (wait up to 25s — stays within Supabase's 60s timeout)
      const apifyRes = await fetch(
        `https://api.apify.com/v2/actor-tasks/${APIFY_TASK_ID}/runs?token=${APIFY_TOKEN}&waitForFinish=25`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: [cleanUsername],
            resultsLimit: 200,
            minPostsFromDaysAgo: 365, // Only posts from last 12 months
          }),
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

  // Parse each item — handle multiple field naming conventions across Apify actors
  const videos = items
    .map((item: any) => {
      const views =
        item.videoViewCount ??
        item.videoPlayCount ??
        item.playsCount ??
        item.plays ??
        item.viewCount ??
        0;
      const likes = item.likesCount ?? item.diggCount ?? item.likes ?? 0;
      const comments = item.commentsCount ?? item.commentCount ?? item.comments ?? 0;
      const totalInteractions = likes + comments;
      const engagementRate = views > 0 ? (totalInteractions / views) * 100 : 0;

      // Video ID — prefer shortCode for Instagram (stable), else id/pk
      const videoId =
        item.shortCode ??
        item.id ??
        item.pk ??
        item.videoId ??
        item.aweme_id ??
        null;

      const thumbnailUrl =
        item.displayUrl ??
        item.thumbnailUrl ??
        item.coverUrl ??
        item.cover ??
        item.previewUrl ??
        item.thumbnail ??
        null;

      const videoUrl =
        item.url ??
        (item.shortCode
          ? `https://www.instagram.com/reel/${item.shortCode}/`
          : null) ??
        item.webVideoUrl ??
        null;

      // Timestamp — Instagram returns ISO string or unix seconds
      let postedAt: string | null = null;
      const rawTs = item.timestamp ?? item.taken_at_timestamp ?? item.createTime ?? item.create_time;
      if (rawTs) {
        const num = typeof rawTs === "number" ? rawTs : Number(rawTs);
        if (!isNaN(num)) {
          // Unix seconds (< 2e10) vs milliseconds
          postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
        } else if (typeof rawTs === "string") {
          postedAt = new Date(rawTs).toISOString();
        }
      }

      const caption = (
        item.caption ??
        item.captionText ??
        item.text ??
        item.desc ??
        ""
      ).slice(0, 600);

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
