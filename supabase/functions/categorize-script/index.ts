import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate the caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { rawScript } = await req.json();
    if (!rawScript || typeof rawScript !== "string") {
      return new Response(JSON.stringify({ error: "rawScript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a script analysis assistant for video production. Given a raw script, you must:

1. Extract metadata from the script:
   - "idea_ganadora": The winning idea or hook of the video. Summarize it in one clear sentence if not explicitly stated.
   - "target": The target audience for this content. Infer from context if not explicitly stated. Common values: "Viral", "Educativo", "Ventas", etc.
   - "formato": The video format. Detect from the script structure or explicit mentions. Must be one of: "TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO". If not stated, infer from the script style (e.g. if there's mostly dialogue with camera directions = TALKING HEAD, if there's mostly B-roll and text overlays = B-ROLL CAPTION, if it's a Q&A = ENTREVISTA, if mixed = VARIADO).

2. Categorize EVERY line of the actual script content into one of three types:
   - "filming": Camera/filming instructions (angles, lighting, transitions, locations, visual directions)
   - "actor": Dialogue, voiceover, or anything the talent/actor says on camera
   - "editor": Post-production instructions (text overlays, music, effects, B-roll inserts, transitions added in editing)

3. IMPORTANT: Assign each line to one of three SECTIONS of the script:
   - "hook": The opening lines that grab attention (typically the first few lines)
   - "body": The main content/argument of the video (the bulk of the script)
   - "cta": The call-to-action or closing lines (typically the last few lines urging the viewer to act)
   Every script MUST have all three sections. If the script is very short, still divide it into hook, body, and cta.

Rules:
- If the script contains lines labeled "Idea Ganadora:", "Target:", "Formato:", or "Google Drive:", extract those values and do NOT include them in the categorized lines
- Every other non-empty line must be categorized
- If a line has a tag like [filming], [actor], [editor] etc., use it as a hint but still validate
- Lines without tags: use context to determine the type
- Dialogue/voiceover lines are "actor"
- Camera angles, lighting, movement = "filming"  
- Text overlays, music, effects, B-roll = "editor"
- When in doubt between filming and editor: if it happens during the shoot → filming, if it happens in post → editor`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Analyze this script and extract metadata + categorize lines:\n\n${rawScript}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "categorize_script",
                description:
                  "Return extracted metadata and categorized script lines as structured data",
                parameters: {
                  type: "object",
                  properties: {
                    idea_ganadora: {
                      type: "string",
                      description: "The winning idea/hook of the video",
                    },
                    target: {
                      type: "string",
                      description: "The target audience for this content",
                    },
                    formato: {
                      type: "string",
                      enum: ["TALKING HEAD", "B-ROLL CAPTION", "ENTREVISTA", "VARIADO"],
                      description: "The video format detected from the script",
                    },
                    lines: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          line_type: {
                            type: "string",
                            enum: ["filming", "actor", "editor"],
                          },
                          section: {
                            type: "string",
                            enum: ["hook", "body", "cta"],
                            description: "Which section of the script this line belongs to",
                          },
                          text: { type: "string" },
                        },
                        required: ["line_type", "section", "text"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["idea_ganadora", "target", "formato", "lines"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "categorize_script" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize-script error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
