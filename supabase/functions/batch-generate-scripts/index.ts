import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_COST_PER_SCRIPT = 25;

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  // Try junction table first (if it exists)
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id;

  // Fallback: direct clients.user_id lookup
  const { data: client } = await adminClient
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return client?.id ?? null;
}

const SCRIPT_SYSTEM_PROMPT = `<system_instructions>
<job>You are a world-class script writer for short-form social media videos.</job>
<goal>To create the highest quality content that goes viral every single time.</goal>
<style_guide>
- Write in a conversational, informal, and friendly tone.
- Use short, punchy sentences to create a fast-paced cadence.
- Use simple language that anyone can understand.
- Avoid jargon and technical terms.
- Avoid em dashes (—) and corporate buzzwords or jargon.
- Sound like human-written content. You must not sound like AI-generated content.
- Use a first-person tone, as if you are speaking to a friend.
- No fluff or wasted words. Be concise and to the point.
- For actor lines: output one sentence per line.
</style_guide>
</system_instructions>

You must categorize EVERY line into:
- line_type: "filming", "actor", or "editor"
- section: "hook", "body", or "cta"

Return virality_score as the average of 9 internal criteria (1-10): TAM, explosivity, emotional resonance, novelty, value tease, curiosity hook, absorption, rehook, stickiness.
For idea_ganadora: STRICT MAXIMUM 3-5 words.`;

function buildScriptPrompt(topic: string, language: string, format: string): string {
  const langLabel = language === "es" ? "SPANISH (Latin American)" : "ENGLISH";
  const formatMap: Record<string, string> = {
    talking_head: "TALKING HEAD — speak directly to camera, build personal trust, share insight",
    broll_caption: "B-ROLL CAPTION — words complement visuals, narrate scenes",
    entrevista: "ENTREVISTA — conversational Q&A energy",
    variado: "VARIADO — dynamic mixed: direct camera, b-roll, text moments",
  };
  const formatDesc = formatMap[format] || formatMap.talking_head;

  return `Write a compelling, viral short-form social media script (45 seconds / ~90-120 words) in ${langLabel}.

Topic: ${topic}
Format: ${formatDesc}

Create an attention-grabbing hook, engaging body with 2-3 key points, and a clear CTA.
Use conversational language, short punchy sentences, and high energy throughout.`;
}

function buildVideoScriptPrompt(
  video: { caption: string; platform: string; views_count: number; outlier_score: number; engagement_rate: number; owner_username: string },
  clientContext: string,
  language: string,
  format: string,
): string {
  const langLabel = language === "es" ? "SPANISH (Latin American)" : "ENGLISH";
  const formatMap: Record<string, string> = {
    talking_head: "TALKING HEAD — speak directly to camera, build personal trust, share insight",
    broll_caption: "B-ROLL CAPTION — words complement visuals, narrate scenes",
    entrevista: "ENTREVISTA — conversational Q&A energy",
    variado: "VARIADO — dynamic mixed: direct camera, b-roll, text moments",
  };
  const formatDesc = formatMap[format] || formatMap.talking_head;

  return `You are creating a short-form video script inspired by this viral video.

VIRAL VIDEO CONTEXT:
- Caption: ${video.caption || "No caption"}
- Platform: ${video.platform}
- Views: ${video.views_count} | Outlier: ${video.outlier_score}x | Engagement: ${video.engagement_rate}%
- Account: @${video.owner_username}

CLIENT CONTEXT:
${clientContext || "No specific client context available."}

Write a compelling, viral short-form social media script (45 seconds / ~90-120 words) in ${langLabel}.
Format: ${formatDesc}

Create a script that replicates the style, structure, and hook pattern of this viral video but adapted for the client's brand, niche, and audience. Include: HOOK, SHIFT, BODY, CTA sections.`;
}

async function extractCanvasContext(adminClient: any, clientId: string): Promise<string> {
  const { data } = await adminClient
    .from("canvas_states")
    .select("nodes")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.nodes || !Array.isArray(data.nodes)) return "";

  const textContent: string[] = [];
  for (const node of data.nodes) {
    if (node.type === "textNoteNode" || node.type === "researchNoteNode") {
      const text = node.data?.noteText || node.data?.text || "";
      if (text.trim()) textContent.push(text.trim());
    }
    if (node.type === "brandGuideNode") {
      const brand = node.data?.brandText || node.data?.text || "";
      if (brand.trim()) textContent.push(`BRAND: ${brand.trim()}`);
    }
  }

  return textContent.join("\n\n").slice(0, 4000);
}

