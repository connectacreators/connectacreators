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

// ─── Apify ───
const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_YT_ACTOR = "streamers~youtube-scraper";
const APIFY_IG_ACTOR = "apify~instagram-reel-scraper";

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return data?.client_id ?? null;
}

function normalizeInstagramReelUrl(url: string): string {
  return url.replace(/\/reels\/([A-Za-z0-9_-]+)/, "/reel/$1");
}

// ─── Instagram: get CDN video URL via Apify reel scraper ───
async function extractInstagramVideoUrl(pageUrl: string): Promise<string | null> {
  try {
    const normalizedUrl = normalizeInstagramReelUrl(pageUrl);
    console.log("Fetching IG video URL via Apify:", normalizedUrl);

    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_IG_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`;
    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [normalizedUrl],
        resultsLimit: 1,
      }),
    });

    if (!res.ok) {
      console.error("Apify IG reel error:", res.status, await res.text().catch(() => ""));
      return null;
    }

    const items = await res.json();
    console.log("Apify IG reel response: items count =", Array.isArray(items) ? items.length : 0);
    if (!Array.isArray(items) || items.length === 0) return null;

    const item = items[0];
    // Log all available URL fields for debugging
    console.log("Apify IG item keys:", Object.keys(item).join(", "));
    const videoUrl = item.videoUrl || item.video_url || item.videoPlaybackUrl || null;
    console.log("Apify IG videoUrl:", videoUrl ? videoUrl.slice(0, 100) + "..." : "null");
    return videoUrl;
  } catch (e) {
    console.error("Apify IG reel extraction error:", e);
    return null;
  }
}

// ─── YouTube: extract transcript from captions ───
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
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleData?.role === "admin") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) {
    return JSON.stringify({ error: "No client record found" });
  }
  const { data: client, error: fetchErr } = await adminClient
    .from("clients")
    .select("id, credits_balance, credits_used")
    .eq("id", primaryClientId)
    .single();

  if (fetchErr || !client) return null;

  if ((client.credits_balance ?? 0) < cost) {
    return JSON.stringify({
      error: `Insufficient credits. You need ${cost} credits but only have ${client.credits_balance ?? 0}.`,
      insufficient_credits: true,
      balance: client.credits_balance ?? 0,
      needed: cost,
    });
  }

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
    const isInstagram = /instagram\.com/.test(url);

    // ─── YouTube: try caption extraction first (fast, free) ───
    if (isYouTube) {
      console.log("YouTube URL detected — trying Apify transcript extraction...");
      transcription = await extractYouTubeTranscript(url);
      if (transcription) {
        console.log("YouTube transcript extracted successfully, length:", transcription.length);
      } else {
        console.log("No YouTube transcript available, falling back to audio extraction...");
      }
    }

    // ─── YouTube: construct thumbnail URL ───
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
          } else {
            youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }
        } catch {
          youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
      }
    }

    // ─── Instagram: get CDN video URL via Apify, then pass to VPS ───
    let igCdnVideoUrl: string | null = null;
    if (isInstagram) {
      console.log("Instagram URL detected — calling Apify reel scraper for CDN URL...");
      igCdnVideoUrl = await extractInstagramVideoUrl(url);
      if (igCdnVideoUrl) {
        console.log("Got Instagram CDN video URL, will pass to VPS for extraction");
      } else {
        console.log("No CDN URL from Apify — will try page URL with VPS cobalt");
      }
    }

    // ─── Extract audio via VPS (uses CDN URL for IG if available, page URL otherwise) ───
    let videoCacheUrl: string | null = null;
    if (!transcription) {
      // For Instagram: prefer CDN URL from Apify (direct download on VPS)
      // Fallback: original page URL (VPS uses cobalt to resolve)
      const extractionUrl = igCdnVideoUrl || url;
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
        console.error("yt-dlp server error:", ytdlpRes.status, err);
        throw new Error(err.error || `Audio extraction failed (${ytdlpRes.status})`);
      }

      videoCacheUrl = ytdlpRes.headers.get("X-Video-Cache") || null;
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
    }

    if (transcription === null || transcription === undefined) {
      throw new Error("Could not transcribe video — audio extraction or transcription failed");
    }
    if (transcription === "") {
      transcription = "(No speech detected in this video)";
    }

    console.log("Transcription complete, length:", transcription.length, "chars");

    // For Instagram: return CDN URL so frontend can proxy via /proxy-video (supports Range/seeking)
    // For others: return VPS cache URL
    const finalVideoUrl = igCdnVideoUrl || videoCacheUrl || null;
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
