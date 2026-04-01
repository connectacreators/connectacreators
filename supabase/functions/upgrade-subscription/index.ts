import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAN_PRICE_MAP: Record<string, string> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER") || "price_1TCX3SCp1qPE081LCBJc8avw",
  growth: Deno.env.get("STRIPE_PRICE_GROWTH") || "price_1TCX3SCp1qPE081LSkPmF8FN",
  enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
};

const PLAN_CONFIG: Record<string, { script_limit: number; lead_tracker_enabled: boolean; facebook_integration_enabled: boolean; credits_monthly_cap: number }> = {
  starter: { script_limit: 75, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 10000 },
  growth: { script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 30000 },
  enterprise: { script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 75000 },
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[UPGRADE-SUBSCRIPTION] ${step}${detailsStr}`);
};

async function getPrimaryClientId(
  adminClient: ReturnType<typeof createClient>,
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
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { new_plan_type } = await req.json();
    if (!new_plan_type || !PLAN_PRICE_MAP[new_plan_type]) {
      throw new Error(`Invalid plan type: ${new_plan_type}`);
    }
    logStep("Upgrade requested", { new_plan_type });

    // Get stripe_customer_id from clients table
    const primaryClientId = await getPrimaryClientId(supabaseClient, user.id);
    if (!primaryClientId) {
      throw new Error("No client record found for this user");
    }
    const { data: clientData, error: clientError } = await supabaseClient
      .from("clients")
      .select("stripe_customer_id, plan_type")
      .eq("id", primaryClientId)
      .single();

    if (clientError || !clientData?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this user");
    }

    if (clientData.plan_type === new_plan_type) {
      throw new Error("You are already on this plan");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = clientData.stripe_customer_id;
    logStep("Found customer", { customerId, currentPlan: clientData.plan_type });

    // Find active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found to upgrade");
    }

    const subscription = subscriptions.data[0];
    const subscriptionItemId = subscription.items.data[0].id;
    logStep("Found subscription", { subscriptionId: subscription.id, itemId: subscriptionItemId });

    // If subscription was set to cancel at period end, undo that
    if (subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
      });
      logStep("Removed cancel_at_period_end flag");
    }

    // Swap the plan with proration
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: subscriptionItemId,
          price: PLAN_PRICE_MAP[new_plan_type],
        },
      ],
      proration_behavior: "always_invoice",
    });

    logStep("Subscription upgraded", { newSubscriptionId: updatedSubscription.id });

    // Update clients table
    const config = PLAN_CONFIG[new_plan_type];
    await supabaseClient
      .from("clients")
      .update({
        plan_type: new_plan_type,
        script_limit: config.script_limit,
        credits_monthly_cap: config.credits_monthly_cap,
        lead_tracker_enabled: config.lead_tracker_enabled,
        facebook_integration_enabled: config.facebook_integration_enabled,
        subscription_status: "active",
      })
      .eq("id", primaryClientId);

    // Update client_limit on subscriptions table
    const CLIENT_LIMITS: Record<string, number> = {
      starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
    };
    await supabaseClient.from("subscriptions")
      .update({ client_limit: CLIENT_LIMITS[new_plan_type] || 1 })
      .eq("user_id", user.id);

    logStep("Client record updated", { new_plan_type, ...config });

    return new Response(
      JSON.stringify({ success: true, plan_type: new_plan_type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
