// Admin-only: add a video as a "Top Framework" by URL.
// - Canonicalizes the URL via the shared helper so (platform, apify_video_id) dedup
//   works against everything else in viral_videos.
// - If the row already exists, marks it as featured + runs analysis if missing.
// - If it doesn't exist, fetches metadata from the VPS, inserts the row, then runs
//   the same full analysis pipeline the cron and user-trigger endpoints use.
// - No credit deduction (admin context, like analyze-viral-video cron).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";
import { runFullAnalysis, type ViralVideoRow, AnalyzerError } from "../_shared/viral-video-analyzer.ts";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth: admin only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // ─── Step 1: Canonicalize ───
  const canonical = canonicalizeVideoUrl(url);
  if (!canonical) {
    return json({ error: "Unsupported URL format" }, 400);
  }
  const { platform, postId, normalizedUrl } = canonical;

  // ─── Step 2: Look for existing row ───
  const { data: existing } = await adminClient
    .from("viral_videos")
    .select("*")
    .eq("platform", platform)
    .eq("apify_video_id", postId)
    .maybeSingle();

  if (existing) {
    // Already in DB. Mark as featured framework if not already.
    const updates: Record<string, unknown> = {};
    if (!existing.is_featured_framework) updates.is_featured_framework = true;
    if (Object.keys(updates).length > 0) {
      await adminClient.from("viral_videos").update(updates).eq("id", existing.id);
    }

    // If already fully analyzed, return cached.
    const alreadyAnalyzed = existing.analysis_status === "analyzed"
      && existing.transcript
      && existing.framework_meta;
    if (alreadyAnalyzed) {
      return json({
        id: existing.id,
        channel_username: existing.channel_username,
        platform,
        status: "already_analyzed",
        cached: true,
      });
    }

    // Row exists but missing analysis — run it now.
    try {
      const patch = await runFullAnalysis(
        adminClient as never,
        existing as ViralVideoRow,
        existing.caption ?? null,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );
      await adminClient
        .from("viral_videos")
        .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
        .eq("id", existing.id);
      return json({
        id: existing.id,
        channel_username: existing.channel_username,
        platform,
        status: "analyzed_existing",
      });
    } catch (err) {
      const code = err instanceof AnalyzerError ? err.code : "unknown_error";
      const message = err instanceof Error ? err.message : String(err);
      await adminClient.from("viral_videos")
        .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
        .eq("id", existing.id);
      return json({
        id: existing.id,
        channel_username: existing.channel_username,
        platform,
        status: "analysis_failed",
        error: message,
      }, 500);
    }
  }

  // ─── Step 3: Not in DB — fetch metadata from VPS ───
  let vpsData: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${VPS_SERVER}/scrape-single-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ url: normalizedUrl }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) vpsData = await res.json();
  } catch (e) {
    console.warn("[scrape-framework-url] VPS fetch failed:", (e as Error).message);
  }

  // Derive channel_username from URL if VPS didn't provide one.
  // IG: prefer URLs that actually embed the username (e.g. /username/reel/SHORTCODE/).
  // Reject the `/reel/SHORTCODE/` shape — that has no username, and the previous
  // regex was incorrectly capturing the shortcode itself (e.g. "DSTGcg9DkLW").
  const usernameMatch =
    url.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/(?:reels?|p)\//i)
    ?? url.match(/tiktok\.com\/@?([a-zA-Z0-9_.]+)/i)
    ?? url.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/i);
  const channelUsername = String(
    (vpsData?.owner_username as string | undefined)
    ?? usernameMatch?.[1]
    ?? "unknown"
  ).replace(/^@/, "");

  const caption = String(vpsData?.title ?? vpsData?.caption ?? "").slice(0, 600);
  const views = Number(vpsData?.views) || 0;
  const likes = Number(vpsData?.likes) || 0;
  const comments = Number(vpsData?.comments) || 0;
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  const outlier = Number(vpsData?.outlier_score) || 5; // default high — admin curated

  let postedAt: string | null = null;
  if (vpsData?.posted_at) {
    const raw = vpsData.posted_at;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!isNaN(num) && num > 0) {
      postedAt = new Date(num < 2e10 ? num * 1000 : num).toISOString();
    }
  }
  if (!postedAt) postedAt = new Date().toISOString();

  const nicheTagsFromCaption = extractNicheTags(caption);
  const frameworkScore = computeFrameworkScore(outlier, engagementRate, postedAt);

  // Cache the thumbnail if VPS returned a CDN URL.
  let thumbnailUrl: string | null = (vpsData?.thumbnail as string | undefined) ?? null;
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

  // ─── Step 4: Insert the row (pending analysis) ───
  const { data: inserted, error: insertErr } = await adminClient
    .from("viral_videos")
    .insert({
      channel_id: null,
      channel_username: channelUsername,
      platform,
      video_url: normalizedUrl,
      apify_video_id: postId,
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
      niche_tags: nicheTagsFromCaption,
      framework_score: frameworkScore,
      analysis_status: "pending",
      user_submitted: true,
      submitted_by: user.id,
    })
    .select("*")
    .single();

  if (insertErr || !inserted) {
    // 23505 race — another resolver inserted first.
    if (insertErr?.code === "23505") {
      const { data: winner } = await adminClient
        .from("viral_videos")
        .select("*")
        .eq("platform", platform)
        .eq("apify_video_id", postId)
        .single();
      if (winner) {
        await adminClient
          .from("viral_videos")
          .update({ is_featured_framework: true })
          .eq("id", winner.id);
        return json({
          id: winner.id,
          channel_username: winner.channel_username,
          platform,
          status: "raced_existing",
        });
      }
    }
    return json({ error: insertErr?.message ?? "Insert failed" }, 500);
  }

  // ─── Step 5: Run full analysis on the newly-inserted row ───
  try {
    const patch = await runFullAnalysis(
      adminClient as never,
      inserted as ViralVideoRow,
      caption,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );
    await adminClient
      .from("viral_videos")
      .update({ ...patch, analysis_status: "analyzed", analysis_error: null })
      .eq("id", inserted.id);
    return json({
      id: inserted.id,
      channel_username: channelUsername,
      platform,
      status: "analyzed",
    });
  } catch (err) {
    const code = err instanceof AnalyzerError ? err.code : "unknown_error";
    const message = err instanceof Error ? err.message : String(err);
    await adminClient.from("viral_videos")
      .update({ analysis_status: "failed", analysis_error: `${code}: ${message}` })
      .eq("id", inserted.id);
    return json({
      id: inserted.id,
      channel_username: channelUsername,
      platform,
      status: "analysis_failed",
      error: message,
    }, 500);
  }
});
