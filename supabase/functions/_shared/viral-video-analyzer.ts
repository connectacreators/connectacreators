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
