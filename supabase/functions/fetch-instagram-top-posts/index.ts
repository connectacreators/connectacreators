import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VPS_SCRAPE_URL = "http://72.62.200.145:3099/scrape-profile";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function parseUsername(profileUrl: string): string {
  let u = profileUrl.trim();
  u = u.replace(/^https?:\/\/(www\.)?/, "");
  u = u.replace(/^instagram\.com\//, "");
  u = u.replace(/^@/, "");
  u = u.split(/[/?#]/)[0];
  return u.toLowerCase();
}

/** VPS returns "YYYY-MM-DD" — convert to full ISO string */
function parsePostedAt(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") {
    // Already ISO
    if (raw.includes("T")) return raw;
    // "YYYY-MM-DD" → midnight UTC
    const d = new Date(raw + "T00:00:00Z");
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof raw === "number") {
    const ms = raw < 1e10 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  return "";
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Vault save (fire-and-forget) ─────────────────────────────────────────── */

interface MappedPost {
  id: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  engagement: number;
  thumbnail: string | null;
  postedAt: string;
  url: string;
}

async function saveToVault(
  supabase: any,
  username: string,
  mapped: MappedPost[],
  avgViews: number
) {
  try {
    // Upsert channel row
    const { data: channelRow, error: channelErr } = await supabase
      .from("viral_channels")
      .upsert(
        {
          username,
          platform: "instagram",
          avg_views: Math.round(avgViews),
          video_count: mapped.length,
          scrape_status: "done",
          last_scraped_at: new Date().toISOString(),
        },
        { onConflict: "username,platform" }
      )
      .select("id")
      .single();

    if (channelErr || !channelRow?.id) {
      console.error("[fetch-instagram-top-posts] Failed to upsert channel:", channelErr?.message);
      return;
    }

    const channelId = channelRow.id;

    // Build video rows — skip items without an id
    const videoRows = mapped
      .filter((p) => p.id)
      .map((p) => ({
        channel_id: channelId,
        channel_username: username,
        platform: "instagram",
        video_url: p.url,
        thumbnail_url: p.thumbnail,
        caption: p.caption,
        views_count: p.views,
        likes_count: p.likes,
        comments_count: p.comments,
        engagement_rate: parseFloat(p.engagement.toFixed(2)),
        outlier_score: parseFloat(
          (avgViews > 0 ? (p.views / avgViews) * 10 : 1).toFixed(2)
        ),
        posted_at: p.postedAt || null,
        scraped_at: new Date().toISOString(),
        apify_video_id: p.id,
      }));

    if (videoRows.length === 0) return;

    const { error: videosErr } = await supabase
      .from("viral_videos")
      .upsert(videoRows, { onConflict: "platform,apify_video_id", ignoreDuplicates: false });

    if (videosErr) {
      console.error("[fetch-instagram-top-posts] Failed to upsert videos:", videosErr.message);
    } else {
      console.log(
        `[fetch-instagram-top-posts] Saved ${videoRows.length} videos to vault for @${username}`
      );
    }
  } catch (e: any) {
    // Non-fatal — vault save failure should not break the response
    console.error("[fetch-instagram-top-posts] saveToVault error:", e.message);
  }
}

/* ── Main handler ─────────────────────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileUrl, limit = 50 } = await req.json();

    if (!profileUrl) {
      return json({ error: "profileUrl is required" }, 400);
    }

    const username = parseUsername(profileUrl);
    if (!username) {
      return json({ error: "Could not parse username from URL" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Check vault first ─────────────────────────────────────────────────
    console.log(`[fetch-instagram-top-posts] Checking vault for @${username}`);

    const { data: channelRow } = await supabase
      .from("viral_channels")
      .select("id, avg_views")
      .eq("username", username)
      .eq("platform", "instagram")
      .eq("scrape_status", "done")
      .maybeSingle();

    if (channelRow?.id) {
      const { data: vaultVideos } = await supabase
        .from("viral_videos")
        .select(
          "video_url, caption, views_count, likes_count, comments_count, engagement_rate, outlier_score, posted_at, thumbnail_url"
        )
        .eq("channel_id", channelRow.id)
        .gt("views_count", 0)
        .order("views_count", { ascending: false })
        .limit(10);

      if (vaultVideos && vaultVideos.length > 0) {
        console.log(
          `[fetch-instagram-top-posts] Cache hit — returning ${vaultVideos.length} posts from vault for @${username}`
        );
        const posts = vaultVideos.map((v: any, i: number) => ({
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
        }));
        return json({ posts, username, fromVault: true });
      }
    }

    // ── 2. Cache miss — call VPS /scrape-profile ─────────────────────────────
    console.log(
      `[fetch-instagram-top-posts] Cache miss — fetching from VPS for @${username} (limit=${limit})`
    );

    const vpsRes = await fetch(VPS_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({
        platform: "instagram",
        username,
        limit,
      }),
    });

    if (!vpsRes.ok) {
      const errText = await vpsRes.text();
      throw new Error(
        `VPS /scrape-profile failed: ${vpsRes.status} ${errText.slice(0, 300)}`
      );
    }

    const vpsData = await vpsRes.json();
    const rawPosts: any[] = vpsData.posts ?? [];

    console.log(
      `[fetch-instagram-top-posts] Got ${rawPosts.length} posts from VPS for @${username}`
    );

    // ── 3. Transform VPS posts into our internal format ──────────────────────
    const mapped: MappedPost[] = rawPosts
      .map((p: any) => ({
        id: String(p.id ?? ""),
        caption: (p.title ?? "").slice(0, 600),
        views: Number(p.views) || 0,
        likes: Number(p.likes) || 0,
        comments: Number(p.comments) || 0,
        engagement: Number(p.engagement_rate) || 0,
        thumbnail: p.thumbnail ?? null,
        postedAt: parsePostedAt(p.posted_at),
        url: p.url ?? "",
      }))
      .filter((p: MappedPost) => p.id);

    if (mapped.length === 0) {
      return json({
        posts: [],
        username,
        fromVault: false,
        message: "No posts found for this profile",
      });
    }

    const avgViews =
      mapped.reduce((sum, p) => sum + p.views, 0) / mapped.length;

    // ── 4. Fire-and-forget vault save ────────────────────────────────────────
    saveToVault(supabase, username, mapped, avgViews);

    // ── 5. Sort by views, return top 10 ──────────────────────────────────────
    const sorted = [...mapped].sort((a, b) => b.views - a.views).slice(0, 10);

    const posts = sorted.map((p, i) => ({
      rank: i + 1,
      caption: p.caption,
      views: p.views,
      viewsFormatted: formatViews(p.views),
      likes: p.likes,
      comments: p.comments,
      engagement_rate: parseFloat(p.engagement.toFixed(2)),
      outlier_score: parseFloat(
        (p.views / (avgViews || 1) * 10).toFixed(1)
      ),
      posted_at: p.postedAt,
      url: p.url,
      thumbnail: p.thumbnail,
    }));

    return json({ posts, username, fromVault: false });
  } catch (e: any) {
    console.error("[fetch-instagram-top-posts] Error:", e);
    return json({ error: e.message || "Unknown error" }, 500);
  }
});
