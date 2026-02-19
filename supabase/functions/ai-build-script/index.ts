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
      const { topic, facts, hookCategory, hookTemplate, language: reqLang } = body;
      if (!topic || !hookCategory) throw new Error("topic and hookCategory are required");
      const langLabel = reqLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";

      const factsText = (facts || []).map((f: any) => `- ${f.fact}`).join("\n");

      const systemPrompt = `You are an expert short-form video scriptwriter who specializes in creating viral hooks. You write hooks that stop people from scrolling within the first 2 seconds.

You will be given a topic, research facts, and a hook format/template to follow. Generate ONLY the main hook — the opening line(s) that grab attention.

Rules:
- ONLY output the hook itself: 1-2 sentences maximum
- Do NOT include any explanation, body content, or additional facts after the hook
- The hook must follow the chosen template structure
- Incorporate the topic naturally
- Create immediate curiosity or shock value
- Write in ${langLabel}`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Topic: "${topic}"

Research facts:
${factsText}

Hook category: ${hookCategory}
Hook template to follow: "${hookTemplate}"

Generate a hook following this template format. Make it irresistible. Write in ${langLabel}.`
      );

      const text = data.content?.find((c: any) => c.type === "text")?.text || "";

      return new Response(JSON.stringify({ hook: text.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: GENERATE SCRIPT ====================
    if (step === "generate-script") {
      const { topic, selectedFacts, hook, structure, length, language: reqLang } = body;
      if (!topic || !hook || !structure) throw new Error("topic, hook, structure are required");
      const langLabel = reqLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";

      const factsText = (selectedFacts || []).map((f: any) => `- ${f.fact}`).join("\n");
      const lengthGuide = length === "short" ? "30 seconds (6-10 lines)" : length === "long" ? "60 seconds (18-25 lines)" : "45 seconds (12-16 lines)";

      const systemPrompt = `You are an expert short-form video scriptwriter. You create complete scripts for social media videos (TikTok, Reels, Shorts).

You must categorize EVERY line into:
- line_type: "filming" (camera/visual instructions), "actor" (dialogue/voiceover), or "editor" (post-production/text overlays/effects)
- section: "hook" (opening), "body" (main content), or "cta" (call-to-action closing)

BEFORE finalizing the script, internally evaluate it against this 9-Step Execution Quality Checklist and adjust until ALL criteria score highly:
1. Massive TAM — Does the idea appeal to a large total addressable market?
2. High Idea Explosivity — Is this idea inherently shareable/explosive?
3. High Emotional Resonance — Does it trigger strong emotions (shock, curiosity, desire, fear)?
4. Novel take or timing — Is this fresh given current trends or perspective?
5. Value teased quickly — Is the value/payoff teased within the first 2-3 seconds?
6. Curiosity-inducing hook — Does the opening line create an irresistible curiosity gap?
7. Easy absorption — Are the words and concepts easy to absorb while watching?
8. Rehook present — Is there a rehook moment mid-script to retain viewers?
9. Sticky idea — Does the core idea feel memorable and worth sharing?

Return a single virality_score which is the average of your internal ratings (1-10) for all 9 criteria above.

