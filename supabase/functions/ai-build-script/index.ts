import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callClaude(apiKey: string, systemPrompt: string, userPrompt: string, tools?: any[], toolChoice?: any, modelOverride?: string) {
  const body: any = {
    model: modelOverride || "claude-haiku-4-5",
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

// Credit costs per action (10x scale)
const CREDIT_COSTS: Record<string, number> = {
  "research": 50,
  "refine-script": 25,
  "translate-script": 25,
  "templatize-script": 50,
  "analyze-template": 0,
  "generate-script": 0,
  "verify-video-type": 0,
  "generate-caption-script": 50,
  "extract-story-facts": 50,
  "analyze-structure": 0,
  "canvas-generate": 50,
  "generate-hooks": 25,
  "generate-ctas": 25,
  "analyze-competitor-post": 0,
};

// All hook templates mirrored from AIScriptWizard.tsx
const HOOK_TEMPLATES: Record<string, string[]> = {
  educational: [
    "This represents your X before, during, and after X",
    "Here's exactly how much (insert action/item) you need to (insert result)",
    "Can you tell us how to (insert result) in 60 seconds?",
    "I'm going to tell you how to get (insert result), (insert mind blowing method).",
    "It took me 10 years to learn this but I'll teach it to you in less than 1 minute.",
  ],
  randomInspo: [
    "This is (insert large number) of (insert item).",
    "You're losing your boyfriend/girlfriend this week to (insert event/hobby).",
    "What (insert title) says vs what they mean.",
    "(insert trend) is the most disgusting trend on social media.",
    "I do not believe in (insert common belief), I believe in (insert your belief).",
  ],
  authorityInspo: [
    "My (insert before state) used to look like this and now they look like this.",
    "10 YEARS it took me from (insert before state) to (insert after state).",
    "How to turn this into this in X simple steps.",
    "(insert big result) from (insert item/thing). Here's how you can do it in X steps.",
    "Over the past (insert time) I've grown my (insert thing) from (insert before) to (insert after).",
  ],
  comparisonInspo: [
    "This is an (insert noun), and this is an (insert noun).",
    "This (insert noun) and this (insert noun) have the same amount of (insert noun).",
    "A lot of people ask me what's better (option #1) or (option #2) for (dream result)...",
    "For this (insert item) you could have all of these (insert item).",
    "This (option #1) has (insert noun) in it, and (option #2) has (insert noun) in it.",
  ],
  storytellingInspo: [
    "I started my (insert business) when I was (insert age) with (insert $).",
    "X years ago my (insert person) told me (insert quote).",
    "I don't have a backup plan so this kind of needs to work.",
    "This is how my (insert event/item/result) changed my life.",
    "X years ago I decided to (insert decision).",
  ],
};

// Deduct credits. Returns error JSON string on failure, null on success.
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
  if (roleData?.role === "admin") return null;

  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("user_id", userId)
    .maybeSingle();

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
    .eq("id", client.id);

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

  // Admin client for credit operations (bypasses RLS)
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

    // Deduct credits for this step (before doing AI work)
    const cost = CREDIT_COSTS[step] ?? 0;
    if (cost > 0) {
      const creditErr = await deductCredits(adminClient, user.id, step, cost);
      if (creditErr) {
        return new Response(creditErr, {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ==================== STEP: RESEARCH ====================
    if (step === "research") {
      const { topic } = body;
      if (!topic) throw new Error("topic is required");

      const systemPrompt = `You are a world-class content researcher specializing in viral social media content. Your job is to find the most shocking, surprising, and impactful facts about any given topic. These facts should make people stop scrolling and say "wait, WHAT?!"

Rules:
- Find exactly 5 facts ranked from impact score 8 to 10 (10 being most mind-blowing)
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
                  },
                  required: ["fact", "impact_score"],
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
    // ==================== STEP: GENERATE SCRIPT ====================
    if (step === "generate-script" || step === "generate-script-stream") {
      const { topic, selectedFacts, hookCategory, hookTemplate, structure, length, language: reqLang, onboardingContext, formato, video_format_hint, structure_guide, video_analysis, remix_transcription } = body;
      if (!topic || !hookCategory || !hookTemplate || !structure) throw new Error("topic, hook, structure are required");
      const langLabel = reqLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";

      const factsText = (selectedFacts || []).map((f: any, i: number) => `${i + 1}. ${f.fact}`).join("\n");
      const lengthGuide = length === "short" ? "30 seconds (approximately 60-80 words)" : length === "long" ? "60 seconds (approximately 120-150 words)" : "45 seconds (approximately 90-120 words)";

      // Script format details for structured prompting
      const SCRIPT_FORMAT_DETAILS: Record<string, { structure: string; tone: string; voice: string; wordChoice: string; pacing: string }> = {
        talking_head: {
          structure: "Educational Motivation — speak directly to camera, build personal trust, share insight or story",
          tone: "Conversational and personal",
          voice: "First-person, as if talking to one friend face-to-face",
          wordChoice: "Simple everyday language, no jargon",
          pacing: "Rapid-fire — short punchy bursts with energy",
        },
        broll_caption: {
          structure: "Visual Storytelling — words complement visuals, narrate scenes, paint a vivid picture",
          tone: "Engaging and descriptive",
          voice: "Narrator — authoritative yet relatable",
          wordChoice: "Descriptive but concise, vivid verbs",
          pacing: "Measured and deliberate — each line lands with weight",
        },
        entrevista: {
          structure: "Conversational Q&A — set up a question then reveal the answer, create dialogue energy",
          tone: "Friendly and curious",
          voice: "Relatable — natural back-and-forth conversational energy",
          wordChoice: "Casual, colloquial, everyday speech",
          pacing: "Natural — mirrors real conversation rhythm",
        },
        variado: {
          structure: "Dynamic Mixed — varies between direct camera, b-roll narration, and text-based moments",
          tone: "High-energy and versatile",
          voice: "Shifts with each section to maximize engagement",
          wordChoice: "Punchy, vivid, and varied",
          pacing: "Fast-paced — constant forward momentum, no dead air",
        },
      };

      const formatKey = (formato || "talking_head").toLowerCase().replace(/[\s\-]/g, "_");
      const fmtDetails = SCRIPT_FORMAT_DETAILS[formatKey] || SCRIPT_FORMAT_DETAILS.talking_head;
      const formatLabel = formato ? formato.toUpperCase().replace(/_/g, " ") : "TALKING HEAD";

      const videoFormatContext = video_format_hint
        ? `<remix_context>\n${video_format_hint}\n</remix_context>\n`
        : "";

      const structureGuideContext = structure_guide?.hook_type
        ? `<viral_structure_reference>
Use this proven format for pacing, rhythm, and section flow ONLY — every word of content must be original to the user's topic and research:
- Hook format: ${structure_guide.hook_type}
- Body structure: ${structure_guide.body_pattern || "story arc with escalating value"}
${structure_guide.section_sequence ? `- Section sequence: ${JSON.stringify(structure_guide.section_sequence)}` : ""}
CRITICAL: This is the user's own original script in their own voice. Every fact, story detail, and insight must come exclusively from their research below. The format is borrowed; the content is entirely theirs.
</viral_structure_reference>\n`
        : "";

      // Original video transcript — strongest structure reference for remixes
      const remixTranscriptContext = remix_transcription
        ? `<original_video_transcript>
Below is the FULL transcript of the original video being remixed. Your script MUST replicate the EXACT same:
- Hook style and opening pattern (how the video starts — question, statement, story, shock, etc.)
- Section flow and number of sections
- Pacing rhythm (short bursts vs. longer explanations)
- Transitions between sections
- Closing/CTA pattern

TRANSCRIPT:
${remix_transcription}

CRITICAL: Replicate the STRUCTURE and FLOW only — every single word of content must be 100% original to the user's topic and research facts. Do NOT copy any content from the transcript.
</original_video_transcript>\n`
        : "";

      // Multimodal video analysis context (from analyze-video-multimodal)
      const audioContext = video_analysis?.audio
        ? `<audio_context>
Original video audio profile — match your script pacing to this:
- Energy level: ${video_analysis.audio.energy}
- Speech density: ${video_analysis.audio.speech_density}
- Background music: ${video_analysis.audio.has_music ? "yes" : "no"}${video_analysis.audio.bpm_estimate ? ` (BPM ~${video_analysis.audio.bpm_estimate})` : ""}
${video_analysis.audio.energy === "high" ? "Write with rapid-fire, punchy lines to match high energy." : video_analysis.audio.energy === "low" ? "Write slower, deliberate lines with breathing room." : ""}
</audio_context>\n`
        : "";

      const visualContext = video_analysis?.visual_segments?.length
        ? `<visual_context>
Original video visual story — use these to write realistic filming/editor directions:
${video_analysis.visual_segments.map((s: any) => `[${s.start}-${s.end}s] ${s.description}`).join("\n")}
</visual_context>\n`
        : "";

      const systemPrompt = `<system_instructions>
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
- No fluff or wasted words. Be concise and to the point. Get the most value out of every sentence.
- Imbue a high degree of excitement and energy into the script.
- Don't sound corny or cheesy. Avoid clichés and overused phrases. Sound genuine and authentic.
- For actor lines: output one sentence per line.
</style_guide>
<target_audience>
- Your target audience is intelligent and curious, but has no background on your topic.
- They won't know any jargon, so you must use simple language that anyone will understand.
- The target audience is your friend, so you must speak to them naturally, not formally.
</target_audience>
</system_instructions>

You must categorize EVERY line into:
- line_type: "filming" (camera/visual instructions), "actor" (spoken dialogue/voiceover), or "editor" (post-production/text overlays/effects)
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

Write in ${langLabel}.
For idea_ganadora: Generate a SHORT, PUNCHY title (STRICT MAXIMUM 3-5 words) that captures the core concept — NOT a full sentence.`;

      const scriptUserPrompt = `<script_instructions>
<task>Write a compelling, attention-grabbing script for a social media short-form video that'll go viral. Target length: ${lengthGuide}.</task>
${remixTranscriptContext}${videoFormatContext}${structureGuideContext}${audioContext}${visualContext}
<topic>
${topic}
</topic>

<hook>
Open the script with an attention-grabbing hook that draws in the viewer. Execute on the hook using the following instructions:
- Format: ${hookCategory}
- Template/Explanation: ${hookTemplate}
Craft the actual hook line yourself based on this pattern, adapted specifically to the topic. The hook must create immediate curiosity or shock within the first 2 seconds.
</hook>

<structure>
Write the script following a predefined structure that works best for this topic:
- Format: ${formatLabel}
- Explanation: ${fmtDetails.structure}
Ensure each section flows smoothly into the next, using appropriate transitions without unnecessary filler.
</structure>

<style>
Embody the following writing style attributes when creating your script:
- Tone: ${fmtDetails.tone}
- Voice: ${fmtDetails.voice}
- Word Choice: ${fmtDetails.wordChoice}
- Pacing: ${fmtDetails.pacing}
</style>

<content>
Incorporate the following details in the body of the script. Use the facts to bolster the story in a way that's natural and informative:
${factsText || "No specific facts provided — use compelling general knowledge about the topic."}
</content>
</script_instructions>`;

      const scriptTools = [{
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
            idea_ganadora: { type: "string", description: "Ultra-short punchy title — STRICT MAXIMUM 3-5 words, never more" },
            target: { type: "string", description: "Target audience" },
            formato: { type: "string", enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"] },
            virality_score: {
              type: "number",
              description: "Average score (1-10) across all 9 quality criteria: TAM, explosivity, emotional resonance, novelty, value tease, curiosity hook, absorption, rehook, stickiness",
            },
          },
          required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
        },
      }];

      // ── Streaming variant: pipe SSE directly to client ──
      if (step === "generate-script-stream") {
        const streamRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            stream: true,
            system: systemPrompt,
            tools: scriptTools,
            tool_choice: { type: "tool", name: "return_script" },
            messages: [{ role: "user", content: scriptUserPrompt }],
          }),
        });
        if (!streamRes.ok) {
          const err = await streamRes.text();
          throw new Error(`Claude streaming error ${streamRes.status}: ${err}`);
        }
        return new Response(streamRes.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      }

      // ── Non-streaming (default) ──
      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        scriptUserPrompt,
        scriptTools,
        { type: "tool", name: "return_script" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      // Server-side enforce 3-5 word limit on idea_ganadora
      if (toolUse.input.idea_ganadora) {
        const words = toolUse.input.idea_ganadora.split(/\s+/);
        if (words.length > 5) {
          toolUse.input.idea_ganadora = words.slice(0, 5).join(" ");
        }
      }

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: REFINE SCRIPT ====================
    if (step === "refine-script") {
      const { topic, currentScript, feedback, hookCategory, hookTemplate, structure, formato } = body;
      if (!currentScript || !feedback) throw new Error("currentScript and feedback are required");

      const currentLines = (currentScript.lines || []).map((l: any) => `[${l.section}/${l.line_type}] ${l.text}`).join("\n");

      const systemPrompt = `You are an expert short-form video scriptwriter. The user has a script that needs refinement based on their specific feedback.

CRITICAL RULES — PRESERVATION PRIORITIES:
1. STRUCTURE: Keep the EXACT same section flow (hook → body → cta) and number of sections. Do NOT restructure.
2. HOOK: NEVER change the hook lines UNLESS the user EXPLICITLY asks to change the hook. The hook is sacred.
3. TOPIC: Stay on the SAME topic. Do not drift to a different subject.
4. FORMAT: Maintain the same format (line_type, section categorization) and script style/formato.
5. Apply ONLY the changes the user explicitly requests. Keep everything else EXACTLY the same.
6. Keep idea_ganadora SHORT and PUNCHY (STRICT MAXIMUM 3-5 words) — only update if the script changes fundamentally.

After refining, re-evaluate against the 9-Step Quality Checklist:
1. Massive TAM  2. Idea Explosivity  3. Emotional Resonance  4. Novel take/timing
5. Value teased quickly  6. Curiosity hook  7. Easy absorption  8. Rehook present  9. Sticky idea

Return a single virality_score which is the average of all 9 criteria (1-10).

Write in the same language as the current script unless told otherwise.`;

      const contextBlock = [
        topic ? `Topic: "${topic}"` : "",
        hookCategory ? `Hook category: ${hookCategory}` : "",
        hookTemplate ? `Hook template: "${hookTemplate}"` : "",
        formato ? `Script format: ${formato}` : "",
        structure ? `Structure: ${structure}` : "",
      ].filter(Boolean).join("\n");

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `${contextBlock}

Current script:
${currentLines}

User feedback — what to fix:
${feedback}

Apply ONLY the requested changes. Preserve the hook, structure, topic, and format unless the user explicitly asks to change them.`,
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
              idea_ganadora: { type: "string", description: "Short punchy title (max 5-7 words)" },
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
      const { currentScript, targetLanguage, topic, hookCategory, hookTemplate } = body;
      if (!currentScript) throw new Error("currentScript is required");

      const currentLines = (currentScript.lines || []).map((l: any) => `[${l.section}/${l.line_type}] ${l.text}`).join("\n");
      const langLabel = targetLanguage === "en" ? "English" : "Spanish (Latin American)";

      const systemPrompt = `You are a professional translator specializing in social media content. Translate the script to ${langLabel}.

CRITICAL PRESERVATION RULES:
1. STRUCTURE: Keep the EXACT same sections, line count, and flow. Do NOT add, remove, or rearrange lines.
2. HOOK: Translate the hook but preserve its impact, rhythm, and curiosity-inducing power. Do NOT rewrite it.
3. TONE: Maintain the same energy, pacing, and emotional intensity.
4. FORMAT: Keep line_type and section categorization IDENTICAL — do not change any line_type or section values.
5. Adapt idioms and expressions naturally — do NOT translate literally. Cultural adaptation is OK, structural changes are NOT.`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `${topic ? `Topic: "${topic}"\n` : ""}${hookCategory ? `Hook style: ${hookCategory}\n` : ""}
Translate this script to ${langLabel}, preserving the exact structure and hook:

${currentLines}

Return the translated script with the SAME structure, same number of lines, same sections.`,
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
              idea_ganadora: { type: "string", description: "Short punchy title (max 5-7 words)" },
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

    // ==================== STEP: ANALYZE TEMPLATE (for Vault) ====================
    if (step === "analyze-template") {
      const { transcription, video_analysis } = body;
      if (!transcription) throw new Error("transcription is required");

      const systemPrompt = `You are an expert at analyzing viral video scripts. Given a transcription, you must:

1. Identify the structural pattern: hook type, body flow, CTA approach, pacing
2. Create a TEMPLATIZED version where specific details are replaced with generic placeholders like [TOPIC], [FACT], [EXAMPLE], [NUMBER], [RESULT], etc.
3. Suggest a short descriptive name for this template

The template_lines should preserve the exact rhythm and structure but make it reusable for ANY topic.`;

      // Build multimodal context if available
      let multimodalContext = "";
      if (video_analysis) {
        const { audio, visual_segments } = video_analysis;
        if (visual_segments?.length) {
          const segmentLines = visual_segments
            .map((s: any) => `  [${s.start}-${s.end}s] ${s.description}`)
            .join("\n");
          multimodalContext += `\n\nVisual segments from the actual video:\n${segmentLines}\n`;
        }
        if (audio) {
          multimodalContext += `\nAudio profile: energy=${audio.energy}, speech density=${audio.speech_density}, music=${audio.has_music ? "yes" : "no"}${audio.bpm_estimate ? `, BPM ~${audio.bpm_estimate}` : ""}.\n`;
          multimodalContext += `Use these cues to write accurate filming/editor lines that match the real pacing and visual style.\n`;
        }
      }

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Analyze this transcription and create a reusable template:\n\n"""${transcription}"""${multimodalContext}`,
        [{
          name: "return_analysis",
          description: "Return the template analysis",
          input_schema: {
            type: "object",
            properties: {
              suggested_name: { type: "string", description: "Short descriptive name for this template (e.g. 'Shock Fact Educational', 'Before/After Story')" },
              structure_analysis: {
                type: "object",
                properties: {
                  hook_type: { type: "string", description: "Type of hook used (question, shock statement, bold claim, etc.)" },
                  body_pattern: { type: "string", description: "Body structure (tips list, storytelling, comparison, tutorial, etc.)" },
                  cta_style: { type: "string", description: "CTA approach (follow prompt, question, challenge, etc.)" },
                  pacing: { type: "string", description: "Fast, medium, slow" },
                  estimated_duration: { type: "string", description: "Estimated video duration" },
                  word_count: { type: "number", description: "Approximate word count" },
                },
                required: ["hook_type", "body_pattern", "cta_style"],
              },
              template_lines: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    line_type: { type: "string", enum: ["filming", "actor", "editor"] },
                    section: { type: "string", enum: ["hook", "body", "cta"] },
                    text: { type: "string", description: "Templatized text with [PLACEHOLDERS]" },
                  },
                  required: ["line_type", "section", "text"],
                },
              },
            },
            required: ["suggested_name", "structure_analysis", "template_lines"],
          },
        }],
        { type: "tool", name: "return_analysis" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: TEMPLATIZE SCRIPT ====================
    if (step === "templatize-script") {
      const { topic, transcription, vault_template, language: reqLang, hookTemplate, hookCategory } = body;
      if (!topic) throw new Error("topic is required");
      // Either use a vault template or a live transcription
      if (!transcription && !vault_template) throw new Error("transcription or vault_template is required");
      const langLabel = reqLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";

      let userPrompt: string;

      if (vault_template) {
        // Use pre-analyzed vault template
        const templateLines = (vault_template.template_lines || [])
          .map((l: any) => `[${l.section}/${l.line_type}] ${l.text}`)
          .join("\n");

        userPrompt = `TEMPLATE STRUCTURE (follow this EXACTLY, replacing all [PLACEHOLDERS] with content about the new topic):
"""
${templateLines}
"""

NEW TOPIC to write about: "${topic}"

Create a new script about this topic following the EXACT same structure, replacing all placeholders. Write in ${langLabel}.`;
      } else {
        userPrompt = `ORIGINAL TRANSCRIPTION (use this as your structural template):
"""
${transcription}
"""

NEW TOPIC to write about: "${topic}"

Create a new script about this topic following the EXACT same structure, length, and flow as the original transcription. Write in ${langLabel}.`;
      }

      // Optional hook override: user selected a specific hook style instead of the video's default
      if (hookTemplate && hookCategory && hookCategory !== "Video Hook") {
        userPrompt += `\n\nIMPORTANT HOOK OVERRIDE: Instead of using the video's original hook, use this specific hook style for the opening lines:\nCategory: ${hookCategory}\nHook template to follow: "${hookTemplate}"\nAdapt this hook to fit the new topic "${topic}" while keeping the body and CTA from the original structure.`;
      }

      const systemPrompt = `You are an expert short-form video scriptwriter who specializes in reverse-engineering viral video structures. You will receive either a transcription from a viral video or a pre-analyzed template structure, AND a new topic. Your job is to:

1. Analyze the structure: hook style, body flow, CTA approach, pacing, approximate length
2. Create a COMPLETELY NEW script about the given topic that follows the EXACT SAME structure
3. The new script should feel like it was written by the same creator but about a different topic
4. Keep the same energy, pacing, and engagement techniques

CRITICAL RULES:
- Match the original's approximate word count and number of sections
- Use the same hook TYPE but with new content
- Maintain the same body pattern
- Mirror the CTA style
- Write in ${langLabel}
- Categorize EVERY line into line_type ("filming", "actor", "editor") and section ("hook", "body", "cta")
- For idea_ganadora: Generate a SHORT, PUNCHY title (max 5-7 words) that captures the core concept

BEFORE finalizing, evaluate against the 9-Step Quality Checklist:
1. Massive TAM  2. Idea Explosivity  3. Emotional Resonance  4. Novel take/timing
5. Value teased quickly  6. Curiosity hook  7. Easy absorption  8. Rehook present  9. Sticky idea

Return a virality_score which is the average of all 9 criteria (1-10).`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        userPrompt,
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

      // Server-side enforce 3-5 word limit on idea_ganadora
      if (toolUse.input.idea_ganadora) {
        const words = toolUse.input.idea_ganadora.split(/\s+/);
        if (words.length > 5) {
          toolUse.input.idea_ganadora = words.slice(0, 5).join(" ");
        }
      }

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: VERIFY VIDEO TYPE ====================
    if (step === "verify-video-type") {
      const { transcription, duration_seconds, audio_hint, visual_hint } = body;
      if (!transcription) throw new Error("transcription is required");

      const durationHint = duration_seconds
        ? `The video is approximately ${duration_seconds} seconds long.`
        : "";

      // Optional multimodal context for refinement pass
      const multimodalHint = (audio_hint || visual_hint)
        ? `\n\nADDITIONAL SIGNAL (use this to resolve ambiguity — do NOT override a clear transcript signal):
${audio_hint ? `Audio: energy=${audio_hint.energy}, speech_density=${audio_hint.speech_density}, has_music=${audio_hint.has_music}
- Low speech density + high music energy → strong signal for caption_video_music
- High speech density → strong signal for talking_head` : ""}
${visual_hint?.length ? `Visual (first 3 scenes): ${(visual_hint as string[]).join(" | ")}` : ""}` : "";

      const systemPrompt = `You are an expert at classifying short-form social media videos by analyzing their transcriptions.

You must decide if a video is:
- caption_video_music: The transcription contains very short, punchy, rhythmic phrases — song lyrics, motivational quotes, "POV:" text stories, aesthetic captions, or text synced to music beats. Characteristic signs: lines of 1-7 words, rhythmic repetition, poetic or lyrical structure, minimal connective prose, sounds like song lyrics or poem stanzas.
- talking_head: Natural spoken language — someone explaining, teaching, telling a story, or narrating over footage. Characteristic signs: full sentences, conversational flow, logical progression, question-and-answer patterns, educational or narrative prose.

If the video is classified as talking_head, also determine if it is a personal storytelling video.
Set is_storytelling = true when: first-person personal narrative ("I", "my", "we"), a journey arc with beginning/middle/end (life events, transformation, "I used to", "I started", "I decided", "my journey"), emotional personal stakes, sharing a personal experience or origin story.
Set is_storytelling = false when: educational fact-delivery, tips/advice, instructional how-to, opinion commentary, product review, or caption_video_music.

${durationHint}${multimodalHint}`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Analyze this video transcription and classify it:\n\n"""${transcription.slice(0, 2000)}"""`,
        [{
          name: "return_video_type",
          description: "Return the detected video type",
          input_schema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["caption_video_music", "talking_head"],
                description: "The detected video type",
              },
              confidence: {
                type: "number",
                description: "Confidence from 0.0 to 1.0",
              },
              reason: {
                type: "string",
                description: "One-sentence explanation of the classification",
              },
              is_storytelling: {
                type: "boolean",
                description: "True only when type=talking_head AND the content is a personal narrative story (first-person journey, life events, origin story). Always false for caption_video_music.",
              },
            },
            required: ["type", "confidence", "reason", "is_storytelling"],
          },
        }],
        { type: "tool", name: "return_video_type" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: GENERATE CAPTION SCRIPT ====================
    // ==================== STEP: EXTRACT STORY FACTS ====================
    if (step === "extract-story-facts") {
      const { story } = body;
      if (!story) throw new Error("story is required");

      const systemPrompt = `You are an expert at analyzing personal stories for short-form social media video content.
Given a personal story told by a content creator, extract the 5 most impactful, emotionally resonant, or surprising moments and key points from it.
These will be used to create a compelling short-form video script that follows the storytelling arc.

Rules:
- Extract exactly 5 key points ranked by emotional impact score from 8 to 10
- Focus on the most powerful, surprising, or transformative moments in the story
- Each fact should be concise (1-2 sentences max), written as a third-person statement that captures the essence of that moment
- Preserve the authentic personal voice — these are real moments from a real journey
- Think about what would make a viewer say "I relate to this" or "that's incredible"
- Score 10 = jaw-dropping or deeply relatable, Score 8 = solid and engaging`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Extract the 5 most impactful key moments from this personal story:\n\n"""${story.slice(0, 3000)}"""`,
        [{
          name: "return_research",
          description: "Return the extracted story key moments as structured data",
          input_schema: {
            type: "object",
            properties: {
              facts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    fact: { type: "string", description: "The impactful story moment or key point" },
                    impact_score: { type: "number", description: "Emotional impact score from 8 to 10" },
                  },
                  required: ["fact", "impact_score"],
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

    // ==================== STEP: GENERATE CAPTION SCRIPT ====================
    if (step === "generate-caption-script") {
      const { topic, template_transcription, client_values, target_pairs, video_analysis } = body;
      if (!topic) throw new Error("topic is required");

      // Determine target number of pairs to match original video structure
      const inferredPairs = target_pairs
        || (template_transcription ? template_transcription.split("\n").filter((l: string) => l.trim()).length : 0)
        || 0;
      const pairTarget = inferredPairs >= 2 && inferredPairs <= 20 ? inferredPairs : null;
      const pairsInstruction = pairTarget
        ? `Generate EXACTLY ${pairTarget} pairs (filming + text_on_screen) to match the original video's length precisely.`
        : "Generate 6–14 pairs (filming + text_on_screen) for a ~30-second video.";

      // Build visual segments context from multimodal analysis
      let visualTemplateContext = "";
      if (video_analysis?.visual_segments?.length) {
        const segs = video_analysis.visual_segments;
        visualTemplateContext = `\n\nORIGINAL VIDEO VISUAL STRUCTURE (${segs.length} scenes — match this scene count and visual style):
${segs.map((s: any, i: number) => `Scene ${i + 1} [${s.start}-${s.end}s]: ${s.description}`).join("\n")}

Use these scene descriptions as the structural template for your filming directions. Adapt them to the new topic but keep the same visual rhythm and scene count.`;
      } else if (template_transcription) {
        // Use transcription lines as visual scaffold
        const lines = template_transcription.split("\n").filter((l: string) => l.trim());
        if (lines.length > 0) {
          visualTemplateContext = `\n\nORIGINAL VIDEO TEXT STRUCTURE (${lines.length} text overlays — match this exact count):
${lines.map((l: string, i: number) => `Caption ${i + 1}: "${l.trim()}"`).join("\n")}

Use this as your structural template. Create one filming+caption pair per original caption line, adapted to the new topic.`;
        }
      }

      // Build audio context from multimodal analysis
      let audioCaptionContext = "";
      if (video_analysis?.audio) {
        const { energy, speech_density, has_music, bpm_estimate } = video_analysis.audio;
        const pacingHint = energy === "high"
          ? "Write SHORT, punchy captions — 1–4 words each. Fast cuts, rapid-fire rhythm."
          : energy === "low"
            ? "Write slower, more expressive captions — up to 8 words each. Cinematic pacing."
            : "Write balanced captions — 3–7 words each. Steady rhythm.";
        audioCaptionContext = `\n\nAUDIO PROFILE — match caption pacing and energy to this:
- Energy level: ${energy}
- Speech density: ${speech_density}
- Background music: ${has_music ? "yes" : "no"}${bpm_estimate ? ` (~${bpm_estimate} BPM)` : ""}
- Pacing rule: ${pacingHint}`;
      }

      const clientContext = client_values
        ? `\n\nCLIENT BRAND VOICE:\n${client_values}`
        : "";

      const systemPrompt = `You are writing a visual storyboard script for a Caption Video + Music Reel (Instagram Reels / TikTok).

This is NOT a talking-head video. It is a montage of short clips with text overlays synced to music.

OUTPUT FORMAT — alternating pairs, always in this order:
1. [filming] — Describe the clip to show: short, specific visual (e.g. "Show: hands typing on laptop, coffee nearby" or "Cut to: sunrise time-lapse over city")
2. [text_on_screen] — The caption that appears over that clip (3–8 words max, punchy, rhythmic)

STORY STRUCTURE (follow this arc):
hook (first 1–2 pairs) → tension/context → turning point → lesson → cta (last 1–2 pairs)

RULES
- ${pairsInstruction}
- Filming lines: short, visual, specific — describe a clip a creator would film themselves OR source from stock footage
- Captions: 3–8 words, punchy, rhythmic — no filler, no generic motivation ("believe in yourself", "you got this")
- Assign sections correctly: hook (opening pairs), body (middle), cta (closing pairs)
- First caption must create immediate curiosity
- Final caption: clear realization, lesson, or call to action
- Every line must earn its place
- CRITICAL: If a reference structure is provided, match its scene count EXACTLY

QUALITY CHECK (verify before returning)
1. Filming lines give a clear visual direction for each moment
2. Captions feel connected and tell a story arc
3. The hook pair creates immediate curiosity
4. The cta pair ends with clear purpose
5. Total pair count matches the target${pairTarget ? ` (${pairTarget} pairs)` : ""}`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        `Write the visual storyboard script for a caption video about: "${topic}"${visualTemplateContext}${audioCaptionContext}${clientContext}

Generate the full storyboard with alternating filming instructions and captions. Each pair = one [filming] line followed by one [text_on_screen] line.${pairTarget ? ` Generate EXACTLY ${pairTarget} pairs total.` : ""}`,
        [{
          name: "return_caption_script",
          description: "Return the visual storyboard script with interleaved filming instructions and caption text",
          input_schema: {
            type: "object",
            properties: {
              lines: {
                type: "array",
                description: "Alternating pairs: filming instruction followed by text_on_screen caption",
                items: {
                  type: "object",
                  properties: {
                    line_type: {
                      type: "string",
                      enum: ["text_on_screen", "filming"],
                      description: "filming = clip/visual instruction; text_on_screen = caption that appears on screen",
                    },
                    section: {
                      type: "string",
                      enum: ["hook", "body", "cta"],
                      description: "hook = opening pairs, body = middle, cta = closing pairs",
                    },
                    text: {
                      type: "string",
                      description: "For filming: short clip description (e.g. 'Show: hands typing on laptop'). For text_on_screen: 3-8 word caption.",
                    },
                  },
                  required: ["line_type", "section", "text"],
                },
              },
              idea_ganadora: {
                type: "string",
                description: "Ultra-short punchy title for the script (3-5 words max)",
              },
              target: {
                type: "string",
                description: "Target audience description",
              },
              formato: {
                type: "string",
                enum: ["CAPTION VIDEO"],
                description: "Always CAPTION VIDEO for this type",
              },
            },
            required: ["lines", "idea_ganadora", "target", "formato"],
          },
        }],
        { type: "tool", name: "return_caption_script" }
      );

      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (!toolUse) throw new Error("No tool use in Claude response");

      // Enforce 3-5 word limit on idea_ganadora
      if (toolUse.input.idea_ganadora) {
        const words = toolUse.input.idea_ganadora.split(/\s+/);
        if (words.length > 5) {
          toolUse.input.idea_ganadora = words.slice(0, 5).join(" ");
        }
      }

      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════
    // STEP: analyze-structure (Super Planning — free, bundled)
    // ══════════════════════════════════════════════════════════════
    if (step === "analyze-structure") {
      const { transcription, caption } = body;
      if (!transcription) throw new Error("transcription is required");

      const structureSystemPrompt = `You are an expert at deconstructing viral short-form video scripts into their structural building blocks.
Given a video transcription, break it down into 4–8 sections (hook, body, cta).
For each section identify:
1. The actual spoken text (actor_text) — verbatim or paraphrased from the transcription
2. A concrete visual/filming instruction (visual_cue) — what the viewer should SEE during this section
3. Which narrative section it belongs to: hook, body, or cta

Also detect the overall video format using EXACTLY one of these values:
- TALKING HEAD: One person speaking directly to camera, solo delivery
- COMPARATIVE DIALOGUE: Two or more people or voices contrasting mindsets/behaviors (avg vs top performer, wrong vs right way, before vs after) — even if one person is playing both roles
- INTERVIEW: Host and guest conversational Q&A format
- B-ROLL CAPTION: No speaking voice — only visual footage with text overlays
- VOICEOVER: Narrated footage, voiceover-driven storytelling (no on-camera speaker)
- MIXED: Mixed format or doesn't fit cleanly above

Also return format_notes: 1-2 sentences describing the specific structural pattern of this video. Example: "Two people alternate contrasting mindset statements per body section. Each section has one below-average rep line then one top-performer line."`;

      const analyzeData = await callClaude(
        ANTHROPIC_API_KEY,
        structureSystemPrompt,
        `Analyze this video transcription and break it into structured sections:
${caption ? `Caption: "${caption}"\n` : ""}
Transcription:
"""${transcription.slice(0, 4000)}"""`,
        [{
          name: "return_structure",
          description: "Return the structural breakdown of the video",
          input_schema: {
            type: "object",
            properties: {
              detected_format: { type: "string", enum: ["TALKING HEAD", "COMPARATIVE DIALOGUE", "INTERVIEW", "B-ROLL CAPTION", "VOICEOVER", "MIXED"] },
              format_notes: { type: "string", description: "1-2 sentences describing the specific structural pattern of this video (e.g. speaker count, contrast style, pacing pattern)" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    section: { type: "string", enum: ["hook", "body", "cta"] },
                    actor_text: { type: "string", description: "The spoken/written text for this section" },
                    visual_cue: { type: "string", description: "What should be visually happening (filming direction)" },
                  },
                  required: ["section", "actor_text", "visual_cue"],
                },
              },
            },
            required: ["detected_format", "sections"],
          },
        }],
        { type: "tool", name: "return_structure" }
      );

      const structureToolUse = analyzeData.content?.find((c: any) => c.type === "tool_use");
      if (!structureToolUse) throw new Error("No tool use in Claude response");

      return new Response(JSON.stringify(structureToolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step: generate-hooks ───
    if (step === "generate-hooks") {
      const { topic, previousHooks } = body;
      if (!topic?.trim()) return errorResponse("topic is required for generate-hooks");

      // Curated subset of ~70 proven viral hook formulas (10 per category)
      const FORMULA_BANK = `
EDUCATIONAL:
- "Here's exactly how much (insert action/item) you need to (insert result)"
- "It took me 10 years to learn this but I'll teach it to you in less than 1 minute"
- "(Insert number) things I wish I knew before (insert action)"
- "Stop (insert action) if you want to (insert result)"
- "The real reason why (insert topic) is (insert revelation)"
- "Most people don't know this about (insert topic)"
- "I tested (insert thing) for (insert time) — here's what happened"
- "The biggest mistake people make with (insert topic)"
- "Why (insert common belief) is actually wrong"
- "Here's a hack for (insert topic) that actually works"

COMPARISON:
- "This is an (insert noun), and this is an (insert noun)"
- "For this (insert item) you could have all of these (insert item)"
- "(Insert option A) vs (insert option B) — which is actually better?"
- "What (insert $) gets you at (insert place A) vs (insert place B)"
- "I compared (insert thing A) and (insert thing B) so you don't have to"
- "Everyone chooses (insert option A) but (insert option B) is actually better"
- "The difference between (insert level A) and (insert level B)"
- "What most people use vs what professionals use for (insert topic)"
- "I tried the cheap version vs the expensive version of (insert item)"
- "(Insert thing) then vs now — the difference is insane"

MYTH BUSTING:
- "This is why doing (insert action) makes you (insert pain point)"
- "Stop using (insert item) for (insert result)"
- "Everything you've been told about (insert topic) is wrong"
- "No, (insert common advice) does NOT (insert claimed result)"
- "(Insert popular thing) is actually ruining your (insert area)"
- "The (insert topic) industry doesn't want you to know this"
- "I used to believe (insert myth) until I discovered (insert truth)"
- "Why (insert popular advice) is the worst thing you can do"
- "3 (insert topic) myths that are costing you (insert consequence)"
- "If you're still (insert action), you need to hear this"

STORYTELLING:
- "I started my (insert business) when I was (insert age) with (insert $)"
- "X years ago my (insert person) told me (insert quote)"
- "I was (insert bad situation) until I discovered (insert solution)"
- "Nobody believed me when I said (insert claim) — here's what happened"
- "The moment that changed everything for my (insert area)"
- "I almost gave up on (insert goal) but then (insert turning point)"
- "Here's the story of how I went from (insert before) to (insert after)"
- "My (insert person) thought I was crazy when I (insert action)"
- "The worst advice I ever received about (insert topic)"
- "I failed at (insert thing) (insert number) times before this worked"

RANDOM:
- "POV: you're a (insert role) and (insert scenario)"
- "Things that just hit different when (insert situation)"
- "Tell me you're a (insert identity) without telling me you're a (insert identity)"
- "Nobody talks about (insert topic) and it shows"
- "This is your sign to (insert action)"
- "Unpopular opinion: (insert hot take about topic)"
- "If (insert topic) was a person, they'd be (insert comparison)"
- "Day (insert number) of (insert challenge) until (insert goal)"
- "Ranking (insert things) from worst to best"
- "Watch this before you (insert action)"

AUTHORITY:
- "My (insert before state) used to look like this and now they look like this"
- "10 YEARS it took me from (insert before state) to (insert after state)"
- "After (insert number) years of (insert expertise), here's my honest advice"
- "I've (insert credential/achievement) — here's what nobody tells you"
- "As a (insert profession) for (insert years), this is what I recommend"
- "I've helped (insert number) people (insert result) — this is the #1 thing that works"
- "Most (insert professionals) won't tell you this"
- "After working with (insert number)+ clients, I can tell you (insert insight)"
- "The advice I give to every (insert audience) who (insert situation)"
- "I built a (insert achievement) by doing this one thing differently"

DAY IN THE LIFE:
- "We all have the same 24 hours in a day so here I am putting my 24 hours to work"
- "A day in the life of a (insert profession) in (insert location)"
- "What a (insert $amount/timeframe) day looks like as a (insert profession)"
- "Come to work with me as a (insert profession)"
- "How I spend my mornings as a (insert profession)"
- "Behind the scenes of running a (insert business/practice)"
- "What most people don't see about being a (insert profession)"
- "5 AM to 10 PM — a realistic day in my life as a (insert profession)"
- "The part of my job nobody talks about"
- "This is what (insert time period) of hard work actually looks like"
`;

      // Build anti-repetition clause
      let avoidClause = "";
      if (Array.isArray(previousHooks) && previousHooks.length > 0) {
        const capped = previousHooks.slice(-20);
        avoidClause = `\n\nIMPORTANT — Do NOT reuse these formula structures (already generated):\n${capped.map((h: string) => `- "${h}"`).join("\n")}\n`;
      }

      const hooksSystem = `You are a creative hook writer for short-form social media scripts.
Below are proven viral hook FORMULAS organized by category. Choose the ones that fit BEST for the given topic — only pick formulas where the topic naturally fills the placeholders. Do NOT force a formula that doesn't fit. Each hook must use a DIFFERENT formula structure.${avoidClause}

${FORMULA_BANK}

Return a JSON tool call only — no prose.`;

      const hooksUserPrompt = `Topic: "${topic}"

Pick the 3-7 best-fitting formulas from the bank above and adapt them by filling in the placeholders with topic-specific content. Only include formulas that genuinely fit — do not force a formula just to reach a count.`;

      const hooksTools = [{
        name: "return_hooks",
        description: "Return 3-7 hooks based on proven viral formulas",
        input_schema: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", enum: ["educational", "comparison", "mythBusting", "storytelling", "random", "authority", "dayInTheLife"] },
                  text: { type: "string" },
                },
                required: ["category", "text"],
              },
              minItems: 3,
              maxItems: 7,
            },
          },
          required: ["hooks"],
        },
      }];

      const hooksData = await callClaude(
        ANTHROPIC_API_KEY,
        hooksSystem,
        hooksUserPrompt,
        hooksTools,
        { type: "tool", name: "return_hooks" },
        "claude-haiku-4-5-20251001",
      );

      const hookToolUse = hooksData.content?.find((b: any) => b.type === "tool_use");
      if (!hookToolUse) return errorResponse("Failed to generate hooks");
      const hooksResult = hookToolUse.input as { hooks: Array<{ category: string; text: string }> };

      return new Response(JSON.stringify({ hooks: hooksResult.hooks }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ─── Step: generate-ctas ───
    if (step === "generate-ctas") {
      const { topic } = body;
      if (!topic?.trim()) return errorResponse("topic is required for generate-ctas");

      const ctasSystem = `You are a CTA (call-to-action) writer for short-form social media scripts.
Generate exactly 3 distinct CTA options for the given topic.
Each CTA must be action-oriented, specific, under 15 words, and feel natural at the end of a video.
Return a JSON tool call only — no prose.`;

      const ctasUserPrompt = `Topic/action: "${topic}"\n\nGenerate 3 strong CTA options.`;

      const ctasTools = [{
        name: "return_ctas",
        description: "Return 3 CTA options",
        input_schema: {
          type: "object",
          properties: {
            ctas: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: ["ctas"],
        },
      }];

      const ctasData = await callClaude(
        ANTHROPIC_API_KEY,
        ctasSystem,
        ctasUserPrompt,
        ctasTools,
        { type: "tool", name: "return_ctas" },
        "claude-haiku-4-5-20251001",
      );

      const ctaToolUse = ctasData.content?.find((b: any) => b.type === "tool_use");
      if (!ctaToolUse) return errorResponse("Failed to generate CTAs");
      const ctasResult = ctaToolUse.input as { ctas: string[] };

      return new Response(JSON.stringify({ ctas: ctasResult.ctas }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ══════════════════════════════════════════════════════════════
    // STEP: canvas-generate (Super Planning — 5 credits)
    // ══════════════════════════════════════════════════════════════
    if (step === "canvas-generate") {
      const {
        transcriptions,
        structures,
        text_notes,
        research_facts,
        primary_topic,
        format: canvasFormat,
        language: canvasLang,
        clientContext,
        conversationMessages,
        selected_hook,
        selected_hook_category,
        brand_guide,
        selected_cta,
        video_analyses,
        competitor_profiles,
      } = body;

      const langLabel = canvasLang === "es" ? "SPANISH (Latin American)" : "ENGLISH";
      const formatKey = (canvasFormat || "talking_head").toLowerCase().replace(/[\s\-]/g, "_");
      const formatLabel = canvasFormat ? canvasFormat.toUpperCase().replace(/_/g, " ") : "TALKING HEAD";

      const factsSection = (research_facts || []).length > 0
        ? `\n<research_facts>\nUse these shock-value facts in the script body:\n${(research_facts as any[]).map((f: any, i: number) => `${i + 1}. ${f.fact}`).join("\n")}\n</research_facts>`
        : "";

      const transcriptSection = (transcriptions || []).length > 0
        ? `\n<reference_transcriptions>\nThis is the SPOKEN WORD reference. Match the same tempo, word count, rhythm, and delivery style:\n${(transcriptions as string[]).map((t: string, i: number) => `Reference ${i + 1}:\n"""${t.slice(0, 6000)}"""`).join("\n\n")}\n</reference_transcriptions>`
        : "";

      // Count sections for enforcement (filter nulls — frontend sends null for nodes without structure yet)
      const validStructures = (structures || []).filter(Boolean);
      const refSectionCount = validStructures.reduce((acc: number, s: any) => acc + (s.sections || []).length, 0);
      const refSectionTypes = validStructures.flatMap((s: any) => (s.sections || []).map((sec: any) => sec.section));
      const hasHook = refSectionTypes.includes("hook");
      const hasBody = refSectionTypes.includes("body");
      const hasCta = refSectionTypes.includes("cta");
      const sectionEnforcement = refSectionCount > 0
        ? `\nSTRICT REQUIREMENT: Your script MUST have exactly the same section breakdown as the reference: ${hasHook ? "HOOK" : ""}${hasBody ? " + BODY" : ""}${hasCta ? " + CTA" : ""} (${refSectionCount} total sections). Match the approximate word count and line count of each section from the reference.`
        : "";

      const structureSection = validStructures.length > 0
        ? `\n<reference_structures>\n⚠️ THIS IS THE #1 PRIORITY — YOUR SCRIPT MUST MATCH THIS SKELETON EXACTLY.\nDetected format: ${validStructures[0]?.detected_format || "unknown"}.${validStructures[0]?.format_notes ? `\nFormat pattern: ${validStructures[0].format_notes}` : ""}\nReplicate this exact section-by-section breakdown — same number of sections, same line count per section, same visual cue style, same pacing:${sectionEnforcement}\n\n${validStructures.map((s: any, i: number) => `Reference ${i + 1} (${s.detected_format}):\n${(s.sections || []).map((sec: any) => `[${sec.section.toUpperCase()}] "${sec.actor_text}" | Visual: ${sec.visual_cue}`).join("\n")}`).join("\n\n")}\n</reference_structures>`
        : "";

      const notesSection = text_notes
        ? `\n<creator_notes>\nCORE CONTENT & INSTRUCTIONS — This is the primary source material. Use everything here as the foundation of the script (topic, talking points, research, brand voice, directions):\n${text_notes}\n</creator_notes>`
        : "";

      const hookSection = selected_hook
        ? `\n<required_hook>\n⚠️ MANDATORY OPENING: The script MUST start with this exact hook (adapt topic words only, preserve the sentence pattern):\n"${selected_hook}"\nHook style: ${selected_hook_category || "general"}\n</required_hook>`
        : "";

      const brandSection = brand_guide
        ? `\n<brand_constraints>\n⚠️ MANDATORY BRAND RULES — violating these will make the script unusable:\n- Tone: ${brand_guide.tone || "not specified"} — write in this tone throughout\n- Brand values to embody: ${brand_guide.brand_values || "none"}\n- FORBIDDEN words/phrases (NEVER use): ${(brand_guide.forbidden_words || "none").split("\n").join(", ")}\n- Tagline to incorporate if natural: "${brand_guide.tagline || ""}"\n</brand_constraints>`
        : "";

      const ctaSection = selected_cta
        ? `\n<required_cta>\n⚠️ MANDATORY ENDING: The script MUST end with this exact CTA as the final actor line:\n"${selected_cta}"\nDo NOT modify it. Use verbatim.\n</required_cta>`
        : "";

      const clientSection = clientContext
        ? `\n<client_context>\n${clientContext}\n</client_context>`
        : "";

      const competitorSection = Array.isArray(competitor_profiles) && competitor_profiles.length > 0
        ? `\n<competitor_analysis>\nUse these competitor insights to understand what hooks and themes are proven to work for this audience. When generating the script, reference these patterns as inspiration only — do NOT copy competitor content.\n${
            competitor_profiles.map((cp: any) => {
              const best = cp.top_posts?.[0];
              return `@${cp.username}:\n- Proven hook patterns: ${(cp.hook_patterns || []).join(", ") || "not analyzed"}\n- Top content themes: ${(cp.content_themes || []).join(", ") || "not analyzed"}${best ? `\n- Best post (${best.outlier_score?.toFixed(1)}x, ${best.views?.toLocaleString()} views): "${(best.caption || "").slice(0, 120)}"` : ""}`;
            }).join("\n\n")
          }\n</competitor_analysis>`
        : "";

      const conversationSection = Array.isArray(conversationMessages) && conversationMessages.length > 0
        ? `\n<approved_direction>\n⚠️ CRITICAL: The creator already discussed and APPROVED a specific script direction in this chat. Your generated script MUST follow this approved direction exactly. Do NOT deviate:\n${(conversationMessages as any[]).map((m: any) => `${m.role === "user" ? "Creator" : "AI"}: ${m.content}`).join("\n")}\n</approved_direction>`
        : "";

      const visualSection = Array.isArray(video_analyses) && video_analyses.length > 0
        ? `\n<visual_analysis>\nThese are the actual visual scenes extracted from the reference video(s) using AI frame analysis. Use them as the scene-by-scene VISUAL TEMPLATE for the new script:\n${
            (video_analyses as any[]).map((va: any, i: number) => {
              const lines = [`Video ${i + 1} (${va.detected_format || "unknown format"}):`];
              (va.visual_segments || []).forEach((seg: any) => {
                const tos = seg.text_on_screen?.length
                  ? ` | TEXT ON SCREEN: "${(seg.text_on_screen as string[]).join(" / ")}"`
                  : "";
                lines.push(`  [${seg.start}s–${seg.end}s] ${seg.description}${tos}`);
              });
              if (va.audio) {
                lines.push(`  Audio: music=${va.audio.has_music}, energy=${va.audio.energy}, speech=${va.audio.speech_density}`);
              }
              return lines.join("\n");
            }).join("\n\n")
          }\n</visual_analysis>`
        : "";

      const canvasSystemPrompt = `<system_instructions>
<job>You are a world-class script writer for short-form social media videos.</job>
<goal>To create the highest quality content that goes viral every single time.</goal>
<style_guide>
- Write in a conversational, informal, and friendly tone.
- Use short, punchy sentences to create a fast-paced cadence.
- Use simple language that anyone can understand.
- Avoid jargon and technical terms.
- NEVER use em dashes (—). Replace with a comma, a period, or a new line.
- NEVER use corporate jargon. Banned words: leverage, synergy, utilize, streamline, robust, scalable, game-changer, innovative, cutting-edge, value proposition, pain points, paradigm shift, holistic, actionable, deliverable.
- Write like texting a smart friend. If a 14-year-old would not understand a word, replace it.
- Sound like human-written content. You must not sound like AI-generated content.
- Use a first-person tone, as if you are speaking to a friend.
- No fluff or wasted words. Be concise and to the point.
- For actor lines: output one sentence per line.
- IMPORTANT: When reference transcriptions and structures are provided from connected video nodes, they are FORMAT TEMPLATES. The new script MUST follow the same structure, section count, pacing, rhythm, and visual approach as the reference. Think of the reference as the mold — pour new topic content into the same mold.
- IMPORTANT: The reference structures only contain the sections the user SELECTED (hook, body, cta). If only hook sections are shown, only use the hook as template. If all sections are shown, template the whole thing.
- IMPORTANT: Creator notes (text notes) are CORE CONTENT — they contain the actual topic, talking points, research, brand voice, and instructions. USE everything in the notes as the foundation of the script.
- IMPORTANT: When <visual_analysis> is present, use the visual scenes as the scene-by-scene template. Keep the same visual pacing, cut timing, and text-overlay pattern — substitute only the topic/values from creator notes. For example if the reference shows TEXT ON SCREEN: "18 years old" and the client is a D2D sales rep aged 23, generate TEXT ON SCREEN: "23 years old". Always output on-screen text content as line_type: "text_on_screen".
- IMPORTANT: For B-roll/caption videos (audio: music=true, speech=low), generate lines primarily as filming, text_on_screen, and editor. Only use actor line_type if the reference video has spoken dialogue.
- IMPORTANT: For talking-head videos, use visual segments to enrich filming directions with actual camera framing and shot timing from the reference (close-up, mid-shot, cut timing, etc.).
</style_guide>
</system_instructions>

You must categorize EVERY line into:
- line_type: "filming" (camera/visual instructions), "actor" (spoken dialogue/voiceover), "editor" (post-production effects like transitions, zoom, speed ramp — NOT text overlays), or "text_on_screen" (ANY on-screen caption, overlay text, or subtitle that appears visually on the video)
- section: "hook" (opening), "body" (main content), or "cta" (call-to-action closing)

⚠️ CRITICAL RULE: Any line that contains text meant to appear ON SCREEN (captions, overlays, subtitles, titles) MUST use line_type "text_on_screen" — NEVER "editor". The "editor" type is ONLY for post-production effects (cuts, transitions, zoom, speed changes, color grading). If you write "TEXT ON SCREEN:" in a line, it MUST be text_on_screen type.

<quality_checklist>
Before finalizing the script, check every item below and adjust until ALL pass:
1. NO JARGON: Every word is plain English a 14-year-old understands.
2. NO EM DASHES: Zero em dashes in the entire script.
3. TAM LARGE ENOUGH: The topic and angle appeal to a broad audience, not an ultra-niche group.
4. REHOOK PRESENT: There is a moment mid-body that re-engages viewers about to scroll away.
5. TEMPLATE MATCH: If reference video structures are provided, the section count, rhythm, and pacing match exactly.
6. STORY MAKES SENSE: Hook → Body → CTA flows logically with no confusing jumps.
7. AUDIENCE CAN FOLLOW: No assumed knowledge. Concepts are explained simply on first mention.
</quality_checklist>

Return a virality_score (1-10) averaging: TAM, explosivity, emotional resonance, novelty, value tease, curiosity hook, absorption, rehook, stickiness, template_fidelity (how well the script follows reference video structure), story_clarity (logical flow hook→body→CTA).

Write in ${langLabel}. Format: ${formatLabel}.
For idea_ganadora: STRICT MAXIMUM 3-5 words — short punchy title only.`;

      const canvasUserPrompt = `<task>Write a compelling viral short-form video script (~45 seconds / 90-120 words) based on all the context below. ${refSectionCount > 0 ? `YOUR SCRIPT MUST MATCH THE REFERENCE STRUCTURE — same sections, same tempo, same size.` : ""}</task>

<topic>${primary_topic || "Based on the provided context"}</topic>
${conversationSection}${structureSection}${transcriptSection}${notesSection}${hookSection}${brandSection}${ctaSection}${factsSection}${clientSection}${competitorSection}${visualSection}`;

      const canvasScriptTools = [{
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
                  line_type: { type: "string", enum: ["filming", "actor", "editor", "text_on_screen"] },
                  section: { type: "string", enum: ["hook", "body", "cta"] },
                  text: { type: "string" },
                },
                required: ["line_type", "section", "text"],
              },
            },
            idea_ganadora: { type: "string", description: "Ultra-short punchy title — STRICT MAXIMUM 3-5 words" },
            target: { type: "string", description: "Target audience" },
            formato: { type: "string", enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"] },
            virality_score: { type: "number", description: "Average score (1-10) across all 11 quality criteria: TAM, explosivity, emotional resonance, novelty, value tease, curiosity hook, absorption, rehook, stickiness, template_fidelity (how well the script follows reference video structure), story_clarity (logical flow hook→body→CTA)" },
          },
          required: ["lines", "idea_ganadora", "target", "formato", "virality_score"],
        },
      }];

      const canvasData = await callClaude(
        ANTHROPIC_API_KEY,
        canvasSystemPrompt,
        canvasUserPrompt,
        canvasScriptTools,
        { type: "tool", name: "return_script" },
        "claude-sonnet-4-6"
      );

      const canvasToolUse = canvasData.content?.find((c: any) => c.type === "tool_use");
      if (!canvasToolUse) throw new Error("No tool use in canvas-generate response");

      // Ensure lines is always an array (Claude may occasionally return malformed data)
      if (!Array.isArray(canvasToolUse.input.lines)) {
        console.error("canvas-generate: lines is not an array, got:", typeof canvasToolUse.input.lines);
        canvasToolUse.input.lines = [];
      }

      // Auto-correct misclassified text_on_screen lines (Claude sometimes puts them as "editor")
      for (const line of canvasToolUse.input.lines) {
        if (line.line_type === "editor" && /text\s*on\s*screen/i.test(line.text)) {
          line.line_type = "text_on_screen";
          // Strip the "TEXT ON SCREEN:" prefix if present — the line_type label already shows it
          line.text = line.text.replace(/^TEXT\s*ON\s*SCREEN\s*:\s*/i, "").replace(/^["']|["']$/g, "");
        }
      }

      if (canvasToolUse.input.idea_ganadora) {
        const words = canvasToolUse.input.idea_ganadora.split(/\s+/);
        if (words.length > 5) canvasToolUse.input.idea_ganadora = words.slice(0, 5).join(" ");
      }

      return new Response(JSON.stringify(canvasToolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== STEP: ANALYZE COMPETITOR POST ====================
    if (step === "analyze-competitor-post") {
      const { caption, views, engagement_rate, outlier_score } = body;

      const systemPrompt = `You are a viral content strategist. Analyze this Instagram reel's caption and performance metrics and explain why it performed well. Be direct, plain, and specific. No jargon.`;

      const captionText = caption || "(no caption)";
      const userPrompt = `Caption: "${captionText}"
Views: ${(views || 0).toLocaleString()}
Engagement rate: ${typeof engagement_rate === "number" ? engagement_rate.toFixed(2) : "0"}%
Outlier score: ${typeof outlier_score === "number" ? outlier_score.toFixed(1) : "0"}x (relative to channel average)

Analyze this post and return structured insights.`;

      const data = await callClaude(
        ANTHROPIC_API_KEY,
        systemPrompt,
        userPrompt,
        [{
          name: "return_analysis",
          description: "Return the competitor post analysis",
          input_schema: {
            type: "object",
            properties: {
              hook_type: {
                type: "string",
                enum: ["educational", "authority", "story", "comparison", "shock", "random"],
                description: "The type of hook used in this post",
              },
              content_theme: {
                type: "string",
                description: "2-3 word topic label for what this post is about",
              },
              why_it_worked: {
                type: "string",
                description: "2-3 sentences in plain English explaining why this post got high views. No jargon.",
              },
              pattern: {
                type: "string",
                description: "The reusable structural pattern, e.g. 'Specific number + timeframe + result'",
              },
            },
            required: ["hook_type", "content_theme", "why_it_worked", "pattern"],
          },
        }],
        { type: "tool", name: "return_analysis" },
        "claude-haiku-4-5-20251001"
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
