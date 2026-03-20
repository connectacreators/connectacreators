import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YTDLP_SERVER = "http://72.62.200.145:3099";
const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";

const COSTS: Record<string, number> = { audio: 150, visual: 100, both: 200 };
const VALID_MODES = ["audio", "visual", "both"];

// ─── Credit deduction (same pattern as transcribe-video) ───
async function deductCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  // Check if admin (admins bypass credits)
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleData?.role === "admin") return null;

  // Get client record
  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !client) return null; // No client record — allow through (staff accounts)

  if ((client.credits_balance ?? 0) < cost) {
    return JSON.stringify({
      error: `Insufficient credits. You need ${cost} credits but only have ${client.credits_balance ?? 0}.`,
      insufficient_credits: true,
      balance: client.credits_balance ?? 0,
      needed: cost,
    });
  }

  // Deduct
  const { error: updateErr } = await adminClient
    .from("clients")
    .update({
      credits_balance: (client.credits_balance ?? 0) - cost,
      credits_used: (client.credits_used ?? 0) + cost,
    })
    .eq("id", client.id);

  if (updateErr) {
    console.error("Credit update error:", updateErr);
    return JSON.stringify({ error: "Failed to deduct credits", details: updateErr.message });
  }

  // Log transaction
  await adminClient.from("credit_transactions").insert({
    client_id: client.id,
    action,
    cost,
    metadata: {},
  });

  return null;
}

// ─── Audio transcription: download file → extract audio if video → Whisper ───
async function transcribeAudio(
  adminClient: any,
  storagePath: string,
  fileType: string,
  openaiKey: string,
): Promise<string> {
  console.log("Audio transcription: downloading file from storage...");

  // Download file from private storage using service role
  const { data: fileData, error: downloadErr } = await adminClient.storage
    .from("canvas-media")
    .download(storagePath);

  if (downloadErr || !fileData) {
    throw new Error(`Failed to download file from storage: ${downloadErr?.message || "no data"}`);
  }

  let audioBlob: Blob;

  if (fileType === "video") {
    // Video → extract audio via VPS
    console.log("File is video — extracting audio via VPS...");

    const formData = new FormData();
    formData.append("file", fileData, "input_video.mp4");

    const extractRes = await fetch(`${YTDLP_SERVER}/extract-audio`, {
      method: "POST",
      headers: { "x-api-key": YTDLP_API_KEY },
      body: formData,
    });

    if (!extractRes.ok) {
      const err = await extractRes.text().catch(() => "Audio extraction failed");
      throw new Error(`VPS audio extraction failed (${extractRes.status}): ${err}`);
    }

    audioBlob = await extractRes.blob();
    console.log("Audio extracted from video, size:", audioBlob.size, "bytes");
  } else {
    // Voice note — use file directly
    audioBlob = fileData;
    console.log("Voice note file, size:", audioBlob.size, "bytes");
  }

  if (audioBlob.size === 0) {
    throw new Error("Received empty audio data");
  }

  if (audioBlob.size > 25 * 1024 * 1024) {
    throw new Error("Audio file too large for transcription (max ~25MB). Try a shorter recording.");
  }

  // Send to Whisper
  console.log("Sending to OpenAI Whisper...");
  const whisperForm = new FormData();
  whisperForm.append(
    "file",
    new Blob([await audioBlob.arrayBuffer()], { type: "audio/mpeg" }),
    "audio.mp3",
  );
  whisperForm.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: whisperForm,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error("Whisper error:", whisperRes.status, errText);
    throw new Error(`Whisper transcription failed [${whisperRes.status}]: ${errText}`);
  }

  const result = await whisperRes.json();
  const transcription = result.text;
  console.log("Audio transcription complete, length:", transcription?.length, "chars");
  return transcription;
}

// ─── Visual transcription: signed URL → VPS frames → Claude Haiku vision ───
async function transcribeVisual(
  adminClient: any,
  storagePath: string,
  anthropicKey: string,
): Promise<any> {
  console.log("Visual transcription: creating signed URL for VPS...");

  // Create a temporary signed URL (15 min) so VPS can download the video
  const { data: signedData, error: signErr } = await adminClient.storage
    .from("canvas-media")
    .createSignedUrl(storagePath, 900); // 15 minutes

  if (signErr || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signErr?.message || "no URL returned"}`);
  }

  const signedUrl = signedData.signedUrl;
  console.log("Signed URL created, calling VPS /analyze-video...");

  // Call VPS to extract frames + audio stats
  const vpsRes = await fetch(`${YTDLP_SERVER}/analyze-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": YTDLP_API_KEY,
    },
    body: JSON.stringify({ url: signedUrl, interval_seconds: 3, max_frames: 20 }),
  });

  if (!vpsRes.ok) {
    const err = await vpsRes.json().catch(() => ({ error: "VPS analyze failed" }));
    throw new Error(err.error || `VPS /analyze-video error (${vpsRes.status})`);
  }

  const vpsData = await vpsRes.json();
  const { duration_seconds, frames, audio: rawAudio } = vpsData;

  console.log(`VPS returned ${frames?.length || 0} frames, duration: ${duration_seconds}s`);

  // Analyze frames with Claude Haiku vision
  const visualSegments = await analyzeFramesWithClaude(
    frames || [],
    duration_seconds,
    anthropicKey,
  );

  console.log(`Visual analysis: ${visualSegments.length} segments`);

  // Estimate audio features from VPS audio stats
  const audioFeatures = estimateAudioFeatures(
    rawAudio?.mean_volume_db ?? null,
    rawAudio?.max_volume_db ?? null,
    duration_seconds,
  );

  // Strip frame_base64 from segments (don't persist large base64 data)
  const segmentsClean = visualSegments.map((seg: any) => ({
    start: seg.start,
    end: seg.end,
    description: seg.description,
    text_on_screen: seg.text_on_screen ?? [],
  }));

  return {
    duration_seconds,
    audio: audioFeatures,
    visual_segments: segmentsClean,
    analysis_version: "multimodal_v2",
  };
}