Rules:
- Write in ${langLabel}
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
              virality_score: {
                type: "number",
                description: "Average score (1-10) across all 9 quality criteria: TAM, explosivity, emotional resonance, novelty, value tease, curiosity hook, absorption, rehook, stickiness",
              },
            },
            required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
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

    // ==================== STEP: REFINE SCRIPT ====================
    if (step === "refine-script") {
      const { topic, currentScript, feedback } = body;
      if (!currentScript || !feedback) throw new Error("currentScript and feedback are required");

      const currentLines = (currentScript.lines || []).map((l: any) => `[${l.section}/${l.line_type}] ${l.text}`).join("\n");

      const systemPrompt = `You are an expert short-form video scriptwriter. The user has a script that needs refinement based on their specific feedback. 

CRITICAL RULES:
- Apply ONLY the changes the user explicitly requests. Keep everything else EXACTLY the same.
- DO NOT change the hook (the lines in the "hook" section) UNLESS the user explicitly asks to change the hook.
- Maintain the same format (line_type, section categorization).

After refining, re-evaluate against the 9-Step Quality Checklist:
1. Massive TAM  2. Idea Explosivity  3. Emotional Resonance  4. Novel take/timing
5. Value teased quickly  6. Curiosity hook  7. Easy absorption  8. Rehook present  9. Sticky idea

Return a single virality_score which is the average of all 9 criteria (1-10).

Write in the same language as the current script unless told otherwise.`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Topic: "${topic || ""}"

Current script:
${currentLines}

User feedback — what to fix:
${feedback}

Apply the requested changes and return the refined script.`,
        [{
          name: "return_script",
          description: "Return the refined categorized script",
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
              idea_ganadora: { type: "string" },
              target: { type: "string" },
              formato: { type: "string", enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"] },
              virality_score: {
                type: "number",
                description: "Average score (1-10) across all 9 quality criteria",
              },
            },
            required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
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

    // ==================== STEP: TRANSLATE SCRIPT ====================
    if (step === "translate-script") {
      const { currentScript, targetLanguage } = body;
      if (!currentScript) throw new Error("currentScript is required");

      const currentLines = (currentScript.lines || []).map((l: any) => `[${l.section}/${l.line_type}] ${l.text}`).join("\n");
      const langLabel = targetLanguage === "en" ? "English" : "Spanish (Latin American)";

      const systemPrompt = `You are a professional translator specializing in social media content. Translate the script to ${langLabel}. 
Maintain the same tone, energy, cultural impact, and structure. Adapt idioms and expressions naturally — do NOT translate literally. Keep line_type and section categorization identical.`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Translate this script to ${langLabel}:

${currentLines}

Return the translated script with the same structure.`,
        [{
          name: "return_script",
          description: "Return the translated script",
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
              idea_ganadora: { type: "string" },
              target: { type: "string" },
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

    // ==================== STEP: TEMPLATIZE SCRIPT ====================
    if (step === "templatize-script") {
      const { topic, transcription, language: reqLang } = body;
      if (!topic || !transcription) throw new Error("topic and transcription are required");
      const langLabel = reqLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";

      const systemPrompt = `You are an expert short-form video scriptwriter who specializes in reverse-engineering viral video structures. You will receive a transcription from a viral video AND a new topic. Your job is to:

1. Analyze the transcription's EXACT structure: hook style, body flow, CTA approach, pacing, approximate length, number of sections, rhetorical devices used
2. Create a COMPLETELY NEW script about the given topic that follows the EXACT SAME structure, flow, and approximate length
3. The new script should feel like it was written by the same creator but about a different topic
4. Keep the same energy, pacing, and engagement techniques

CRITICAL RULES:
- Match the original's approximate word count and number of sections
- Use the same hook TYPE (question, statement, shock, etc.) but with new content
- Maintain the same body pattern (tips, story, comparison, etc.)
- Mirror the CTA style
- Write in ${langLabel}
- Categorize EVERY line into line_type ("filming", "actor", "editor") and section ("hook", "body", "cta")

BEFORE finalizing, evaluate against the 9-Step Quality Checklist:
1. Massive TAM  2. Idea Explosivity  3. Emotional Resonance  4. Novel take/timing
5. Value teased quickly  6. Curiosity hook  7. Easy absorption  8. Rehook present  9. Sticky idea

Return a virality_score which is the average of all 9 criteria (1-10).`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `ORIGINAL TRANSCRIPTION (use this as your structural template):
"""
${transcription}
"""

NEW TOPIC to write about: "${topic}"

Create a new script about this topic following the EXACT same structure, length, and flow as the original transcription. Write in ${langLabel}.`,
        [{
          name: "return_script",
          description: "Return the templatized script",
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
              virality_score: {
                type: "number",
                description: "Average score (1-10) across all 9 quality criteria",
              },
            },
            required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
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
