import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const APIFY_TOKEN = "apify_api_XcMx5KAjTPY1wBow3wgTaA3Y4wdiwL0MbbI2";
const APIFY_IG_TASK = "connectacreators~instagram-reel-scraper-task";

function normalizeInstagramReelUrl(url: string): string {
  return url.replace(/\/reels\/([A-Za-z0-9_-]+)/, "/reel/$1");
}

async function getInstagramThumbnailViaApify(reelUrl: string): Promise<string | null> {
  try {
    const normalizedUrl = normalizeInstagramReelUrl(reelUrl);
    console.log("Fetching IG thumbnail via Apify task:", normalizedUrl);
    const taskUrl = `https://api.apify.com/v2/actor-tasks/${APIFY_IG_TASK}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90`;
    const res = await fetch(taskUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: [normalizedUrl] }),
    });
    if (!res.ok) { console.error("Apify IG task error:", res.status); return null; }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;
    const item = items[0];
    const displayUrl = item.displayUrl || item.display_url || item.thumbnailUrl || item.thumbnail_url || null;
    if (!displayUrl) return null;
    console.log("Apify IG displayUrl:", displayUrl.slice(0, 80) + "...");
    // Return raw CDN URL — browser will proxy it through VPS /proxy-image to avoid CORS block
    return displayUrl;
  } catch (e) {
    console.error("Apify IG task thumbnail error:", e);
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
        const vpsRes = await fetch("http://72.62.200.145:3099/get-thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": "ytdlp_connecta_2026_secret" },
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

    // ---- Instagram — Apify task (displayUrl) first, VPS cobalt as fallback ----
    if (!thumbnailUrl && url.includes("instagram.com")) {
      thumbnailUrl = await getInstagramThumbnailViaApify(url);

      // Fallback: VPS /get-thumbnail via cobalt + ffmpeg first frame
      if (!thumbnailUrl) {
        try {
          console.log("Apify returned no thumbnail — trying VPS cobalt:", url);
          const vpsRes = await fetch("http://72.62.200.145:3099/get-thumbnail", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": "ytdlp_connecta_2026_secret" },
            body: JSON.stringify({ url }),
          });
          if (vpsRes.ok) {
            const vpsData = await vpsRes.json();
            if (vpsData.thumbnail_url) {
              thumbnailUrl = vpsData.thumbnail_url;
              console.log("VPS IG thumbnail OK, size:", thumbnailUrl.length);
            }
          }
        } catch (e) { console.error("VPS IG thumbnail error:", e); }
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
