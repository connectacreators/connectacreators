import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const YTDLP_SERVER = "http://72.62.200.145:3099";
const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";

// ─── Resolve video URL via VPS cobalt-proxy (replaces Apify) ───
async function resolveVideoUrlViaCobalt(pageUrl: string): Promise<string | null> {
  try {
    console.log("Resolving video URL via VPS /cobalt-proxy:", pageUrl);
    const res = await fetch(`${YTDLP_SERVER}/cobalt-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
      body: JSON.stringify({ url: pageUrl }),
    });
    if (!res.ok) { console.error("VPS cobalt-proxy error:", res.status); return null; }
    const data = await res.json();
    if (data.url) {
      console.log("VPS cobalt-proxy cached URL:", data.url.slice(0, 80) + "...");
      return data.url;
    }
    console.log("VPS cobalt-proxy returned no URL:", data.status);
    return null;
  } catch (e) {
    console.error("VPS cobalt-proxy resolve error:", e);
    return null;
  }
}

// ==================== TYPES ====================
interface AudioFeatures {
  bpm_estimate: number;
  energy: "high" | "medium" | "low";
  speech_density: "high" | "medium" | "low";
  has_music: boolean;
  mean_volume_db: number | null;
}

interface VisualSegment {
  start: number;
  end: number;
  description: string;
  text_on_screen?: string[];
  frame_base64?: string;
  frame_type?: string;
}

export interface VideoAnalysis {
  duration_seconds: number;
  audio: AudioFeatures;
  visual_segments: VisualSegment[];
  analysis_version: "multimodal_v1" | "multimodal_v2";
}

// ==================== AUDIO FEATURE ESTIMATION ====================
function estimateAudioFeatures(
  meanVolumeDb: number | null,
  maxVolumeDb: number | null,
  transcript: string,
  durationSeconds: number
): AudioFeatures {
  // Energy from volume levels
  let energy: "high" | "medium" | "low" = "medium";
  if (meanVolumeDb !== null) {
    if (meanVolumeDb > -15) energy = "high";
    else if (meanVolumeDb < -25) energy = "low";
    else energy = "medium";
  }

  // Speech density from transcript word count vs duration
  const wordCount = transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  const wordsPerSecond = durationSeconds > 0 ? wordCount / durationSeconds : 0;
  let speechDensity: "high" | "medium" | "low";
  if (wordsPerSecond > 3) speechDensity = "high";
  else if (wordsPerSecond >= 1) speechDensity = "medium";
  else speechDensity = "low";

  // Music presence: loud max volume + low speech density suggests background music
  const hasMusic = maxVolumeDb !== null
    ? (maxVolumeDb > -6 && speechDensity !== "high")
    : (energy === "high" && speechDensity === "low");

  // BPM estimate: rough heuristic from energy + music presence
  let bpmEstimate: number;
  if (!hasMusic) {
    bpmEstimate = 0; // no music detected
  } else if (energy === "high") {
    bpmEstimate = 128;
  } else if (energy === "medium") {
    bpmEstimate = 100;
  } else {
    bpmEstimate = 80;
  }

  return {
    bpm_estimate: bpmEstimate,
    energy,
    speech_density: speechDensity,
    has_music: hasMusic,
    mean_volume_db: meanVolumeDb,
  };
}

// ==================== VISUAL ANALYSIS VIA CLAUDE ====================
async function analyzeFramesWithClaude(
  frames: Array<{ timestamp: number; base64: string; content_type: string }>,
  durationSeconds: number,
  anthropicKey: string
): Promise<VisualSegment[]> {
  if (frames.length === 0) return [];

  // Build multi-image Claude message
  const imageContent = frames.map((frame, i) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: frame.content_type as "image/jpeg",
      data: frame.base64,
    },
  }));

  // Add timestamp labels as text blocks between images
  const contentBlocks: any[] = [];
  frames.forEach((frame, i) => {
    contentBlocks.push({
      type: "text",
      text: `[Frame at ${frame.timestamp}s]`,
    });
    contentBlocks.push(imageContent[i]);
  });

  contentBlocks.push({
    type: "text",
    text: `You are analyzing a short-form social media video (total duration: ${Math.round(durationSeconds)}s).

Above are ${frames.length} frames captured at 3-second intervals across the full video. Each frame is labeled with its timestamp.

Describe what is visually happening in each segment. Group consecutive frames that show the same scene/action into one segment. Also extract any text visible on screen (captions, overlays, titles, subtitles) per segment.

Return ONLY valid JSON in this exact format:
{"segments":[{"start":0,"end":3,"description":"Brief description of what is happening","text_on_screen":["Any visible text line 1","Line 2"]},{"start":3,"end":7,"description":"Next scene description","text_on_screen":[]}]}

Rules:
- Keep descriptions concise (5-15 words each)
- Group 2-3 similar consecutive frames into one segment
- Use present tense ("Person walking", "Text overlay appears", etc.)
- Maximum 20 segments total
- text_on_screen: list every piece of text visible as an overlay, caption, or title — empty array if none`,
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude vision error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() || "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn("Could not parse Claude vision response:", text.slice(0, 200));
    // Fallback: create a single segment covering the whole video
    return [{ start: 0, end: Math.round(durationSeconds), description: "Video content" }];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.segments || []) as VisualSegment[];
  } catch (parseErr) {
    console.warn("JSON parse failed, attempting cleanup:", (parseErr as Error).message);
    // Try to fix common JSON issues: trailing commas, truncated output
    try {
      let cleaned = jsonMatch[0]
        .replace(/,\s*([}\]])/g, "$1")  // Remove trailing commas
        .replace(/\n/g, " ");           // Normalize newlines
      // If truncated (no closing }), try to close it
      const openBraces = (cleaned.match(/\{/g) || []).length;
      const closeBraces = (cleaned.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        // Truncated — find last complete segment and close
        const lastComplete = cleaned.lastIndexOf("}");
        if (lastComplete > 0) {
          cleaned = cleaned.slice(0, lastComplete + 1) + "]}";
        }
      }
      const parsed = JSON.parse(cleaned);
      return (parsed.segments || []) as VisualSegment[];
    } catch {
      console.warn("JSON cleanup also failed, using fallback segment");
      return [{ start: 0, end: Math.round(durationSeconds), description: "Video content" }];
    }
  }
}

// ==================== MAIN HANDLER ====================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url, transcript = "", original_url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // original_url is the page URL (for VPS cache keying)
    const origUrl = original_url || url;
    console.log("Analyzing video multimodal:", url);

    // For social media URLs, resolve to cached/CDN video URL via VPS cobalt-proxy
    let videoUrl = url;
    const isSocialUrl = /instagram\.com\/(reel|reels|p)\/|tiktok\.com|facebook\.com|fb\.watch|youtube\.com\/shorts\//.test(url);
    if (isSocialUrl) {
      const cachedUrl = await resolveVideoUrlViaCobalt(url);
      if (cachedUrl) {
        videoUrl = cachedUrl;
        console.log("Using VPS cobalt-proxy cached URL for analysis");
      } else {
        console.log("VPS cobalt-proxy returned no URL — VPS /analyze-video will handle directly");
      }
    }

    // Call VPS /analyze-video to get frames + audio stats
    // Pass original_url so VPS can look up cached video from transcription step
    console.log("Calling VPS /analyze-video...");
    const vpsRes = await fetch(`${YTDLP_SERVER}/analyze-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": YTDLP_API_KEY,
      },
      body: JSON.stringify({ url: videoUrl, original_url: origUrl, interval_seconds: 3, max_frames: 20 }),
    });

    if (!vpsRes.ok) {
      const err = await vpsRes.json().catch(() => ({ error: "VPS analyze failed" }));
      throw new Error(err.error || `VPS error ${vpsRes.status}`);
    }

    const vpsData = await vpsRes.json();
    const { duration_seconds, frames, audio: rawAudio } = vpsData;

    console.log(`VPS returned ${frames?.length || 0} frames, duration: ${duration_seconds}s`);

    // Analyze frames with Claude vision and compute audio features in parallel
    const [visualSegments, audioFeatures] = await Promise.all([
      analyzeFramesWithClaude(frames || [], duration_seconds, ANTHROPIC_API_KEY),
      Promise.resolve(estimateAudioFeatures(
        rawAudio?.mean_volume_db ?? null,
        rawAudio?.max_volume_db ?? null,
        transcript,
        duration_seconds
      )),
    ]);

    console.log(`Visual analysis: ${visualSegments.length} segments`);

    // Strip frame_base64/frame_type — frames are only used internally during Claude vision call.
    // Never persist them in canvas node data (hundreds of KB each would blow canvas_states row size).
    const segmentsClean: VisualSegment[] = visualSegments.map((seg) => ({
      start: seg.start,
      end: seg.end,
      description: seg.description,
      text_on_screen: seg.text_on_screen ?? [],
    }));

    const result: VideoAnalysis = {
      duration_seconds,
      audio: audioFeatures,
      visual_segments: segmentsClean,
      analysis_version: "multimodal_v2",
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("analyze-video-multimodal error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
