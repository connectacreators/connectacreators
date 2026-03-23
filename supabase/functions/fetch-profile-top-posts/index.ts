import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_ACTOR_INSTAGRAM = "apify~instagram-reel-scraper";
const APIFY_ACTOR_TIKTOK = "apidojo~tiktok-profile-scraper";
const APIFY_ACTOR_YOUTUBE = "igview-owner~youtube-shorts-scraper";

const MAX_RESULTS = 100; // hard cap

type Platform = "instagram" | "tiktok" | "youtube";

function detectPlatform(url: string): Platform | null {
  const s = url.toLowerCase();
  if (s.includes("instagram.com")) return "instagram";
  if (s.includes("tiktok.com")) return "tiktok";
  if (s.includes("youtube.com") || s.includes("youtu.be")) return "youtube";
  return null;
}

function parseIdentifier(profileUrl: string, platform: Platform): { username: string; fullUrl: string } {
  const s = profileUrl.trim();
  if (platform === "instagram") {
    let u = s.replace(/^https?:\/\/(www\.)?/, "").replace(/^instagram\.com\//, "").replace(/^@/, "");
    u = u.split(/[/?#]/)[0].toLowerCase();
    return { username: u, fullUrl: `https://www.instagram.com/${u}/` };
  }
  if (platform === "tiktok") {
    const match = s.match(/tiktok\.com\/@?([^/?#\s]+)/i);
    const u = match ? match[1].replace(/\/$/, "").toLowerCase() : s.replace(/^@/, "").trim().toLowerCase();
    return { username: u, fullUrl: `https://www.tiktok.com/@${u}` };
  }
  // YouTube
  const handleMatch = s.match(/youtube\.com\/@([^/?#\s]+)/i);
  const customMatch = s.match(/youtube\.com\/c\/([^/?#\s]+)/i);
  const channelMatch = s.match(/youtube\.com\/channel\/([^/?#\s]+)/i);
  if (handleMatch) {
    const u = handleMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/@${u}` };
  }
  if (customMatch) {
    const u = customMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/c/${u}` };
  }
  if (channelMatch) {
    const u = channelMatch[1].replace(/\/$/, "");
    return { username: u, fullUrl: `https://youtube.com/channel/${u}` };
  }
  const bare = s.replace(/^@/, "").trim();
  return { username: bare, fullUrl: `https://youtube.com/@${bare}` };
}

function buildActorInput(platform: Platform, username: string, fullUrl: string, limit: number): { actorId: string; input: Record<string, unknown> } {
  const safeLimit = Math.min(limit, MAX_RESULTS);
  if (platform === "instagram") {
    return { actorId: APIFY_ACTOR_INSTAGRAM, input: { username: [username], resultsLimit: safeLimit } };
  }
  if (platform === "tiktok") {
    return { actorId: APIFY_ACTOR_TIKTOK, input: { handles: [username], startUrls: [{ url: fullUrl }], resultsPerPage: safeLimit, shouldDownloadVideos: false, shouldDownloadCovers: false } };
  }
  // YouTube: confirmed channelUrl + maxResults
  return { actorId: APIFY_ACTOR_YOUTUBE, input: { channelUrl: fullUrl, maxResults: safeLimit } };
}

// Parses "3.5K views" → 3500, "1.2M" → 1200000
function parseYouTubeViewCount(text: string | undefined): number {
  if (!text) return 0;
  const clean = text.replace(/[^0-9.KMBkmb]/g, "").toUpperCase();
  if (clean.endsWith("B")) return Math.round(parseFloat(clean) * 1_000_000_000);
  if (clean.endsWith("M")) return Math.round(parseFloat(clean) * 1_000_000);
  if (clean.endsWith("K")) return Math.round(parseFloat(clean) * 1_000);
  return parseInt(clean) || 0;
}

function normalizeItem(item: any, platform: Platform, username: string) {
  let views = 0, likes = 0, comments = 0, videoId = "", caption = "", thumbnail: string | null = null, postedAt = "", url = "";

  if (platform === "instagram") {
    views = item.videoPlayCount ?? item.videoViewCount ?? item.playsCount ?? item.playCount ?? item.viewCount ?? 0;
    likes = item.likesCount ?? item.diggCount ?? item.likes ?? 0;
    comments = item.commentsCount ?? item.commentCount ?? item.comments ?? 0;
    videoId = item.shortCode ?? item.id ?? item.pk ?? "";
    caption = (item.caption ?? item.captionText ?? item.text ?? "").slice(0, 600);
    thumbnail = item.displayUrl ?? item.thumbnailUrl ?? item.coverUrl ?? null;
    postedAt = parseTimestamp(item.timestamp ?? item.taken_at_timestamp);
    url = item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : item.id ? `https://www.instagram.com/p/${item.id}/` : "";
  } else if (platform === "tiktok") {
    views = item.video?.playCount ?? item.videoViewCount ?? item.playsCount ?? item.plays ?? item.viewCount ?? 0;
    likes = item.likeCount ?? item.likesCount ?? item.diggCount ?? 0;
    comments = item.commentCount ?? item.commentsCount ?? 0;
    videoId = item.id ?? item.aweme_id ?? "";
    caption = (item.caption ?? item.desc ?? item.text ?? "").slice(0, 600);
    thumbnail = item.coverUrl ?? item.cover ?? item.thumbnailUrl ?? (typeof item.image === "object" ? item.image?.url : item.image) ?? null;
    postedAt = parseTimestamp(item.createTime ?? item.create_time ?? item.createdAt);
    url = item.webVideoUrl ?? item.url ?? (videoId ? `https://www.tiktok.com/@${username}/video/${videoId}` : "");
  } else {
    // YouTube — confirmed field names from test run
    views = parseYouTubeViewCount(item.viewCountText);
    likes = 0;    // not returned by actor
    comments = 0; // not returned by actor
    videoId = item.videoId ?? item.id ?? "";
    caption = (item.title ?? "").slice(0, 600);
    thumbnail = item.thumbnail ?? item.thumbnails?.[0]?.url ?? null;
    postedAt = ""; // not returned by actor
    url = item.shortUrl ?? (videoId ? `https://www.youtube.com/shorts/${videoId}` : "");
  }

  const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
  return { views: Number(views) || 0, likes: Number(likes) || 0, comments: Number(comments) || 0, videoId: String(videoId), caption, thumbnail, postedAt, url, engagement };
}

function parseTimestamp(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "number") { const ms = raw < 1e10 ? raw * 1000 : raw; return new Date(ms).toISOString(); }
  if (typeof raw === "string") { const d = new Date(raw); if (!isNaN(d.getTime())) return d.toISOString(); }
  return "";
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

async function saveToVault(supabase: any, username: string, platform: Platform, items: ReturnType<typeof normalizeItem>[], avgViews: number) {
  try {
    const { data: channelRow, error: chErr } = await supabase
      .from("viral_channels")
      .upsert({ username, platform, avg_views: Math.round(avgViews), video_count: items.length, scrape_status: "done", last_scraped_at: new Date().toISOString() }, { onConflict: "username,platform" })
      .select("id").single();
    if (chErr || !channelRow?.id) { console.error("[fetch-profile-top-posts] channel upsert failed:", chErr?.message); return; }

    const videoRows = items.filter((p) => p.videoId).map((p) => ({
      channel_id: channelRow.id, channel_username: username, platform,
      video_url: p.url, thumbnail_url: p.thumbnail, caption: p.caption,
      views_count: p.views, likes_count: p.likes, comments_count: p.comments,
      engagement_rate: parseFloat(p.engagement.toFixed(2)),
      outlier_score: parseFloat((avgViews > 0 ? (p.views / avgViews) * 10 : 1).toFixed(2)),
      posted_at: p.postedAt || null, scraped_at: new Date().toISOString(), apify_video_id: p.videoId,
    }));

    if (videoRows.length === 0) return;
    const { error: vErr } = await supabase.from("viral_videos").upsert(videoRows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false });
    if (vErr) console.error("[fetch-profile-top-posts] videos upsert failed:", vErr.message);
    else console.log(`[fetch-profile-top-posts] saved ${videoRows.length} videos for @${username} (${platform})`);
  } catch (e: any) {
    console.error("[fetch-profile-top-posts] saveToVault error:", e.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { profileUrl, limit = 50 } = await req.json();
    if (!profileUrl) return json({ error: "profileUrl is required" }, 400);

    const platform = detectPlatform(profileUrl);
    if (!platform) return json({ error: "Unsupported platform — paste an Instagram, TikTok, or YouTube channel URL" }, 400);

    // Reject single YouTube video URLs (youtube.com/shorts/VIDEO_ID)
    if (platform === "youtube" && /youtube\.com\/shorts\/[^/]+\/?$/.test(profileUrl)) {
      return json({ error: "Paste a YouTube channel URL, not a single video URL" }, 400);
    }

    const { username, fullUrl } = parseIdentifier(profileUrl, platform);
    if (!username) return json({ error: "Could not parse username from URL" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Cache check (compound key: username + platform)
    console.log(`[fetch-profile-top-posts] checking vault for @${username} (${platform})`);
    const { data: channelRow } = await supabase
      .from("viral_channels")
      .select("id, avg_views, video_count")
      .eq("username", username).eq("platform", platform).eq("scrape_status", "done")
      .maybeSingle();

    if (channelRow?.id && (channelRow.video_count ?? 0) >= 20) {
      const { data: vaultVideos } = await supabase.from("viral_videos")
        .select("video_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, thumbnail_url")
        .eq("channel_id", channelRow.id).gt("views_count", 0)
        .order("views_count", { ascending: false }).limit(10);
      if (vaultVideos && vaultVideos.length > 0) {
        console.log(`[fetch-profile-top-posts] cache hit — ${vaultVideos.length} from vault for @${username}`);
        return json({ posts: vaultVideos.map((v: any, i: number) => ({ rank: i + 1, caption: v.caption, views: v.views_count, viewsFormatted: formatViews(v.views_count), likes: v.likes_count, comments: v.comments_count, engagement_rate: v.engagement_rate, outlier_score: v.outlier_score, posted_at: v.posted_at, url: v.video_url, thumbnail: v.thumbnail_url })), username, platform, fromVault: true });
      }
    }

    // 2. Cache miss — call Apify
    console.log(`[fetch-profile-top-posts] cache miss — fetching from Apify for @${username} (${platform})`);
    const { actorId, input } = buildActorInput(platform, username, fullUrl, limit);
    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${APIFY_TOKEN}&waitForFinish=30`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!runRes.ok) { const errText = await runRes.text(); throw new Error(`Apify run failed: ${runRes.status} ${errText.slice(0, 200)}`); }

    const runData = await runRes.json();
    let runStatus = runData?.data?.status ?? "UNKNOWN";
    let datasetId = runData?.data?.defaultDatasetId ?? null;
    const runId = runData?.data?.id ?? null;

    if (runStatus === "RUNNING" && runId) {
      await new Promise(r => setTimeout(r, 15000));
      const pollRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      if (pollRes.ok) { const p = await pollRes.json(); runStatus = p?.data?.status ?? runStatus; datasetId = p?.data?.defaultDatasetId ?? datasetId; }
    }

    if (!datasetId) throw new Error("No dataset ID from Apify");

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${limit}`);
    if (!itemsRes.ok) throw new Error(`Dataset fetch failed: ${itemsRes.status}`);

    const rawItems: any[] = await itemsRes.json();
    console.log(`[fetch-profile-top-posts] got ${rawItems.length} raw items (${platform})`);

    // YouTube actor returns channel_metadata as first item — filter to only video items
    const videoItems = platform === "youtube" ? rawItems.filter(item => item.itemType === "short") : rawItems;
    const normalized = videoItems.map(item => normalizeItem(item, platform, username)).filter(p => p.videoId);

    if (normalized.length === 0) return json({ posts: [], username, platform, message: "No posts found for this profile" });

    const avgViews = normalized.reduce((s, p) => s + p.views, 0) / normalized.length;

    // 3. Fire-and-forget vault save
    saveToVault(supabase, username, platform, normalized, avgViews);

    const sorted = [...normalized].sort((a, b) => b.views - a.views).slice(0, 10);
    return json({ posts: sorted.map((p, i) => ({ rank: i + 1, caption: p.caption, views: p.views, viewsFormatted: formatViews(p.views), likes: p.likes, comments: p.comments, engagement_rate: parseFloat(p.engagement.toFixed(2)), outlier_score: parseFloat((p.views / (avgViews || 1) * 10).toFixed(1)), posted_at: p.postedAt, url: p.url, thumbnail: p.thumbnail, platform })), username, platform });
  } catch (e: any) {
    console.error("[fetch-profile-top-posts] error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
