import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GETTRANSCRIBE_API_KEY = Deno.env.get("GETTRANSCRIBE_API_KEY");
  if (!GETTRANSCRIBE_API_KEY) {
    return new Response(JSON.stringify({ error: "GETTRANSCRIBE_API_KEY not configured" }), {
      status: 500,
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

    console.log("Transcribing video URL:", url);

    const response = await fetch("https://api.gettranscribe.ai/transcriptions", {
      method: "POST",
      headers: {
        "x-api-key": GETTRANSCRIBE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GetTranscribe API error:", response.status, errorText);
      throw new Error(`Transcription failed [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    console.log("GetTranscribe response keys:", Object.keys(data));

    // Extract transcription text - adapt to API response format
    const transcription = data.transcription || data.text || data.transcript || 
      (data.results && data.results.map((r: any) => r.text || r.transcript).join(" ")) ||
      (typeof data === "string" ? data : JSON.stringify(data));

    return new Response(JSON.stringify({ transcription }), {
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
