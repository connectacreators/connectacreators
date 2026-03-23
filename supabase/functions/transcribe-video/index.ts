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

// ─── Apify actors ───
const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_YT_ACTOR = "streamers~youtube-scraper";
const APIFY_IG_TASK = "connectacreators~instagram-reel-scraper-task";

// ─── Instagram: normalize /reels/ → /reel/ for the Apify task ───
function normalizeInstagramReelUrl(url: string): string {
  // Task expects /reel/CODE/ (singular), not /reels/CODE/ (plural)
  return url.replace(/\/reels\/([A-Za-z0-9_-]+)/, "/reel/$1");
}

// ─── Instagram: get direct CDN video URL + thumbnail via Apify task ───
async function extractInstagramVideoUrl(reelUrl: string): Promise<{ videoUrl: string | null; displayUrl: string | null }> {
  if (!/instagram\.com\/(reel|reels|p)\//.test(reelUrl)) return { videoUrl: null, displayUrl: null };

  const normalizedUrl = normalizeInstagramReelUrl(reelUrl);
  console.log("Extracting Instagram reel via Apify task:", normalizedUrl);

  try {
    const taskUrl = `https://api.apify.com/v2/actor-tasks/${APIFY_IG_TASK}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90`;
    const res = await fetch(taskUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: [normalizedUrl] }),
    });

    if (!res.ok) {
      console.error("Apify IG task error:", res.status, await res.text().catch(() => ""));
      return { videoUrl: null, displayUrl: null };
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.log("Apify IG task returned no items");
      return { videoUrl: null, displayUrl: null };
    }

    const item = items[0];
    const videoUrl = item.videoUrl || item.video_url || item.videoPlaybackUrl || item.download_url || null;
    const displayUrl = item.displayUrl || item.display_url || item.thumbnailUrl || item.thumbnail_url || null;

    if (videoUrl) {
      console.log("Instagram videoUrl from Apify task:", videoUrl.slice(0, 80) + "...");
    } else {
      console.log("No videoUrl in Apify task response, keys:", Object.keys(item).join(", "));
    }
    if (displayUrl) {
      console.log("Instagram displayUrl from Apify task:", displayUrl.slice(0, 80) + "...");
    }

    return { videoUrl, displayUrl };
  } catch (e) {
    console.error("Apify IG task error:", e);
    return { videoUrl: null, displayUrl: null };
  }
}

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
    const isInstagram = /instagram\.com\/(reel|reels|p)\//.test(url);

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

    // ─── Instagram: use Apify task to get direct CDN video URL + thumbnail ───
    let audioSourceUrl: string | null = null;
    let igDisplayUrl: string | null = null;
    if (isInstagram) {
      console.log("Instagram URL detected — resolving via Apify task...");
      const { videoUrl: igVideoUrl, displayUrl } = await extractInstagramVideoUrl(url);
      if (igVideoUrl) {
        audioSourceUrl = igVideoUrl;
        igDisplayUrl = displayUrl;
        console.log("Using Apify CDN videoUrl for audio extraction");
      } else {
        console.log("Apify task returned no videoUrl — falling back to VPS cobalt with original URL");
        // audioSourceUrl stays null → VPS /extract-audio receives original IG page URL
      }
    }

    // ─── Instagram: pass displayUrl raw — frontend proxies via VPS /proxy-image ───
    const igThumbnailUrl: string | null = igDisplayUrl || null;
    if (igThumbnailUrl) {
      console.log("Instagram displayUrl for thumbnail:", igThumbnailUrl.slice(0, 80) + "...");
    }

    // ─── Extract audio: prefer direct URL from Apify, fallback to yt-dlp server ───
    let videoCacheUrl: string | null = null;
    if (!transcription) {
      let audioBlob: Blob;
      // Track whether we fell back to a raw CDN download (MP4 container, not extracted MP3).
      // This determines which MIME type to declare when uploading to Whisper.
      let rawCdnFallback = false;

      if (audioSourceUrl) {
        // Download audio directly from Apify-provided CDN URL (no cookies needed)
        console.log("Downloading audio from direct video URL via yt-dlp server...");
        const ytdlpRes = await fetch(`${YTDLP_SERVER}/extract-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": YTDLP_API_KEY,
          },
          body: JSON.stringify({ url: audioSourceUrl, original_url: url }),
        });

        if (!ytdlpRes.ok) {
          // Try direct download as fallback — Instagram CDN serves MP4 directly
          console.log("yt-dlp failed on direct URL, trying raw CDN download...");
          const directRes = await fetch(audioSourceUrl);
          if (!directRes.ok) {
            throw new Error("Failed to download Instagram video audio");
          }
          audioBlob = await directRes.blob();
          rawCdnFallback = true; // raw MP4 video container, not extracted MP3
          console.log("Raw CDN download, content-type:", directRes.headers.get("content-type"));
        } else {
          videoCacheUrl = ytdlpRes.headers.get("X-Video-Cache") || null;
          if (videoCacheUrl) console.log("VPS cached video at:", videoCacheUrl);
          audioBlob = await ytdlpRes.blob();
        }
      } else {
        // Standard yt-dlp extraction (works for YouTube fallback, TikTok, etc.)
        console.log("Calling yt-dlp server...");
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
        audioBlob = await ytdlpRes.blob();
      }

      console.log("Audio received, size:", audioBlob.size, "bytes");

      if (audioBlob.size === 0) {
        throw new Error("Received empty audio from extraction server");
      }

      if (audioBlob.size > 25 * 1024 * 1024) {
        throw new Error("Video is too long for transcription (max ~25MB audio). Try a shorter clip.");
      }

      // Read blob content into ArrayBuffer once — calling arrayBuffer() twice on a
      // Response-derived Blob in Deno consumes the underlying stream the first time,
      // leaving an empty buffer on the second read.
      const audioBuffer = await audioBlob.arrayBuffer();

      console.log("Sending to OpenAI Whisper...");
      // Detect the actual container format by checking MP4 magic bytes (ftyp box at offset 4).
      // rawCdnFallback alone isn't enough — yt-dlp on a direct CDN URL can return the raw
      // MP4 container with HTTP 200 instead of an extracted MP3.
      let isMp4 = false;
      if (audioBuffer.byteLength >= 12) {
        const header = new Uint8Array(audioBuffer, 0, 12);
        isMp4 = header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70; // 'ftyp'
      }
      const whisperMime = (rawCdnFallback || isMp4) ? "video/mp4" : "audio/mpeg";
      const whisperFilename = (rawCdnFallback || isMp4) ? "audio.mp4" : "audio.mp3";
      console.log(`Whisper upload: mime=${whisperMime} filename=${whisperFilename} (rawCdnFallback=${rawCdnFallback} isMp4=${isMp4} bytes=${audioBuffer.byteLength})`);
      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: whisperMime }), whisperFilename);
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

    const thumbnailUrl = youtubeThumbnailUrl || igThumbnailUrl || null;
    // Prefer Apify CDN URL, fall back to VPS-cached video URL
    const finalVideoUrl = audioSourceUrl || videoCacheUrl || null;
    if (!audioSourceUrl && videoCacheUrl) {
      console.log("Apify returned no videoUrl — using VPS cache URL instead:", videoCacheUrl);
    }
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
