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
    const od = client.onboarding_data || {};

    // 1. Onboarding incomplete (red)
    const requiredFields = ["clientName", "industry", "uniqueOffer", "targetClient", "story"];
    const onboardingDone = requiredFields.every((f) => od[f] && String(od[f]).trim().length > 3);
    if (!onboardingDone) {
      tasks.push({
        id: "onboarding",
        titleEn: "Finish setting up your profile",
        titleEs: "Termina de configurar tu perfil",
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

    // 2. No Instagram handle (red) — blocks the whole content workflow
    const hasInstagram = od.instagram && String(od.instagram).trim().length > 1;
    if (onboardingDone && !hasInstagram) {
      tasks.push({
        id: "no_instagram",
        titleEn: "Add your Instagram handle",
        titleEs: "Agrega tu usuario de Instagram",
        subtitleEn: "Without it, your AI can't reference your account or track your content.",
        subtitleEs: "Sin él, tu IA no puede referenciar tu cuenta ni rastrear tu contenido.",
        priority: "red",
        actionLabelEn: "Add it now",
        actionLabelEs: "Agrégalo ahora",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/onboarding",
      });
    }

    // 3. Fetch strategy + this month's progress counts in parallel
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const iso = monthStart.toISOString();
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const monthProgressPct = dayOfMonth / daysInMonth; // 0–1

    const [
      { data: strategy },
      { count: scriptsThisMonth },
      { count: videosEditedThisMonth },
      { count: postsScheduledThisMonth },
      { data: recentScript },
      { data: approvedScripts },
      { data: stalledEdits },
      { data: calendarItems },
    ] = await Promise.all([
      adminClient.from("client_strategies").select("*").eq("client_id", clientId).maybeSingle(),
      adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", iso),
      adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
      adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("schedule_date", iso.slice(0, 10)).is("deleted_at", null),
      adminClient.from("scripts").select("created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      adminClient.from("scripts").select("id").eq("client_id", clientId).eq("review_status", "approved").limit(1),
      adminClient.from("video_edits").select("id").eq("client_id", clientId).is("assignee", null).is("deleted_at", null).limit(1),
      adminClient.from("video_edits").select("id").eq("client_id", clientId).gte("schedule_date", new Date().toISOString().slice(0, 10)).lte("schedule_date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).is("deleted_at", null).limit(1),
    ]);

    const scriptGoal = strategy?.scripts_per_month ?? 20;
    const videoGoal = strategy?.videos_edited_per_month ?? 20;
    const postGoal = strategy?.posts_per_month ?? 20;
    const scriptsDone = scriptsThisMonth ?? 0;
    const videosDone = videosEditedThisMonth ?? 0;
    const postsDone = postsScheduledThisMonth ?? 0;

    // Expected by now based on how far through the month we are
    const expectedScripts = Math.floor(scriptGoal * monthProgressPct);
    const behindOnScripts = scriptsDone < expectedScripts - 2; // 2-script grace buffer

    // 4. Strategy: behind on monthly script goal (red)
    if (behindOnScripts && scriptsDone < scriptGoal) {
      const remaining = scriptGoal - scriptsDone;
      tasks.push({
        id: "behind_scripts",
        titleEn: `You're behind — ${scriptsDone}/${scriptGoal} scripts this month`,
        titleEs: `Estás atrasado — ${scriptsDone}/${scriptGoal} guiones este mes`,
        subtitleEn: `${remaining} more to hit your goal. Let's write some now.`,
        subtitleEs: `${remaining} más para alcanzar tu meta. Escribamos ahora.`,
        priority: "red",
        actionLabelEn: "Write scripts",
        actionLabelEs: "Escribir guiones",
        skipLabelEn: "Later",
        skipLabelEs: "Después",
        actionPath: "/scripts",
      });
    } else if (!behindOnScripts) {
      // 5. No recent script (red if 5+ days, only when not already flagged as behind)
      const daysSinceScript = recentScript
        ? Math.floor((Date.now() - new Date(recentScript.created_at).getTime()) / 86400000)
        : 999;
      if (daysSinceScript >= 5) {
        const daysLabel = daysSinceScript >= 999 ? "a while" : `${daysSinceScript} days`;
        const daysLabelEs = daysSinceScript >= 999 ? "un tiempo" : `${daysSinceScript} días`;
        tasks.push({
          id: "no_recent_script",
          titleEn: `No new scripts in ${daysLabel}`,
          titleEs: `Sin guiones nuevos en ${daysLabelEs}`,
          subtitleEn: "Your AI is ready to help you create something great.",
          subtitleEs: "Tu IA está lista para ayudarte a crear algo genial.",
          priority: "red",
          actionLabelEn: "Let's do it",
          actionLabelEs: "Vamos a hacerlo",
          skipLabelEn: "Later",
          skipLabelEs: "Después",
          actionPath: "/scripts",
        });
      }
    }

    // 6. Approved script not filmed yet (amber)
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

    // 7. Video edit with no assignee (amber)
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

    // 8. ManyChat not set up (amber) — strategy says it's a priority
    const manychatActive = strategy?.manychat_active ?? false;
    const manychatKeyword = strategy?.manychat_keyword ?? "";
    if (!manychatActive || !manychatKeyword) {
      tasks.push({
        id: "manychat_not_set",
        titleEn: "ManyChat isn't set up yet",
        titleEs: "ManyChat no está configurado aún",
        subtitleEn: "Set a keyword trigger on your posts to auto-DM leads. This doubles your conversions.",
        subtitleEs: "Configura un trigger de palabra clave para auto-DM de leads. Esto duplica tus conversiones.",
        priority: "amber",
        actionLabelEn: "Set it up",
        actionLabelEs: "Configurarlo",
        skipLabelEn: "Skip",
        skipLabelEs: "Omitir",
        actionPath: `/clients/${clientId}/strategy`,
      });
    }

    // 9. Calendar empty next 7 days (blue)
    if (!calendarItems || calendarItems.length === 0) {
      tasks.push({
        id: "empty_calendar",
        titleEn: "Next week's calendar is empty",
        titleEs: "El calendario de la próxima semana está vacío",
        subtitleEn: `You've scheduled ${postsDone}/${postGoal} posts this month. Once content is ready, your AI can schedule it.`,
        subtitleEs: `Has programado ${postsDone}/${postGoal} publicaciones este mes. Una vez listo el contenido, tu IA puede programarlo.`,
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
