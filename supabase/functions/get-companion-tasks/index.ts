import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Get client record
    const { data: client } = await adminClient
      .from("clients")
      .select("id, onboarding_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ tasks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = client.id;
    const tasks = [];

    // 1. Onboarding incomplete (red)
    const od = client.onboarding_data || {};
    const onboardingDone = od && Object.keys(od).length >= 3;
    if (!onboardingDone) {
      tasks.push({
        id: "onboarding",
        titleEn: "Let's finish setting up your profile",
        titleEs: "Terminemos de configurar tu perfil",
        subtitleEn: "Your AI needs to know your brand and audience to help you.",
        subtitleEs: "Tu IA necesita conocer tu marca y audiencia para ayudarte.",
        priority: "red",
        actionLabelEn: "Complete profile",
        actionLabelEs: "Completar perfil",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/onboarding",
      });
    }

    // 2. No recent script (red if 5+ days)
    const { data: recentScript } = await adminClient
      .from("scripts")
      .select("created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceScript = recentScript
      ? Math.floor((Date.now() - new Date(recentScript.created_at).getTime()) / 86400000)
      : 999;

    if (daysSinceScript >= 5) {
      const daysLabel = daysSinceScript >= 999 ? "a while" : `${daysSinceScript} days`;
      const daysLabelEs = daysSinceScript >= 999 ? "un tiempo" : `${daysSinceScript} días`;
      tasks.push({
        id: "no_recent_script",
        titleEn: `You haven't posted in ${daysLabel}`,
        titleEs: `No has publicado en ${daysLabelEs}`,
        subtitleEn: "Your AI is ready to help you create something great. Let's go.",
        subtitleEs: "Tu IA está lista para ayudarte a crear algo genial. Vamos.",
        priority: "red",
        actionLabelEn: "Let's do it",
        actionLabelEs: "Vamos a hacerlo",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/scripts",
      });
    }

    // 3. Approved script not filmed yet (amber)
    const { data: approvedScripts } = await adminClient
      .from("scripts")
      .select("id")
      .eq("client_id", clientId)
      .eq("review_status", "approved")
      .limit(1);

    if (approvedScripts && approvedScripts.length > 0) {
      tasks.push({
        id: "time_to_film",
        titleEn: "Time to film",
        titleEs: "Es hora de filmar",
        subtitleEn: "Your script is approved. Upload your footage and your editor handles the rest.",
        subtitleEs: "Tu guión está aprobado. Sube tu metraje y tu editor se encarga del resto.",
        priority: "amber",
        actionLabelEn: "Upload footage",
        actionLabelEs: "Subir metraje",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/editing-queue",
      });
    }

    // 4. Video edit with no assignee (amber)
    const { data: stalledEdits } = await adminClient
      .from("video_edits")
      .select("id")
      .eq("client_id", clientId)
      .is("assignee", null)
      .is("deleted_at", null)
      .limit(1);

    if (stalledEdits && stalledEdits.length > 0) {
      tasks.push({
        id: "stalled_edit",
        titleEn: "Your video needs an editor",
        titleEs: "Tu video necesita un editor",
        subtitleEn: "Footage is uploaded but no editor is assigned yet.",
        subtitleEs: "El metraje está subido pero aún no hay editor asignado.",
        priority: "amber",
        actionLabelEn: "View editing queue",
        actionLabelEs: "Ver cola de edición",
        skipLabelEn: "Skip",
        skipLabelEs: "Omitir",
        actionPath: "/editing-queue",
      });
    }

    // 5. Calendar empty next 7 days (blue)
    const today = new Date().toISOString().slice(0, 10);
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { data: calendarItems } = await adminClient
      .from("video_edits")
      .select("id")
      .eq("client_id", clientId)
      .gte("schedule_date", today)
      .lte("schedule_date", nextWeek)
      .is("deleted_at", null)
      .limit(1);

    if (!calendarItems || calendarItems.length === 0) {
      tasks.push({
        id: "empty_calendar",
        titleEn: "Next week's calendar is empty",
        titleEs: "El calendario de la próxima semana está vacío",
        subtitleEn: "Once your content is ready, your AI can schedule it automatically.",
        subtitleEs: "Una vez que tu contenido esté listo, tu IA puede programarlo automáticamente.",
        priority: "blue",
        actionLabelEn: "View calendar",
        actionLabelEs: "Ver calendario",
        skipLabelEn: "Skip",
        skipLabelEs: "Omitir",
        actionPath: "/content-calendar",
      });
    }

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
