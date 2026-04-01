import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.json().catch(() => ({}));
    const action = body.action || "portal";

    // ── Admin sync: list ALL Stripe subscriptions and upsert into DB ──────────
    if (action === "admin-sync") {
      const { data: roleData } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleData?.role !== "admin") throw new Error("Admin access required");

      // Build email → userId map from all auth users
      const { data: authData } = await (supabaseClient.auth.admin as any).listUsers({ perPage: 1000 });
      const emailToUser = new Map<string, { id: string; full_name: string | null }>(
        ((authData?.users ?? []) as any[]).map((u: any) => [
          u.email,
          { id: u.id, full_name: u.user_metadata?.full_name ?? null },
        ])
      );

      // Fetch all Stripe subscriptions (paginated)
      const allStripeSubs: any[] = [];
      let page: any = await stripe.subscriptions.list({
        limit: 100,
        status: "all",
        expand: ["data.customer"],
      });
      allStripeSubs.push(...page.data);
      while (page.has_more) {
        page = await stripe.subscriptions.list({
          limit: 100,
          status: "all",
          expand: ["data.customer"],
          starting_after: page.data[page.data.length - 1].id,
        });
        allStripeSubs.push(...page.data);
      }

      const results: any[] = [];

      for (const sub of allStripeSubs) {
        try {
          const customer = sub.customer as any;
          const email: string | null = customer?.email ?? null;
          if (!email) continue;

          const authUser = emailToUser.get(email) ?? null;
          const userId = authUser?.id ?? null;

          // Map Stripe status → our status
          const dbStatus =
            sub.status === "active" ? "active"
            : sub.status === "canceled" ? "canceled"
            : sub.status === "trialing" ? "trialing"
            : "inactive";

          // Infer plan from price amount (cents)
          const price = sub.items?.data[0]?.price;
          const amount = price?.unit_amount ?? 0;
          let planType = "starter";
          if (amount >= 15000) planType = "enterprise";
          else if (amount >= 6000) planType = "growth";

          const customerId: string =
            typeof sub.customer === "string" ? sub.customer : customer.id;

          // Check if a row already exists for this stripe_subscription_id
          const { data: existing } = await supabaseClient
            .from("subscriptions")
            .select("id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();

          let inserted = false;
          if (existing) {
            await supabaseClient
              .from("subscriptions")
              .update({
                status: dbStatus,
                stripe_customer_id: customerId,
                ...(userId ? { user_id: userId } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabaseClient.from("subscriptions").insert({
              email,
              user_id: userId,
              full_name: authUser?.full_name ?? customer?.name ?? null,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              plan_type: planType,
              status: dbStatus,
              is_manually_assigned: false,
              subscribed_at: new Date(sub.created * 1000).toISOString(),
            });
            inserted = true;
          }

          // Keep clients table in sync
          if (userId) {
            await supabaseClient
              .from("clients")
              .update({ stripe_customer_id: customerId, subscription_status: dbStatus })
              .eq("user_id", userId);
          }

          results.push({
            email,
            stripe_status: sub.status,
            db_status: dbStatus,
            plan: planType,
            inserted,
          });
        } catch (err) {
          results.push({ error: String(err) });
        }
      }

      return new Response(JSON.stringify({ synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Per-user actions: need the user's own stripe_customer_id ─────────────
    const { data: client } = await supabaseClient
      .from("clients")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!client?.stripe_customer_id) {
      throw new Error("No Stripe customer found. Please subscribe first.");
    }

    const customerId = client.stripe_customer_id;

    if (action === "portal") {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: "https://connectacreators.com/subscription",
      });
      return new Response(JSON.stringify({ url: portalSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Portal with pre-selected plan change confirmation ─────────────
    if (action === "portal-upgrade") {
      const targetPlan = body.target_plan as string;
      const PLAN_PRICE_MAP: Record<string, string> = {
        starter:    Deno.env.get("STRIPE_PRICE_STARTER")    || "price_1TCX3SCp1qPE081LCBJc8avw",
        growth:     Deno.env.get("STRIPE_PRICE_GROWTH")     || "price_1TCX3SCp1qPE081LSkPmF8FN",
        enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
      };
      if (!targetPlan || !PLAN_PRICE_MAP[targetPlan]) {
        throw new Error(`Invalid target plan: ${targetPlan}`);
      }

      // Each product maps to its own price — portal config requires price to belong to product
      const PRODUCT_PRICE_MAP: Array<{ product: string; prices: string[] }> = [
        { product: "prod_U8CMY29gkbO85Y", prices: [PLAN_PRICE_MAP.starter] },
        { product: "prod_U8CMTfvyn4lvgv", prices: [PLAN_PRICE_MAP.growth] },
        { product: "prod_U8CMxSv9ZoV1PF", prices: [PLAN_PRICE_MAP.enterprise] },
      ];

      // Create a portal configuration that allows plan switching
      const portalConfig = await stripe.billingPortal.configurations.create({
        business_profile: {
          headline: "Manage your Connecta subscription",
        },
        features: {
          subscription_update: {
            enabled: true,
            default_allowed_updates: ["price"],
            proration_behavior: "always_invoice",
            products: PRODUCT_PRICE_MAP,
          },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
        },
      });

      // Find the active subscription
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId, limit: 5,
      });
      const subscription = subscriptions.data.find(s => s.status === "active" || s.status === "trialing");
      if (!subscription) {
        throw new Error("No active subscription found.");
      }

      const currentItem = subscription.items.data[0];
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: "https://connectacreators.com/subscription",
        configuration: portalConfig.id,
        flow_data: {
          type: "subscription_update_confirm",
          subscription_update_confirm: {
            subscription: subscription.id,
            items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[targetPlan], quantity: 1 }],
          },
        },
      });
      return new Response(JSON.stringify({ url: portalSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "invoices") {
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
      const invoiceList = invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amount: inv.amount_paid,
        currency: inv.currency,
        status: inv.status,
        date: inv.created,
        pdf_url: inv.invoice_pdf,
        hosted_url: inv.hosted_invoice_url,
      }));
      return new Response(JSON.stringify({ invoices: invoiceList }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "status") {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: "all",
      });
      if (subscriptions.data.length === 0) {
        return new Response(JSON.stringify({ subscription: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sub = subscriptions.data[0];
      const planName =
        sub.items.data[0]?.price?.lookup_key ||
        sub.items.data[0]?.price?.nickname ||
        null;
      const amount = sub.items.data[0]?.price?.unit_amount ?? null;
      const currency = sub.items.data[0]?.price?.currency ?? "usd";
      const interval = sub.items.data[0]?.price?.recurring?.interval ?? null;

      const dbStatus =
        sub.status === "active" ? "active"
        : sub.status === "canceled" ? "canceled"
        : sub.status === "past_due" ? "past_due"
        : sub.status === "trialing" ? "trialing"
        : "inactive";

      await supabaseClient
        .from("clients")
        .update({ subscription_status: dbStatus })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          subscription: {
            id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: sub.current_period_end,
            current_period_start: sub.current_period_start,
            canceled_at: sub.canceled_at,
            cancel_at: sub.cancel_at,
            plan_name: planName,
            amount,
            currency,
            interval,
            created: sub.created,
            trial_end: sub.trial_end,
            trial_start: sub.trial_start,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Change plan: upgrade or downgrade ──────────────────────────────────────
    if (action === "change-plan") {
      const newPlan = body.new_plan as string;

      const PLAN_PRICE_MAP: Record<string, string> = {
        starter:    Deno.env.get("STRIPE_PRICE_STARTER")    || "price_1TCX3SCp1qPE081LCBJc8avw",
        growth:     Deno.env.get("STRIPE_PRICE_GROWTH")     || "price_1TCX3SCp1qPE081LSkPmF8FN",
        enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
      };

      const PLAN_CONFIG: Record<string, {
        plan_type: string; script_limit: number;
        lead_tracker_enabled: boolean; facebook_integration_enabled: boolean;
        credits_monthly_cap: number; channel_scrapes_limit: number; amount: number;
      }> = {
        starter:    { plan_type: "starter",    script_limit: 75,  lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 10000, channel_scrapes_limit: 8,  amount: 3900  },
        growth:     { plan_type: "growth",     script_limit: 200, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 30000, channel_scrapes_limit: 15, amount: 7900  },
        enterprise: { plan_type: "enterprise", script_limit: 500, lead_tracker_enabled: true, facebook_integration_enabled: true, credits_monthly_cap: 75000, channel_scrapes_limit: 25, amount: 13900 },
      };

      if (!PLAN_CONFIG[newPlan] || !PLAN_PRICE_MAP[newPlan]) {
        throw new Error(`Invalid plan: ${newPlan}`);
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId, limit: 5,
      });
      const subscription = subscriptions.data.find(s => s.status === "active" || s.status === "trialing");
      if (!subscription) {
        throw new Error("No active or trialing subscription found. Please subscribe first.");
      }
      const currentItem = subscription.items.data[0];
      const currentPriceId = currentItem.price.id;
      const currentAmount = currentItem.price.unit_amount ?? 0;
      const newAmount = PLAN_CONFIG[newPlan].amount;
      const config = PLAN_CONFIG[newPlan];

      if (currentPriceId === PLAN_PRICE_MAP[newPlan]) {
        throw new Error("You are already on this plan.");
      }

      const isUpgrade = newAmount > currentAmount;
      const isTrial = subscription.status === "trialing";

      if (isTrial) {
        // Trial user changing plan: end trial + switch plan + start billing
        await stripe.subscriptions.update(subscription.id, {
          items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
          trial_end: "now",
          proration_behavior: "none",
        });
      } else if (isUpgrade) {
        // Upgrade: charge prorated difference immediately via new invoice
        await stripe.subscriptions.update(subscription.id, {
          items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
          proration_behavior: "always_invoice",
        });
      } else {
        // Downgrade: no refund, change takes effect at next billing cycle
        await stripe.subscriptions.update(subscription.id, {
          items: [{ id: currentItem.id, price: PLAN_PRICE_MAP[newPlan] }],
          proration_behavior: "none",
        });
      }

      // Fetch current credits to calculate upgrade bonus
      const { data: clientRow } = await supabaseClient
        .from("clients")
        .select("credits_balance, credits_monthly_cap")
        .eq("user_id", user.id)
        .maybeSingle();

      const currentCap = clientRow?.credits_monthly_cap ?? 0;
      const currentBalance = clientRow?.credits_balance ?? 0;

      let newBalance: number;
      if (isTrial) {
        newBalance = config.credits_monthly_cap;
      } else if (isUpgrade) {
        newBalance = currentBalance + Math.max(0, config.credits_monthly_cap - currentCap);
      } else {
        newBalance = currentBalance;
      }

      // Update clients table: plan limits + credits cap
      const clientUpdate: Record<string, any> = {
        plan_type: config.plan_type,
        script_limit: config.script_limit,
        lead_tracker_enabled: config.lead_tracker_enabled,
        facebook_integration_enabled: config.facebook_integration_enabled,
        subscription_status: "active",
        credits_monthly_cap: config.credits_monthly_cap,
        channel_scrapes_limit: config.channel_scrapes_limit,
        credits_balance: newBalance,
      };
      if (isTrial) {
        clientUpdate.credits_used = 0;
        clientUpdate.trial_ends_at = null;
      }

      await supabaseClient.from("clients").update(clientUpdate).eq("user_id", user.id);

      // Sync subscriptions table for admin visibility
      try {
        await supabaseClient.from("subscriptions").upsert({
          user_id: user.id,
          email: user.email,
          plan_type: config.plan_type,
          status: "active",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "email" });
      } catch (_) { /* non-fatal */ }

      return new Response(JSON.stringify({
        success: true,
        plan: newPlan,
        is_upgrade: isUpgrade,
        message: isTrial
          ? `Activated ${config.plan_type} plan! Your trial has ended and billing has started.`
          : isUpgrade
          ? `Upgraded to ${config.plan_type}! The prorated amount has been charged and your credits have been topped up.`
          : `Downgrade to ${config.plan_type} scheduled. Your current plan remains active until the next billing cycle. No refund is issued.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "end-trial") {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId, limit: 5,
      });
      const trialSub = subscriptions.data.find(s => s.status === "trialing");
      if (!trialSub) {
        throw new Error("No trial subscription found.");
      }

      await stripe.subscriptions.update(trialSub.id, {
        trial_end: "now",
      });

      // Get plan config to grant full credits
      const priceId = trialSub.items.data[0]?.price?.id;
      const END_TRIAL_PRICE_MAP: Record<string, string> = {
        starter:    Deno.env.get("STRIPE_PRICE_STARTER")    || "price_1TCX3SCp1qPE081LCBJc8avw",
        growth:     Deno.env.get("STRIPE_PRICE_GROWTH")     || "price_1TCX3SCp1qPE081LSkPmF8FN",
        enterprise: Deno.env.get("STRIPE_PRICE_ENTERPRISE") || "price_1TCX3SCp1qPE081LODOQradO",
      };
      const PLAN_CREDITS: Record<string, number> = {
        starter: 10000, growth: 30000, enterprise: 75000,
      };

      const planKey = Object.entries(END_TRIAL_PRICE_MAP).find(([_, v]) => v === priceId)?.[0];
      if (planKey) {
        await supabaseClient.from("clients").update({
          subscription_status: "active",
          credits_balance: PLAN_CREDITS[planKey],
          credits_monthly_cap: PLAN_CREDITS[planKey],
          credits_used: 0,
          trial_ends_at: null,
        }).eq("user_id", user.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Trial ended. Your subscription is now active and billing has started.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
