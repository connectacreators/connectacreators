import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Look up stripe_customer_id from clients table
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (clientError) {
      console.error("[get-subscription] Client lookup error:", clientError);
      return new Response(JSON.stringify({ error: "Error looking up client" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!client?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ subscription: null, invoices: [], message: "No Stripe customer linked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Fetch active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: client.stripe_customer_id,
      status: "all",
      limit: 1,
      expand: ["data.default_payment_method"],
    });

    const sub = subscriptions.data[0] || null;

    let subscription = null;
    if (sub) {
      const item = sub.items.data[0];
      subscription = {
        id: sub.id,
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        plan_name: item?.price?.nickname || item?.price?.product || "Subscription",
        amount: item?.price?.unit_amount || 0,
        currency: item?.price?.currency || "usd",
        interval: item?.price?.recurring?.interval || "month",
      };
    }

    // Fetch invoices
    const invoicesRes = await stripe.invoices.list({
      customer: client.stripe_customer_id,
      limit: 50,
    });

    const invoices = invoicesRes.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created,
      amount: inv.status === "paid" ? inv.amount_paid : inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      pdf_url: inv.invoice_pdf,
      hosted_url: inv.hosted_invoice_url,
    }));

    return new Response(JSON.stringify({ subscription, invoices }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[get-subscription] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
