import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
// Use the universal Instagram Scraper — the hashtag-specific actor returns
// mostly images with zero video view counts, making it useless for viral video discovery.
const ACTOR_ID = "apify~instagram-scraper";
const SEARCH_LIMIT = 15;            // Number of accounts to find per keyword
const RESULTS_LIMIT = 50;           // Posts per account
const MAX_RESULTS = 50;             // Keep only top 50 by composite score
const MIN_VIEWS = 50_000;           // Discard anything below this before scoring
const CACHE_TTL_HOURS = 6;          // Skip Apify if same keywords scraped within this window
const POLL_TIMEOUT_MS = 120_000;    // Universal scraper needs more time (searches accounts + posts)
const POLL_INTERVAL_MS = 4000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildCacheKey(tags: string[]): string {
  return [...tags].sort().join(",");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { hashtags } = await req.json() as { hashtags: string[] };
    if (!hashtags?.length) {
      return new Response(JSON.stringify({ error: "hashtags array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clean keywords (strip # prefix if included)
    const cleanTags = hashtags.map(h => h.replace(/^#/, "").trim()).filter(Boolean);
    const cacheKey = buildCacheKey(cleanTags);

    // ── 1. Cache guard ────────────────────────────────────────────────────────
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await supabase
      .from("viral_videos")
      .select("id")
      .eq("hashtag_source", cacheKey)
      .gt("scraped_at", cacheThreshold)
      .limit(1)
      .maybeSingle();

    if (cachedRow) {
      return new Response(
        JSON.stringify({ inserted: 0, cached: true, message: "Results from cache (scraped < 6h ago)", hashtags: cleanTags }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Start Apify run ──────────────────────────────────────────────────
    // Use the universal Instagram Scraper with user search — it finds accounts
    // matching the keywords then scrapes their posts, returning videos with
    // actual videoViewCount data.
    const searchQuery = cleanTags.join(" ");
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search: searchQuery,
          searchType: "user",
          resultsType: "posts",
          searchLimit: SEARCH_LIMIT,
          resultsLimit: RESULTS_LIMIT,
        }),
      }
    );

    if (!runRes.ok) {
      const err = await runRes.text();
      throw new Error(`Apify start failed: ${err}`);
    }

    const { data: runData } = await runRes.json();
    const runId = runData.id;
    const datasetId = runData.defaultDatasetId;

    // Poll until finished
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let status = runData.status;

    while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
      );
      const pollData = await pollRes.json();
      status = pollData.data?.status ?? status;
    }

    if (status === "FAILED" || status === "ABORTED") {
      throw new Error(`Apify run ${status}`);
    }

    // Fetch full dataset
    const datasetRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=2000&clean=true`
    );
    if (!datasetRes.ok) throw new Error("Failed to fetch dataset");
    const items: any[] = await datasetRes.json();

    if (!items.length) {
      return new Response(JSON.stringify({ inserted: 0, message: "No results from Apify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Early filter: video posts only, then discard below MIN_VIEWS ────
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const videoPosts = items
      .filter(item => item.type === "Video" || item.isVideo === true || item.videoUrl)
      .map(item => {
        const views = item.videoViewCount ?? item.videoPlayCount ?? item.playsCount ?? 0;
        const likes = item.likesCount ?? item.likeCount ?? 0;
        const comments = item.commentsCount ?? item.commentCount ?? 0;
        const videoId = item.shortCode ?? item.id ?? item.pk;
        const ownerUsername = item.ownerUsername ?? item.owner?.username ?? "unknown";
        const caption = (item.caption ?? item.text ?? "").slice(0, 600);
        const thumbnail = typeof item.displayUrl === "string"
          ? item.displayUrl
          : (item.displayUrl?.url ?? item.thumbnailUrl ?? item.coverUrl ?? null);
        const postUrl = item.url ?? `https://www.instagram.com/reel/${videoId}/`;

        let postedAt: string | null = null;
        let ageInDays = 0;
        if (item.timestamp) {
          const ts = typeof item.timestamp === "number"
            ? new Date(item.timestamp * 1000)
            : new Date(item.timestamp);
          if (!isNaN(ts.getTime())) {
            postedAt = ts.toISOString();
            ageInDays = (now - ts.getTime()) / 86_400_000;
          }
        }

        return { views, likes, comments, videoId, ownerUsername, caption, thumbnail, postUrl, postedAt, ageInDays };
      })
      .filter(p => {
        if (!p.videoId) return false;
        if (p.views < MIN_VIEWS) return false;
        if (p.postedAt && new Date(p.postedAt).getTime() < oneYearAgo) return false;
        return true;
      });

    if (!videoPosts.length) {
      return new Response(
        JSON.stringify({ inserted: 0, message: `No videos met the ${MIN_VIEWS / 1000}K views threshold`, total_scraped: items.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Velocity + composite ranking ──────────────────────────────────────
    const scored = videoPosts.map(p => ({
      ...p,
      velocity: p.postedAt ? p.views / Math.max(p.ageInDays, 1) : 0,
    }));

    const maxViews    = scored.reduce((m, p) => p.views > m ? p.views : m, 0);
    const maxVelocity = scored.reduce((m, p) => p.velocity > m ? p.velocity : m, 0);

    const ranked = scored
      .map(p => {
        const normViews    = p.views / maxViews;
        const normVelocity = maxVelocity > 0 ? p.velocity / maxVelocity : 0;
        const composite    = maxVelocity > 0
          ? 0.7 * normViews + 0.3 * normVelocity
          : normViews;
        return { ...p, composite };
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, MAX_RESULTS);

    // ── 5. Outlier score (relative to kept batch avg) ─────────────────────────
    const viewsList = ranked.map(p => p.views);
    const avgViews  = viewsList.reduce((a, b) => a + b, 0) / (viewsList.length || 1);

    const rows: any[] = ranked.map(p => ({
      channel_id: null,
      channel_username: p.ownerUsername,
      platform: "instagram",
      video_url: p.postUrl,
      thumbnail_url: p.thumbnail,
      caption: p.caption,
      views_count: p.views,
      likes_count: p.likes,
      comments_count: p.comments,
      engagement_rate: Math.round(p.views > 0 ? ((p.likes + p.comments) / p.views) * 10000 : 0) / 100,
      outlier_score: Math.round((p.views / avgViews) * 100) / 100,
      posted_at: p.postedAt,
      scraped_at: new Date().toISOString(),
      apify_video_id: p.videoId,
      hashtag_source: cacheKey,
    }));

    // ── 6. Upsert ─────────────────────────────────────────────────────────────
    const { error: upsertErr, count } = await supabase
      .from("viral_videos")
      .upsert(rows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false })
      .select("id", { count: "exact", head: true });

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

    return new Response(
      JSON.stringify({
        inserted: count ?? rows.length,
        hashtags: cleanTags,
        total_scraped: items.length,
        videos_found: videoPosts.length,
        total_processed: ranked.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("scrape-hashtag error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
