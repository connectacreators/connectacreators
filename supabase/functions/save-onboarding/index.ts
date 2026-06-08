import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// DEPRECATED 2026-06-08. Anonymous onboarding saves were replaced by the
// login-gated form: authenticated clients now write clients.onboarding_data
// directly via RLS. This endpoint is retired to close the open write hole.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "This endpoint has been retired. Use the login-gated onboarding form." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
