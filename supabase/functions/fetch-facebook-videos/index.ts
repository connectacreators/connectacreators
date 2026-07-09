// fetch-facebook-videos
// Reads a client's Facebook PAGE videos + view counts via the official Graph
// API, using the page access token stored (encrypted) in social_connections by
// the scheduler's facebook-oauth flow. This is READ-ONLY (pages_read_engagement)
// — the sanctioned path, not scraping. No fake accounts, no flagging risk.
//
// Body: { client_id: string, limit?: number, persist?: boolean }
// - persist=true upserts into viral_channels/viral_videos (platform=facebook)
//   so Facebook shows up on the Strategy Performance tab like the other nets.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { decryptToken } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v19.0";

interface FbVideo {
  id: string;
  title?: string;
  description?: string;
  created_time?: string;
  permalink_url?: string;
  picture?: string;
  views?: number;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { client_id, limit = 24, persist = false, reels_only = false } = await req.json() as {
      client_id: string; limit?: number; persist?: boolean; reels_only?: boolean;
    };
    if (!client_id) return json({ error: "client_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find the client's active Facebook page connection.
    const { data: conn } = await admin
      .from("social_connections")
      .select("id, account_label, platform_account_id, access_token_enc, scopes, status")
      .eq("client_id", client_id)
      .eq("platform", "facebook")
      .eq("status", "active")
      .maybeSingle();

    if (!conn) {
      return json({
        error: "no_connection",
        message: "This client hasn't connected a Facebook page yet. Connect it via the scheduler's Facebook button to enable Facebook analytics.",
      }, 404);
    }
    if (!(conn.scopes ?? []).includes("pages_read_engagement")) {
      return json({
        error: "missing_scope",
        message: "The Facebook connection lacks pages_read_engagement — reconnect the page to grant analytics access.",
      }, 403);
    }

    const pageId = conn.platform_account_id;
    const token = await decryptToken(conn.access_token_enc);

    // Page videos with lifetime views + engagement summaries.
    const fields = [
      "id", "title", "description", "created_time", "permalink_url",
      "picture", "views",
      "likes.summary(true)", "comments.summary(true)",
    ].join(",");
    const fetchEdge = async (edge: string) => {
      const u = `${GRAPH}/${pageId}/${edge}?fields=${encodeURIComponent(fields)}&limit=${Math.min(50, limit)}&access_token=${encodeURIComponent(token)}`;
      const r = await fetch(u);
      const b = await r.json().catch(() => null);
      return { ok: r.ok && b && !b.error, status: r.status, body: b as { data?: FbVideo[]; error?: { message?: string } } | null };
    };

    // reels_only → the dedicated /video_reels edge; fall back to /videos
    // (filtered to reel permalinks) if the reels edge rejects a field.
    let result = reels_only ? await fetchEdge("video_reels") : await fetchEdge("videos");
    let usedFallback = false;
    if (reels_only && !result.ok) { result = await fetchEdge("videos"); usedFallback = true; }
    if (!result.ok) {
      return json({
        error: "graph_error",
        status: result.status,
        detail: result.body?.error?.message ?? "unknown",
      }, 502);
    }

    let raw = (result.body?.data ?? []) as FbVideo[];
    if (reels_only && usedFallback) {
      raw = raw.filter((v) => /\/reel\//.test(v.permalink_url || ""));
    }
    // Page follower count (best-effort).
    let followers: number | null = null;
    try {
      const pr = await fetch(`${GRAPH}/${pageId}?fields=followers_count,fan_count,name,picture&access_token=${encodeURIComponent(token)}`);
      const pj = await pr.json();
      followers = pj.followers_count ?? pj.fan_count ?? null;
    } catch { /* ignore */ }

    const posts = raw.map((v) => ({
      id: v.id,
      caption: (v.title || v.description || "").slice(0, 600),
      views: Number(v.views) || 0,
      likes: v.likes?.summary?.total_count ?? 0,
      comments: v.comments?.summary?.total_count ?? 0,
      thumbnail: v.picture ?? null,
      posted_at: v.created_time ? v.created_time.slice(0, 10) : null,
      url: v.permalink_url ? (v.permalink_url.startsWith("http") ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : `https://www.facebook.com/${v.id}`,
    }));

    await admin.from("social_connections").update({ last_used_at: new Date().toISOString() }).eq("id", conn.id);

    let persisted = 0;
    if (persist && posts.length > 0) {
      const username = String(conn.account_label || pageId).replace(/^@/, "");
      const viewsList = posts.map((p) => p.views).sort((a, b) => a - b);
      const median = viewsList[Math.floor(viewsList.length / 2)] || 1;
      // viral_channels has no unique index on (platform,username) — select-or-insert
      // like the other scrape flows rather than upsert-on-conflict.
      const chanFields = {
        display_name: conn.account_label || username,
        follower_count: followers,
        video_count: posts.length,
        avg_views: Math.round(posts.reduce((s, p) => s + p.views, 0) / posts.length),
        last_scraped_at: new Date().toISOString(),
        scrape_status: "done",
        scrape_error: null,
      };
      const { data: existingCh } = await admin
        .from("viral_channels")
        .select("id")
        .eq("platform", "facebook")
        .eq("username", username)
        .maybeSingle();
      let channel = existingCh;
      if (channel?.id) {
        await admin.from("viral_channels").update(chanFields).eq("id", channel.id);
      } else {
        const { data: created } = await admin
          .from("viral_channels")
          .insert({ platform: "facebook", username, ...chanFields })
          .select("id")
          .maybeSingle();
        channel = created;
      }
      if (channel?.id) {
        const { error } = await admin.from("viral_videos").upsert(
          posts.map((p) => ({
            channel_id: channel.id,
            channel_username: username,
            platform: "facebook",
            video_url: p.url,
            thumbnail_url: p.thumbnail,
            caption: p.caption,
            views_count: p.views,
            likes_count: p.likes,
            comments_count: p.comments,
            engagement_rate: p.views > 0 ? Number(((p.likes + p.comments) / p.views * 100).toFixed(2)) : 0,
            outlier_score: median > 0 ? Number((p.views / median).toFixed(2)) : 1,
            apify_video_id: p.id,
            posted_at: p.posted_at,
            scraped_at: new Date().toISOString(),
          })),
          { onConflict: "platform,apify_video_id", ignoreDuplicates: false },
        );
        if (!error) persisted = posts.length;
      }
    }

    return json({
      success: true,
      page_id: pageId,
      account: conn.account_label,
      followers,
      count: posts.length,
      persisted,
      posts,
    });
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
