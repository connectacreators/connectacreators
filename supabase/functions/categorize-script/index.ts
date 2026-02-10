import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const systemPrompt = `You are a script analysis assistant for video production. Given a raw script, you must categorize EVERY line into one of three types:

- "filming": Camera/filming instructions (angles, lighting, transitions, locations, visual directions)
- "actor": Dialogue, voiceover, or anything the talent/actor says on camera
- "editor": Post-production instructions (text overlays, music, effects, B-roll inserts, transitions added in editing)

Return a JSON array where each element has:
- "line_type": one of "filming", "actor", "editor"
- "text": the original text of that line

Rules:
- Every non-empty line must be categorized
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
              content: `Categorize each line of this script:\n\n${rawScript}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "categorize_lines",
                description:
                  "Return categorized script lines as structured data",
                parameters: {
                  type: "object",
                  properties: {
                    lines: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          line_type: {
                            type: "string",
                            enum: ["filming", "actor", "editor"],
                          },
                          text: { type: "string" },
                        },
                        required: ["line_type", "text"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["lines"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "categorize_lines" },
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
