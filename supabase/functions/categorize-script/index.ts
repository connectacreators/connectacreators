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

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Gate AI categorization (Anthropic spend) to admin + Connecta+ callers only.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const allowedRoles = new Set(["admin", "connecta_plus"]);
  const isAllowed = (roleRows ?? []).some((r: { role: string }) => allowedRoles.has(r.role));
  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error: "AI categorization is available on Connecta+ only." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // ── Recolor mode: re-classify EXISTING lines without re-splitting. ──
    // Input: { mode: "recolor", lines: string[] }
    // Output: { types: ("filming"|"actor"|"editor"|"text_on_screen")[] } index-aligned.
    if (body?.mode === "recolor") {
      const lines = body.lines;
      if (!Array.isArray(lines) || lines.length === 0 || !lines.every((l: unknown) => typeof l === "string")) {
        return new Response(JSON.stringify({ error: "lines (string[]) is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const recolorSystem = `You are a script line classifier for short-form video production. You will receive the script's content lines as a numbered list. Classify EACH line into exactly one of four types:
- "filming": on-set camera/filming instructions (angles, lighting, camera movement, locations, what to physically shoot)
- "actor": dialogue or voiceover — the actual words the talent speaks on camera or in voiceover
- "editor": post-production instructions (music, sound effects, B-roll inserts, transitions/effects added in editing, notes to the editor)
- "text_on_screen": on-screen caption/overlay text shown to the viewer but NOT spoken — short punchy words or phrases meant to appear as text on the video

Rules:
- Return an array "types" with EXACTLY one entry per input line, in the SAME ORDER and the SAME COUNT as the input.
- Do NOT add, merge, split, reorder, or skip any line.
- If a line is spoken aloud by the talent, it is "actor" even if it is short.
- Only use "text_on_screen" for text that appears on screen and is not spoken.`;

      const numbered = lines.map((l: string, i: number) => `${i + 1}. ${l}`).join("\n");

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: recolorSystem,
          messages: [
            {
              role: "user",
              content: `Classify each of these ${lines.length} script lines. Return exactly ${lines.length} types in order:\n\n${numbered}`,
            },
          ],
          tools: [
            {
              name: "recolor_lines",
              description: "Return one line type per input line, index-aligned.",
              input_schema: {
                type: "object",
                properties: {
                  types: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["filming", "actor", "editor", "text_on_screen"],
                    },
                    description: `Exactly ${lines.length} entries, one per input line, in order.`,
                  },
                },
                required: ["types"],
                additionalProperties: false,
              },
            },
          ],
          tool_choice: { type: "tool", name: "recolor_lines" },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (resp.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const t = await resp.text();
        console.error("AI error (recolor):", resp.status, t);
        throw new Error("AI gateway error");
      }

      const rdata = await resp.json();
      const rtool = (rdata.content || []).find((b: any) => b.type === "tool_use");
      if (!rtool?.input?.types || !Array.isArray(rtool.input.types)) {
        console.error("No recolor tool use:", JSON.stringify(rdata));
        throw new Error("AI did not return structured data");
      }

      return new Response(JSON.stringify({ types: rtool.input.types }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Default: first-creation full analysis from raw script text. ──
    const { rawScript } = body;
    if (!rawScript || typeof rawScript !== "string") {
      return new Response(JSON.stringify({ error: "rawScript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Analyze this script and extract metadata + categorize lines:\n\n${rawScript}`,
            },
          ],
          tools: [
            {
              name: "categorize_script",
              description:
                "Return extracted metadata and categorized script lines as structured data",
              input_schema: {
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
          ],
          tool_choice: { type: "tool", name: "categorize_script" },
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
    const messageContent = data.content || [];
    let parsed;

    // Find the tool use block in the response
    const toolUseBlock = messageContent.find((block: any) => block.type === "tool_use");
    if (toolUseBlock && toolUseBlock.input) {
      parsed = toolUseBlock.input;
    } else {
      console.error("No tool use block in response:", JSON.stringify(data));
      throw new Error("AI did not return structured data");
    }

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
