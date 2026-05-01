import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==================== WIZARD CONFIG MAPPING ====================
const WIZARD_CONFIGS: Record<string, { suggested_format: string; prompt_hint: string; use_transcript_as_template: boolean }> = {
  CAPTION_VIDEO_MUSIC: {
    suggested_format: "caption_video_music",
    prompt_hint: "This is a caption/music video. The story is told through short on-screen text cards, often synced to music beats. Write punchy, minimal text-card lines — typically 3-7 words per card.",
    use_transcript_as_template: false,
  },
  TALKING_HEAD: {
    suggested_format: "TALKING HEAD",
    prompt_hint: "This is a talking-head or voiceover video. Write direct, conversational spoken lines as if a person is speaking to or about the topic.",
    use_transcript_as_template: true,
  },
};

// ==================== STAGE 1: CAPTION HEURISTICS ====================
function analyzeCaption(caption: string | null): { format: string | null; confidence: number } {
  if (!caption || caption.trim().length === 0) {
    return { format: null, confidence: 0 };
  }

  const words = caption.trim().split(/\s+/);
  const hashtagWords = words.filter((w) => w.startsWith("#"));
  const nonHashtagWords = words.filter((w) => !w.startsWith("#") && w.length > 1);
  const hashtagRatio = words.length > 0 ? hashtagWords.length / words.length : 0;
  const nonHashtagCount = nonHashtagWords.length;

  // Strong CAPTION_VIDEO_MUSIC signal: almost entirely hashtags, almost no readable text
  if (nonHashtagCount < 5 && hashtagRatio > 0.6) {
    return { format: "CAPTION_VIDEO_MUSIC", confidence: 0.55 };
  }

  // Strong TALKING_HEAD signal: substantial caption text
  if (nonHashtagCount > 50) {
    return { format: "TALKING_HEAD", confidence: 0.60 };
  }

  // Ambiguous — proceed to vision
  return { format: null, confidence: 0 };
}

// ==================== STAGE 2: VISION CLASSIFICATION ====================
async function classifyWithVision(
  thumbnailUrl: string,
  caption: string | null,
  anthropicKey: string
): Promise<{ format: string; confidence: number; reason: string }> {
  const captionText = caption ? caption.slice(0, 300) : "(no caption)";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: thumbnailUrl,
              },
            },
            {
              type: "text",
              text: `You are a video format classifier for short-form social media videos (Instagram Reels / TikTok).

Given the thumbnail image above and the video caption below, classify this video into ONE format:

- CAPTION_VIDEO_MUSIC: A video where the story is told primarily through short on-screen text cards, typically synced to music or a beat. Very minimal speech — the TEXT IS the content. The thumbnail often shows bold text overlays, lyrics-style cards, or motivational/aesthetic text. Examples: music lyrics videos, text-only motivational content, "POV:" text stories, caption-driven aesthetic videos.

- TALKING_HEAD: Any video with a real person speaking directly to camera (face visible, mouth moving) OR with a narrator voicing over footage (B-roll, product shots, scenery). Includes: educational/tutorial videos, vlogs, storytelling with voiceover, interview-style content, documentary-style narration, product reviews.

Caption: "${captionText}"

Return ONLY valid JSON, nothing else:
{"format":"CAPTION_VIDEO_MUSIC|TALKING_HEAD","confidence":0.0,"reason":"one sentence"}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic vision error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() || "";

  // Extract JSON — handle cases where model wraps it in ```json
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse vision response: ${text}`);

  const parsed = JSON.parse(jsonMatch[0]);
  const format = parsed.format?.toUpperCase();

  if (!["CAPTION_VIDEO_MUSIC", "TALKING_HEAD"].includes(format)) {
    // Unknown format — default to TALKING_HEAD
    return {
      format: "TALKING_HEAD",
      confidence: 0.5,
      reason: `Unrecognized format '${format}', defaulting to TALKING_HEAD`,
    };
  }

  return {
    format,
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.75,
    reason: parsed.reason || "",
  };
}

// ==================== MAIN HANDLER ====================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const { video_id, thumbnail_url, caption } = body;

    if (!video_id || !thumbnail_url) {
      return new Response(
        JSON.stringify({ error: "video_id and thumbnail_url are required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceKey);

    // ── Stage 1: Caption heuristics ──
    const heuristic = analyzeCaption(caption);

    let format: string;
    let confidence: number;
    let detectionStage: string;
    let reason = "";

    // ── Stage 2: Vision (always runs — cheap and reliable) ──
    try {
      const vision = await classifyWithVision(thumbnail_url, caption, anthropicKey);
      format = vision.format;
      confidence = vision.confidence;
      detectionStage = "vision";
      reason = vision.reason;

      // If heuristics and vision agree, boost confidence slightly
      if (heuristic.format === format && heuristic.confidence > 0) {
        confidence = Math.min(0.99, confidence + 0.05);
      }
    } catch (visionErr) {
      // Vision failed — fall back to heuristics if available, else default
      console.error("Vision failed:", visionErr);
      if (heuristic.format) {
        format = heuristic.format;
        confidence = heuristic.confidence;
        detectionStage = "heuristic_fallback";
      } else {
        format = "TALKING_HEAD";
        confidence = 0.50;
        detectionStage = "default_fallback";
      }
    }

    // ── Build result ──
    const result = {
      format,
      confidence: Math.round(confidence * 100) / 100,
      detection_stage: detectionStage,
      detected_at: new Date().toISOString(),
      reason,
      wizard_config: WIZARD_CONFIGS[format] || WIZARD_CONFIGS.TALKING_HEAD,
    };

    // ── Persist to DB ──
    const { error: updateError } = await db
      .from("viral_videos")
      .update({ format_detection: result })
      .eq("id", video_id);

    if (updateError) {
      console.error("DB update error:", updateError);
      // Still return the result even if DB write fails
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("detect-video-format error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Detection failed" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
