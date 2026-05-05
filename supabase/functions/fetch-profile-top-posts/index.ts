import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VPS_SCRAPE_URL = "http://72.62.200.145:3099/scrape-profile";
const VPS_PROXY_IMAGE_URL = "http://72.62.200.145:3099/proxy-image";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

const MAX_RESULTS = 100; // hard cap

async function fetchVpsWithRetry(url: string, init: RequestInit, retries = 2, delayMs = 6000): Promise<Response> {
  let res = await fetch(url, init);
  while (res.status === 503 && retries-- > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url, init);
  }
  return res;
}

// Require at least this many videos before trusting the vault cache — ensures
// the top-10 ranking is meaningful and the channel was scraped at scale, not just delta-updated.
const VAULT_CACHE_MIN_VIDEOS = 20;

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

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Convert VPS "YYYY-MM-DD" date string to ISO timestamp */
function normalizePostedAt(raw: string | null | undefined): string {
  if (!raw) return "";
  // Already ISO
  if (raw.includes("T")) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  // "YYYY-MM-DD" → ISO
  const d = new Date(raw + "T00:00:00Z");
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

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
  followers: number | null;
}

interface NormalizedPost {
  videoId: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  engagement: number;
  thumbnail: string | null;
  postedAt: string;
  url: string;
}

function normalizeVpsPost(post: VpsPost): NormalizedPost {
  const views = Number(post.views) || 0;
  const likes = Number(post.likes) || 0;
  const comments = Number(post.comments) || 0;
  const engagement = post.engagement_rate != null
    ? Number(post.engagement_rate)
    : views > 0 ? ((likes + comments) / views) * 100 : 0;

  return {
    videoId: String(post.id || ""),
    caption: (post.title || "").slice(0, 600),
    views,
    likes,
    comments,
    engagement,
    thumbnail: post.thumbnail || null,
    postedAt: normalizePostedAt(post.posted_at),
    url: post.url || "",
  };
}

async function saveToVault(
  supabase: any,
  username: string,
  platform: Platform,
  items: NormalizedPost[],
  avgViews: number,
) {
  try {
    const { data: channelRow, error: chErr } = await supabase
      .from("viral_channels")
      .upsert(
        {
          username,
          platform,
          avg_views: Math.round(avgViews),
          video_count: items.length,
          scrape_status: "done",
          last_scraped_at: new Date().toISOString(),
        },
        { onConflict: "username,platform" },
      )
      .select("id")
      .single();

    if (chErr || !channelRow?.id) {
      console.error("[fetch-profile-top-posts] channel upsert failed:", chErr?.message);
      return;
    }

    const videoRows = items
      .filter((p) => p.videoId)
      .map((p) => ({
        channel_id: channelRow.id,
        channel_username: username,
        platform,
        video_url: p.url,
        thumbnail_url: p.thumbnail,
        caption: p.caption,
        views_count: p.views,
        likes_count: p.likes,
        comments_count: p.comments,
        engagement_rate: parseFloat(p.engagement.toFixed(2)),
        outlier_score: parseFloat((avgViews > 0 ? (p.views / avgViews) * 10 : 1).toFixed(2)),
        posted_at: p.postedAt || null,
        scraped_at: new Date().toISOString(),
        apify_video_id: p.videoId,
      }));

    if (videoRows.length === 0) return;

    const { data: inserted, error: vErr } = await supabase
      .from("viral_videos")
      .upsert(videoRows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false })
      .select("id, outlier_score, views_count");

    if (vErr) console.error("[fetch-profile-top-posts] videos upsert failed:", vErr.message);
    else {
      console.log(`[fetch-profile-top-posts] saved ${videoRows.length} videos for @${username} (${platform})`);
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
            }).catch((e) => console.warn("[fetch-profile-top-posts] analyze-viral-video trigger failed:", (e as Error).message));
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[fetch-profile-top-posts] saveToVault error:", e.message);
  }
}

/**
 * Download a profile picture via VPS proxy and convert to base64.
 * This ensures the image survives CDN expiry (Instagram/TikTok expire URLs quickly).
 */
