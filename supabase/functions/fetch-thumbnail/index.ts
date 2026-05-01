import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const YTDLP_SERVER = "http://72.62.200.145:3099";
const YTDLP_API_KEY = "ytdlp_connecta_2026_secret";

// ─── Instagram: get thumbnail via VPS Puppeteer (replaces Apify) ───
async function getInstagramThumbnailViaVPS(reelUrl: string): Promise<string | null> {
  try {
    console.log("Fetching IG thumbnail via VPS /ig-thumbnail:", reelUrl);
    const res = await fetch(`${YTDLP_SERVER}/ig-thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
      body: JSON.stringify({ url: reelUrl }),
    });
    if (!res.ok) { console.error("VPS ig-thumbnail error:", res.status); return null; }
    const data = await res.json();
    const thumbnailUrl = data.thumbnail_url || null;
    if (thumbnailUrl) console.log("VPS IG thumbnail:", thumbnailUrl.slice(0, 80) + "...");
    return thumbnailUrl;
  } catch (e) {
    console.error("VPS ig-thumbnail error:", e);
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Fetching thumbnail for:", url);

    let thumbnailUrl: string | null = null;

    // ---- YouTube ----
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) {
      const videoId = ytMatch[1];
      const maxRes = "https://img.youtube.com/vi/" + videoId + "/maxresdefault.jpg";
      const hq = "https://img.youtube.com/vi/" + videoId + "/hqdefault.jpg";
      const check = await fetch(maxRes, { method: "HEAD" });
      thumbnailUrl = (check.ok && check.headers.get("content-length") !== "1403")
        ? maxRes
        : hq;
      console.log("YouTube thumbnail:", thumbnailUrl);
    }

    // ---- TikTok ----
    if (!thumbnailUrl && url.includes("tiktok.com")) {
      const oembedUrl = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(url);
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const data = await res.json();
        thumbnailUrl = data.thumbnail_url || null;
        console.log("TikTok thumbnail:", thumbnailUrl);
      }
    }

    // ---- Facebook ----
    if (!thumbnailUrl && (url.includes("facebook.com") || url.includes("fb.watch"))) {
      try {
        console.log("Facebook URL — calling VPS /get-thumbnail (cached frame):", url);
        const vpsRes = await fetch(`${YTDLP_SERVER}/get-thumbnail`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
          body: JSON.stringify({ url }),
        });
        if (vpsRes.ok) {
          const vpsData = await vpsRes.json();
          if (vpsData.thumbnail_url) {
            thumbnailUrl = vpsData.thumbnail_url;
            console.log("Facebook VPS thumbnail OK, size:", thumbnailUrl.length);
          }
        }
      } catch (e) { console.error("Facebook VPS thumbnail error:", e); }
    }

    // ---- Instagram — VPS Puppeteer first, VPS cobalt+ffmpeg as fallback ----
    if (!thumbnailUrl && url.includes("instagram.com")) {
      thumbnailUrl = await getInstagramThumbnailViaVPS(url);

      // Fallback: VPS /get-thumbnail via cobalt + ffmpeg first frame
      if (!thumbnailUrl) {
        try {
          console.log("VPS Puppeteer returned no thumbnail — trying cobalt+ffmpeg:", url);
          const vpsRes = await fetch(`${YTDLP_SERVER}/get-thumbnail`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": YTDLP_API_KEY },
            body: JSON.stringify({ url }),
          });
          if (vpsRes.ok) {
            const vpsData = await vpsRes.json();
            if (vpsData.thumbnail_url) {
              thumbnailUrl = vpsData.thumbnail_url;
              console.log("VPS cobalt thumbnail OK, size:", thumbnailUrl.length);
            }
          }
        } catch (e) { console.error("VPS cobalt thumbnail error:", e); }
      }
    }

    return new Response(JSON.stringify({ thumbnail_url: thumbnailUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fetch-thumbnail error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
