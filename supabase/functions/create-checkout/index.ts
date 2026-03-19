import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Price IDs read from env vars (set in Supabase Dashboard → Edge Functions → Secrets)
// Fallback to hardcoded values if env vars not set
const PLAN_PRICE_MAP: Record<string, string> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER") || "price_1TCX3SCp1qPE081LCBJc8avw",
  growth: Deno.env.get("STRIPE_PRICE_GROWTH") || "price_1TCX3SCp1qPE081LSkPmF8FN",
  enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
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

    const { plan_type, phone } = await req.json();
    if (!plan_type || !PLAN_PRICE_MAP[plan_type]) {
      throw new Error(`Invalid plan_type: ${plan_type}`);
    }
    logStep("Plan selected", { plan_type });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Look up or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing Stripe customer found", { customerId });
      // Update phone if provided
      if (phone) {
        await stripe.customers.update(customerId, { phone });
      }
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        phone: phone || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      logStep("New Stripe customer created", { customerId });
    }

    // Save stripe_customer_id to clients table
    await supabaseClient
      .from("clients")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", user.id);

    const origin = "https://connectacreators.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: PLAN_PRICE_MAP[plan_type], quantity: 1 }],
      mode: "subscription",
      ui_mode: "embedded",
      payment_method_collection: "always",
      return_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { plan_type, supabase_user_id: user.id },
      subscription_data: {
        trial_period_days: 7,
        metadata: { plan_type, supabase_user_id: user.id },
      },
    });

    logStep("Embedded checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ client_secret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
