import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YTDLP_SERVER = "http://72.62.200.145:3099";
const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";
const CREDIT_COST = 50;

// ─── VPS cobalt-proxy: resolve social media URL to cached video ───
async function resolveVideoUrlViaCobalt(pageUrl: string): Promise<{ url: string | null; thumbnail: string | null; title: string | null }> {
  try {
    console.log("Resolving video URL via VPS /cobalt-proxy:", pageUrl);
    const res = await fetch(`${YTDLP_SERVER}/cobalt-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
      body: JSON.stringify({ url: pageUrl }),
    });
    if (!res.ok) { console.error("VPS cobalt-proxy error:", res.status); return { url: null, thumbnail: null, title: null }; }
    const data = await res.json();
    return {
      url: data.url || null,
      thumbnail: data.thumbnail || null,
      title: data.title || null,
    };
  } catch (e) {
    console.error("VPS cobalt-proxy resolve error:", e);
    return { url: null, thumbnail: null, title: null };
  }
}

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  // Try junction table first (if it exists)
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id;

  // Fallback: direct clients.user_id lookup
  const { data: client } = await adminClient
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return client?.id ?? null;
}


// Deduct credits — atomic via DB function (no race condition).
async function deductCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  if (cost === 0) return null;

  const { data: roleData } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = roleData?.role;
  if (role === "admin" || role === "videographer" || role === "editor" || role === "connecta_plus") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return null;

  const { data: result, error } = await adminClient.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId, p_action: action, p_cost: cost,
  });
  if (error) { console.error("Credit deduction error:", error); return null; }
  if (!result?.ok) return JSON.stringify(result);
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Session expired. Please refresh the page and try again." }), {
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
    return new Response(JSON.stringify({ error: "Session expired. Please refresh the page and try again." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url, source, viral_video_id } = await req.json() as {
      url: string;
      source?: string;
      viral_video_id?: string | null;
    };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = source === "competitor"
      ? "transcribe_competitor_post"
      : source === "build_mode"
        ? "transcribe_for_build"
        : "add_video_to_vault";
    const creditErr = await deductCredits(adminClient, user.id, action, CREDIT_COST);
    if (creditErr) {
      return new Response(creditErr, {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize Instagram /p/ URLs to /reel/ format (yt-dlp + cobalt prefer /reel/)
    let normalizedUrl = url;
    const igPostMatch = url.match(/instagram\.com\/p\/([^/?]+)/);
    if (igPostMatch) {
      normalizedUrl = `https://www.instagram.com/reel/${igPostMatch[1]}/`;
      console.log("Normalized IG /p/ → /reel/:", normalizedUrl);
    }

    console.log("Transcribing video URL:", normalizedUrl);

    let transcription: string | null = null;
    const isYouTube = /(?:youtube\.com\/|youtu\.be\/)/.test(normalizedUrl);

    // ─── Step 1: Resolve video URL via VPS cobalt-proxy (all platforms) ───
    // This caches the video on VPS and returns the cached URL + metadata
    console.log("Resolving video via VPS cobalt-proxy...");
    const cobaltResult = await resolveVideoUrlViaCobalt(url);
    const cachedVideoUrl = cobaltResult.url;
    let videoTitle = cobaltResult.title;
    let thumbnailUrl = cobaltResult.thumbnail;

    if (cachedVideoUrl) {
      console.log("VPS cobalt-proxy cached URL:", cachedVideoUrl.slice(0, 80) + "...");
    } else {
      console.log("VPS cobalt-proxy returned no cached URL — will pass original URL to /extract-audio");
    }

    // ─── Step 2: YouTube thumbnail fallback (free CDN) ───
    if (isYouTube && !thumbnailUrl) {
      const ytIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytIdMatch) {
        const videoId = ytIdMatch[1];
        const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
          const thumbCheck = await fetch(maxresUrl, { method: "HEAD" });
          const cLen = thumbCheck.headers.get("content-length");
          thumbnailUrl = (thumbCheck.ok && cLen !== "1403")
            ? maxresUrl
            : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        } catch {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }
    }

    // ─── Step 2.5: YouTube captions fast-path (free, instant) ───
    if (isYouTube) {
      console.log("YouTube detected — trying captions fast-path...");
      try {
        const captionsRes = await fetch(`${YTDLP_SERVER}/youtube-captions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
          body: JSON.stringify({ url }),
        });
        if (captionsRes.ok) {
          const captionsData = await captionsRes.json();
          if (captionsData.captions && captionsData.captions.length > 50) {
            console.log(`YouTube captions found! Length: ${captionsData.captions.length} chars`);
            transcription = captionsData.captions;
          } else {
            console.log("YouTube captions empty or too short, falling back to Whisper");
          }
        }
      } catch (e) {
        console.log("YouTube captions fetch failed, falling back to Whisper:", e.message);
      }
    }

    // ─── Step 3: Extract audio via VPS and transcribe with Whisper ───
    // Only if captions weren't found (non-YouTube or no captions available)
    let videoCacheUrl: string | null = cachedVideoUrl || null;
    if (!transcription) {
    // VPS /extract-audio handles all platforms (cobalt for IG/TikTok, yt-dlp+WARP for YouTube, Puppeteer for FB)
    const extractionUrl = cachedVideoUrl || url;
    console.log("Calling VPS /extract-audio with:", extractionUrl.slice(0, 100) + "...");

    const ytdlpRes = await fetch(`${YTDLP_SERVER}/extract-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": YTDLP_API_KEY,
      },
      body: JSON.stringify({ url: extractionUrl, original_url: url }),
    });

    if (!ytdlpRes.ok) {
      const err = await ytdlpRes.json().catch(() => ({ error: "Audio extraction failed" }));
      console.error("VPS /extract-audio error:", ytdlpRes.status, err);
      throw new Error(err.error || `Audio extraction failed (${ytdlpRes.status})`);
    }

    videoCacheUrl = ytdlpRes.headers.get("X-Video-Cache") || cachedVideoUrl || null;
    const vpsContentType = ytdlpRes.headers.get("Content-Type") || "unknown";
    const vpsContentLength = ytdlpRes.headers.get("Content-Length") || "unknown";
    console.log("VPS response — Content-Type:", vpsContentType, "Content-Length:", vpsContentLength);
    if (videoCacheUrl) console.log("VPS cached video at:", videoCacheUrl);

    const rawBytes = new Uint8Array(await ytdlpRes.arrayBuffer());

    if (rawBytes.byteLength === 0) {
      throw new Error("Received empty audio from extraction server");
    }

    if (rawBytes.byteLength > 25 * 1024 * 1024) {
      throw new Error("Video is too long for transcription (max ~25MB audio). Try a shorter clip.");
    }

    // Log header bytes for MP3 verification
    const hexHeader = Array.from(rawBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, "0")).join(" ");
    console.log(`Audio: ${rawBytes.byteLength} bytes, header: [${hexHeader}]`);

    const audioBlob = new Blob([rawBytes.buffer], { type: "audio/mpeg" });
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");

    console.log("Sending", audioBlob.size, "bytes to Whisper...");
    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    const whisperBody = await whisperRes.text();
    console.log("Whisper status:", whisperRes.status, "body:", whisperBody.slice(0, 500));

    if (!whisperRes.ok) {
      throw new Error(`Transcription failed [${whisperRes.status}]: ${whisperBody}`);
    }

    const result = JSON.parse(whisperBody);
    transcription = result.text;
    console.log("Whisper text length:", transcription?.length ?? 0);

    if (transcription === "") {
      transcription = "(No speech detected in this video)";
    }
    } // end if (!transcription) — Whisper fallback block

    if (transcription === null || transcription === undefined) {
      throw new Error("Could not transcribe video — audio extraction or transcription failed");
    }

    console.log("Transcription complete, length:", transcription!.length, "chars");

    // Facebook thumbnail fallback: now that /extract-audio has cached the video,
    // /get-thumbnail can extract a frame from the cached file
    const isFacebook = /facebook\.com|fb\.watch/.test(url);
    if (!thumbnailUrl && isFacebook && videoCacheUrl) {
      try {
        console.log("Facebook: calling /get-thumbnail now that video is cached");
        const thumbRes = await fetch(`${YTDLP_SERVER}/get-thumbnail`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
          body: JSON.stringify({ url }),
        });
        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();
          if (thumbData.thumbnail_url) {
            thumbnailUrl = thumbData.thumbnail_url;
            console.log("Facebook thumbnail extracted, size:", thumbnailUrl!.length);
          }
        }
      } catch (e) {
        console.error("Facebook thumbnail fallback failed:", e);
      }
    }

    // If caller provided a viral_video_id, persist transcript so subsequent
    // draft_script calls can reuse it without re-billing the user.
    if (viral_video_id && typeof viral_video_id === "string") {
      const update: Record<string, unknown> = {
        transcript: transcription,
        transcript_status: "done",
        transcribed_at: new Date().toISOString(),
        transcript_error: null,
      };
      if (thumbnailUrl) update.thumbnail_url = thumbnailUrl;
      const { error: persistErr } = await adminClient
        .from("viral_videos")
        .update(update)
        .eq("id", viral_video_id);
      if (persistErr) console.warn("[transcribe-video] persist to viral_videos failed:", persistErr.message);
    }

    // Return cached video URL for frontend playback + metadata
    const finalVideoUrl = videoCacheUrl || null;
    return new Response(JSON.stringify({
      transcription,
      videoUrl: finalVideoUrl,
      thumbnail_url: thumbnailUrl ?? null,
      video_title: videoTitle ?? null,
    }), {
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