// ─── Claude Haiku vision analysis (same logic as analyze-video-multimodal) ───
async function analyzeFramesWithClaude(
  frames: Array<{ timestamp: number; base64: string; content_type: string }>,
  durationSeconds: number,
  anthropicKey: string,
): Promise<any[]> {
  if (frames.length === 0) return [];

  // Build multi-image Claude message
  const contentBlocks: any[] = [];
  frames.forEach((frame) => {
    contentBlocks.push({
      type: "text",
      text: `[Frame at ${frame.timestamp}s]`,
    });
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: frame.content_type as "image/jpeg",
        data: frame.base64,
      },
    });
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
    // Fallback: single segment covering the whole video
    return [{ start: 0, end: Math.round(durationSeconds), description: "Video content" }];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.segments || []) as any[];
}

// ─── Audio feature estimation (same logic as analyze-video-multimodal) ───
function estimateAudioFeatures(
  meanVolumeDb: number | null,
  maxVolumeDb: number | null,
  durationSeconds: number,
): any {
  let energy: "high" | "medium" | "low" = "medium";
  if (meanVolumeDb !== null) {
    if (meanVolumeDb > -15) energy = "high";
    else if (meanVolumeDb < -25) energy = "low";
    else energy = "medium";
  }

  // Without transcript, assume medium speech density
  const speechDensity: "high" | "medium" | "low" = "medium";

  const hasMusic = maxVolumeDb !== null
    ? (maxVolumeDb > -6 && speechDensity !== "high")
    : (energy === "high" && speechDensity === "low");

  let bpmEstimate: number;
  if (!hasMusic) {
    bpmEstimate = 0;
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

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

  // Create user client (to verify identity) + admin client (for credit ops + storage)
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body outside try so media_id is available in error handler
  let media_id: string | undefined;
  let mode: string | undefined;

  try {
    const body = await req.json();
    media_id = body.media_id;
    mode = body.mode;

    // Validate input
    if (!media_id || typeof media_id !== "string") {
      return new Response(JSON.stringify({ error: "media_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!mode || !VALID_MODES.includes(mode)) {
      return new Response(
        JSON.stringify({ error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch canvas_media row and verify ownership
    const { data: media, error: mediaErr } = await adminClient
      .from("canvas_media")
      .select("*")
      .eq("id", media_id)
      .maybeSingle();

    if (mediaErr || !media) {
      return new Response(JSON.stringify({ error: "Media not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (media.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Media not found or not owned by user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate mode vs file type
    if (mode === "visual" && media.file_type !== "video") {
      return new Response(
        JSON.stringify({ error: "Visual transcription is only available for video files" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (mode === "both" && media.file_type !== "video") {
      return new Response(
        JSON.stringify({ error: "Combined transcription is only available for video files" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (mode === "audio" && media.file_type === "image") {
      return new Response(
        JSON.stringify({ error: "Audio transcription is not available for image files" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check required API keys for the requested mode
    if ((mode === "audio" || mode === "both") && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((mode === "visual" || mode === "both") && !ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits BEFORE processing
    const cost = COSTS[mode];
    const creditErr = await deductCredits(adminClient, user.id, `canvas_transcribe_${mode}`, cost);
    if (creditErr) {
      return new Response(creditErr, {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set status to processing
    await adminClient
      .from("canvas_media")
      .update({ transcription_status: "processing" })
      .eq("id", media_id);

    console.log(`Transcribing canvas media: id=${media_id}, mode=${mode}, file_type=${media.file_type}`);

    let audioTranscription: string | null = null;
    let visualTranscription: any | null = null;

    if (mode === "audio") {
      audioTranscription = await transcribeAudio(
        adminClient,
        media.storage_path,
        media.file_type,
        OPENAI_API_KEY!,
      );
    } else if (mode === "visual") {
      visualTranscription = await transcribeVisual(
        adminClient,
        media.storage_path,
        ANTHROPIC_API_KEY!,
      );
    } else {
      // mode === "both" — run audio + visual in parallel
      const [audioResult, visualResult] = await Promise.all([
        transcribeAudio(adminClient, media.storage_path, media.file_type, OPENAI_API_KEY!),
        transcribeVisual(adminClient, media.storage_path, ANTHROPIC_API_KEY!),
      ]);
      audioTranscription = audioResult;
      visualTranscription = visualResult;
    }

    // Save results to DB
    const updatePayload: any = { transcription_status: "done" };
    if (audioTranscription !== null) {
      updatePayload.audio_transcription = audioTranscription;
    }
    if (visualTranscription !== null) {
      updatePayload.visual_transcription = visualTranscription;
    }

    const { error: saveErr } = await adminClient
      .from("canvas_media")
      .update(updatePayload)
      .eq("id", media_id);

    if (saveErr) {
      console.error("Failed to save transcription results:", saveErr);
      throw new Error(`Failed to save results: ${saveErr.message}`);
    }

    console.log(`Transcription complete: mode=${mode}, media_id=${media_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        audio_transcription: audioTranscription,
        visual_transcription: visualTranscription,
        credits_charged: cost,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("transcribe-canvas-media error:", e);

    // Try to set error status on the media row (best effort)
    if (media_id) {
      try {
        await adminClient
          .from("canvas_media")
          .update({ transcription_status: "error" })
          .eq("id", media_id);
      } catch {
        // Ignore — error status update is best effort
      }
    }

    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
