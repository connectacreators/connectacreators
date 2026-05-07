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

// Common words to skip when splitting multi-word queries into sub-searches
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "of", "in", "on", "at", "to",
  "with", "by", "is", "are", "was", "be", "how", "what", "when", "do",
  "i", "my", "me", "we", "you", "your", "it", "its", "as", "from",
]);

// ── Framework helpers ─────────────────────────────────────────────────────

function extractNicheTags(caption: string | null, hashtagSource: string | null): string[] {
  const tags: string[] = [];
  if (hashtagSource) tags.push(hashtagSource.toLowerCase().trim());
  if (caption) {
    const matches = caption.match(/#([a-zA-Z][a-zA-Z0-9_]{1,49})/g) ?? [];
    for (const m of matches) tags.push(m.slice(1).toLowerCase());
  }
  return [...new Set(tags)].slice(0, 20);
}

function computeFrameworkScore(
  outlier: number,
  engagement: number,
  postedAt: string | null,
  scrapedAt: string,
): number {
  const now = Date.now();
  const ref = postedAt ? new Date(postedAt).getTime() : new Date(scrapedAt).getTime();
  const daysSince = (now - ref) / 86_400_000;
  return outlier * Math.log(1 + engagement) * Math.exp(-daysSince / 30);
}

async function fetchVpsWithRetry(url: string, init: RequestInit, retries = 2, delayMs = 6000): Promise<Response> {
  let res = await fetch(url, init);
  while (res.status === 503 && retries-- > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
    res = await fetch(url, init);
  }
  return res;
}

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

/**
 * Build expanded search terms from a query.
 * "tile remodeling" → ["tile remodeling", "tile", "remodeling"]
 * "sales humor" → ["sales humor", "sales", "humor"]
 * "tile" → ["tile"]
 */
function buildSearchTerms(query: string): string[] {
  const clean = query.trim().toLowerCase();
  const words = clean.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const terms: string[] = [clean]; // always include the full phrase
  if (words.length > 1) {
    // Add each meaningful word as its own search
    for (const w of words) {
      if (!terms.includes(w)) terms.push(w);
    }
    // Also try first-word combinations (e.g. "tile installation" from "tile remodeling installation")
    if (words.length > 2) {
      const pair = words[0] + " " + words[1];
      if (!terms.includes(pair)) terms.push(pair);
    }
  }
  // Cap at 4 search terms to avoid overloading the VPS
  return terms.slice(0, 4);
}

async function vpsSearch(term: string, limit: number, signal: AbortSignal): Promise<any[]> {
  try {
    const res = await fetchVpsWithRetry(`${VPS_SERVER}/scrape-reels-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ query: term, limit }),
      signal,
    });
    if (res.status === 503) {
      console.warn(`[scrape-reels-search] VPS 503 for "${term}"`);
      return [];
    }
    if (!res.ok) {
      console.warn(`[scrape-reels-search] VPS HTTP ${res.status} for "${term}"`);
      return [];
    }
    const data = await res.json();
    return data.posts ?? [];
  } catch (e: any) {
    if (e.name === "AbortError") throw e; // propagate abort
    console.warn(`[scrape-reels-search] VPS error for "${term}": ${e.message}`);
    return [];
  }
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

    // ── Build expanded search terms ─────────────────────────────────────────
    const searchTerms = buildSearchTerms(cleanQuery);
    console.log(`[scrape-reels-search] Expanded "${cleanQuery}" → ${JSON.stringify(searchTerms)}`);

    // ── Run all searches in parallel with shared timeout ───────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);

    let allPosts: any[] = [];
    try {
      // Run searches in parallel — each gets 150 results, combined gives 450+ candidates
      const limitPerTerm = Math.ceil(500 / searchTerms.length);
      const results = await Promise.allSettled(
        searchTerms.map(term => vpsSearch(term, limitPerTerm, controller.signal))
      );

      for (const r of results) {
        if (r.status === "fulfilled") allPosts = allPosts.concat(r.value);
      }
    } finally {
      clearTimeout(timeout);
    }

    console.log(`[scrape-reels-search] Combined: ${allPosts.length} posts across ${searchTerms.length} searches`);

    // ── Deduplicate by video id ──────────────────────────────────────────────
    const seenIds = new Set<string>();
    const uniquePosts: any[] = [];
    for (const post of allPosts) {
      const id = String(post.id ?? "");
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        uniquePosts.push(post);
      }
    }
    console.log(`[scrape-reels-search] After dedup: ${uniquePosts.length} unique posts`);

    if (uniquePosts.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No results found" });
    }

    // ── Process posts ─────────────────────────────────────────────────────
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    // Language filter: reject captions with non-Latin scripts
    const NON_LATIN_RE = /[؀-ۿऀ-ॿঀ-৿਀-੿଀-୿ఀ-౿ഀ-ൿ฀-๿က-႟぀-ヿ一-鿿가-힯]/;
    function isLatinCaption(caption: string | null): boolean {
      if (!caption || caption.trim().length < 5) return true;
      const clean = caption.replace(/#\S+|@\S+|https?:\/\/\S+/g, "").trim();
      if (clean.length < 5) return true;
      const nonLatinChars = (clean.match(NON_LATIN_RE) || []).length;
      return nonLatinChars / clean.length < 0.3;
    }

    const videos = uniquePosts
      .map((post: any) => {
        const videoId = post.id;
        if (!videoId) return null;

        const caption = post.title ?? "";
        if (!isLatinCaption(caption)) return null;

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
              if (ts.getTime() < oneYearAgo) return null;
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
          caption: caption.slice(0, 600),
          views_count: views,
          likes_count: likes,
          comments_count: comments,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          outlier_score: Number(post.outlier_score) || 1,
          posted_at: postedAt,
          scraped_at: new Date().toISOString(),
          apify_video_id: String(videoId),
          hashtag_source: cleanQuery,
          niche_tags: extractNicheTags(caption.slice(0, 600), cleanQuery),
          framework_score: computeFrameworkScore(
            Number(post.outlier_score) || 1,
            engagementRate,
            postedAt,
            new Date().toISOString(),
          ),
        };
      })
      .filter((v): v is NonNullable<typeof v> =>
        v !== null &&
        v.apify_video_id !== null &&
        v.views_count >= 50_000 &&
        v.outlier_score >= 1.5
      );

    if (videos.length === 0) {
      return json({ inserted: 0, query: cleanQuery, cached: false, message: "No viral videos found (min 50k views + 1.5x outlier)" });
    }

    // VPS already calculates per-account outlier scores — use them directly
    const videosWithOutlier = videos;

    // Cache CDN thumbnails
    for (const v of videosWithOutlier) {
      if (shouldCacheThumbnail(v.thumbnail_url) && v.apify_video_id) {
        const key = `search_${v.apify_video_id}`;
        const cached = await cacheThumbnail(v.thumbnail_url!, key);
        if (cached) v.thumbnail_url = cached;
      }
    }

    // ── Upsert ────────────────────────────────────────────────────────────
    const { data: inserted, error: upsertErr } = await adminClient
      .from("viral_videos")
      .upsert(videosWithOutlier, {
        onConflict: "platform,apify_video_id",
        ignoreDuplicates: false,
      })
      .select("id, outlier_score, views_count");

    if (upsertErr) {
      console.error("[scrape-reels-search] Upsert error:", upsertErr);
      throw new Error("Database upsert failed: " + upsertErr.message);
    }

    console.log(`[scrape-reels-search] Upserted ${videosWithOutlier.length} videos for "${cleanQuery}"`);

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
          }).catch((e) => console.warn("[scrape-reels-search] analyze-viral-video trigger failed:", (e as Error).message));
        }
      }
    }

    return json({
      inserted: videosWithOutlier.length,
      query: cleanQuery,
      terms_searched: searchTerms,
      total_scraped: uniquePosts.length,
      cached: false,
    });
  } catch (e: any) {
    console.error("[scrape-reels-search] Error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});