const RETURN_SCRIPT_TOOL = {
  name: "return_script",
  description: "Return the complete categorized script",
  input_schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            line_type: { type: "string", enum: ["filming", "actor", "editor"] },
            section: { type: "string", enum: ["hook", "body", "cta"] },
            text: { type: "string" },
          },
          required: ["line_type", "section", "text"],
        },
      },
      idea_ganadora: { type: "string", description: "Ultra-short punchy title — STRICT MAXIMUM 3-5 words" },
      target: { type: "string", description: "Target audience" },
      formato: { type: "string", enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"] },
      virality_score: { type: "number" },
    },
    required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
  },
};

async function deductCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  if (cost === 0) return null;

  // Admin bypass
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = roleData?.role;
  // Skip credit deduction for admin, videographers, and editors
  if (role === "admin" || role === "videographer" || role === "editor") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return null;
  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("id", primaryClientId)
    .single();

  if (fetchErr || !client) return null; // staff/no-record accounts pass through

  if ((client.credits_balance ?? 0) < cost) {
    return JSON.stringify({
      error: `Insufficient credits. You need ${cost} credits but only have ${client.credits_balance ?? 0}.`,
      insufficient_credits: true,
      balance: client.credits_balance ?? 0,
      needed: cost,
    });
  }

  const { error: updateErr } = await adminClient
    .from("clients")
    .update({
      credits_balance: (client.credits_balance ?? 0) - cost,
      credits_used: (client.credits_used ?? 0) + cost,
    })
    .eq("id", primaryClientId);

  if (updateErr) {
    console.error("Credit update error:", updateErr);
    return null; // Don't block on credit tracking errors
  }

  await adminClient.from("credit_transactions").insert({
    client_id: client.id,
    action,
    cost,
    metadata: {},
  });

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { topics, videos, language = "en", format = "talking_head", clientId } = body;

    // Determine mode: videos[] (new) or topics[] (legacy)
    const isVideoMode = Array.isArray(videos) && videos.length > 0;

    if (!isVideoMode && (!topics || !Array.isArray(topics) || topics.length === 0)) {
      return new Response(JSON.stringify({ error: "topics or videos array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemCount = isVideoMode ? videos.length : topics.length;
    if (itemCount > 10) {
      return new Response(JSON.stringify({ error: "Maximum 10 items per batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits
    const totalCost = itemCount * BATCH_COST_PER_SCRIPT;
    if (totalCost > 0) {
      const creditErr = await deductCredits(adminClient, user.id, "batch_generate", totalCost);
      if (creditErr) {
        return new Response(creditErr, {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Extract canvas context for video mode
    let clientContext = "";
    if (isVideoMode && clientId) {
      clientContext = await extractCanvasContext(adminClient, clientId);
    }

    // Build batch requests
    const requests = isVideoMode
      ? videos.map((video: any, i: number) => ({
          custom_id: `vscript-${clientId || "unknown"}-${i}-${Date.now()}`,
          params: {
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            system: SCRIPT_SYSTEM_PROMPT,
            tools: [RETURN_SCRIPT_TOOL],
            tool_choice: { type: "tool", name: "return_script" },
            messages: [{ role: "user", content: buildVideoScriptPrompt(video, clientContext, language, format) }],
          },
        }))
      : topics.map((topic: string, i: number) => ({
          custom_id: `script-${clientId || "unknown"}-${i}-${Date.now()}`,
          params: {
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            system: SCRIPT_SYSTEM_PROMPT,
            tools: [RETURN_SCRIPT_TOOL],
            tool_choice: { type: "tool", name: "return_script" },
            messages: [{ role: "user", content: buildScriptPrompt(topic, language, format) }],
          },
        }));

    // Submit batch
    const batchRes = await fetch("https://api.anthropic.com/v1/messages/batches", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (!batchRes.ok) {
      const err = await batchRes.text();
      throw new Error(`Anthropic Batches API error ${batchRes.status}: ${err}`);
    }

    const batch = await batchRes.json();

    // Build map for correlation: custom_id → video/topic data
    const videoMap: Record<string, any> = {};
    if (isVideoMode) {
      requests.forEach((r: any, i: number) => {
        videoMap[r.custom_id] = videos[i];
      });
    } else {
      requests.forEach((r: any, i: number) => {
        videoMap[r.custom_id] = topics[i];
      });
    }

    return new Response(
      JSON.stringify({
        batchId: batch.id,
        status: batch.processing_status,
        videoMap,
        topicMap: isVideoMode ? undefined : videoMap, // backwards compat
        requestCounts: batch.request_counts,
        isVideoMode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("batch-generate-scripts error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
