import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VPS_SCRAPE_URL = "http://72.62.200.145:3099/scrape-profile";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

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
async function scrapeProfile(handle: string, limit: number): Promise<{ caption: string; views: number; likes: number }[]> {
  const username = parseUsername(handle);
  if (!username) return [];

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
    return [];
  }
  if (!res.ok) return [];

  const data = await res.json().catch(() => null);
  if (!data?.posts) return [];

  return (data.posts as any[]).slice(0, limit).map((p) => ({
    caption: String(p.title || p.caption || "").slice(0, 300),
    views: Number(p.views) || 0,
    likes: Number(p.likes) || 0,
  }));
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

    const { client_id } = await req.json() as { client_id: string };
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }

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
    const instagramHandle = String(od.instagram || "").trim();
    const emulationProfiles = parseProfiles(od.top3Profiles);

    if (!instagramHandle) {
      return new Response(JSON.stringify({ error: "No Instagram handle in onboarding data" }), { status: 400, headers: corsHeaders });
    }

    const [clientPosts, ...emulationPostArrays] = await Promise.all([
      scrapeProfile(instagramHandle, 20),
      ...emulationProfiles.map((handle) => scrapeProfile(handle, 10)),
    ]);

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

    const prompt = `You are analyzing a social media creator's content alignment.

CLIENT PROFILE:
- Industry: ${industry}
- Target audience: ${targetAudience}
- Unique offer: ${uniqueOffer}
- Instagram: @${instagramHandle}

CLIENT'S RECENT POSTS (last ${clientPosts.length}):
${clientPostsText}

EMULATION PROFILES (what they aspire to):
${emulationText || "None provided."}

Score the client on two dimensions. Be honest — a 5/10 is average, 3/10 is poor, 8/10 is genuinely strong.

1. AUDIENCE ALIGNMENT (0-10): Do the client's captions, topics, and framing clearly speak to "${targetAudience}"? Compare to the emulation profiles — are they reaching similar people with similar language and topics? Consider: specificity of language, problem awareness level, niche relevance.

2. CONTENT UNIQUENESS (0-10): Is the client's hook style, angle, and topic selection differentiated from the emulation profiles and from generic content in their niche? Or are they blending in? Consider: distinctive angles, specific stories, memorable hooks vs generic captions.

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "audience_score": <integer 0-10>,
  "uniqueness_score": <integer 0-10>,
  "summary": "<2-3 sentences explaining the scores in plain English. Be specific about what's working and what needs to change. No jargon.>",
  "audience_detail": "<1 sentence on audience alignment specifically>",
  "uniqueness_detail": "<1 sentence on uniqueness specifically>"
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
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return new Response(JSON.stringify({ error: "Claude error: " + err }), { status: 500, headers: corsHeaders });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let analysis: {
      audience_score: number;
      uniqueness_score: number;
      summary: string;
      audience_detail: string;
      uniqueness_detail: string;
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
    };

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
