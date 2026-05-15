// supabase/functions/_shared/viral-video-analyzer.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const VPS_BASE = "http://72.62.200.145:3099";
const VPS_KEY = "ytdlp_connecta_2026_secret";
const BUCKET = "viral-videos";
const FILE_TTL_DAYS = 90;

export interface ViralVideoRow {
  id: string;
  platform: string;
  apify_video_id: string;
  video_url: string;
  transcript: string | null;
  framework_meta: Record<string, unknown> | null;
  video_file_url: string | null;
  video_file_expires_at: string | null;
  analysis_status: "pending" | "analyzing" | "analyzed" | "failed";
}

export class AnalyzerError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Step 1 of the pipeline: download the source video via VPS cobalt-proxy and
 * upload it to Supabase Storage. Idempotent — returns the cached signed URL if
 * row.video_file_url is set and not expired.
 */
export async function acquireVideoFile(
  admin: SupabaseClient,
  row: ViralVideoRow,
): Promise<{ video_file_url: string; video_file_expires_at: string }> {
  // Skip if already cached and not expired.
  if (row.video_file_url && row.video_file_expires_at) {
    if (new Date(row.video_file_expires_at) > new Date()) {
      return { video_file_url: row.video_file_url, video_file_expires_at: row.video_file_expires_at };
    }
  }

  // 1. Resolve to a downloadable URL via VPS cobalt-proxy.
  //    Response shape: { url, thumbnail, title }.
  const cobaltRes = await fetch(`${VPS_BASE}/cobalt-proxy`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
    body: JSON.stringify({ url: row.video_url }),
  });
  if (!cobaltRes.ok) {
    throw new AnalyzerError("cobalt_failed", `Cobalt proxy returned ${cobaltRes.status}`);
  }
  const cobaltData = await cobaltRes.json();
  const downloadUrl: string | null = cobaltData.url || null;
  if (!downloadUrl) {
    throw new AnalyzerError("cobalt_no_url", "Cobalt returned no downloadable URL");
  }

  // 2. Stream the MP4 down.
  const mp4Res = await fetch(downloadUrl);
  if (!mp4Res.ok) throw new AnalyzerError("download_failed", `MP4 fetch ${mp4Res.status}`);
  const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer());

  // 3. Upload to Storage.
  const path = `${row.id}.mp4`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, mp4Bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (uploadErr) throw new AnalyzerError("storage_upload_failed", uploadErr.message);

  // 4. Signed URL for playback (TTL ≈ file TTL: 90 days = 7,776,000 s).
  const { data: signed, error: signErr } = await admin
    .storage.from(BUCKET)
    .createSignedUrl(path, FILE_TTL_DAYS * 24 * 60 * 60);
  if (signErr || !signed) throw new AnalyzerError("storage_sign_failed", signErr?.message ?? "no signed url");

  const expires = new Date(Date.now() + FILE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { video_file_url: signed.signedUrl, video_file_expires_at: expires };
}

/**
 * Step 2 of the pipeline: transcribe the video. Short-circuits if row.transcript
 * is already populated (cache hit from a prior partial analysis). Otherwise tries
 * the YouTube captions fast-path, then falls back to Whisper via VPS /extract-audio.
 *
 * Mirrors the production logic in transcribe-video/index.ts so behavior is identical.
 */
