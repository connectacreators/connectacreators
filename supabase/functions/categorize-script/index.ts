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

    // ── Recolor mode: content-aware re-split + re-classify EXISTING blocks. ──
    // Input: { mode: "recolor", blocks: string[] } — each block is the RAW,
    // unsplit text of one existing content block (no client-side pre-split).
    // Output: { blocks: [{ lines: [{ text, line_type }] }] }, one group per
    // input block, in order.
    //
    // Previously the client pre-split each block into "sentences" via a
    // deterministic regex (splitSentences.ts) BEFORE this ever saw it, then
    // this only classified the type of each already-fixed piece. That regex
    // only understands grammar (periods + capital letters) — it has no idea
    // a sentence contains an embedded filming direction that should be its
    // own line, or that two short clauses are one continuous voiceover beat
    // that shouldn't be split just because there's a period between them.
    // Now the model itself decides BOTH where a block should split into
    // production-meaningful lines AND what each resulting line is — the
    // whole point being it understands "this is dialogue" vs "this is a
    // camera direction," not just punctuation.
    //
    // Splitting is the risky part (classification alone never touches the
    // text), so every block's result is verified server-side: the returned
    // lines must reconstruct the original block's text exactly (whitespace
    // aside). A block that fails this check is NOT trusted to split — it's
    // kept as a single unsplit line instead (same "when a cut is uncertain,
    // do not cut" philosophy the old regex splitter used), reusing whatever
    // line_type the model assigned to that block's first attempted line
    // rather than discarding the classification too.
    if (body?.mode === "recolor") {
      const blocks = body.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0 || !blocks.every((b: unknown) => typeof b === "string")) {
        return new Response(JSON.stringify({ error: "blocks (string[]) is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const recolorSystem = `You are segmenting and classifying a short-form video script for production. You will receive the script's content as numbered BLOCKS of raw text — each block may already contain multiple sentences or thoughts run together.

For EACH block, decide the natural line breaks. A "line" is ONE production beat: one continuous voiceover/dialogue thought, OR one filming instruction, OR one editor/post-production note — NOT necessarily one grammatical sentence. A sentence with an embedded camera direction should split into two lines (the spoken part and the direction); two short spoken clauses that are really one continuous thought should STAY as one line even if a period separates them.

Then classify each resulting line into exactly one of four types:
- "filming": on-set camera/filming instructions (angles, lighting, camera movement, locations, what to physically shoot)
- "actor": dialogue or voiceover — the actual words the talent speaks on camera or in voiceover
- "editor": post-production instructions (music, sound effects, B-roll inserts, transitions/effects added in editing, notes to the editor)
- "text_on_screen": on-screen caption/overlay text shown to the viewer but NOT spoken — short punchy words or phrases meant to appear as text on the video

ABSOLUTE RULE — verbatim text only: every line's "text" must be an exact, unbroken substring of its original block (leading/trailing whitespace may be trimmed, nothing else changed). Concatenating a block's lines back together (ignoring whitespace) must reproduce that block's original text exactly. Do NOT paraphrase, correct, add, or drop a single word — you are only choosing WHERE to cut and WHAT each piece is, never rewriting.

- If a line is spoken aloud by the talent, it is "actor" even if it is short.
- Only use "text_on_screen" for text that appears on screen and is not spoken.
- A block that's already a single beat returns one line — do not split just to split.`;

      const numbered = blocks.map((b: string, i: number) => `Block ${i + 1}:\n${b}`).join("\n\n");

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
              content: `Segment and classify these ${blocks.length} blocks. Return exactly ${blocks.length} block groups, in order, each containing that block's resulting lines:\n\n${numbered}`,
            },
          ],
          tools: [
            {
              name: "recolor_blocks",
              description: "Return each block's resulting lines (verbatim text + type), index-aligned to the input blocks.",
              input_schema: {
                type: "object",
                properties: {
                  blocks: {
                    type: "array",
                    description: `Exactly ${blocks.length} entries, one per input block, in order.`,
                    items: {
                      type: "object",
                      properties: {
                        lines: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              text: { type: "string", description: "Verbatim substring of the original block." },
                              line_type: { type: "string", enum: ["filming", "actor", "editor", "text_on_screen"] },
                            },
                            required: ["text", "line_type"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["lines"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["blocks"],
                additionalProperties: false,
              },
            },
          ],
          tool_choice: { type: "tool", name: "recolor_blocks" },
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
      const resultBlocks = rtool?.input?.blocks;
      if (!Array.isArray(resultBlocks) || resultBlocks.length !== blocks.length) {
        console.error("No/mismatched recolor tool use:", JSON.stringify(rdata));
        throw new Error("AI did not return structured data");
      }

      const normalize = (s: string) => s.replace(/\s+/g, "");
      const finalBlocks = resultBlocks.map((result: any, i: number) => {
        const original = blocks[i] as string;
        const candidateLines = Array.isArray(result?.lines) ? result.lines : [];
        const reconstructed = candidateLines.map((l: any) => String(l?.text ?? "")).join("");
        if (candidateLines.length > 0 && normalize(reconstructed) === normalize(original)) {
          return {
            lines: candidateLines.map((l: any) => ({
              text: String(l.text).trim(),
              line_type: l.line_type,
            })),
          };
        }
        // Verbatim check failed — don't trust the split for this block.
        // Keep it as one unsplit line, but still use whatever type the
        // model guessed for its first attempted piece rather than
        // discarding classification along with the untrusted split.
        const fallbackType = candidateLines[0]?.line_type;
        const validTypes = new Set(["filming", "actor", "editor", "text_on_screen"]);
        return {
          lines: [{
            text: original.trim(),
            line_type: validTypes.has(fallbackType) ? fallbackType : "actor",
          }],
        };
      });

      return new Response(JSON.stringify({ blocks: finalBlocks }), {
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
