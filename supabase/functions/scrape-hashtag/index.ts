import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── VPS connection ───────────────────────────────────────────────────────────
const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

// ── Tuning constants ─────────────────────────────────────────────────────────
const SEARCH_LIMIT = 15;        // Max accounts to find per keyword search
const RESULTS_LIMIT = 50;       // Posts to fetch per account
const MAX_RESULTS = 50;         // Keep only top 50 by composite score
const MIN_VIEWS = 50_000;       // Discard anything below this before scoring
const CACHE_TTL_HOURS = 6;      // Skip scrape if same keywords scraped within this window

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildCacheKey(tags: string[]): string {
  return [...tags].sort().join(",");
}

// ── VPS helpers ──────────────────────────────────────────────────────────────

/**
 * Search Instagram for accounts matching a query via VPS /ig-search endpoint.
 *
 * NOTE: The /ig-search endpoint does NOT exist on the VPS yet.
 * It needs to be created to accept POST {query, limit} and return
 * {users: [{username, full_name, follower_count, profile_pic_url}]}.
 * Until then, this call will fail and the function will return an
 * informative error — use the `profiles` input param as a workaround.
 */
async function vpsSearchAccounts(
  query: string,
  limit: number
): Promise<{ username: string; full_name: string; follower_count: number }[]> {
  const res = await fetch(`${VPS_SERVER}/ig-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": VPS_API_KEY,
    },
    body: JSON.stringify({ query, limit }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(`VPS /ig-search failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.users ?? [];
}

/**
 * Scrape posts from a single Instagram profile via VPS /scrape-profile.
 */
async function vpsScrapeProfile(
  username: string,
  limit: number
): Promise<any[]> {
  const res = await fetch(`${VPS_SERVER}/scrape-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": VPS_API_KEY,
    },
    body: JSON.stringify({ platform: "instagram", username, limit }),
  });

  if (!res.ok) {
    console.error(`VPS /scrape-profile failed for @${username}: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.posts ?? [];
}

// ── Thumbnail caching (same as scrape-channel) ──────────────────────────────

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
  } catch {
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      hashtags?: string[];
      profiles?: string[];
    };

    const { hashtags, profiles } = body;

    if (!hashtags?.length && !profiles?.length) {
      return json({
        error: "Provide `hashtags` array (keyword search) and/or `profiles` array (direct usernames)",
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Clean keywords (strip # prefix)
    const cleanTags = (hashtags ?? []).map(h => h.replace(/^#/, "").trim()).filter(Boolean);
    // Clean profiles (strip @ prefix and URLs)
    const cleanProfiles = (profiles ?? []).map(p => {
      const instaMatch = p.match(/instagram\.com\/([^/?#\s]+)/i);
      if (instaMatch) return instaMatch[1].replace(/\/$/, "").toLowerCase();
      return p.replace(/^@/, "").trim().toLowerCase();
    }).filter(Boolean);

    // Build cache key from both hashtags and profiles for proper dedup
    const cacheKey = buildCacheKey([...cleanTags, ...cleanProfiles.map(p => `@${p}`)]);

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
      return json({
        inserted: 0,
        cached: true,
        message: `Results from cache (scraped < ${CACHE_TTL_HOURS}h ago)`,
        hashtags: cleanTags,
        profiles: cleanProfiles,
      });
    }

    // ── 2. Collect usernames to scrape ────────────────────────────────────────
    const usernamesToScrape = new Set<string>();

    // Add directly-provided profiles first
    for (const p of cleanProfiles) {
      usernamesToScrape.add(p);
    }

    // If hashtags provided, search for matching accounts via VPS /ig-search
    if (cleanTags.length > 0) {
      const searchQuery = cleanTags.join(" ");
      try {
        const accounts = await vpsSearchAccounts(searchQuery, SEARCH_LIMIT);
        for (const acc of accounts) {
          if (acc.username) {
            usernamesToScrape.add(acc.username.toLowerCase());
          }
        }
        console.log(`/ig-search returned ${accounts.length} accounts for "${searchQuery}"`);
      } catch (searchErr: any) {
        // If no profiles were provided as fallback, this is a hard failure
        if (cleanProfiles.length === 0) {
          return json({
            error: `Instagram account search failed: ${searchErr.message}. ` +
              `The VPS /ig-search endpoint may not be deployed yet. ` +
              `As a workaround, include a "profiles" array with Instagram usernames to scrape directly.`,
            hint: `Example: {"hashtags": ["fitness"], "profiles": ["username1", "username2"]}`,
          }, 502);
        }
        // We have profiles as fallback — log and continue
        console.warn(`/ig-search failed (using ${cleanProfiles.length} direct profiles as fallback): ${searchErr.message}`);
      }
    }

    if (usernamesToScrape.size === 0) {
      return json({
        inserted: 0,
        message: "No accounts found to scrape",
        hashtags: cleanTags,
      });
    }

    // ── 3. Scrape posts from each account ─────────────────────────────────────
    const allPosts: { post: any; ownerUsername: string }[] = [];
    const errors: string[] = [];

    // Scrape accounts in parallel (batches of 5 to avoid overwhelming VPS)
    const usernameList = Array.from(usernamesToScrape);
    const BATCH_SIZE = 5;

    for (let i = 0; i < usernameList.length; i += BATCH_SIZE) {
      const batch = usernameList.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (username) => {
          const posts = await vpsScrapeProfile(username, RESULTS_LIMIT);
          return { username, posts };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { username, posts } = result.value;
          for (const post of posts) {
            allPosts.push({ post, ownerUsername: username });
          }
        } else {
          errors.push(result.reason?.message ?? "unknown scrape error");
        }
      }
    }

    if (allPosts.length === 0) {
      return json({
        inserted: 0,
        message: "No posts returned from any account",
        accounts_attempted: usernameList.length,
        errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      });
    }

    // ── 4. Filter: video posts only, min views, max 12 months old, Latin-script only ──
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    // Language filter: reject non-Latin scripts (Arabic, Devanagari, Bengali, Thai, CJK, etc.)
    const NON_LATIN_RE = /[\u0600-\u06FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0C00-\u0C7F\u0D00-\u0D7F\u0E00-\u0E7F\u1000-\u109F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
    function isLatinCaption(cap: string | null): boolean {
      if (!cap || cap.trim().length < 5) return true;
      const clean = cap.replace(/#\S+|@\S+|https?:\/\/\S+/g, "").trim();
      if (clean.length < 5) return true;
      const nonLatinChars = (clean.match(NON_LATIN_RE) || []).length;
      return nonLatinChars / clean.length < 0.3;
    }

    const videoPosts = allPosts
      .map(({ post, ownerUsername }) => {
        // VPS /scrape-profile returns: id, url, thumbnail, title, views, likes, comments, posted_at, engagement_rate
        const videoId = post.id ?? post.shortcode ?? null;
        if (!videoId) return null;

        const views = Number(post.views) || 0;
        const likes = Number(post.likes) || 0;
        const comments = Number(post.comments) || 0;
        const caption = (post.title ?? post.caption ?? "").slice(0, 600);

        // Skip non-English/Spanish captions
        if (!isLatinCaption(caption)) return null;
        const thumbnail = post.thumbnail ?? null;
        const postUrl = post.url ?? `https://www.instagram.com/reel/${videoId}/`;

        let postedAt: string | null = null;
        let ageInDays = 0;
        if (post.posted_at) {
          const raw = post.posted_at;
          const num = typeof raw === "number" ? raw : Number(raw);
          if (!isNaN(num) && num > 0) {
            const ts = new Date(num < 2e10 ? num * 1000 : num);
            if (!isNaN(ts.getTime())) {
              postedAt = ts.toISOString();
              ageInDays = (now - ts.getTime()) / 86_400_000;
            }
          } else if (typeof raw === "string") {
            const ts = new Date(raw);
            if (!isNaN(ts.getTime())) {
              postedAt = ts.toISOString();
              ageInDays = (now - ts.getTime()) / 86_400_000;
            }
          }
        }

        return { views, likes, comments, videoId, ownerUsername, caption, thumbnail, postUrl, postedAt, ageInDays };
      })
      .filter((p): p is NonNullable<typeof p> => {
        if (!p) return false;
        if (!p.videoId) return false;
        if (p.views < MIN_VIEWS) return false;
        if (p.postedAt && new Date(p.postedAt).getTime() < oneYearAgo) return false;
        return true;
      });

    if (videoPosts.length === 0) {
      return json({
        inserted: 0,
        message: `No videos met the ${MIN_VIEWS / 1000}K views threshold`,
        total_scraped: allPosts.length,
        accounts_scraped: usernameList.length,
      });
    }

    // ── 5. Velocity + composite ranking ───────────────────────────────────────
    const scored = videoPosts.map(p => ({
      ...p,
      velocity: p.postedAt ? p.views / Math.max(p.ageInDays, 1) : 0,
    }));

    const maxViews = scored.reduce((m, p) => p.views > m ? p.views : m, 0);
    const maxVelocity = scored.reduce((m, p) => p.velocity > m ? p.velocity : m, 0);

    const ranked = scored
      .map(p => {
        const normViews = p.views / maxViews;
        const normVelocity = maxVelocity > 0 ? p.velocity / maxVelocity : 0;
        const composite = maxVelocity > 0
          ? 0.7 * normViews + 0.3 * normVelocity
          : normViews;
        return { ...p, composite };
      })
      .sort((a, b) => b.composite - a.composite)
      .slice(0, MAX_RESULTS);

    // ── 6. Outlier score (relative to kept batch avg) ─────────────────────────
    const viewsList = ranked.map(p => p.views);
    const avgViews = viewsList.reduce((a, b) => a + b, 0) / (viewsList.length || 1);

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
      apify_video_id: String(p.videoId),
      hashtag_source: cacheKey,
    }));

    // ── 7. Cache expiring CDN thumbnails to VPS ───────────────────────────────
    for (const row of rows) {
      if (shouldCacheThumbnail(row.thumbnail_url) && row.apify_video_id) {
        const key = `hashtag_${row.apify_video_id}`;
        const cached = await cacheThumbnail(row.thumbnail_url, key);
        if (cached) row.thumbnail_url = cached;
      }
    }

    // ── 8. Upsert to viral_videos ─────────────────────────────────────────────
    const { error: upsertErr, count } = await supabase
      .from("viral_videos")
      .upsert(rows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false })
      .select("id", { count: "exact", head: true });

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

    return json({
      inserted: count ?? rows.length,
      hashtags: cleanTags,
      profiles: cleanProfiles.length > 0 ? cleanProfiles : undefined,
      accounts_scraped: usernameList.length,
      total_scraped: allPosts.length,
      videos_found: videoPosts.length,
      total_processed: ranked.length,
    });

  } catch (err: any) {
    console.error("scrape-hashtag error:", err);
    return json({ error: err.message }, 500);
  }
});
