import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_COST_PER_SCRIPT = 50;

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
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
  if (roleData?.role === "admin" || roleData?.role === "videographer") return null;

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
    const { topics, language = "en", format = "talking_head", clientId } = await req.json();

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return new Response(JSON.stringify({ error: "topics array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (topics.length > 10) {
      return new Response(JSON.stringify({ error: "Maximum 10 topics per batch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits before submitting to Anthropic
    const totalCost = topics.length * BATCH_COST_PER_SCRIPT;
    if (totalCost > 0) {
      const creditErr = await deductCredits(adminClient, user.id, "batch_generate", totalCost);
      if (creditErr) {
        return new Response(creditErr, {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const requests = topics.map((topic: string, i: number) => ({
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

    // Return batch ID and topic map so poll function can correlate results
    const topicMap: Record<string, string> = {};
    requests.forEach((r: any, i: number) => { topicMap[r.custom_id] = topics[i]; });

    return new Response(
      JSON.stringify({
        batchId: batch.id,
        status: batch.processing_status,
        topicMap,
        requestCounts: batch.request_counts,
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
