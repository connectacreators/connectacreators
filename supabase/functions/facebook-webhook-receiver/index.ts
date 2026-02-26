import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FB_API = "https://graph.facebook.com/v19.0";
const VERIFY_TOKEN = Deno.env.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN")!;

serve(async (req) => {
  // ─── GET: Hub Challenge Verification ───────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── POST: Lead Event ──────────────────────────────────────────────
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return new Response("Bad Request", { status: 400 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      await processWebhookEvent(body, supabase);
    } catch (err) {
      console.error("Webhook processing error:", err);
    }

    // Always return 200 to prevent Meta from retrying
    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function processWebhookEvent(body: any, supabase: any) {
  // Facebook sends: { object: "page", entry: [...] }
  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    const pageId = entry.id;

    for (const change of entry.changes || []) {
      if (change.field !== "leadgen") continue;

      const leadgenId = change.value?.leadgen_id;
      const formId = change.value?.form_id;

      if (!leadgenId || !formId) continue;

      console.log(`Processing lead ${leadgenId} from form ${formId} on page ${pageId}`);

      // 1. Find which client owns this page
      const { data: pageRow } = await supabase
        .from("facebook_pages")
        .select("client_id, page_access_token, page_name")
        .eq("page_id", pageId)
        .maybeSingle();

      if (!pageRow) {
        console.warn(`No client found for page ${pageId}`);
        continue;
      }

      try {
        // 2. Fetch lead details from Graph API
        const leadRes = await fetch(
          `${FB_API}/${leadgenId}?fields=id,created_time,field_data,form_id,ad_id,ad_name,adset_id,campaign_id&access_token=${pageRow.page_access_token}`
        );

        if (!leadRes.ok) {
          console.error(`Failed to fetch lead ${leadgenId}: ${leadRes.status}`);
          continue;
        }

        const leadData = await leadRes.json();

        // 3. Parse field_data array into flat object
        // field_data = [{ name: "full_name", values: ["John Doe"] }, ...]
        const fields: Record<string, string> = {};
        for (const field of leadData.field_data || []) {
          const key = field.name.toLowerCase().replace(/\s+/g, "_");
          fields[key] = field.values?.[0] || "";
        }

        const triggerData = {
          full_name: fields.full_name || fields.name || "",
          email: fields.email || "",
          phone: fields.phone_number || fields.phone || "",
          form_id: formId,
          form_name: "",
          page_id: pageId,
          page_name: pageRow.page_name,
          facebook_lead_id: leadgenId,
          source: "Facebook Lead Ads",
          created_at: leadData.created_time || new Date().toISOString(),
          raw_fields: fields,
        };

        // 4. Optionally get form name from cached forms table
        const { data: formRow } = await supabase
          .from("facebook_lead_forms")
          .select("form_name")
          .eq("form_id", formId)
          .maybeSingle();
        if (formRow) triggerData.form_name = formRow.form_name;

        // 5. Upsert lead into leads table (so it appears in LeadTracker)
        const { data: insertedLead } = await supabase
          .from("leads")
          .upsert(
            {
              client_id: pageRow.client_id,
              full_name: triggerData.full_name,
              email: triggerData.email,
              phone: triggerData.phone,
              status: "Meta Ad (Not Booked)",
              source: "Facebook Lead Ads",
              facebook_lead_id: leadgenId,
              facebook_form_id: formId,
              created_at: triggerData.created_at,
            },
            { onConflict: "facebook_lead_id" }
          )
          .select()
          .single();

        // 6. Find active workflows for this client with trigger_type='new_lead'
        const { data: workflows } = await supabase
          .from("client_workflows")
          .select("*")
          .eq("client_id", pageRow.client_id)
          .eq("trigger_type", "new_lead")
          .eq("is_active", true);

        for (const workflow of workflows || []) {
          // Check form_id filter
          const workflowFormId =
            workflow.trigger_config?.facebook_form_id ||
            workflow.facebook_form_id;
          if (workflowFormId && workflowFormId !== formId) {
            console.log(
              `Skipping workflow ${workflow.id} — form_id mismatch (${workflowFormId} !== ${formId})`
            );
            continue;
          }

          // Check page_id filter
          const workflowPageId =
            workflow.trigger_config?.facebook_page_id ||
            workflow.facebook_page_id;
          if (workflowPageId && workflowPageId !== pageId) {
            console.log(
              `Skipping workflow ${workflow.id} — page_id mismatch (${workflowPageId} !== ${pageId})`
            );
            continue;
          }

          // Fire the workflow
          try {
            console.log(`Firing workflow ${workflow.id} for lead ${leadgenId}`);
            await supabase.functions.invoke("execute-workflow", {
              body: {
                workflow_id: workflow.id,
                client_id: pageRow.client_id,
                trigger_data: {
                  ...triggerData,
                  lead_id: insertedLead?.id,
                },
                steps: workflow.steps,
              },
            });

            // Update last_triggered_at
            await supabase
              .from("client_workflows")
              .update({ last_triggered_at: new Date().toISOString() })
              .eq("id", workflow.id);
          } catch (wfErr) {
            console.error(`Failed to fire workflow ${workflow.id}:`, wfErr);
          }
        }

        console.log(
          `Processed lead ${leadgenId} for client ${pageRow.client_id}`
        );
      } catch (err) {
        console.error(`Error processing lead ${leadgenId}:`, err);
      }
    }
  }
}
