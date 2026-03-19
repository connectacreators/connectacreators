import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Credit limits per plan (updated 2026-03-18: expanded caps, all plans get lead tracker + FB integration)
const PLAN_CONFIG: Record<string, {
  credits_monthly_cap: number;
  channel_scrapes_limit: number;
  script_limit: number;
  lead_tracker_enabled: boolean;
  facebook_integration_enabled: boolean;
}> = {
  free:       { credits_monthly_cap: 250,   channel_scrapes_limit: 1,  script_limit: 10,   lead_tracker_enabled: true, facebook_integration_enabled: true },
  starter:    { credits_monthly_cap: 10000, channel_scrapes_limit: 5,  script_limit: 75,   lead_tracker_enabled: true, facebook_integration_enabled: true },
  growth:     { credits_monthly_cap: 30000, channel_scrapes_limit: 10, script_limit: 200,  lead_tracker_enabled: true, facebook_integration_enabled: true },
  enterprise: { credits_monthly_cap: 75000, channel_scrapes_limit: 15, script_limit: 500,  lead_tracker_enabled: true, facebook_integration_enabled: true },
};

const PRODUCT_PLAN_MAP: Record<string, string> = {
  // Current products (new pricing: $39/$79/$139)
  "prod_U8CMY29gkbO85Y": "starter",
  "prod_U8CMTfvyn4lvgv": "growth",
  "prod_U8CMxSv9ZoV1PF": "enterprise",
  // Legacy products (grandfathered subscribers)
  "prod_Tzx3VOK8V8gI11": "starter",
  "prod_Tzx4et0Y0iv6LI": "growth",
  "prod_Tzx4OBg3PpYuES": "enterprise",
};

const TRIAL_CREDITS = 250;

function getDbStatus(sub: Stripe.Subscription): string {
  if (sub.cancel_at_period_end && sub.status === "active") return "canceling";
  const map: Record<string, string> = {
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    unpaid: "past_due",
    canceled: "canceled",
  };
  return map[sub.status] ?? "inactive";
}

