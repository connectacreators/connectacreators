import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let scriptId: string | null = url.searchParams.get("id");
  if (!scriptId && req.method === "POST") {
    try { scriptId = (await req.json())?.id ?? null; } catch { /* ignore */ }
  }

  if (!scriptId || !UUID_RE.test(scriptId)) {
    return new Response(JSON.stringify({ error: "Invalid script id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: script, error: scriptError } = await admin
    .from("scripts")
    .select("title, idea_ganadora, target, formato, inspiration_url")
    .eq("id", scriptId)
    .is("deleted_at", null)
    .maybeSingle();

  if (scriptError) {
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!script) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: lines } = await admin
    .from("script_lines")
    .select("line_type, text, section, line_number")
    .eq("script_id", scriptId)
    .order("line_number");

  return new Response(
    JSON.stringify({
      script,
      lines: (lines ?? []).map(({ line_type, text, section }) => ({ line_type, text, section })),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
