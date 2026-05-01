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
  starter:    { credits_monthly_cap: 10000, channel_scrapes_limit: 8,  script_limit: 75,   lead_tracker_enabled: true, facebook_integration_enabled: true },
  growth:     { credits_monthly_cap: 30000, channel_scrapes_limit: 15, script_limit: 200,  lead_tracker_enabled: true, facebook_integration_enabled: true },
  enterprise: { credits_monthly_cap: 75000, channel_scrapes_limit: 25, script_limit: 500,  lead_tracker_enabled: true, facebook_integration_enabled: true },
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

const TRIAL_CREDITS = 1000;

function getDbStatus(sub: Stripe.Subscription): string {
  if (sub.cancel_at_period_end && (sub.status === "active" || sub.status === "trialing")) return "canceling";
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
  // Primary: metadata.supabase_user_id → subscriber_clients → primary client
  const userId = sub.metadata?.supabase_user_id;
  if (userId) {
    const { data: link } = await adminClient
      .from("subscriber_clients")
      .select("client_id")
      .eq("subscriber_user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (link?.client_id) return link.client_id;

    // Fallback: direct user_id match on clients (for legacy data)
    const { data } = await adminClient
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Fallback: stripe_customer_id
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
    // Trial: grant 1000 credits. Full credits granted on first payment.
    const isTrial = sub.status === "trialing";
    const grantAmount = isTrial ? 1000 : planCfg.credits_monthly_cap;
    if (isTrial) {
      clientUpdate.credits_monthly_cap = 1000;
    }
    clientUpdate.credits_balance = grantAmount;
    clientUpdate.credits_used = 0;
    clientUpdate.channel_scrapes_used = 0;
    clientUpdate.credits_reset_at = new Date(sub.current_period_end * 1000).toISOString();

    await adminClient.from("credit_transactions").insert({
      client_id: clientId,
      action: isTrial ? "trial_grant" : "initial_grant",
      credits: grantAmount,
      metadata: { plan_type: planType, is_trial: isTrial },
    });
    logStep("Initialized credits", { grantAmount, isTrial });
  }

  // When transitioning from trialing → active, don't touch credits here.
  // Let invoice.payment_succeeded handle the full credit grant to avoid race conditions.
  if (!isNew) {
    const { data: currentClient } = await adminClient
      .from("clients")
      .select("subscription_status, plan_type, credits_balance, credits_monthly_cap")
      .eq("id", clientId)
      .maybeSingle();
    if (currentClient?.subscription_status === "trialing" && dbStatus === "active") {
      delete clientUpdate.credits_monthly_cap;
      delete clientUpdate.credits_balance;
      delete clientUpdate.credits_used;
      delete clientUpdate.channel_scrapes_used;
      logStep("Trial→active transition: skipping credit update (handled by invoice.payment_succeeded)");
    } else if (currentClient?.plan_type && currentClient.plan_type !== planType) {
      // Plan change detected (upgrade/downgrade via Stripe portal)
      const oldCap = currentClient.credits_monthly_cap ?? 0;
      const newCap = planCfg.credits_monthly_cap;
      const currentBalance = currentClient.credits_balance ?? 0;

      if (newCap > oldCap) {
        // Upgrade: full fresh allocation at new plan level (prevents inflation on re-upgrades)
        clientUpdate.credits_balance = newCap;
        clientUpdate.credits_used = 0;
        clientUpdate.pending_plan_type = null;
        clientUpdate.pending_plan_effective_date = null;
      } else {
        // Downgrade: don't change plan_type or credits — a pending downgrade was saved.
        // Keep current plan active until invoice.payment_succeeded applies it.
        delete clientUpdate.credits_monthly_cap;
        delete clientUpdate.plan_type;
        delete clientUpdate.script_limit;
        delete clientUpdate.channel_scrapes_limit;
        logStep("Downgrade detected — skipping plan_type update (pending downgrade active)");
      }

      logStep("Plan change detected", {
        oldPlan: currentClient.plan_type, newPlan: planType,
        oldCap, newCap, newBalance: clientUpdate.credits_balance,
      });
    }
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

  // Ensure subscriber_clients junction entry exists (only on creation)
  if (isNew && userId && clientId) {
    try {
      await adminClient.from("subscriber_clients").upsert({
        subscriber_user_id: userId,
        client_id: clientId,
        is_primary: true,
      }, { onConflict: "subscriber_user_id,client_id" });
      logStep("Created subscriber_clients junction entry", { userId, clientId });
    } catch (junctionErr) {
      logStep("WARNING: junction entry creation failed (non-fatal)", { error: String(junctionErr) });
    }
  }

  // Update client_limit on subscriptions table (every sync, not just on creation)
  // This ensures plan upgrades/downgrades correctly update the client limit.
  if (userId) {
    try {
      const CLIENT_LIMITS: Record<string, number> = {
        starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
      };
      await adminClient.from("subscriptions")
        .update({ client_limit: CLIENT_LIMITS[planType] || 1 })
        .eq("user_id", userId);
    } catch (limitErr) {
      logStep("WARNING: client_limit update failed (non-fatal)", { error: String(limitErr) });
    }
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

    const stripe = new Stripe(stripeKey);

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      // Must use constructEventAsync in Deno edge runtime (SubtleCrypto requires async)
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
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
          // Mark as canceled but PRESERVE credits — users keep what they haven't used.
          // The subscription guard's hasCredits fallback lets them use remaining credits
          // until depleted, then redirects to /signup.
          // Top-up credits are also preserved (separate column).
          await adminClient.from("clients")
            .update({ subscription_status: "canceled" })
            .eq("id", clientId);

          const userId = await getUserIdBySubscription(adminClient, sub);
          if (userId) {
            await adminClient.from("subscriptions")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("user_id", userId);
          }
          logStep("Subscription canceled — credits preserved", { clientId });
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // Only process subscription renewals and first charges, not one-off invoices
        if (invoice.billing_reason !== "subscription_cycle" && invoice.billing_reason !== "subscription_create") {
          logStep("Skipping non-cycle/non-first-charge invoice", { billing_reason: invoice.billing_reason });
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

        // Use subscription's current_period_end (always the latest correct value)
        const resetTimestamp = Math.max(sub.current_period_end, invoice.period_end);

        // Apply pending downgrade if one exists
        const { data: pendingCheck } = await adminClient
          .from("clients")
          .select("pending_plan_type, pending_plan_effective_date")
          .eq("id", clientId)
          .maybeSingle();

        if (pendingCheck?.pending_plan_type) {
          const pendingPlan = pendingCheck.pending_plan_type;
          const pendingCfg = PLAN_CONFIG[pendingPlan];
          if (pendingCfg) {
            await adminClient.from("clients").update({
              plan_type: pendingPlan,
              credits_balance: pendingCfg.credits_monthly_cap,
              credits_monthly_cap: pendingCfg.credits_monthly_cap,
              credits_used: 0,
              channel_scrapes_used: 0,
              channel_scrapes_limit: pendingCfg.channel_scrapes_limit,
              script_limit: pendingCfg.script_limit,
              subscription_status: "active",
              credits_reset_at: new Date(resetTimestamp * 1000).toISOString(),
              pending_plan_type: null,
              pending_plan_effective_date: null,
            }).eq("id", clientId);

            // Update client_limit on plan change
            const userId2 = await getUserIdBySubscription(adminClient, sub);
            if (userId2) {
              const CLIENT_LIMITS: Record<string, number> = {
                starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
              };
              await adminClient.from("subscriptions")
                .update({ client_limit: CLIENT_LIMITS[pendingPlan] || 1 })
                .eq("user_id", userId2);
            }

            await adminClient.from("credit_transactions").insert({
              client_id: clientId,
              action: "plan_downgrade_reset",
              credits: pendingCfg.credits_monthly_cap,
              metadata: { plan_type: pendingPlan, previous_plan: planType },
            });
            logStep("Applied pending downgrade", { clientId, pendingPlan, credits: pendingCfg.credits_monthly_cap });
            break; // Skip normal renewal logic — downgrade handled everything
          }
        }

        // Check if this is the first charge after trial
        const { data: currentClient } = await adminClient
          .from("clients")
          .select("subscription_status, credits_monthly_cap")
          .eq("id", clientId)
          .maybeSingle();

        const isPostTrial = currentClient?.subscription_status === "trialing" || currentClient?.subscription_status === "trial";

        if (isPostTrial) {
          // First charge after trial — grant full plan credits
          await adminClient.from("clients").update({
            credits_balance: planCfg.credits_monthly_cap,
            credits_monthly_cap: planCfg.credits_monthly_cap,
            credits_used: 0,
            channel_scrapes_used: 0,
            subscription_status: "active",
            trial_ends_at: null,
            credits_reset_at: new Date(resetTimestamp * 1000).toISOString(),
            pending_plan_type: null,
            pending_plan_effective_date: null,
          }).eq("id", clientId);

          await adminClient.from("credit_transactions").insert({
            client_id: clientId,
            action: "initial_grant",
            credits: planCfg.credits_monthly_cap,
            metadata: { billing_period_end: resetTimestamp, plan_type: planType, post_trial: true },
          });
          logStep("Post-trial: granted full credits", { clientId, planType, credits: planCfg.credits_monthly_cap });
        } else {
          // Regular monthly renewal
          await adminClient.from("clients").update({
            credits_balance: planCfg.credits_monthly_cap,
            credits_used: 0,
            channel_scrapes_used: 0,
            subscription_status: "active",
            trial_ends_at: null,
            credits_reset_at: new Date(resetTimestamp * 1000).toISOString(),
            pending_plan_type: null,
            pending_plan_effective_date: null,
          }).eq("id", clientId);

          await adminClient.from("credit_transactions").insert({
            client_id: clientId,
            action: "monthly_reset",
            credits: planCfg.credits_monthly_cap,
            metadata: { billing_period_end: resetTimestamp, plan_type: planType },
          });
          logStep("Credits reset for billing cycle", { clientId, planType, credits: planCfg.credits_monthly_cap });
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Only handle top-up payments (mode=payment with type=credit_topup metadata)
        if (session.mode !== "payment" || session.metadata?.type !== "credit_topup") {
          logStep("Skipping non-topup checkout session", { sessionId: session.id, mode: session.mode });
          break;
        }
        if (session.payment_status !== "paid") {
          logStep("Topup session not paid", { sessionId: session.id, payment_status: session.payment_status });
          break;
        }
        const clientId = session.metadata?.client_id;
        const credits = parseInt(session.metadata?.credits || "0", 10);
        if (!clientId || !credits || credits <= 0) {
          logStep("Topup session missing metadata", { sessionId: session.id });
          break;
        }
        const { data: result, error: rpcError } = await adminClient.rpc("add_topup_credits", {
          p_client_id: clientId,
          p_amount: credits,
          p_session_id: session.id,
        });
        if (rpcError) {
          logStep("ERROR adding topup credits", { error: rpcError.message });
        } else {
          logStep("Topup credits added", { clientId, credits, result });
        }
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
