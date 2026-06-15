import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "claude-haiku-4-5-20251001";
// Haiku 4.5 list price (USD per million tokens). Cache reads 0.1x, writes 1.25x.
const HAIKU_IN = 1.0, HAIKU_OUT = 5.0;

// Fire-and-forget usage logger. Self-contained (this fn is Haiku-only) so the
// edge function deploys as a single file. Uses a service-role client because
// anthropic_usage_log is not writable by the calling user. Never throws.
async function logCaptionUsage(usage: any, userId: string | null): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !usage) return;
    const inputTokens = usage.input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    if (inputTokens + cacheWrite + cacheRead + outputTokens === 0) return;
    const cost =
      ((inputTokens * HAIKU_IN + cacheWrite * HAIKU_IN * 1.25 + cacheRead * HAIKU_IN * 0.1) +
        outputTokens * HAIKU_OUT) / 1_000_000;
    const svc = createClient(url, key);
    const { error } = await svc.from("anthropic_usage_log").insert({
      user_id: userId,
      function_name: "generate-caption",
      model: MODEL,
      input_tokens: inputTokens,
      cache_creation_tokens: cacheWrite,
      cache_read_tokens: cacheRead,
      output_tokens: outputTokens,
      cost_usd: cost,
      metadata: null,
    });
    if (error) console.error("[generate-caption] usage log failed:", error.message);
  } catch (err) {
    console.error("[generate-caption] usage log threw:", err);
  }
}

// Strip em/en dashes (rule: no em dashes) and collapse the seams they leave behind.
function stripDashes(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

// One word, no spaces/punctuation, keeping unicode letters/numbers (accents ok).
function cleanHashtag(s: string): string {
  return s.replace(/^#+/, "").replace(/[^\p{L}\p{N}]/gu, "");
}

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

  // Gate caption generation (Anthropic spend) to admin + Connecta+ callers only.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const allowedRoles = new Set(["admin", "connecta_plus"]);
  const isAllowed = (roleRows ?? []).some((r: { role: string }) => allowedRoles.has(r.role));
  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error: "AI caption generation is available on Connecta+ only." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const scriptText: string = typeof body?.scriptText === "string" ? body.scriptText : "";
    const ctaText: string = typeof body?.ctaText === "string" ? body.ctaText : "";
    const title: string = typeof body?.title === "string" ? body.title : "";

    if (!scriptText.trim()) {
      return new Response(JSON.stringify({ error: "scriptText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const systemPrompt = `You write Instagram captions for short-form video. Given a video script, produce a caption optimized for Instagram with strong SEO using the keywords the video is actually about.

You MUST return exactly four parts via the tool:
1. "hook": A SHORT, punchy first-line hook sentence (max ~12 words). Little to no emojis — prefer none. It should make someone stop scrolling and relate to the topic.
2. "context": ONE line that adds context and naturally packs in the main SEO keywords/topics of the video (what someone would search for). Conversational, not a keyword dump.
3. "cta": A short call-to-action that tells the viewer to FOLLOW or to COMMENT a specific keyword. Base this on the script's actual call-to-action: if the script's CTA asks people to comment a word, save, share, follow, or DM, mirror that intent and reuse its keyword. If the script gives no clear CTA, default to asking them to follow for more on the topic.
4. "hashtags": EXACTLY 5 hashtags. Each must be a SINGLE word (no spaces), SEO-optimized for the video's topic. Return them WITHOUT the leading "#".

Hard rules:
- NEVER use em dashes (—) or en dashes (–) anywhere. Use commas or periods instead.
- Write in the SAME LANGUAGE as the script (if the script is in Spanish, write the caption in Spanish).
- Sound like a real person, not AI. No generic filler, no "dive into", no "unlock", no "elevate".
- Keep it tight. This is a caption, not an essay.`;

    const userContent = `${title ? `Video title/idea: ${title}\n\n` : ""}SCRIPT:\n${scriptText}\n\n${
      ctaText.trim()
        ? `The script's call-to-action lines are:\n${ctaText}\n\nUse these to shape the caption's CTA.`
        : `The script has no explicit call-to-action. Default the CTA to following for more on this topic.`
    }`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        tools: [
          {
            name: "write_caption",
            description: "Return the structured Instagram caption parts.",
            input_schema: {
              type: "object",
              properties: {
                hook: {
                  type: "string",
                  description: "Short first-line hook sentence, little to no emojis, no em dashes.",
                },
                context: {
                  type: "string",
                  description: "One context line packed with the video's SEO keywords.",
                },
                cta: {
                  type: "string",
                  description: "Call-to-action: follow or comment a keyword, based on the script's CTA.",
                },
                hashtags: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 5,
                  maxItems: 5,
                  description: "Exactly 5 single-word, SEO-optimized hashtags, without the leading #.",
                },
              },
              required: ["hook", "context", "cta", "hashtags"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "write_caption" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI error (generate-caption):", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    if (data?.usage) logCaptionUsage(data.usage, user.id);

    const tool = (data.content || []).find((b: any) => b.type === "tool_use");
    const input = tool?.input;
    if (!input || typeof input.hook !== "string") {
      console.error("No caption tool use:", JSON.stringify(data));
      throw new Error("AI did not return structured data");
    }

    const hook = stripDashes(input.hook || "");
    const context = stripDashes(input.context || "");
    const cta = stripDashes(input.cta || "");
    const hashtags = (Array.isArray(input.hashtags) ? input.hashtags : [])
      .map((h: unknown) => cleanHashtag(String(h ?? "")))
      .filter((h: string) => h.length > 0)
      .slice(0, 5)
      .map((h: string) => `#${h}`)
      .join(" ");

    // Assemble in the required format: hook, blank line, context, blank line, CTA,
    // blank line, hashtags.
    const caption = [hook, context, cta, hashtags].filter((p) => p.trim()).join("\n\n");

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-caption error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
