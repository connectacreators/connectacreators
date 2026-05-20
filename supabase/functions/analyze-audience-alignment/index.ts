import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { parseExtendedAnalysis } from "../_shared/profile-analysis-parser.ts";
import type { ExtendedAnalysisPayload } from "../_shared/profile-analysis-types.ts";
import { logAnthropicUsage } from "../_shared/log-anthropic-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VPS_SCRAPE_URL = "http://72.62.200.145:3099/scrape-profile";
const VPS_PROXY_URL = "http://72.62.200.145:3099/proxy-image";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

async function proxyImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(`${VPS_PROXY_URL}?url=${encodeURIComponent(url)}`, {
      headers: { "x-api-key": VPS_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

// Extract bare username from a handle or URL
function parseUsername(raw: string): string {
  const s = raw.trim().replace(/^@/, "").replace(/\/$/, "");
  // Handle full URLs like https://www.instagram.com/username/
  const match = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (match) return match[1].toLowerCase();
  // Handle tiktok.com/@username
  const ttMatch = s.match(/tiktok\.com\/@?([^/?#\s]+)/i);
  if (ttMatch) return ttMatch[1].toLowerCase();
  // Bare handle
  return s.split(/[/?#]/)[0].toLowerCase();
}

// VPS expects POST with JSON body { platform, username, limit }
interface ScrapedPost {
  id: string;
  caption: string;
  views: number;
  likes: number;
  thumbnail: string | null;
  /** The reel/post URL on the source platform — used as the playback source
   *  via the stream-reel proxy so the FE can play the video inline. */
  video_url: string | null;
}
interface ScrapeResult {
  posts: ScrapedPost[];
  profilePicUrl: string | null;
  followers: number | null;
}
async function scrapeProfile(handle: string, limit: number): Promise<ScrapeResult> {
  const empty: ScrapeResult = { posts: [], profilePicUrl: null, followers: null };
  const username = parseUsername(handle);
  if (!username) return empty;

  let res: Response;
  try {
    res = await fetch(VPS_SCRAPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY,
      },
      body: JSON.stringify({ platform: "instagram", username, limit }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return empty;
  }
  if (!res.ok) return empty;

  const data = await res.json().catch(() => null);
  if (!data?.posts) return empty;

  return {
    posts: (data.posts as any[]).slice(0, limit).map((p, i) => ({
      id: String(p.id || `post-${i}`),
      caption: String(p.title || p.caption || "").slice(0, 300),
      views: Number(p.views) || 0,
      likes: Number(p.likes) || 0,
      thumbnail: p.thumbnail || null,
      video_url: (typeof p.url === "string" && p.url.length > 0) ? p.url : null,
    })),
    profilePicUrl: data.profilePicUrl || null,
    followers: data.followers ? Number(data.followers) : null,
  };
}

function parseProfiles(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return (raw as string[]).filter(Boolean).slice(0, 3);
  return String(raw).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const {
      client_id,
      language,
      extended_dimensions = false,
      include_competitors = true,
      target_handle,
      is_competitor_view = false,
    } = await req.json() as {
      client_id: string;
      language?: string;
      extended_dimensions?: boolean;
      include_competitors?: boolean;
      target_handle?: string;
      is_competitor_view?: boolean;
    };
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }
    const lang = language === "es" ? "es" : "en";

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: client } = await adminClient
      .from("clients")
      .select("id, name, onboarding_data")
      .eq("id", client_id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
    }

    const od = client.onboarding_data || {};
    const onboardingHandle = String(od.instagram || "").trim();
    const emulationProfiles = parseProfiles(od.top3Profiles);

    // Use the explicit target_handle if provided; otherwise fall back to the
    // client's own onboarded handle. This is what lets analyze_my_profile
    // run on a competitor's profile without overwriting the client record.
    const instagramHandle = (target_handle && target_handle.trim()) || onboardingHandle;

    if (!instagramHandle) {
      return new Response(JSON.stringify({ error: "No Instagram handle provided and onboarding has none" }), { status: 400, headers: corsHeaders });
    }

    // Competitor view = the scrape target isn't the client's own profile.
    // Detected either explicitly (is_competitor_view from the tool) or by
    // mismatch between the scrape target and onboarding.
    const isCompetitor = is_competitor_view || (
      onboardingHandle.length > 0 &&
      instagramHandle.toLowerCase() !== onboardingHandle.toLowerCase()
    );

    const competitorsRequested = include_competitors && emulationProfiles.length > 0;
    const [clientResult, ...emulationResults] = await Promise.all([
      scrapeProfile(instagramHandle, 10),
      ...(competitorsRequested
        ? emulationProfiles.map((handle) => scrapeProfile(handle, 10))
        : []),
    ]);

    const clientPosts = clientResult.posts;
    const followers = clientResult.followers;
    // Proxy the profile pic through VPS and store as base64 so it's browser-safe
    const profilePicUrl = clientResult.profilePicUrl
      ? await proxyImageAsBase64(clientResult.profilePicUrl)
      : null;
    const emulationPostArrays = emulationResults.map(r => r.posts);
    const totalEmulationPosts = emulationPostArrays.reduce((sum, arr) => sum + arr.length, 0);

    const clientPostsText = clientPosts.length > 0
      ? clientPosts.map((p, i) =>
          `Post ${i + 1}: "${p.caption}" — ${p.views.toLocaleString()} views, ${p.likes.toLocaleString()} likes`
        ).join("\n")
      : "No posts found.";

    const emulationText = emulationProfiles.map((profile, i) => {
      const posts = emulationPostArrays[i] || [];
      if (posts.length === 0) return `${profile}: No posts found.`;
      const postsStr = posts.map((p, j) =>
        `  Post ${j + 1}: "${p.caption}" — ${p.views.toLocaleString()} views`
      ).join("\n");
      return `${profile}:\n${postsStr}`;
    }).join("\n\n");

    const targetAudience = od.targetClient || "not specified";
    const industry = od.industry || "not specified";
    const uniqueOffer = od.uniqueOffer || "not specified";

    const noEmulationProfiles = emulationProfiles.length === 0;

    const langInstruction = lang === "es"
      ? "Respond entirely in Spanish. All text in the JSON values must be in Spanish."
      : "Respond entirely in English.";

    const prompt = `You are analyzing a social media creator's most recent content to assess how well it serves their target audience. ${langInstruction}

CLIENT PROFILE:
- Industry: ${industry}
- Target audience: ${targetAudience}
- Unique offer: ${uniqueOffer}
- Instagram: @${instagramHandle}

MOST RECENT POSTS (last ${clientPosts.length} — ordered newest first):
${clientPostsText}

EMULATION PROFILES (accounts they want to model):
${noEmulationProfiles ? "None provided — score based on stated target audience and industry benchmarks only." : emulationText}

Score the client on two dimensions. Be honest — a 5/10 is average, 3/10 is poor, 8/10 is genuinely strong. Focus on the most recent posts as the truest signal of current strategy.

1. AUDIENCE ALIGNMENT (0-10): Do the captions, topics, and framing of these recent posts clearly speak to "${targetAudience}"? Are they addressing that audience's specific problems, language, and awareness level? ${noEmulationProfiles ? "Score against industry benchmarks since no emulation profiles were provided." : "Compare to the emulation profiles — are they reaching similar people with similar language?"}

2. CONTENT UNIQUENESS (0-10): Does the hook style, angle, and topic selection stand out in this niche, or does it blend into generic content? Consider: distinctive personal stories, specific client results, memorable hooks vs templated captions.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "audience_score": <integer 0-10>,
  "uniqueness_score": <integer 0-10>,
  "summary": "<2-3 sentences on what these recent posts show about audience alignment and uniqueness. Be specific — name the patterns you see. No jargon.>${noEmulationProfiles ? " End with exactly this sentence: 'Add competitor or reference accounts in your onboarding profile to get a more precise benchmark for these scores.'" : ""}",
  "audience_detail": "<1 sentence on audience alignment — what specifically is or isn't connecting with ${targetAudience}>",
  "uniqueness_detail": "<1 sentence on what makes the content blend in or stand out>"${extended_dimensions ? `,
  "hook_patterns": [
    { "pattern": "<short slug like 'question-led', 'story-led', 'number-led', 'controversy'>", "frequency": <0..1>, "example": "<<=80 char caption fragment>" }
  ],
  "format_mix": { "reel": <0..1>, "carousel": <0..1>, "static": <0..1>, "video": <0..1> },
  "cadence": { "posts_per_week": <number>, "last_post_at": "<ISO date of most recent post in this sample>" },
  "outlier_band": { "median": <median views across the sample>, "top": <max views in sample>, "top_post_id": "<id of top post>" },
  "top_posts": [
    { "id": "<post id>", "thumbnail": "<thumbnail url if available else null>", "views": <number>, "outlier_ratio": <views / median>, "hook": "<<=100 char caption opening line>" }
  ]${competitorsRequested ? `,
  "comparison": {
    "cadence_delta_pct": <signed percent: client's posts/wk minus avg competitor posts/wk, expressed as percent of competitor avg. Negative = client posts less.>,
    "format_mix_delta": { "reel": <signed delta vs competitor avg>, "carousel": <signed delta>, ... },
    "common_winning_hooks": ["<hook patterns that appear in top competitor posts>"],
    "where_youre_winning": "<1 short sentence>",
    "where_theyre_winning": "<1 short sentence>"
  }` : ""}` : ""}
}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: extended_dimensions ? 2048 : 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return new Response(JSON.stringify({ error: "Claude error: " + err }), { status: 500, headers: corsHeaders });
    }

    const claudeData = await claudeRes.json();
    if (claudeData?.usage) logAnthropicUsage(adminClient, {
      functionName: "analyze-audience-alignment", model: "claude-haiku-4-5-20251001",
      usage: claudeData.usage, userId: user?.id ?? null,
      metadata: { extended_dimensions: !!extended_dimensions },
    });
    const rawText = claudeData.content?.[0]?.text || "{}";

    let analysis: {
      audience_score: number;
      uniqueness_score: number;
      summary: string;
      audience_detail: string;
      uniqueness_detail: string;
      // Extended fields — optional; parsed defensively by parseExtendedAnalysis.
      hook_patterns?: unknown;
      format_mix?: unknown;
      cadence?: unknown;
      outlier_band?: unknown;
      top_posts?: unknown;
      comparison?: unknown;
    };

    try {
      analysis = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(JSON.stringify({ error: "Failed to parse Claude response", raw: rawText }), { status: 500, headers: corsHeaders });
      }
      analysis = JSON.parse(match[0]);
    }

    const audienceScore = Math.max(0, Math.min(10, Math.round(analysis.audience_score)));
    const uniquenessScore = Math.max(0, Math.min(10, Math.round(analysis.uniqueness_score)));

    const extended: ExtendedAnalysisPayload | null = extended_dimensions
      ? parseExtendedAnalysis(analysis as unknown)
      : null;

    // Override Claude's top_posts + outlier_band with real scrape data. Claude
    // doesn't see post IDs or thumbnail URLs in the prompt (we only feed it
    // captions+views+likes), so its top_posts entries would have null
    // thumbnails. Replace with the actual top-3-by-views from scrape data.
    if (extended && clientResult.posts.length > 0) {
      const sorted = clientResult.posts.slice().sort((a, b) => b.views - a.views);
      const viewsList = clientResult.posts.map((p) => p.views).sort((a, b) => a - b);
      const median = viewsList.length > 0
        ? viewsList[Math.floor(viewsList.length / 2)] || 1
        : 1;
      extended.top_posts = sorted.slice(0, 3).map((p) => ({
        id: p.id,
        thumbnail: p.thumbnail,
        views: p.views,
        outlier_ratio: median > 0 ? Number((p.views / median).toFixed(1)) : 0,
        hook: p.caption.slice(0, 100),
        video_url: p.video_url,
      }));
      extended.outlier_band = {
        median,
        top: sorted[0]?.views ?? 0,
        top_post_id: sorted[0]?.id ?? null,
      };
    }

    const analysisPayload = {
      audience_score: audienceScore,
      uniqueness_score: uniquenessScore,
      summary: analysis.summary || "",
      audience_detail: analysis.audience_detail || "",
      uniqueness_detail: analysis.uniqueness_detail || "",
      client_posts_analyzed: clientPosts.length,
      emulation_posts_analyzed: totalEmulationPosts,
      emulation_profiles: emulationProfiles,
      analyzed_at: new Date().toISOString(),
      language: lang,
      profilePicUrl: profilePicUrl || null,
      followers: followers || null,
      ...(extended ? extended : {}),
      handle: instagramHandle,
      platform: "instagram" as const,
    };

    // Only overwrite the client's own analysis when this scrape IS the
    // client's profile. Competitor scrapes still flow to viral_channels +
    // viral_videos below, but they don't replace the client record.
    if (!isCompetitor) {
      await adminClient.from("client_strategies").upsert(
        {
          client_id,
          audience_score: audienceScore,
          uniqueness_score: uniquenessScore,
          audience_analysis: analysisPayload,
          audience_analyzed_at: new Date().toISOString(),
        },
        { onConflict: "client_id" }
      );
    }

    // Mirror the client's scrape into viral_channels + viral_videos so
    // (a) any future analyze_my_profile call for this handle can pull
    // the posts from DB instead of re-scraping, and (b) the profile
    // shows up in /viral-today's reference corpus for find_viral_videos.
    // Best-effort: errors here must NOT fail the analysis response.
    try {
      const { data: channelRow } = await adminClient
        .from("viral_channels")
        .upsert({
          platform: "instagram",
          username: instagramHandle.toLowerCase(),
          display_name: instagramHandle,
          avatar_url: profilePicUrl || null,
          follower_count: followers || null,
          video_count: clientResult.posts.length,
          avg_views: clientResult.posts.length > 0
            ? Math.round(clientResult.posts.reduce((s, p) => s + p.views, 0) / clientResult.posts.length)
            : 0,
          last_scraped_at: new Date().toISOString(),
          scrape_status: "done",
          created_by: user.id,
        }, { onConflict: "platform,username" })
        .select("id")
        .maybeSingle();
      const channelId = channelRow?.id;
      if (channelId && clientResult.posts.length > 0) {
        const medianViews = (() => {
          const arr = clientResult.posts.map((p) => p.views).sort((a, b) => a - b);
          return arr[Math.floor(arr.length / 2)] || 1;
        })();
        await adminClient.from("viral_videos").upsert(
          clientResult.posts.map((p) => ({
            channel_id: channelId,
            channel_username: instagramHandle.toLowerCase(),
            platform: "instagram",
            video_url: p.video_url,
            thumbnail_url: p.thumbnail,
            caption: p.caption,
            views_count: p.views,
            likes_count: p.likes,
            outlier_score: medianViews > 0 ? Number((p.views / medianViews).toFixed(2)) : 1,
            apify_video_id: p.id,
            scraped_at: new Date().toISOString(),
          })),
          { onConflict: "platform,apify_video_id", ignoreDuplicates: false },
        );
      }
    } catch (err) {
      console.warn("[analyze-audience-alignment] viral_today mirror failed (non-fatal):", err);
    }

    return new Response(JSON.stringify({ success: true, analysis: analysisPayload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