export async function acquireTranscript(row: ViralVideoRow): Promise<string> {
  if (row.transcript && row.transcript.trim().length > 0) {
    return row.transcript;
  }

  // YouTube fast-path: captions API.
  if (row.platform === "youtube") {
    try {
      const captionsRes = await fetch(`${VPS_BASE}/youtube-captions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
        body: JSON.stringify({ url: row.video_url }),
      });
      if (captionsRes.ok) {
        const captionsData = await captionsRes.json();
        if (captionsData.captions && typeof captionsData.captions === "string" && captionsData.captions.length > 50) {
          return captionsData.captions;
        }
      }
    } catch (_e) {
      // Fall through to Whisper.
    }
  }

  // Whisper fallback.
  const audioRes = await fetch(`${VPS_BASE}/extract-audio`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": VPS_KEY },
    body: JSON.stringify({ url: row.video_url, original_url: row.video_url }),
  });
  if (!audioRes.ok) {
    const errBody = await audioRes.json().catch(() => ({}));
    throw new AnalyzerError("audio_extract_failed", errBody.error ?? `extract-audio ${audioRes.status}`);
  }

  const rawBytes = new Uint8Array(await audioRes.arrayBuffer());
  if (rawBytes.byteLength === 0) {
    throw new AnalyzerError("audio_empty", "Received empty audio from extraction server");
  }
  if (rawBytes.byteLength > 25 * 1024 * 1024) {
    throw new AnalyzerError("audio_too_large", "Video is too long for transcription (max ~25MB audio)");
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new AnalyzerError("openai_missing_key", "OPENAI_API_KEY not configured");

  const audioBlob = new Blob([rawBytes.buffer], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", audioBlob, "audio.mp3");
  form.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  const whisperBody = await whisperRes.text();
  if (!whisperRes.ok) {
    throw new AnalyzerError("whisper_failed", `Whisper ${whisperRes.status}: ${whisperBody.slice(0, 500)}`);
  }
  const parsed = JSON.parse(whisperBody);
  if (!parsed.text) throw new AnalyzerError("whisper_no_text", "Whisper returned no text");
  return parsed.text;
}

/**
 * Step 3 of the pipeline: visual breakdown via /analyze-video-multimodal.
 * Idempotent — returns cached visual data if framework_meta.visual_segments
 * is already present.
 *
 * Returns the raw multimodal response (structureData) so the orchestrator can
 * use detected_format, sections, audio_features, etc. for caption-style and
 * hook/cta extraction.
 */
export async function acquireVisualBreakdown(
  row: ViralVideoRow,
  transcript: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Record<string, unknown> | null> {
  const cached = row.framework_meta as Record<string, unknown> | null;
  if (cached && Array.isArray(cached.visual_segments) && (cached.visual_segments as unknown[]).length > 0) {
    // Re-hydrate a structureData-shaped object from the cached row.
    return {
      visual_segments: cached.visual_segments,
      detected_format: cached.content_type ?? null,
      audio_features: cached.visual_pacing
        ? {
            bpm_estimate: (cached.visual_pacing as Record<string, unknown>).cuts_per_minute ?? null,
            energy: (cached.visual_pacing as Record<string, unknown>).tempo ?? null,
          }
        : null,
      sections: cached.raw_structure ?? null,
    };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-video-multimodal`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      url: row.video_url,
      original_url: row.video_url,
      transcript,
    }),
  });
  const json: Record<string, unknown> = await res.json().catch(() => ({}));
  // Even if visual analysis fails partially, return null so the orchestrator
  // can still persist transcript-only state (mirrors cron behavior).
  return res.ok ? json : null;
}

/**
 * Step 4 of the pipeline: Haiku tagging. Returns the 4 fields (niche_tags,
 * audience, key_topics, body_structure). Caption-style and hook/cta are
 * computed by the orchestrator, not the tagger — same as the cron.
 *
 * Tolerant: returns empty fields on any parse/network error rather than throwing,
 * so a partial framework_meta is better than nothing.
 */
export interface TagResult {
  niche_tags: string[];
  audience: string;
  key_topics: string[];
  body_structure: string;
}

