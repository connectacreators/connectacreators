import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CONVERT-TO-AGENCY-CLIENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr) throw new Error(`Auth error: ${authErr.message}`);
    if (!userData.user) throw new Error("Not authenticated");
    logStep("Caller authenticated", { userId: userData.user.id });

    // Verify caller is admin
    const { data: roleRows, error: roleErr } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    if (roleErr) throw new Error(`Role check failed: ${roleErr.message}`);
    const isAdmin = (roleRows || []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin access required");
    logStep("Caller is admin");

    const { user_id: targetUserId } = await req.json();
    if (!targetUserId) throw new Error("Missing user_id");

    logStep("Converting user", { targetUserId });

    // 1. Fetch target client record
    const { data: client, error: clientErr } = await adminClient
      .from("clients")
      .select("id, name, email, plan_type, stripe_customer_id, subscription_status")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (clientErr) throw new Error(`Failed to fetch client: ${clientErr.message}`);
    if (!client) throw new Error("Client record not found");

    logStep("Found client", { clientId: client.id, currentPlan: client.plan_type });

    if (client.plan_type === "connecta_plus") {
      throw new Error("Client is already an agency client");
    }

    // 2. Cancel Stripe subscription immediately (if exists)
    if (client.stripe_customer_id) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        try {
          const subs = await stripe.subscriptions.list({
            customer: client.stripe_customer_id,
            status: "all",
            limit: 10,
          });
          for (const sub of subs.data) {
            if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
              await stripe.subscriptions.cancel(sub.id);
              logStep("Canceled Stripe subscription", { subId: sub.id, wasStatus: sub.status });
            }
          }
        } catch (stripeErr) {
          logStep("WARNING: Stripe cancellation failed (non-fatal)", { error: String(stripeErr) });
        }
      }
    }

    // 3. Update clients record to connecta_plus
    const { error: updateErr } = await adminClient
      .from("clients")
      .update({
        plan_type: "connecta_plus",
        subscription_status: "active",
        credits_monthly_cap: 0,
        credits_balance: 0,
        credits_used: 0,
        channel_scrapes_limit: 25,
        channel_scrapes_used: 0,
        script_limit: 500,
        lead_tracker_enabled: true,
        facebook_integration_enabled: true,
        trial_ends_at: null,
        pending_plan_type: null,
        pending_plan_effective_date: null,
      })
      .eq("id", client.id);

    if (updateErr) throw new Error(`Failed to update client: ${updateErr.message}`);

    // 4. Update user_roles: remove 'user' role, add 'connecta_plus' role
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("role", "user");

    // Check if connecta_plus role already exists
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("role", "connecta_plus")
      .maybeSingle();

    if (!existingRole) {
      const { error: insertRoleErr } = await adminClient
        .from("user_roles")
        .insert({ user_id: targetUserId, role: "connecta_plus" });
      if (insertRoleErr) {
        logStep("WARNING: role insert failed (non-fatal)", { error: insertRoleErr.message });
      }
    }
    logStep("Role updated to connecta_plus");

    // 5. Update subscriptions table (if row exists)
    await adminClient
      .from("subscriptions")
      .update({
        plan_type: "connecta_plus",
        status: "active",
        client_limit: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", targetUserId);

    logStep("Conversion complete", { clientId: client.id, name: client.name });

    return new Response(JSON.stringify({
      ok: true,
      message: `${client.name} converted to Agency Client successfully`,
      client_id: client.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
