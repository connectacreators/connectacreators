import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get all active scheduled workflows
    const { data: workflows, error: fetchError } = await adminClient
      .from("client_workflows")
      .select("*")
      .eq("trigger_type", "schedule")
      .eq("is_active", true);

    if (fetchError) {
      throw fetchError;
    }

    let executed = 0;
    let checked = workflows?.length ?? 0;

    // Function to determine if a workflow should run now
    function shouldRunNow(preset: string, lastRun: string | null): boolean {
      const now = new Date();
      const todayAt9 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
      const last = lastRun ? new Date(lastRun) : null;

      switch (preset) {
        case "daily_9am":
          // Run if today at 9am has passed AND (lastRun is null OR lastRun was before today at 9am)
          return now >= todayAt9 && (!last || last < todayAt9);

        case "monday_9am":
          // Run if today is Monday at 9am has passed AND (lastRun is null OR lastRun was before this Monday at 9am)
          const isMonday = now.getDay() === 1;
          return isMonday && now >= todayAt9 && (!last || last < todayAt9);

        case "monthly_1st":
          // Run if today is 1st of month at 9am has passed AND (lastRun is null OR lastRun was in a previous month)
          const is1st = now.getDate() === 1;
          return (
            is1st &&
            now >= todayAt9 &&
            (!last ||
              last.getMonth() < now.getMonth() ||
              last.getFullYear() < now.getFullYear())
          );

        default:
          return false;
      }
    }

    // Execute workflows that are due
    for (const workflow of workflows || []) {
      const schedulePreset = workflow.trigger_config?.schedule_preset;
      if (!schedulePreset) {
        console.warn(`Workflow ${workflow.id} missing schedule_preset`);
        continue;
      }

      if (shouldRunNow(schedulePreset, workflow.last_triggered_at)) {
        try {
          // Invoke execute-workflow
          await adminClient.functions.invoke("execute-workflow", {
            body: {
              workflow_id: workflow.id,
              client_id: workflow.client_id,
              trigger_data: {
                source: "schedule",
                preset: schedulePreset,
                triggered_at: new Date().toISOString(),
              },
              steps: workflow.steps,
            },
          });

          // Update last_triggered_at
          await adminClient
            .from("client_workflows")
            .update({ last_triggered_at: new Date().toISOString() })
            .eq("id", workflow.id);

          executed++;
          console.log(`Executed scheduled workflow: ${workflow.id}`);
        } catch (wfErr) {
          console.error(`Error executing workflow ${workflow.id}:`, wfErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked,
        executed,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("run-scheduled-workflows error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
