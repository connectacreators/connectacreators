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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a",
};

async function transcribe(bytes: Uint8Array, mimeType: string, openaiKey: string): Promise<string> {
  const ext = MIME_EXT[mimeType.split(";")[0]] || "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), `voice.${ext}`);
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return (result.text || "").trim();
}

async function suggestFollowUps(
  question: string,
  transcript: string,
  alreadyAsked: string[],
  anthropicKey: string,
): Promise<string[]> {
  const system =
    "You are a concise interview coach helping someone give a richer, more specific answer out loud. " +
    "Given the question they are answering and what they have said so far, propose 1-3 VERY short follow-up " +
    "prompts (max ~6 words each) that pull out concrete, specific details they have not covered yet — " +
    "numbers, names, dates, examples, outcomes. Do not repeat anything in 'already asked'. " +
    "Return ONLY a compact JSON array of strings, nothing else.";

  const user =
    `Question they're answering: "${question}"\n` +
    `What they've said so far: "${transcript}"\n` +
    `Already asked: ${alreadyAsked.length ? alreadyAsked.join(" | ") : "(none)"}\n` +
    `Return 1-3 short follow-up prompts as a JSON array of strings.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "[]";

  // Extract the JSON array even if the model adds stray text.
  const match = text.match(/\[[\s\S]*\]/);
  let arr: unknown = [];
  try {
    arr = JSON.parse(match ? match[0] : text);
  } catch {
    arr = [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: { audioBase64?: string; mimeType?: string; question?: string; alreadyAsked?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { audioBase64, mimeType = "audio/webm", question = "", alreadyAsked = [] } = body;
  if (!audioBase64) return json({ error: "Missing audio" }, 400);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!openaiKey || !anthropicKey) return json({ error: "Coaching not configured" }, 500);

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return json({ error: "Invalid audio encoding" }, 400);
  }
  if (bytes.length === 0) return json({ questions: [], transcript: "" });
  if (bytes.length > 25 * 1024 * 1024) return json({ error: "Audio too large" }, 400);

  try {
    const transcript = await transcribe(bytes, mimeType, openaiKey);
    // Too little said yet — no suggestions, save a model call.
    if (transcript.split(/\s+/).filter(Boolean).length < 6) {
      return json({ questions: [], transcript });
    }
    const questions = await suggestFollowUps(question, transcript, alreadyAsked, anthropicKey);
    return json({ questions, transcript });
  } catch (e) {
    console.error("onboarding-live-coach error:", e);
    return json({ questions: [], error: "Coaching failed" }, 200); // soft-fail: never block recording
  }
});
