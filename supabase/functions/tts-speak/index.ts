// Text-to-speech read-back for the Command Deck's voice mode (/ai). Takes
// the assistant's reply text and returns spoken audio via ElevenLabs.
// Admin-gated (same cost-control pattern as generate-caption) since every
// call spends real ElevenLabs credits — this must never be reachable by an
// unauthenticated or non-admin caller. Text length is capped for the same
// reason: a runaway reply should never turn into a runaway TTS bill.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// "Danielle" — swapped from "Lily" 2026-07-28 after a live report that
// English replies sounded accented. Checked ElevenLabs' own voice metadata
// (GET /v2/voices) rather than guessing: Lily's verified_languages had ZERO
// English entries at all — she was never actually verified for English,
// only pressed into it via the multilingual model, same mechanism as the
// earlier Bella→Lily swap but in reverse (a Spanish-trained voice carries
// ITS accent into English, mirroring why an English-trained voice carried
// its accent into Spanish before). Danielle is one of the few voices in
// the account's library with BOTH en(canadian) and es(latin) as genuinely
// verified languages, not just multilingual-model-attempted — Canadian
// English reads as neutral/unaccented to most listeners, and es(latin)
// keeps the Latin American Spanish match the original swap was for.
// NOT verified by ear (no audio playback available when this was chosen)
// — flag it if this still isn't right and we'll pick a different one from
// the same verified-both-languages shortlist.
const VOICE_ID = "FVQMzxJGPUBtfz1Azdoy";
// eleven_multilingual_v2 — ElevenLabs' most life-like/emotionally rich
// model, prioritizing cross-lingual quality over raw speed. Switched from
// eleven_flash_v2_5 (their lowest-latency tier, optimized for speed over
// fidelity) for the same reason as the voice change above: a fluent-
// sounding bilingual reply matters more here than shaving latency once
// accent quality was the actual live complaint.
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Gate to admins only — the Command Deck itself is already admin-only,
  // this is defense in depth against the function URL being hit directly.
  const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Voice read-back is admin-only." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Voice read-back is not configured." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      // speed is a genuine ElevenLabs voice_settings field (REST range
      // 0.25-4.0, 1.0 = normal) — 1.15 is a noticeable but still-natural
      // bump, picked after a user request for faster replies; much higher
      // starts degrading audio quality per ElevenLabs' own docs.
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.15 },
    }),
  });

  if (!elevenRes.ok || !elevenRes.body) {
    const detail = await elevenRes.text().catch(() => "");
    console.error("[tts-speak] ElevenLabs error:", elevenRes.status, detail.slice(0, 500));
    return new Response(JSON.stringify({ error: "Voice read-back failed." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(elevenRes.body, {
    headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});