async function downloadProfilePicAsBase64(picUrl: string): Promise<string | null> {
  if (!picUrl) return null;
  try {
    // Use VPS proxy to avoid Instagram/TikTok CDN blocks
    const proxyUrl = `${VPS_PROXY_IMAGE_URL}?url=${encodeURIComponent(picUrl)}`;
    const picRes = await fetch(proxyUrl, {
      headers: { "x-api-key": VPS_API_KEY },
    });
    if (picRes.ok) {
      const buf = await picRes.arrayBuffer();
      if (buf.byteLength === 0) return null;
      const contentType = picRes.headers.get("content-type") || "image/jpeg";
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      console.log(`[fetch-profile-top-posts] profilePic downloaded via proxy: ${(buf.byteLength / 1024).toFixed(1)} KB`);
      return `data:${contentType};base64,${b64}`;
    }
    console.warn(`[fetch-profile-top-posts] proxy-image returned ${picRes.status}`);
  } catch (e: any) {
    console.warn("[fetch-profile-top-posts] profilePic proxy download failed:", e.message);
  }

  // Fallback: try direct fetch (works for YouTube, sometimes for others)
  try {
    const picRes = await fetch(picUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.instagram.com/",
      },
    });
    if (picRes.ok) {
      const buf = await picRes.arrayBuffer();
      if (buf.byteLength === 0) return null;
      const contentType = picRes.headers.get("content-type") || "image/jpeg";
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      console.log(`[fetch-profile-top-posts] profilePic downloaded directly: ${(buf.byteLength / 1024).toFixed(1)} KB`);
      return `data:${contentType};base64,${b64}`;
    }
  } catch (e: any) {
    console.warn("[fetch-profile-top-posts] profilePic direct download failed:", e.message);
  }

  return null;
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

    const { username } = parseIdentifier(profileUrl, platform);
    if (!username) return json({ error: "Could not parse username from URL" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. Cache check (compound key: username + platform) ──
    console.log(`[fetch-profile-top-posts] checking vault for @${username} (${platform})`);
    const { data: channelRow } = await supabase
      .from("viral_channels")
      .select("id, avg_views, video_count")
      .eq("username", username)
      .eq("platform", platform)
      .eq("scrape_status", "done")
      .maybeSingle();

    if (channelRow?.id && (channelRow.video_count ?? 0) >= VAULT_CACHE_MIN_VIDEOS) {
      const { data: vaultVideos } = await supabase
        .from("viral_videos")
        .select("video_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, thumbnail_url")
        .eq("channel_id", channelRow.id)
        .gt("views_count", 0)
        .order("views_count", { ascending: false })
        .limit(10);

      if (vaultVideos && vaultVideos.length > 0) {
        console.log(`[fetch-profile-top-posts] cache hit — ${vaultVideos.length} from vault for @${username}`);
        return json({
          posts: vaultVideos.map((v: any, i: number) => ({
            rank: i + 1,
            caption: v.caption,
            views: v.views_count,
            viewsFormatted: formatViews(v.views_count),
            likes: v.likes_count,
            comments: v.comments_count,
            engagement_rate: v.engagement_rate,
            outlier_score: v.outlier_score,
            posted_at: v.posted_at,
            url: v.video_url,
            thumbnail: v.thumbnail_url,
            platform,
          })),
          username,
          platform,
          profilePicUrl: null,
          profilePicB64: null,
          fromVault: true,
        });
      }
    }

    // ── 2. Cache miss — call VPS /scrape-profile ──
    const safeLimit = Math.min(Number(limit) || 50, MAX_RESULTS);
    console.log(`[fetch-profile-top-posts] cache miss — calling VPS /scrape-profile for @${username} (${platform}), limit=${safeLimit}`);

    const vpsRes = await fetchVpsWithRetry(VPS_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({
        platform,
        username,
        limit: safeLimit,
      }),
    });

    if (vpsRes.status === 503) {
      throw new Error("Server busy, please try again in ~30 seconds");
    }

    if (!vpsRes.ok) {
      const errText = await vpsRes.text();
      throw new Error(`VPS /scrape-profile failed: ${vpsRes.status} ${errText.slice(0, 300)}`);
    }

    const vpsData: VpsResponse = await vpsRes.json();
    console.log(`[fetch-profile-top-posts] VPS returned ${vpsData.posts?.length ?? 0} posts for @${username}`);

    const rawPosts = vpsData.posts ?? [];
    const normalized = rawPosts.map(normalizeVpsPost).filter((p) => p.videoId);

    // Extract profile picture URL from VPS response
    const profilePicUrl: string | null = vpsData.profilePicUrl || null;
    console.log(`[fetch-profile-top-posts] profilePicUrl: ${profilePicUrl ? profilePicUrl.slice(0, 80) + "..." : "none"}`);

    // Download profile pic and convert to base64 so it survives CDN expiry
    let profilePicB64: string | null = null;
    if (profilePicUrl) {
      profilePicB64 = await downloadProfilePicAsBase64(profilePicUrl);
    }

    if (normalized.length === 0) {
      return json({
        posts: [],
        username,
        platform,
        profilePicUrl,
        profilePicB64,
        message: "No posts found for this profile",
      });
    }

    const avgViews = normalized.reduce((s, p) => s + p.views, 0) / normalized.length;

    // ── 3. Fire-and-forget vault save ──
    saveToVault(supabase, username, platform, normalized, avgViews);

    // ── 4. Return top 10 sorted by views ──
    const sorted = [...normalized].sort((a, b) => b.views - a.views).slice(0, 10);

    return json({
      posts: sorted.map((p, i) => ({
        rank: i + 1,
        caption: p.caption,
        views: p.views,
        viewsFormatted: formatViews(p.views),
        likes: p.likes,
        comments: p.comments,
        engagement_rate: parseFloat(p.engagement.toFixed(2)),
        outlier_score: parseFloat(((p.views / (avgViews || 1)) * 10).toFixed(1)),
        posted_at: p.postedAt,
        url: p.url,
        thumbnail: p.thumbnail,
        platform,
      })),
      username,
      platform,
      profilePicUrl,
      profilePicB64,
    });
  } catch (e: any) {
    console.error("[fetch-profile-top-posts] error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