async function getClientBySubscription(
  adminClient: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
): Promise<string | null> {
  // Primary: look up by supabase_user_id in subscription metadata
  const userId = sub.metadata?.supabase_user_id;
  if (userId) {
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Fallback: look up by stripe_customer_id
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

async function getUserIdBySubscription(
  adminClient: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
): Promise<string | null> {
  const userId = sub.metadata?.supabase_user_id;
  if (userId) return userId;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const { data } = await adminClient
      .from("clients")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

async function syncSubscription(
  adminClient: ReturnType<typeof createClient>,
  sub: Stripe.Subscription,
  isNew: boolean
) {
  const productId = sub.items.data[0]?.price?.product as string;
  const planType = PRODUCT_PLAN_MAP[productId];
  if (!planType) {
    logStep("Unknown product, skipping", { productId });
    return;
  }
  const planCfg = PLAN_CONFIG[planType];
  const dbStatus = getDbStatus(sub);
  const clientId = await getClientBySubscription(adminClient, sub);
  const userId = await getUserIdBySubscription(adminClient, sub);

  if (!clientId || !userId) {
    logStep("Client not found for subscription", { subId: sub.id });
    return;
  }

  logStep("Syncing subscription", { subId: sub.id, planType, dbStatus, clientId, isNew });

  const clientUpdate: Record<string, any> = {
    plan_type: planType,
    script_limit: planCfg.script_limit,
    lead_tracker_enabled: planCfg.lead_tracker_enabled,
    facebook_integration_enabled: planCfg.facebook_integration_enabled,
    credits_monthly_cap: planCfg.credits_monthly_cap,
    channel_scrapes_limit: planCfg.channel_scrapes_limit,
    subscription_status: dbStatus,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  };

  // On subscription.created only: initialize credits
  if (isNew) {
    const grantAmount = planCfg.credits_monthly_cap;
    clientUpdate.credits_balance = grantAmount;
    clientUpdate.credits_used = 0;
    clientUpdate.channel_scrapes_used = 0;
    clientUpdate.credits_reset_at = new Date(sub.current_period_end * 1000).toISOString();

    await adminClient.from("credit_transactions").insert({
      client_id: clientId,
      action: "initial_grant",
      credits: grantAmount,
      metadata: { plan_type: planType },
    });
    logStep("Initialized credits", { grantAmount });
  }

  await adminClient.from("clients").update(clientUpdate).eq("id", clientId);

  // Sync subscriptions table (for admin Subscribers page)
  try {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
    await adminClient.from("subscriptions").upsert({
      user_id: userId,
      email: authUser?.user?.email ?? null,
      full_name: authUser?.user?.user_metadata?.full_name ?? null,
      plan_type: planType,
      status: dbStatus,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      subscribed_at: isNew ? new Date(sub.created * 1000).toISOString() : undefined,
      is_manually_assigned: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
  } catch (syncErr) {
    logStep("WARNING: subscriptions table sync failed (non-fatal)", { error: String(syncErr) });
  }

  // Assign 'user' role if needed
  if (isNew) {
    try {
      const { data: existingRoles } = await adminClient
        .from("user_roles").select("role").eq("user_id", userId);
      const hasAdminOrVid = existingRoles?.some(
        (r: any) => r.role === "admin" || r.role === "videographer"
      );
      if (!hasAdminOrVid) {
        const hasUser = existingRoles?.some((r: any) => r.role === "user");
        if (!hasUser) {
          await adminClient.from("user_roles").insert({ user_id: userId, role: "user" });
          logStep("Assigned user role");
        }
      }
    } catch (roleErr) {
      logStep("WARNING: role assignment failed (non-fatal)", { error: String(roleErr) });
    }
  }

  logStep("Subscription synced successfully", { subId: sub.id, dbStatus });
}

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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      logStep("Webhook signature verification failed", { error: String(err) });
      return new Response(`Webhook Error: ${err}`, { status: 400 });
    }

    logStep("Received event", { type: event.type, id: event.id });

    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(adminClient, sub, true);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(adminClient, sub, false);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clientId = await getClientBySubscription(adminClient, sub);
        if (clientId) {
          await adminClient.from("clients")
            .update({ subscription_status: "canceled" })
            .eq("id", clientId);

          const userId = await getUserIdBySubscription(adminClient, sub);
          if (userId) {
            await adminClient.from("subscriptions")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("user_id", userId);
          }
          logStep("Subscription canceled", { clientId });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only process subscription renewals, not initial setup or one-off invoices
        if (invoice.billing_reason !== "subscription_cycle") {
          logStep("Skipping non-cycle invoice", { billing_reason: invoice.billing_reason });
          break;
        }

        // Get the subscription to find the plan
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (!subId) {
          logStep("No subscription on invoice");
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subId);
        const productId = sub.items.data[0]?.price?.product as string;
        const planType = PRODUCT_PLAN_MAP[productId];
        if (!planType) {
          logStep("Unknown product in invoice", { productId });
          break;
        }
        const planCfg = PLAN_CONFIG[planType];
        const clientId = await getClientBySubscription(adminClient, sub);
        if (!clientId) {
          logStep("Client not found for invoice subscription");
          break;
        }

        // Reset credits for new billing cycle
        await adminClient.from("clients").update({
          credits_balance: planCfg.credits_monthly_cap,
          credits_used: 0,
          channel_scrapes_used: 0,
          subscription_status: "active",
          trial_ends_at: null,
          credits_reset_at: new Date(invoice.period_end * 1000).toISOString(),
        }).eq("id", clientId);

        await adminClient.from("credit_transactions").insert({
          client_id: clientId,
          action: "monthly_reset",
          credits: planCfg.credits_monthly_cap,
          metadata: { billing_period_end: invoice.period_end, plan_type: planType },
        });

        logStep("Credits reset for billing cycle", { clientId, planType, credits: planCfg.credits_monthly_cap });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const clientId = await getClientBySubscription(adminClient, sub);
        if (clientId) {
          await adminClient.from("clients")
            .update({ subscription_status: "past_due" })
            .eq("id", clientId);
          logStep("Payment failed, marked past_due", { clientId });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
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
