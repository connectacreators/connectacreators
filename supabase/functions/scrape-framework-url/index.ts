import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function extractNicheTags(caption: string | null): string[] {
  if (!caption) return [];
  const matches = caption.match(/#([a-zA-Z][a-zA-Z0-9_]{1,49})/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))].slice(0, 20);
}

function computeFrameworkScore(
  outlier: number,
  engagement: number,
  postedAt: string | null,
): number {
  const now = Date.now();
  const ref = postedAt ? new Date(postedAt).getTime() : now;
  const daysSince = (now - ref) / 86_400_000;
  return outlier * Math.log(1 + engagement) * Math.exp(-daysSince / 30);
}

function detectPlatform(url: string): "instagram" | "tiktok" | "youtube" {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return "instagram";
}

// Extract the canonical video id from a public URL. Used as the apify_video_id
// for upsert dedup so we don't fight the existing (platform, apify_video_id)
// unique index.
function extractVideoIdFromUrl(url: string, platform: string): string | null {
  if (platform === "instagram") {
    const m = url.match(/\/(?:reels?|p)\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  }
  if (platform === "tiktok") {
    const m = url.match(/\/video\/(\d+)/);
    return m?.[1] ?? null;
  }
  if (platform === "youtube") {
    const m = url.match(/[?&]v=([A-Za-z0-9_-]+)/)
      ?? url.match(/youtu\.be\/([A-Za-z0-9_-]+)/)
      ?? url.match(/\/shorts\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth: admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleData?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let url: string;
  try {
    const body = await req.json();
    url = body.url;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!url || typeof url !== "string") return json({ error: "url is required" }, 400);

  const platform = detectPlatform(url);

  // Attempt VPS fetch for real metadata
  let vpsData: any = null;
  try {
    const res = await fetch(`${VPS_SERVER}/scrape-single-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) vpsData = await res.json();
  } catch (e) {
    console.warn("[scrape-framework-url] VPS fetch failed:", (e as Error).message);
  }

  const usernameMatch = url.match(/instagram\.com\/(?:reels?\/|p\/)?@?([^/?#\s]+)/i)
    ?? url.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  const channelUsername = (vpsData?.owner_username ?? usernameMatch?.[1] ?? "unknown")
    .replace(/^@/, "");

  const caption = (vpsData?.title ?? "(admin-curated)").slice(0, 600);
  const views = Number(vpsData?.views) || 0;
  const likes = Number(vpsData?.likes) || 0;
  const comments = Number(vpsData?.comments) || 0;
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  const outlier = Number(vpsData?.outlier_score) || 5; // default high — admin picked it

  let postedAt: string | null = null;
  if (vpsData?.posted_at) {
    const raw = vpsData.posted_at;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!isNaN(num) && num > 0) {
      postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
    }
  }
  // If we couldn't determine the original post time (VPS unavailable or
  // payload missing the field), fall back to "now". Otherwise the row gets
  // posted_at=NULL and the default Viral Today date filter (>= 12 months ago)
  // silently excludes it because NULL fails the comparison — admin sees
  // "Framework added" but can't find the video.
  if (!postedAt) postedAt = new Date().toISOString();

  const niche_tags = extractNicheTags(caption);
  const framework_score = computeFrameworkScore(outlier, engagementRate, postedAt);
  const apifyVideoId = String(vpsData?.id ?? extractVideoIdFromUrl(url, platform) ?? `manual_${Date.now()}`);

  // Cache thumbnail if CDN URL
  let thumbnailUrl: string | null = vpsData?.thumbnail ?? null;
  if (thumbnailUrl && /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent/.test(thumbnailUrl)) {
    try {
      const cacheRes = await fetch(`${VPS_SERVER}/cache-thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ url: thumbnailUrl, key: `framework_${Date.now()}` }),
      });
      if (cacheRes.ok) {
        const { cached_url } = await cacheRes.json();
        if (cached_url) thumbnailUrl = cached_url;
      }
    } catch { /* non-blocking */ }
  }

  const { data: inserted, error: upsertErr } = await adminClient
    .from("viral_videos")
    .upsert({
      channel_id: null,
      channel_username: channelUsername,
      platform,
      video_url: url,
      apify_video_id: apifyVideoId,
      thumbnail_url: thumbnailUrl,
      caption,
      views_count: views,
      likes_count: likes,
      comments_count: comments,
      engagement_rate: Math.round(engagementRate * 100) / 100,
      outlier_score: outlier,
      posted_at: postedAt,
      scraped_at: new Date().toISOString(),
      is_featured_framework: true,
      niche_tags,
      framework_score,
    }, { onConflict: "platform,apify_video_id", ignoreDuplicates: false })
    .select("id")
    .single();

  if (upsertErr || !inserted) {
    return json({ error: upsertErr?.message ?? "Upsert failed" }, 500);
  }

  return json({ id: inserted.id, channel_username: channelUsername, platform });
});
