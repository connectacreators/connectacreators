import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YTDLP_SERVER = "http://72.62.200.145:3099";
const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";
const CREDIT_COST = 150;

// ─── Apify (YouTube transcript extraction only) ───
const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_YT_ACTOR = "streamers~youtube-scraper";

async function extractYouTubeTranscript(videoUrl: string): Promise<string | null> {
  const ytMatch = videoUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (!ytMatch) return null;

  console.log("Extracting YouTube transcript via Apify for:", ytMatch[1]);

  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_YT_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=50`;
    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: videoUrl }],
        maxResults: 1,
        downloadSubtitles: true,
        subtitlesLanguage: "en",
        subtitlesFormat: "plaintext",
      }),
    });

    if (!res.ok) {
      console.error("Apify YouTube error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.log("Apify returned no items");
      return null;
    }

    const item = items[0];
    const subtitles = item.subtitles;

    if (Array.isArray(subtitles) && subtitles.length > 0) {
      // Find English subtitle, or first available
      const enSub = subtitles.find((s: any) => s.language === "en") || subtitles[0];
      if (enSub?.plaintext) {
        const transcript = enSub.plaintext.replace(/\n/g, " ").trim();
        console.log(`YouTube transcript extracted (${enSub.language}): ${transcript.length} chars`);
        return transcript;
      }
    }

    console.log("No subtitles in Apify response");
    return null;
  } catch (e) {
    console.error("Apify YouTube transcript error:", e);
    return null;
  }
}

// Deduct credits atomically. Returns null on success, error string on failure.
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
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create user client (to verify identity) + admin client (for credit ops)
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

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits BEFORE doing the expensive operation
    const creditErr = await deductCredits(adminClient, user.id, "add_video_to_vault", CREDIT_COST);
    if (creditErr) {
      return new Response(creditErr, {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Transcribing video URL:", url);

    let transcription: string | null = null;
    const isYouTube = /(?:youtube\.com\/|youtu\.be\/)/.test(url);

    // ─── YouTube: try caption extraction first (fast, free, no audio download) ───
    if (isYouTube) {
      console.log("YouTube URL detected — trying Apify transcript extraction...");
      transcription = await extractYouTubeTranscript(url);
      if (transcription) {
        console.log("YouTube transcript extracted successfully, length:", transcription.length);
      } else {
        console.log("No YouTube transcript available, falling back to audio extraction...");
      }
    }

    // ─── YouTube: construct thumbnail URL from video ID ───
    let youtubeThumbnailUrl: string | null = null;
    if (isYouTube) {
      const ytIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytIdMatch) {
        const videoId = ytIdMatch[1];
        const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
          const headRes = await fetch(maxresUrl, { method: "HEAD" });
          const contentLength = headRes.headers.get("content-length");
          if (headRes.ok && contentLength !== "1403") {
            youtubeThumbnailUrl = maxresUrl;
            console.log("YouTube maxresdefault thumbnail available:", videoId);
          } else {
            youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            console.log("YouTube using hqdefault fallback:", videoId);
          }
        } catch {
          youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          console.log("YouTube HEAD failed, using hqdefault fallback:", videoId);
        }
      }
    }

    // ─── Instagram thumbnails handled by separate fetch-thumbnail edge function ───
    // (no Apify call here — saves 10-90s that could cause edge function timeout)

    // ─── Extract audio via VPS yt-dlp server (cobalt+ffmpeg → always returns MP3) ───
    let videoCacheUrl: string | null = null;
    if (!transcription) {
      console.log("Calling yt-dlp server with original page URL...");
      const ytdlpRes = await fetch(`${YTDLP_SERVER}/extract-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": YTDLP_API_KEY,
        },
        body: JSON.stringify({ url, original_url: url }),
      });

      if (!ytdlpRes.ok) {
        const err = await ytdlpRes.json().catch(() => ({ error: "Audio extraction failed" }));
        console.error("yt-dlp server error:", ytdlpRes.status, err);
        throw new Error(err.error || `Audio extraction failed (${ytdlpRes.status})`);
      }

      videoCacheUrl = ytdlpRes.headers.get("X-Video-Cache") || null;
      if (videoCacheUrl) console.log("VPS cached video at:", videoCacheUrl);
      // Materialize the response body into an ArrayBuffer — Deno Response-derived Blobs
      // may silently yield empty content when passed directly to FormData in some cases.
      const audioBuffer = await ytdlpRes.arrayBuffer();

      if (audioBuffer.byteLength === 0) {
        throw new Error("Received empty audio from extraction server");
      }

      if (audioBuffer.byteLength > 25 * 1024 * 1024) {
        throw new Error("Video is too long for transcription (max ~25MB audio). Try a shorter clip.");
      }

      console.log("Audio received, size:", audioBuffer.byteLength, "bytes. Sending to OpenAI Whisper...");
      // VPS always converts to MP3 via ffmpeg → declare audio/mpeg
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
      formData.append("model", "whisper-1");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!whisperRes.ok) {
        const errText = await whisperRes.text();
        console.error("Whisper error:", whisperRes.status, errText);
        throw new Error(`Transcription failed [${whisperRes.status}]: ${errText}`);
      }

      const result = await whisperRes.json();
      transcription = result.text;
    }

    if (!transcription) {
      throw new Error("Could not transcribe video — no captions found and audio extraction failed");
    }

    console.log("Transcription complete, length:", transcription.length, "chars");

    const finalVideoUrl = videoCacheUrl || null;
    // YouTube thumbnails from this function; Instagram thumbnails via separate fetch-thumbnail
    const thumbnailUrl = youtubeThumbnailUrl || null;
    return new Response(JSON.stringify({ transcription, videoUrl: finalVideoUrl, thumbnail_url: thumbnailUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("transcribe-video error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
