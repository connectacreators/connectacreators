import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser } } = await callerClient.auth.getUser();
    if (!callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      email,
      password,
      full_name,
      plan_type,
      status,
      trial_ends_at,
      is_manually_assigned,
      subscribed_at,
      notes,
      stripe_subscription_id,
      stripe_customer_id,
    } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user (email auto-confirmed)
    let userId: string;
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });

    if (createError) {
      // User already exists — find their id
      if (
        createError.message?.toLowerCase().includes("already") ||
        createError.message?.toLowerCase().includes("exists")
      ) {
        const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = listData?.users?.find((u) => u.email === email);
        if (existing) {
          userId = existing.id;
        } else {
          throw createError;
        }
      } else {
        throw createError;
      }
    } else {
      userId = newUser.user.id;
    }

    // Assign 'user' role (upsert so re-creating works cleanly)
    await adminClient.from("user_roles").upsert(
      { user_id: userId, role: "user" },
      { onConflict: "user_id" }
    );

    // Create/update subscription record
    const { data: subscription, error: subError } = await adminClient
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          email,
          full_name: full_name || null,
          plan_type,
          status,
          trial_ends_at: trial_ends_at || null,
          is_manually_assigned: is_manually_assigned ?? true,
          subscribed_at: subscribed_at || new Date().toISOString(),
          notes: notes || null,
          stripe_subscription_id: stripe_subscription_id || null,
          stripe_customer_id: stripe_customer_id || null,
        },
        { onConflict: "email" }
      )
      .select()
      .single();

    if (subError) throw subError;

    // Create/update clients record so Dashboard subscription check passes
    const scriptLimits: Record<string, number> = { starter: 75, growth: 200, enterprise: 500, connecta_dfy: 500, connecta_plus: 500 };
    const creditsMap: Record<string, number> = { starter: 10000, growth: 30000, enterprise: 75000, connecta_dfy: 75000, connecta_plus: 75000 };
    const scrapesMap: Record<string, number> = { starter: 8, growth: 15, enterprise: 25, connecta_dfy: 25, connecta_plus: 25 };
    const clientStatus = (status === "active" || status === "trial") ? "active" : "inactive";
    const creditsCap = creditsMap[plan_type] ?? 10000;
    const clientPayload = {
      user_id: userId,
      name: full_name || email,
      email,
      plan_type,
      subscription_status: clientStatus,
      script_limit: scriptLimits[plan_type] ?? 75,
      lead_tracker_enabled: true,
      facebook_integration_enabled: true,
      credits_monthly_cap: creditsCap,
      credits_balance: creditsCap,
      credits_used: 0,
      channel_scrapes_limit: scrapesMap[plan_type] ?? 8,
      channel_scrapes_used: 0,
    };
    const { data: existingClient } = await adminClient
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingClient) {
      await adminClient.from("clients").update(clientPayload).eq("id", existingClient.id);
    } else {
      await adminClient.from("clients").insert(clientPayload);
    }

    // Get the client ID (either existing or newly created)
    let clientId: string;
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient } = await adminClient
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      clientId = newClient?.id;
    }

    // Create subscriber_clients junction entry (primary client)
    if (clientId) {
      await adminClient.from("subscriber_clients").upsert({
        subscriber_user_id: userId,
        client_id: clientId,
        is_primary: true,
      }, { onConflict: "subscriber_user_id,client_id" });
    }

    // Set client_limit on subscriptions table based on plan
    const CLIENT_LIMITS: Record<string, number> = {
      starter: 5, growth: 10, enterprise: 20, connecta_dfy: 1, connecta_plus: 1
    };
    await adminClient.from("subscriptions")
      .update({ client_limit: CLIENT_LIMITS[plan_type] || 1 })
      .eq("user_id", userId);

    return new Response(
      JSON.stringify({ success: true, user_id: userId, subscription }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("create-subscriber-user error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
