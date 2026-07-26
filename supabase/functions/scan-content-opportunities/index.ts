// supabase/functions/scan-content-opportunities/index.ts
//
// Proactive "what to post" tips — daily scan that finds each client's best
// unseen matching viral video and surfaces it as a companion_alerts row
// (kind='content_opportunity'), the same proactive-detection table the
// stuck_client/edit_overdue/etc. scanner already uses. Unlike those five
// (a plain SQL function, scan_companion_alerts() in
// supabase/migrations/20260507_companion_alerts.sql), this one is an edge
// function because the client->niche derivation needs the same JS regex
// mapping ViralToday.tsx's "For You" sort uses — reimplementing it in raw
// SQL would create a second copy to keep in sync (exactly the kind of
// drift that caused the "For You doesn't filter by relevance" bug fixed
// earlier — see video-taxonomy.ts's CANONICAL_NICHES comment).
//
// IMPORTANT: INDUSTRY_TO_NICHE below MUST be kept in sync with the
// identical table in src/pages/ViralToday.tsx. No shared package exists
// between the Vite frontend and Deno edge functions in this repo, so this
// is a deliberate, documented duplication rather than a shared module.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = "connectacreators-cron-2026";

// Keep in sync with src/pages/ViralToday.tsx's INDUSTRY_TO_NICHE.
const INDUSTRY_TO_NICHE: Array<[RegExp, string]> = [
  [/chiropract|physical therap|physio|sports med|wellness|holistic|nutritionist|dietitian/i, "fitness"],
  [/personal train|fitness|gym|crossfit|yoga|pilates/i, "fitness"],
  [/realtor|real estate|mortgage|broker|home loan/i, "real_estate"],
  [/sales|sdr|closer|appointment setter|outbound|cold call/i, "sales"],
  [/financ|cpa|account|tax|wealth|invest|bookkeep|insurance/i, "finance"],
  [/coach|consult|mentor|advisor|life coach|business coach/i, "coaching"],
  [/ecommerce|shopify|amazon fba|dtc|drop ship|online store/i, "ecommerce"],
  [/saas|software|tech|developer|engineer|startup|founder/i, "saas_tech"],
  [/beauty|esthetic|skincare|makeup|cosmetic|hair stylist|salon|nail/i, "beauty"],
  [/food|chef|restaurant|recipe|bakery|cafe/i, "food"],
  [/mindset|self help|productivity|motivation|stoic/i, "mindset"],
  [/dating|relationship|marriage|couples therapy/i, "relationships"],
  [/teach|tutor|education|course creator|professor/i, "education"],
  [/lifestyle|vlog|travel|fashion|home decor/i, "lifestyle"],
  [/parent|mom|dad|family|baby|toddler/i, "parenting"],
  [/immigration/i, "immigration"],
  [/lawyer|attorney|legal|law firm/i, "legal_services"],
  [/dentist|doctor|medical|surgeon|clinic|aesthetics|med spa/i, "health"],
];

function deriveNiche(onboardingData: Record<string, unknown> | null): string | null {
  if (!onboardingData) return null;
  const industryText = [onboardingData.industry, onboardingData.industryOther, onboardingData.niche]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ");
  if (!industryText) return null;
  for (const [re, slug] of INDUSTRY_TO_NICHE) {
    if (re.test(industryText)) return slug;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: clients, error: clientsErr } = await admin
    .from("clients")
    .select("id, name, user_id, onboarding_data")
    .not("user_id", "is", null);

  if (clientsErr) {
    return new Response(JSON.stringify({ error: clientsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let inserted = 0;
  let skippedNoNiche = 0;
  let skippedHasOpen = 0;
  let skippedNoMatch = 0;

  for (const client of clients ?? []) {
    const niche = deriveNiche(client.onboarding_data as Record<string, unknown> | null);
    if (!niche) { skippedNoNiche++; continue; }

    // Only ever surface ONE open tip per client at a time — a wall of
    // suggestions defeats the "one clear thing to check today" point.
    const { data: existingOpen } = await admin
      .from("companion_alerts")
      .select("id")
      .eq("client_id", client.id)
      .eq("kind", "content_opportunity")
      .is("dismissed_at", null)
      .limit(1)
      .maybeSingle();
    if (existingOpen) { skippedHasOpen++; continue; }

    // Videos already suggested to this client (dismissed or not) are never
    // suggested again — check dedupe keys directly rather than relying
    // solely on the unique index, since dismissed rows aren't covered by
    // the partial index and we still don't want to repeat a dismissed idea.
    const { data: alreadySuggested } = await admin
      .from("companion_alerts")
      .select("payload")
      .eq("client_id", client.id)
      .eq("kind", "content_opportunity");
    const seenVideoIds = new Set(
      (alreadySuggested ?? []).map((a: { payload: Record<string, unknown> }) => a.payload?.video_id).filter(Boolean),
    );

    const { data: candidates } = await admin
      .from("viral_videos")
      .select("id, caption, hook_text, thumbnail_url, video_url, channel_username, platform, outlier_score, views_count, posted_at")
      .eq("primary_niche", niche)
      .gte("posted_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .not("outlier_score", "is", null)
      .order("outlier_score", { ascending: false })
      .limit(20);

    const best = (candidates ?? []).find((v) => !seenVideoIds.has(v.id));
    if (!best) { skippedNoMatch++; continue; }

    const captionPreview = (best.hook_text || best.caption || "").slice(0, 120);
    const { error: insertErr } = await admin.from("companion_alerts").insert({
      user_id: client.user_id,
      client_id: client.id,
      kind: "content_opportunity",
      severity: "low",
      title: `New idea for ${client.name}: ${captionPreview}`,
      body: `A ${niche.replace(/_/g, " ")} video from @${best.channel_username ?? "unknown"} is outperforming (${Math.round((best.outlier_score ?? 0) * 10) / 10}x baseline). Could be a strong reference for ${client.name}'s next post.`,
      payload: {
        video_id: best.id,
        video_url: best.video_url,
        caption: best.caption,
        hook_text: best.hook_text,
        thumbnail_url: best.thumbnail_url,
        channel_username: best.channel_username,
        platform: best.platform,
        outlier_score: best.outlier_score,
        views_count: best.views_count,
        niche,
      },
      dedupe_key: `content_opportunity:${client.id}:${best.id}`,
    });
    if (!insertErr) inserted++;
  }

  return new Response(
    JSON.stringify({ inserted, skippedNoNiche, skippedHasOpen, skippedNoMatch, totalClients: (clients ?? []).length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
