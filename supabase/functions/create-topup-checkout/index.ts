import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Credit pack definitions
const PACKS: Record<string, { credits: number; amount: number; name: string }> = {
  small:  { credits: 1000,  amount: 500,  name: "1,000 Credits" },
  medium: { credits: 4000,  amount: 1500, name: "4,000 Credits" },
  large:  { credits: 10000, amount: 3000, name: "10,000 Credits" },
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-TOPUP-CHECKOUT] ${step}${detailsStr}`);
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
    logStep("User authenticated", { userId: user.id });

    const { pack_type } = await req.json();
    const pack = PACKS[pack_type];
    if (!pack) throw new Error(`Invalid pack_type: ${pack_type}`);
    logStep("Pack selected", { pack_type, ...pack });

    // Find the user's primary client for metadata
    const { data: link } = await supabaseClient
      .from("subscriber_clients")
      .select("client_id")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();

    let clientId = link?.client_id;
    if (!clientId) {
      // Fallback: direct user_id lookup
      const { data: c } = await supabaseClient
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      clientId = c?.id;
    }

    if (!clientId) throw new Error("No client record found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Look up existing customer (top-ups require an existing customer)
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No Stripe customer found. You must have an active subscription to buy top-ups.");
    }
    const customerId = customers.data[0].id;

    const origin = "https://connectacreators.com";

    // Create one-time payment checkout session (not subscription)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: pack.name,
            description: `One-time purchase — credits never expire`,
          },
          unit_amount: pack.amount,
        },
        quantity: 1,
      }],
      mode: "payment",
      ui_mode: "embedded",
      return_url: `${origin}/topup-success?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        type: "credit_topup",
        pack_type,
        credits: String(pack.credits),
        client_id: clientId,
        supabase_user_id: user.id,
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ client_secret: session.client_secret }), {
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
