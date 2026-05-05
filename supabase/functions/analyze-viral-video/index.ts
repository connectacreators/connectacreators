// supabase/functions/analyze-viral-video/index.ts
// Orchestrator: takes a viral_videos row, calls existing transcribe-video and
// analyze-video-multimodal functions, plus a Haiku call for niche tagging,
// then writes results back to the row.
//
// Idempotent: if transcribed_at IS NOT NULL on the row, returns immediately.
// Threshold: only processes videos where outlier_score >= 5 AND views_count >= 500000.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const MIN_OUTLIER_SCORE = 5;
const MIN_VIEWS = 500_000;

interface RequestBody {
  video_id: string;
  force?: boolean; // re-analyze even if transcribed_at exists
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.video_id) {
    return new Response(JSON.stringify({ error: "missing video_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Load the row
  const { data: video, error: videoErr } = await admin
    .from("viral_videos")
    .select("id, video_url, caption, channel_username, outlier_score, views_count, transcript, transcribed_at")
    .eq("id", body.video_id)
    .maybeSingle();

  if (videoErr || !video) {
    return new Response(JSON.stringify({ error: `video not found: ${body.video_id}` }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Idempotency check
  if (video.transcribed_at && !body.force) {
    return new Response(JSON.stringify({ skipped: true, reason: "already_analyzed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Threshold check
  const outlier = Number(video.outlier_score ?? 0);
  const views = Number(video.views_count ?? 0);
  if (outlier < MIN_OUTLIER_SCORE || views < MIN_VIEWS) {
    return new Response(JSON.stringify({
      skipped: true,
      reason: "below_threshold",
      outlier_score: outlier,
      views_count: views,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!video.video_url) {
    return new Response(JSON.stringify({ error: "no video_url on row" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Transcribe directly via VPS (mirrors transcribe-video internals).
  // We bypass the transcribe-video edge function because it requires a real user JWT
  // for credit deduction — this orchestrator runs as a background/admin job with no user session.
  const YTDLP_SERVER = "http://72.62.200.145:3099";
  const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

  // 4a. Resolve video URL via VPS cobalt-proxy
  let cachedVideoUrl: string | null = null;
  try {
    const cobaltRes = await fetch(`${YTDLP_SERVER}/cobalt-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
      body: JSON.stringify({ url: video.video_url }),
    });
    if (cobaltRes.ok) {
      const cobaltJson = await cobaltRes.json();
      cachedVideoUrl = cobaltJson.url ?? null;
    }
  } catch (e) {
    console.warn("[analyze-viral-video] cobalt-proxy failed:", (e as Error).message);
  }

  // 4b. Try YouTube captions fast-path if applicable
  let transcript: string | null = null;
  const isYouTube = /(?:youtube\.com\/|youtu\.be\/)/.test(video.video_url);
  if (isYouTube) {
    try {
      const captionsRes = await fetch(`${YTDLP_SERVER}/youtube-captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
        body: JSON.stringify({ url: video.video_url }),
      });
      if (captionsRes.ok) {
        const captionsData = await captionsRes.json();
        if (captionsData.captions && captionsData.captions.length > 50) {
          transcript = captionsData.captions;
          console.log("[analyze-viral-video] YouTube captions fast-path, length:", transcript!.length);
        }
      }
    } catch (e) {
      console.warn("[analyze-viral-video] youtube-captions failed:", (e as Error).message);
    }
  }

  // 4c. Whisper fallback via VPS /extract-audio
  if (!transcript) {
    const extractionUrl = cachedVideoUrl || video.video_url;
    const audioRes = await fetch(`${YTDLP_SERVER}/extract-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
      body: JSON.stringify({ url: extractionUrl, original_url: video.video_url }),
    });
    if (!audioRes.ok) {
      const errBody = await audioRes.json().catch(() => ({}));
      console.error("[analyze-viral-video] extract-audio failed:", audioRes.status, errBody);
      return new Response(JSON.stringify({
        error: "transcribe_failed",
        details: (errBody as any)?.error ?? `extract-audio status ${audioRes.status}`,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBytes = new Uint8Array(await audioRes.arrayBuffer());
    if (rawBytes.byteLength === 0) {
      return new Response(JSON.stringify({ error: "transcribe_failed", details: "empty audio from VPS" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawBytes.byteLength > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "transcribe_failed", details: "audio too large (>25MB)" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = new FormData();
    formData.append("file", new Blob([rawBytes.buffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model", "whisper-1");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    const whisperBody = await whisperRes.text();
    if (!whisperRes.ok) {
      console.error("[analyze-viral-video] whisper failed:", whisperRes.status, whisperBody.slice(0, 300));
      return new Response(JSON.stringify({
        error: "transcribe_failed",
        details: `whisper ${whisperRes.status}`,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    transcript = JSON.parse(whisperBody).text ?? "";
    if (transcript === "") transcript = "(No speech detected in this video)";
    console.log("[analyze-viral-video] Whisper transcript length:", transcript.length);
  }

  if (!transcript) {
    return new Response(JSON.stringify({ error: "transcribe_failed", details: "no transcript produced" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Call existing analyze-video-multimodal function
  const multimodalRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-video-multimodal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      url: video.video_url,
      original_url: video.video_url,
      transcript,
    }),
  });
  const multimodalJson: any = await multimodalRes.json().catch(() => ({}));
  // Even if visual analysis fails partially, we keep the transcript and continue
  const structureData = multimodalRes.ok ? multimodalJson : null;

  // 6. Extract hook_text and cta_text from structure (if available) or fall back to transcript chunks
  let hookText: string | null = null;
  let ctaText: string | null = null;
  if (structureData?.sections && Array.isArray(structureData.sections)) {
    const hookSection = structureData.sections.find((s: any) => s.section === "hook");
    const ctaSection = structureData.sections.find((s: any) => s.section === "cta");
    hookText = hookSection?.actor_text ?? hookSection?.visual_cue ?? null;
    ctaText = ctaSection?.actor_text ?? ctaSection?.visual_cue ?? null;
  }
  if (!hookText && transcript) {
    // Fallback: first 30 words
    hookText = transcript.split(/\s+/).slice(0, 30).join(" ");
  }
  if (!ctaText && transcript) {
    // Fallback: last 30 words
    const words = transcript.split(/\s+/);
    ctaText = words.slice(Math.max(0, words.length - 30)).join(" ");
  }

  // 7. Haiku call for niche/audience/key_topics tagging
  let nicheTags: string[] = [];
  let audience: string = "";
  let keyTopics: string[] = [];
  let bodyStructure: string = "";

  try {
    const tagRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are tagging a viral short-form video for a creator-content database. Read the transcript and caption, then output ONLY a JSON object with these fields:

{
  "niche_tags": ["<2-4 short niche labels, lowercase, e.g. 'personal branding', 'fitness', 'pest control sales'>"],
  "audience": "<one phrase describing the target viewer, e.g. 'creators 18-30 starting from zero'>",
  "key_topics": ["<3-5 specific topic labels, e.g. 'origin story', 'career pivot', 'rookie pitch contest'>"],
  "body_structure": "<one sentence summarizing the body's narrative pattern, e.g. '5 beats — origin, struggle, pivot, result, lesson'>"
}

CAPTION: ${(video.caption ?? "").slice(0, 400)}

TRANSCRIPT: ${transcript.slice(0, 2500)}

Output ONLY the JSON object, no commentary.`,
        }],
      }),
    });
    const tagJson: any = await tagRes.json();
    if (tagRes.ok) {
      let raw = (tagJson.content?.[0]?.text as string ?? "").trim();
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(raw);
      nicheTags = Array.isArray(parsed.niche_tags) ? parsed.niche_tags.slice(0, 4) : [];
      audience = typeof parsed.audience === "string" ? parsed.audience.slice(0, 200) : "";
      keyTopics = Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [];
      bodyStructure = typeof parsed.body_structure === "string" ? parsed.body_structure.slice(0, 300) : "";
    } else {
      console.warn("[analyze-viral-video] haiku tagging failed:", tagJson);
    }
  } catch (e) {
    console.warn("[analyze-viral-video] haiku parse error:", (e as Error).message);
  }

  // 8. Compose framework_meta
  const frameworkMeta: Record<string, unknown> = {
    niche_tags: nicheTags,
    audience,
    key_topics: keyTopics,
    body_structure: bodyStructure,
    content_type: structureData?.detected_format ?? null,
    visual_pacing: {
      cuts_per_minute: structureData?.audio_features?.bpm_estimate ?? null,
      tempo: structureData?.audio_features?.energy ?? null,
    },
    visual_segments: Array.isArray(structureData?.visual_segments)
      ? structureData.visual_segments.slice(0, 10)
      : [],
    raw_structure: structureData?.sections ?? null,
  };

  // 9. Persist to viral_videos
  const { error: updateErr } = await admin
    .from("viral_videos")
    .update({
      transcript,
      hook_text: hookText,
      cta_text: ctaText,
      framework_meta: frameworkMeta,
      transcribed_at: new Date().toISOString(),
    })
    .eq("id", body.video_id);

  if (updateErr) {
    console.error("[analyze-viral-video] update failed:", updateErr);
    return new Response(JSON.stringify({ error: "db_update_failed", details: updateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    video_id: body.video_id,
    transcript_length: transcript.length,
    has_structure: !!structureData,
    niche_tags: nicheTags,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
