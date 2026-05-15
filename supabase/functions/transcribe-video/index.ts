import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { canonicalizeVideoUrl } from "../_shared/canonicalize-video-url.ts";
import { runFullAnalysis, ViralVideoRow } from "../_shared/viral-video-analyzer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CREDIT_COST = 50;

async function getPrimaryClientId(
  adminClient: any,
  userId: string
): Promise<string | null> {
  // Try junction table first (if it exists)
  const { data } = await adminClient
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id;

  // Fallback: direct clients.user_id lookup
  const { data: client } = await adminClient
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return client?.id ?? null;
}

// Deduct credits — atomic via DB function (no race condition).
async function deductCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  if (cost === 0) return null;

  const { data: roleData } = await adminClient
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = roleData?.role;
  if (role === "admin" || role === "videographer" || role === "editor" || role === "connecta_plus") return null;

  const primaryClientId = await getPrimaryClientId(adminClient, userId);
  if (!primaryClientId) return null;

  const { data: result, error } = await adminClient.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId, p_action: action, p_cost: cost,
  });
  if (error) { console.error("Credit deduction error:", error); return null; }
  if (!result?.ok) return JSON.stringify(result);
  return null;
}

// Refund credits on analyzer failure.
async function refundCredits(
  adminClient: any,
  userId: string,
  action: string,
  cost: number,
): Promise<void> {
  if (cost === 0) return;
  try {
    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const role = roleData?.role;
    if (role === "admin" || role === "videographer" || role === "editor" || role === "connecta_plus") return;

    const primaryClientId = await getPrimaryClientId(adminClient, userId);
    if (!primaryClientId) return;

    // Use deduct_credits_atomic with a negative cost — same RPC as the
    // shared _shared/credits.ts helper, since refund_credits_atomic does
    // not exist as a separate RPC in this schema.
    await adminClient.rpc("deduct_credits_atomic", {
      p_client_id: primaryClientId, p_action: `refund:${action}`, p_cost: -cost,
    });
  } catch (e) {
    console.error("Credit refund error (non-fatal):", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Session expired. Please refresh the page and try again." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Session expired. Please refresh the page and try again." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url, source, viral_video_id } = await req.json() as {
      url: string;
      source?: string;
      viral_video_id?: string | null;
    };
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = source === "competitor"
      ? "transcribe_competitor_post"
      : source === "build_mode"
        ? "transcribe_for_build"
        : "add_video_to_vault";

    // ─── Step 1: Resolve to a viral_videos row (BEFORE credit deduction so we can noop on cache) ───
    let row: ViralVideoRow;

    if (viral_video_id && typeof viral_video_id === "string") {
      // Caller already has a row — load it.
      const { data: existing, error: loadErr } = await adminClient
        .from("viral_videos")
        .select("*")
        .eq("id", viral_video_id)
        .maybeSingle();
      if (loadErr || !existing) {
        // Row not found — treat as a URL-only call.
        console.warn("[transcribe-video] viral_video_id not found, falling back to URL resolve:", viral_video_id);
        row = await resolveOrCreateRow(adminClient as any, url, user.id);
      } else {
        row = existing as ViralVideoRow;
      }
    } else {
      // No ID — canonicalize URL and find or create.
      row = await resolveOrCreateRow(adminClient as any, url, user.id);
    }

    // ─── Cache short-circuit: row already analyzed and file still valid → return without charging ───
    // This mirrors the noop behavior in /analyze-viral-video-user so callers (Save to Vault, Canvas,
    // AIScriptWizard, etc.) never get charged twice for the same URL across surfaces.
    if (
      row.analysis_status === "analyzed" &&
      row.video_file_url &&
      row.video_file_expires_at &&
      new Date(row.video_file_expires_at) > new Date()
    ) {
      console.log("[transcribe-video] cache hit — returning cached analysis, no credit charge");
      return new Response(JSON.stringify({
        transcription: row.transcript ?? "",
        videoUrl: row.video_file_url,
        thumbnail_url: (row as any).thumbnail_url ?? null,
        video_title: null,
        cached: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 2: Credit deduction (after resolve, before work) ───
    const creditErr = await deductCredits(adminClient, user.id, action, CREDIT_COST);
    if (creditErr) {
      return new Response(creditErr, {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 3: Run full analysis ───
    let patch: Awaited<ReturnType<typeof runFullAnalysis>>;
    try {
      patch = await runFullAnalysis(
        adminClient as any,
        row,
        (row as any).caption ?? null,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
      );
    } catch (analyzerErr: any) {
      console.error("[transcribe-video] runFullAnalysis failed:", analyzerErr);
      // Refund credits and mark row as failed.
      await refundCredits(adminClient, user.id, action, CREDIT_COST);
      await adminClient
        .from("viral_videos")
        .update({
          analysis_status: "failed",
          analysis_error: analyzerErr?.message ?? String(analyzerErr),
        })
        .eq("id", row.id);
      return new Response(
        JSON.stringify({ error: analyzerErr?.code ?? "analyzer_failed", message: analyzerErr?.message ?? "Analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── Step 3: Persist the patch to viral_videos ───
    const { error: updateErr } = await adminClient
      .from("viral_videos")
      .update({
        transcript: patch.transcript,
        framework_meta: patch.framework_meta,
        hook_text: patch.hook_text,
        cta_text: patch.cta_text,
        transcribed_at: patch.transcribed_at,
        video_file_url: patch.video_file_url,
        video_file_expires_at: patch.video_file_expires_at,
        analysis_status: "analyzed",
        analysis_error: null,
      })
      .eq("id", row.id);
    if (updateErr) {
      console.warn("[transcribe-video] viral_videos update failed:", updateErr.message);
    }

    // ─── Step 4: Return legacy response shape ───
    return new Response(JSON.stringify({
      transcription: patch.transcript,
      videoUrl: patch.video_file_url,
      thumbnail_url: (row as any).thumbnail_url ?? null,
      video_title: null,
    }), {
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

// ─── Helper: find-or-create a viral_videos row from a URL ───
async function resolveOrCreateRow(
  adminClient: any,
  url: string,
  userId: string,
): Promise<ViralVideoRow> {
  // Normalize Instagram /p/ → /reel/
  let normalizedUrl = url;
  const igPostMatch = url.match(/instagram\.com\/p\/([^/?]+)/);
  if (igPostMatch) {
    normalizedUrl = `https://www.instagram.com/reel/${igPostMatch[1]}/`;
  }

  const canonical = canonicalizeVideoUrl(normalizedUrl);

  // If not canonicalizable (e.g. a raw MP4 link), insert a stub with platform="facebook"
  // as a best-effort fallback so we still get a row to hang analysis from.
  if (!canonical) {
    console.warn("[transcribe-video] URL not canonical, inserting generic stub:", normalizedUrl.slice(0, 80));
    const { data: inserted, error: insertErr } = await adminClient
      .from("viral_videos")
      .insert({
        platform: "facebook",
        apify_video_id: crypto.randomUUID(),
        video_url: normalizedUrl,
        channel_username: "unknown",
        analysis_status: "pending",
        user_submitted: true,
        submitted_by: userId,
        outlier_score: 0,
        views_count: 0,
        likes_count: 0,
        comments_count: 0,
        scraped_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);
    return inserted;
  }

  // Try to find existing row.
  const { data: existing, error: findErr } = await adminClient
    .from("viral_videos")
    .select("*")
    .eq("platform", canonical.platform)
    .eq("apify_video_id", canonical.postId)
    .maybeSingle();
  if (findErr) throw new Error(`DB find failed: ${findErr.message}`);
  if (existing) return existing;

  // Extract channel_username from URL (mirror viral-video-resolve logic).
  let channelUsername = "unknown";
  const igHandle = canonical.normalizedUrl.match(/instagram\.com\/([^/]+)\/(?:reel|p)\//);
  const ttHandle = url.match(/tiktok\.com\/@([^/]+)\/video\//);
  if (igHandle) channelUsername = igHandle[1];
  else if (ttHandle) channelUsername = ttHandle[1];

  // Insert pending stub.
  const insertPayload = {
    platform: canonical.platform,
    apify_video_id: canonical.postId,
    video_url: canonical.normalizedUrl,
    channel_username: channelUsername,
    analysis_status: "pending",
    user_submitted: true,
    submitted_by: userId,
    outlier_score: 0,
    views_count: 0,
    likes_count: 0,
    comments_count: 0,
    scraped_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await adminClient
    .from("viral_videos")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr) {
    // 23505 = unique violation; race. Re-select.
    if (insertErr.code === "23505") {
      const { data: winner } = await adminClient
        .from("viral_videos")
        .select("*")
        .eq("platform", canonical.platform)
        .eq("apify_video_id", canonical.postId)
        .single();
      if (winner) return winner;
    }
    throw new Error(`DB insert failed: ${insertErr.message}`);
  }

  return inserted;
}
