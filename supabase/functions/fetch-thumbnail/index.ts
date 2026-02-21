import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let thumbnailUrl: string | null = null;

    // Try TikTok oEmbed first (works without auth)
    if (url.includes("tiktok.com")) {
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        }
      } catch { /* fall through */ }
    }

    // Try noembed.com (proxy for many oEmbed providers including Instagram)
    if (!thumbnailUrl) {
      try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        }
      } catch { /* fall through */ }
    }

    // Fallback: fetch the page HTML and extract og:image
    if (!thumbnailUrl) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": "text/html",
          },
          redirect: "follow",
        });
        if (res.ok) {
          const html = await res.text();
          // Try og:image
          const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
          if (ogMatch?.[1]) {
            thumbnailUrl = ogMatch[1];
          }
          // Try twitter:image as fallback
          if (!thumbnailUrl) {
            const twMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
            if (twMatch?.[1]) {
              thumbnailUrl = twMatch[1];
            }
          }
        }
      } catch { /* fall through */ }
    }

    return new Response(
      JSON.stringify({ thumbnail_url: thumbnailUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
