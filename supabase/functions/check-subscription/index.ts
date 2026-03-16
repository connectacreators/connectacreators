import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map Stripe product IDs to plan config
const PRODUCT_PLAN_MAP: Record<string, {
  plan_type: string;
  script_limit: number;
  lead_tracker_enabled: boolean;
  facebook_integration_enabled: boolean;
  credits_monthly_cap: number;
  channel_scrapes_limit: number;
}> = {
  "prod_Tzx3VOK8V8gI11": { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: false, facebook_integration_enabled: false, credits_monthly_cap: 500,  channel_scrapes_limit: 5  },
  "prod_Tzx4et0Y0iv6LI": { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: false, facebook_integration_enabled: false, credits_monthly_cap: 1500, channel_scrapes_limit: 12 },
  "prod_Tzx4OBg3PpYuES": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true,  facebook_integration_enabled: true,  credits_monthly_cap: 3500, channel_scrapes_limit: 25 },
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const allSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const subscription = allSubs.data.find(s => s.status === "active" || s.status === "trialing") ?? null;
    const hasActiveSub = subscription !== null;

    let planData = null;
    let subscriptionEnd = null;
    let trialEndsAt = null;

    if (hasActiveSub) {
      // Log the full subscription keys to understand the shape
      logStep("Subscription keys", { keys: Object.keys(subscription) });
      logStep("Subscription raw data", {
        id: subscription.id,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        current_period_end_type: typeof subscription.current_period_end,
        current_period_end_str: String(subscription.current_period_end),
      });

      // Extremely defensive date handling
      try {
        const rawEnd = subscription.current_period_end;
        if (rawEnd === null || rawEnd === undefined) {
          subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          logStep("WARNING: current_period_end is null, defaulting to +30 days");
        } else if (typeof rawEnd === "number" && !isNaN(rawEnd)) {
          const ms = rawEnd < 1e12 ? rawEnd * 1000 : rawEnd;
          subscriptionEnd = new Date(ms).toISOString();
        } else if (typeof rawEnd === "string" && rawEnd.length > 0) {
          const parsed = Date.parse(rawEnd);
          if (!isNaN(parsed)) {
            subscriptionEnd = new Date(parsed).toISOString();
          } else {
            // Try parsing as unix timestamp string
            const num = Number(rawEnd);
            if (!isNaN(num)) {
              const ms = num < 1e12 ? num * 1000 : num;
              subscriptionEnd = new Date(ms).toISOString();
            } else {
              subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              logStep("WARNING: Unparseable string current_period_end", { rawEnd });
            }
          }
        } else if (typeof rawEnd === "object" && rawEnd !== null) {
          // Some Stripe versions return Date objects or objects with valueOf
          const val = rawEnd.valueOf ? rawEnd.valueOf() : Number(rawEnd);
          if (typeof val === "number" && !isNaN(val)) {
            const ms = val < 1e12 ? val * 1000 : val;
            subscriptionEnd = new Date(ms).toISOString();
          } else {
            subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            logStep("WARNING: Object current_period_end not convertible", { rawEnd: String(rawEnd) });
          }
        } else {
          subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          logStep("WARNING: Unknown current_period_end type", { type: typeof rawEnd });
        }
      } catch (dateErr) {
        subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        logStep("WARNING: Exception parsing date, defaulting to +30 days", { error: String(dateErr) });
      }

      logStep("Resolved subscriptionEnd", { subscriptionEnd });

      // Parse trial_end if subscription is trialing
      if (subscription.status === "trialing" && subscription.trial_end) {
        trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
      }

      const productId = subscription.items.data[0].price.product as string;
      logStep("Active subscription found", { subscriptionId: subscription.id, status: subscription.status, productId, subscriptionEnd });

      planData = PRODUCT_PLAN_MAP[productId];
      if (planData) {
        const subscriptionStatus = subscription.status === "trialing" ? "trialing" : "active";

        // Update clients table with subscription data
        await supabaseClient
          .from("clients")
          .update({
            plan_type: planData.plan_type,
            script_limit: planData.script_limit,
            lead_tracker_enabled: planData.lead_tracker_enabled,
            facebook_integration_enabled: planData.facebook_integration_enabled,
            credits_monthly_cap: planData.credits_monthly_cap,
            channel_scrapes_limit: planData.channel_scrapes_limit,
            subscription_status: subscriptionStatus,
            trial_ends_at: trialEndsAt,
            stripe_customer_id: customerId,
          })
          .eq("user_id", user.id);
        logStep("Updated client record", { ...planData, subscriptionStatus, trialEndsAt });

        // Initialize credits for new subscribers (only if credits_monthly_cap is not yet set)
        const { data: clientRow } = await supabaseClient
          .from("clients")
          .select("id, credits_monthly_cap")
          .eq("user_id", user.id)
          .maybeSingle();

        if (clientRow && (clientRow.credits_monthly_cap ?? 0) === 0) {
          const TRIAL_CREDITS = 100;
          const grantAmount = subscription.status === "trialing" ? TRIAL_CREDITS : planData.credits_monthly_cap;
          await supabaseClient.from("clients").update({
            credits_monthly_cap: planData.credits_monthly_cap,
            channel_scrapes_limit: planData.channel_scrapes_limit,
            credits_balance: grantAmount,
            credits_used: 0,
            channel_scrapes_used: 0,
            credits_reset_at: new Date(subscription.current_period_end * 1000).toISOString(),
          }).eq("user_id", user.id);

          await supabaseClient.from("credit_transactions").insert({
            client_id: clientRow.id,
            action: "initial_grant",
            credits: grantAmount,
            metadata: { plan_type: planData.plan_type, is_trial: subscription.status === "trialing" },
          });
          logStep("Initialized credits for new subscriber", { grantAmount, planType: planData.plan_type });
        }

        // Sync to subscriptions table for admin Subscribers page visibility
        try {
          await supabaseClient
            .from("subscriptions")
            .upsert({
              user_id: user.id,
              email: user.email,
              full_name: user.user_metadata?.full_name ?? null,
              plan_type: planData.plan_type,
              status: subscription.status === "trialing" ? "trialing" : "active",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              subscribed_at: new Date(subscription.created * 1000).toISOString(),
              is_manually_assigned: false,
              updated_at: new Date().toISOString(),
            }, { onConflict: "email" });
          logStep("Synced to subscriptions table");
        } catch (syncErr) {
          // Non-fatal: don't block subscription confirmation if sync fails
          logStep("WARNING: Failed to sync subscriptions table", { error: String(syncErr) });
        }

        // Assign 'user' role if not already admin or videographer
        const { data: existingRoles } = await supabaseClient
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const hasAdminOrVideographer = existingRoles?.some(
          (r: any) => r.role === "admin" || r.role === "videographer"
        );

        if (!hasAdminOrVideographer) {
          const hasUserRole = existingRoles?.some((r: any) => r.role === "user");
          if (!hasUserRole) {
            await supabaseClient
              .from("user_roles")
              .insert({ user_id: user.id, role: "user" });
            logStep("Assigned 'user' role to subscriber");
          }
        }
      }
    } else {
      logStep("No active subscription");
      // Mark as inactive if no active subscription
      await supabaseClient
        .from("clients")
        .update({ subscription_status: "inactive" })
        .eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSub,
        plan_type: planData?.plan_type || null,
        subscription_end: subscriptionEnd,
        trial_ends_at: trialEndsAt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
