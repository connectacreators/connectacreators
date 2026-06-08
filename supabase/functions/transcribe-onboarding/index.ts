import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Decode a base64 string to bytes without blowing the stack on large inputs.
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Require an authenticated user — the onboarding form is login-gated.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { audioBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { audioBase64, mimeType = "audio/webm" } = body;
  if (!audioBase64) return json({ error: "Missing audio" }, 400);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "Transcription not configured" }, 500);

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return json({ error: "Invalid audio encoding" }, 400);
  }

  if (bytes.length === 0) return json({ error: "Empty audio" }, 400);
  if (bytes.length > 25 * 1024 * 1024) {
    return json({ error: "Recording too long (max 25MB). Try a shorter clip." }, 400);
  }

  const ext = MIME_EXT[mimeType.split(";")[0]] || "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), `voice.${ext}`);
  form.append("model", "whisper-1");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Whisper error:", res.status, errText);
      return json({ error: "Transcription failed" }, 502);
    }
    const result = await res.json();
    return json({ text: (result.text || "").trim() });
  } catch (e) {
    console.error("transcribe-onboarding error:", e);
    return json({ error: "Transcription failed" }, 500);
  }
});
