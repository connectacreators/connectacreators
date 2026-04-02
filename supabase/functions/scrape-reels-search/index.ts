import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";
const CACHE_TTL_HOURS = 6;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function shouldCacheThumbnail(url: string | null): boolean {
  if (!url) return false;
  return /cdninstagram\.com|fbcdn\.net|instagram\.f|scontent/.test(url);
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
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── Auth: admin-only ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

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

  // Check admin role
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleData?.role !== "admin") {
    return json({ error: "Admin access required" }, 403);
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "query is required" }, 400);
    }

    const cleanQuery = query.trim().toLowerCase();

    // ── Cache guard: skip if same query searched within 6 hours ────────────
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await adminClient
      .from("viral_videos")
      .select("id")
      .eq("hashtag_source", cleanQuery)
      .gt("scraped_at", cacheThreshold)
      .limit(1)
      .maybeSingle();

    if (cachedRow) {
      return json({
        inserted: 0,
        query: cleanQuery,
        cached: true,
        message: `Already searched "${cleanQuery}" within the last ${CACHE_TTL_HOURS} hours`,
      });
    }

    // ── Call VPS /scrape-reels-search ──────────────────────────────────────
    console.log(`[scrape-reels-search] Searching: "${cleanQuery}"`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let vpsRes: Response;
    try {
      vpsRes = await fetch(`${VPS_SERVER}/scrape-reels-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
        body: JSON.stringify({ query: cleanQuery, limit: 150 }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!vpsRes.ok) {
      const errBody = await vpsRes.json().catch(() => ({ error: "VPS error" }));
      throw new Error(errBody.error || `VPS HTTP ${vpsRes.status}`);
    }

    const vpsData = await vpsRes.json();
    const posts: any[] = vpsData.posts ?? [];
    console.log(`[scrape-reels-search] VPS returned ${posts.length} posts`);

    if (posts.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No results found" });
    }

    // ── Process posts ─────────────────────────────────────────────────────
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const videos = posts
      .map((post: any) => {
        const videoId = post.id;
        if (!videoId) return null;

        const views = Number(post.views) || 0;
        const likes = Number(post.likes) || 0;
        const comments = Number(post.comments) || 0;
        const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

        let postedAt: string | null = null;
        if (post.posted_at) {
          const raw = post.posted_at;
          const num = typeof raw === "number" ? raw : Number(raw);
          if (!isNaN(num) && num > 0) {
            const ts = new Date(num < 2e10 ? num * 1000 : num);
            if (!isNaN(ts.getTime())) {
              if (ts.getTime() < oneYearAgo) return null; // too old
              postedAt = ts.toISOString();
            }
          } else if (typeof raw === "string") {
            const ts = new Date(raw);
            if (!isNaN(ts.getTime())) {
              if (ts.getTime() < oneYearAgo) return null;
              postedAt = ts.toISOString();
            }
          }
        }

        return {
          channel_id: null,
          channel_username: post.owner_username || "unknown",
          platform: "instagram",
          video_url: post.url,
          thumbnail_url: post.thumbnail || null,
          caption: (post.title ?? "").slice(0, 600),
          views_count: views,
          likes_count: likes,
          comments_count: comments,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          outlier_score: 1, // recalculated below
          posted_at: postedAt,
          scraped_at: new Date().toISOString(),
          apify_video_id: String(videoId),
          hashtag_source: cleanQuery,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null && v.apify_video_id !== null);

    if (videos.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No recent videos found" });
    }

    // Calculate outlier scores (relative to batch average)
    const totalViews = videos.reduce((sum, v) => sum + v.views_count, 0);
    const avgViews = totalViews / videos.length;
    const videosWithOutlier = videos.map(v => ({
      ...v,
      outlier_score: avgViews > 0 ? Math.round((v.views_count / avgViews) * 10) / 10 : 1,
    }));

    // Cache CDN thumbnails
    for (const v of videosWithOutlier) {
      if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
        const key = `search_${v.apify_video_id}`;
        const cached = await cacheThumbnail(v.thumbnail_url!, key);
        if (cached) v.thumbnail_url = cached;
      }
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    const { error: upsertErr } = await adminClient
      .from("viral_videos")
      .upsert(videosWithOutlier, {
        onConflict: "platform,apify_video_id",
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      console.error("[scrape-reels-search] Upsert error:", upsertErr);
      throw new Error("Database upsert failed: " + upsertErr.message);
    }

    console.log(`[scrape-reels-search] Upserted ${videosWithOutlier.length} videos for "${cleanQuery}"`);

    return json({
      inserted: videosWithOutlier.length,
      query: cleanQuery,
      total_scraped: posts.length,
      cached: false,
    });
  } catch (e: any) {
    console.error("[scrape-reels-search] Error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});