export async function tagFramework(
  caption: string | null,
  effectiveText: string,
  isCaptionStyle: boolean,
): Promise<TagResult> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return { niche_tags: [], audience: "", key_topics: [], body_structure: "" };

  const prompt = `You are tagging a viral short-form video for a creator-content database. Read the content and caption, then output ONLY a JSON object with these fields:

{
  "niche_tags": ["<2-4 short niche labels, lowercase, e.g. 'personal branding', 'fitness', 'pest control sales'>"],
  "audience": "<one phrase describing the target viewer, e.g. 'creators 18-30 starting from zero'>",
  "key_topics": ["<3-5 specific topic labels, e.g. 'origin story', 'career pivot', 'rookie pitch contest'>"],
  "body_structure": "<one sentence summarizing the body's narrative pattern, e.g. '5 beats — origin, struggle, pivot, result, lesson'>"
}

CAPTION: ${(caption ?? "").slice(0, 400)}

${isCaptionStyle ? "TEXT ON SCREEN (caption-style video):" : "TRANSCRIPT:"} ${effectiveText.slice(0, 2500)}

Output ONLY the JSON object, no commentary.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const body: any = await res.json();
    if (!res.ok) return { niche_tags: [], audience: "", key_topics: [], body_structure: "" };
    let raw = (body.content?.[0]?.text as string ?? "").trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw);
    return {
      niche_tags: Array.isArray(parsed.niche_tags) ? parsed.niche_tags.slice(0, 4) : [],
      audience: typeof parsed.audience === "string" ? parsed.audience.slice(0, 200) : "",
      key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 5) : [],
      body_structure: typeof parsed.body_structure === "string" ? parsed.body_structure.slice(0, 300) : "",
    };
  } catch {
    return { niche_tags: [], audience: "", key_topics: [], body_structure: "" };
  }
}

/**
 * Full pipeline orchestrator. Runs all four steps idempotently and returns the
 * column patch to apply to viral_videos. Caller does the UPDATE.
 *
 * Mirrors the cron pipeline in analyze-viral-video/index.ts so both user-
 * triggered and cron-triggered analyses produce identical viral_videos rows.
 */
export async function runFullAnalysis(
  admin: SupabaseClient,
  row: ViralVideoRow,
  caption: string | null,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{
  video_file_url: string;
  video_file_expires_at: string;
  transcript: string;
  hook_text: string | null;
  cta_text: string | null;
  framework_meta: Record<string, unknown>;
  transcribed_at: string;
}> {
  // 1. Acquire video file.
  const fileResult = await acquireVideoFile(admin, row);
  row.video_file_url = fileResult.video_file_url;
  row.video_file_expires_at = fileResult.video_file_expires_at;

  // 2. Acquire transcript.
  const transcript = await acquireTranscript(row);
  row.transcript = transcript;

  // 3. Acquire visual breakdown (may return null on failure — keep going).
  const structureData = await acquireVisualBreakdown(row, transcript, supabaseUrl, serviceRoleKey);

  // 4. Caption-style detection (mirror of cron lines 231-241).
  const transcriptWordCount = transcript.split(/\s+/).filter(Boolean).length;
  const segments = (structureData?.visual_segments as any[] | undefined) ?? [];
  const hasVisualTextOnScreen = segments.some(
    (s: any) => Array.isArray(s.text_on_screen) && s.text_on_screen.length > 0,
  );
  const detectedFormat = typeof structureData?.detected_format === "string" ? (structureData.detected_format as string) : null;
  const isCaptionStyle =
    (detectedFormat !== null && detectedFormat.includes("CAPTION")) ||
    (hasVisualTextOnScreen && transcriptWordCount < 40);

  // 5. Build visualTextSummary (cron lines 244-260).
  let visualTextSummary: string | null = null;
  if (isCaptionStyle && segments.length > 0) {
    const lines: string[] = [];
    for (const seg of segments) {
      const texts = Array.isArray(seg.text_on_screen) ? seg.text_on_screen.join(" / ") : null;
      const desc = typeof seg.description === "string" ? seg.description : null;
      const line = texts ?? desc;
      if (line && line.trim()) lines.push(line.trim());
    }
    if (lines.length > 0) visualTextSummary = lines.join("\n");
  }

  // 6. Hook/CTA extraction (cron lines 263-283).
  let hookText: string | null = null;
  let ctaText: string | null = null;
  if (visualTextSummary) {
    const lines = visualTextSummary.split("\n");
    hookText = lines[0] ?? null;
    ctaText = lines[lines.length - 1] !== hookText ? (lines[lines.length - 1] ?? null) : null;
  } else if (Array.isArray(structureData?.sections)) {
    const sections = structureData!.sections as any[];
    const hookSection = sections.find((s) => s.section === "hook");
    const ctaSection = sections.find((s) => s.section === "cta");
    hookText = hookSection?.actor_text ?? hookSection?.visual_cue ?? null;
    ctaText = ctaSection?.actor_text ?? ctaSection?.visual_cue ?? null;
  }
  if (!hookText && !isCaptionStyle && transcript) {
    hookText = transcript.split(/\s+/).slice(0, 30).join(" ");
  }
  if (!ctaText && !isCaptionStyle && transcript) {
    const words = transcript.split(/\s+/);
    ctaText = words.slice(Math.max(0, words.length - 30)).join(" ");
  }

  // 7. Effective transcript: caption-style → visual text; otherwise → audio.
  const effectiveTranscript = (isCaptionStyle && visualTextSummary) ? visualTextSummary : transcript;

  // 8. Tag (use visual text for caption-style, transcript otherwise).
  const taggingText = (isCaptionStyle && visualTextSummary) ? visualTextSummary : transcript;
  const tags = await tagFramework(caption, taggingText, isCaptionStyle);

  // 9. Compose framework_meta (cron lines 348-363).
  const audioFeatures = (structureData?.audio_features as any) ?? null;
  const framework_meta: Record<string, unknown> = {
    niche_tags: tags.niche_tags,
    audience: tags.audience,
    key_topics: tags.key_topics,
    body_structure: tags.body_structure,
    content_type: detectedFormat,
    is_caption_style: isCaptionStyle,
    visual_pacing: {
      cuts_per_minute: audioFeatures?.bpm_estimate ?? null,
      tempo: audioFeatures?.energy ?? null,
    },
    visual_segments: segments.slice(0, 10),
    raw_structure: structureData?.sections ?? null,
  };

  return {
    video_file_url: fileResult.video_file_url,
    video_file_expires_at: fileResult.video_file_expires_at,
    transcript: effectiveTranscript,
    hook_text: hookText,
    cta_text: ctaText,
    framework_meta,
    transcribed_at: new Date().toISOString(),
  };
}
