import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const PLAN_CONFIG: Record<string, { credits_monthly_cap: number; channel_scrapes_limit: number }> = {
  starter:    { credits_monthly_cap: 10000, channel_scrapes_limit: 8  },
  growth:     { credits_monthly_cap: 30000, channel_scrapes_limit: 15 },
  enterprise: { credits_monthly_cap: 75000, channel_scrapes_limit: 25 },
};

const PRODUCT_PLAN_MAP: Record<string, string> = {
  "prod_U8CMY29gkbO85Y": "starter",
  "prod_U8CMTfvyn4lvgv": "growth",
  "prod_U8CMxSv9ZoV1PF": "enterprise",
  "prod_Tzx3VOK8V8gI11": "starter",
  "prod_Tzx4et0Y0iv6LI": "growth",
  "prod_Tzx4OBg3PpYuES": "enterprise",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Protect with cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== "connectacreators-cron-2026") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });

  // Get all clients with stripe_customer_id
  const { data: clients } = await adminClient
    .from("clients")
    .select("id, name, email, stripe_customer_id, plan_type, subscription_status, credits_balance, credits_monthly_cap")
    .not("stripe_customer_id", "is", null);

  if (!clients?.length) {
    return new Response(JSON.stringify({ message: "No clients with Stripe IDs" }), { headers: corsHeaders });
  }

  const results: any[] = [];

  for (const client of clients) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: client.stripe_customer_id,
        status: "all",
        limit: 5,
      });

      const activeSub = subs.data.find(s => s.status === "active" || s.status === "trialing");

      if (!activeSub) {
        // No active sub — check if canceled.
        // PRESERVE credits — users keep what they haven't used until the
        // monthly reset (matches stripe-webhook policy on subscription.deleted).
        const canceledSub = subs.data.find(s => s.status === "canceled");
        if (canceledSub && client.subscription_status !== "canceled") {
          await adminClient.from("clients").update({
            subscription_status: "canceled",
            // pending_plan fields cleared so a future resubscribe doesn't
            // accidentally trigger a stale downgrade reset
            pending_plan_type: null,
            pending_plan_effective_date: null,
          }).eq("id", client.id);
          results.push({ name: client.name, action: "marked_canceled", was: client.subscription_status });
        } else {
          results.push({ name: client.name, action: "no_active_sub", status: client.subscription_status });
        }
        continue;
      }

      // Find plan type from product
      const productId = activeSub.items.data[0]?.price?.product;
      const planType = typeof productId === "string" ? PRODUCT_PLAN_MAP[productId] : null;
      const planCfg = planType ? PLAN_CONFIG[planType] : null;

      const dbStatus = activeSub.cancel_at_period_end && activeSub.status === "active"
        ? "canceling"
        : activeSub.status === "trialing" ? "trialing" : "active";

      const update: Record<string, any> = {
        subscription_status: dbStatus,
        stripe_subscription_id: activeSub.id,
      };

      if (planType) update.plan_type = planType;
      if (planCfg) {
        update.credits_monthly_cap = planCfg.credits_monthly_cap;
        update.channel_scrapes_limit = planCfg.channel_scrapes_limit;
      }

      // If transitioning from trialing to active, grant full credits
      if (client.subscription_status === "trialing" && dbStatus === "active" && planCfg) {
        update.credits_balance = planCfg.credits_monthly_cap;
        update.credits_used = 0;
        update.trial_ends_at = null;
      }

      // Defensive date parsing (Stripe API version may return string or number)
      const safeDateISO = (raw: any): string | null => {
        if (!raw) return null;
        try {
          if (typeof raw === "number") return new Date(raw < 1e12 ? raw * 1000 : raw).toISOString();
          if (typeof raw === "string") return new Date(Date.parse(raw)).toISOString();
        } catch {}
        return null;
      };

      if (activeSub.trial_end) {
        const te = safeDateISO(activeSub.trial_end);
        if (te) update.trial_ends_at = te;
      }

      const resetAt = safeDateISO(activeSub.current_period_end);
      if (resetAt) update.credits_reset_at = resetAt;

      await adminClient.from("clients").update(update).eq("id", client.id);

      results.push({
        name: client.name,
        action: "synced",
        plan: planType,
        stripe_status: activeSub.status,
        db_was: client.subscription_status,
        db_now: dbStatus,
        cap_was: client.credits_monthly_cap,
        cap_now: planCfg?.credits_monthly_cap ?? client.credits_monthly_cap,
      });
    } catch (err) {
      results.push({ name: client.name, action: "error", error: String(err) });
    }
  }

  return new Response(JSON.stringify({ synced: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
