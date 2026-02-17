import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callClaude(apiKey: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any) {
  const body: any = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const status = res.status;
    const text = await res.text();
    console.error("Claude error:", status, text);
    if (status === 429) throw { status: 429, message: "Rate limit exceeded. Try again shortly." };
    if (status === 402) throw { status: 402, message: "Payment required on Anthropic account." };
    throw new Error(`Claude API error: ${status}`);
  }

  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { step } = body;

    // ==================== STEP: RESEARCH ====================
    if (step === "research") {
      const { topic } = body;
      if (!topic) throw new Error("topic is required");

      const systemPrompt = `You are a world-class content researcher specializing in viral social media content. Your job is to find the most shocking, surprising, and impactful facts about any given topic. These facts should make people stop scrolling and say "wait, WHAT?!"

Rules:
- Find 8-10 facts ranked from impact score 8 to 10 (10 being most mind-blowing)
- Facts must be TRUE and verifiable
- Focus on counterintuitive, surprising, little-known facts
- Each fact should be concise (1-2 sentences max)
- Think about what would make great hook material for short-form video`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Research the most shocking and impactful facts about: "${topic}"`,
        [{
          name: "return_research",
          description: "Return the researched facts as structured data",
          input_schema: {
            type: "object",
            properties: {
              facts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    fact: { type: "string", description: "The shocking fact" },
                    impact_score: { type: "number", description: "Impact score from 8 to 10" },
                    why_shocking: { type: "string", description: "Brief explanation of why this is shocking" },
                  },
                  required: ["fact", "impact_score", "why_shocking"],
                },
              },
            },
            required: ["facts"],
          },
        }],
        { type: "tool", name: "return_research" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: GENERATE HOOK ====================
    if (step === "generate-hook") {
      const { topic, facts, hookCategory, hookTemplate } = body;
      if (!topic || !hookCategory) throw new Error("topic and hookCategory are required");

      const factsText = (facts || []).map((f: any) => `- ${f.fact}`).join("\n");

      const systemPrompt = `You are an expert short-form video scriptwriter who specializes in creating viral hooks. You write hooks that stop people from scrolling within the first 2 seconds.

You will be given a topic, research facts, and a hook format/template to follow. Generate ONLY the main hook — the opening line(s) that grab attention.

Rules:
- ONLY output the hook itself: 1-2 sentences maximum
- Do NOT include any explanation, body content, or additional facts after the hook
- The hook must follow the chosen template structure
- Incorporate the topic naturally
- Create immediate curiosity or shock value
- Write in SPANISH (Latin American) by default`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Topic: "${topic}"

Research facts:
${factsText}

Hook category: ${hookCategory}
Hook template to follow: "${hookTemplate}"

Generate a hook following this template format. Make it irresistible.`
      );

      const text = data.content?.find((c: any) => c.type === "text")?.text || "";

      return new Response(JSON.stringify({ hook: text.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: GENERATE SCRIPT ====================
    if (step === "generate-script") {
      const { topic, selectedFacts, hook, structure, length } = body;
      if (!topic || !hook || !structure) throw new Error("topic, hook, structure are required");

      const factsText = (selectedFacts || []).map((f: any) => `- ${f.fact}`).join("\n");
      const lengthGuide = length === "short" ? "30 seconds (6-10 lines)" : length === "long" ? "60 seconds (18-25 lines)" : "45 seconds (12-16 lines)";

      const systemPrompt = `You are an expert short-form video scriptwriter. You create complete scripts for social media videos (TikTok, Reels, Shorts).

You must categorize EVERY line into:
- line_type: "filming" (camera/visual instructions), "actor" (dialogue/voiceover), or "editor" (post-production/text overlays/effects)
- section: "hook" (opening), "body" (main content), or "cta" (call-to-action closing)

Rules:
- Write in SPANISH (Latin American)
- The hook is already provided — include it as the first actor lines in the hook section
- Add appropriate filming and editor instructions throughout
- End with a strong CTA
- Follow the chosen script structure format
- Target length: ${lengthGuide}
- Incorporate the selected research facts naturally into the body
- Make it engaging, conversational, and optimized for retention`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Topic: "${topic}"

Hook (already written):
${hook}

Script structure: ${structure}

Selected research facts to include:
${factsText || "No specific facts selected — use general knowledge"}

Target length: ${lengthGuide}

Generate the complete script.`,
        [{
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
              idea_ganadora: { type: "string", description: "The winning idea/hook summary" },
              target: { type: "string", description: "Target audience" },
              formato: { type: "string", enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"] },
            },
            required: ["lines", "idea_ganadora", "target", "formato"],
          },
        }],
        { type: "tool", name: "return_script" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid step parameter" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-build-script error:", e);
    const status = e?.status || 500;
    const message = e?.message || (e instanceof Error ? e.message : "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
