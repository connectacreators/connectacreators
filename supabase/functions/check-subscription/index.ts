import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map Stripe product IDs to plan config
const PRODUCT_PLAN_MAP: Record<string, { plan_type: string; script_limit: number; lead_tracker_enabled: boolean; facebook_integration_enabled: boolean }> = {
  "prod_Tzx3VOK8V8gI11": { plan_type: "starter", script_limit: 75, lead_tracker_enabled: false, facebook_integration_enabled: false },
  "prod_Tzx4et0Y0iv6LI": { plan_type: "growth", script_limit: 200, lead_tracker_enabled: false, facebook_integration_enabled: false },
  "prod_Tzx4OBg3PpYuES": { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true },
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

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let planData = null;
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      const productId = subscription.items.data[0].price.product as string;
      logStep("Active subscription found", { subscriptionId: subscription.id, productId });

      planData = PRODUCT_PLAN_MAP[productId];
      if (planData) {
        // Update clients table with subscription data
        await supabaseClient
          .from("clients")
          .update({
            plan_type: planData.plan_type,
            script_limit: planData.script_limit,
            lead_tracker_enabled: planData.lead_tracker_enabled,
            facebook_integration_enabled: planData.facebook_integration_enabled,
            subscription_status: "active",
            stripe_customer_id: customerId,
          })
          .eq("user_id", user.id);
        logStep("Updated client record", planData);
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
