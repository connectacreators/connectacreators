import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VPS_SERVER = "http://72.62.200.145:3099";
const VPS_API_KEY = "ytdlp_connecta_2026_secret";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let query: string;
  let limit: number;
  try {
    const body = await req.json();
    query = String(body.query ?? "").trim();
    limit = Math.max(1, Math.min(Number(body.limit) || 15, 30));
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!query) return json({ error: "query is required" }, 400);

  // Provenance row first, so even a failed search leaves a trace of the attempt.
  const { data: run, error: runErr } = await supabase
    .from("ig_prospect_runs")
    .insert({ user_id: user.id, query, requested: limit })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: `Could not create run: ${runErr?.message}` }, 500);

  let users: Array<Record<string, unknown>> = [];
  try {
    const res = await fetch(`${VPS_SERVER}/ig-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": VPS_API_KEY },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      const text = await res.text();
      return json({
        error: `Instagram search failed (${res.status})`,
        detail: text.slice(0, 300),
        run_id: run.id,
      }, res.status === 503 ? 503 : 502);
    }
    const payload = await res.json();
    users = Array.isArray(payload.users) ? payload.users : [];
  } catch (e) {
    return json({ error: `Could not reach scraper: ${(e as Error).message}`, run_id: run.id }, 502);
  }

  // on conflict do nothing => a handle already in the table is silently skipped,
  // which is the whole point of the global unique(username).
  const rows = users.map((u) => ({
    username: String(u.username),
    user_id: user.id,
    run_id: run.id,
    ig_user_id: u.user_id ? String(u.user_id) : null,
    full_name: (u.full_name as string) ?? null,
    follower_count: (u.follower_count as number) ?? null,
    profile_pic_url: (u.profile_pic_url as string) ?? null,
    is_verified: !!u.is_verified,
    is_private: !!u.is_private,
  }));

  let inserted: unknown[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("ig_prospects")
      .upsert(rows, { onConflict: "username", ignoreDuplicates: true })
      .select("*");
    if (error) return json({ error: `Insert failed: ${error.message}`, run_id: run.id }, 500);
    inserted = data ?? [];
  }

  await supabase
    .from("ig_prospect_runs")
    .update({ returned: users.length, inserted: inserted.length })
    .eq("id", run.id);

  return json({
    run_id: run.id,
    returned: users.length,
    inserted: inserted.length,
    already_known: users.length - inserted.length,
    prospects: inserted,
  });
});
