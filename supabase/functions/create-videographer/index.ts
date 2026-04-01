import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // GET: fetch user details for management modal
    if (req.method === "GET") {
      const url = new URL(req.url);
      const userId = url.searchParams.get("user_id");
      if (!userId) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (error || !userData?.user) return new Response(JSON.stringify({ error: error?.message || "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const u = userData.user;
      return new Response(JSON.stringify({
        id: u.id,
        email: u.email,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        banned_until: u.banned_until,
        user_metadata: u.user_metadata,
        created_at: u.created_at,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // DELETE: remove team member
    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Remove from videographer_clients (for videographers/editors)
      await supabaseAdmin.from("videographer_clients").delete().eq("videographer_user_id", user_id);
      // Remove all user roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      // Remove client record (for connecta_plus)
      await supabaseAdmin.from("clients").delete().eq("user_id", user_id);
      // Remove profile
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      // Delete auth user
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST: create team member OR manage credentials (routed by _action field)
    const body = await req.json();

    // Management actions — routed via _action: "manage"
    if (body._action === "manage") {
      const { user_id, action } = body;
      if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "reset_password") {
        const { password } = body;
        if (!password) return new Response(JSON.stringify({ error: "password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(user_id);
        const existingMeta = userData?.user?.user_metadata || {};

        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          password,
          user_metadata: { ...existingMeta, force_password_change: true },
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "toggle_ban") {
        const { ban } = body;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: ban ? "876000h" : "none",
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "force_logout") {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const logoutRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}/logout`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
        });
        if (!logoutRes.ok) {
          const errText = await logoutRes.text();
          return new Response(JSON.stringify({ error: `Logout failed: ${errText}` }), { status: logoutRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Legacy: password-only update (no action field)
      if (body.password) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: body.password });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create team member (default POST)
    const { email, password, username, full_name, role = "videographer" } = body;

    const validRoles = ["videographer", "editor", "connecta_plus"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role. Must be: videographer, editor, or connecta_plus" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || username, force_password_change: true },
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userId = newUser.user.id;

    // Assign role
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });

    // Set display name on profile
    const profileUsername = (username || full_name || "").toLowerCase().replace(/\s+/g, "_");
    await supabaseAdmin.from("profiles").update({ username: profileUsername, display_name: full_name }).eq("user_id", userId);

    if (role === "connecta_plus") {
      // Connecta Plus: ensure they have an active client record (no subscription needed)
      const { data: existingClient } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingClient) {
        await supabaseAdmin.from("clients").update({
          plan_type: "enterprise",
          subscription_status: "active",
          full_name: full_name || email,
        }).eq("user_id", userId);
      } else {
        await supabaseAdmin.from("clients").insert({
          user_id: userId,
          full_name: full_name || email,
          email: email,
          plan_type: "enterprise",
          subscription_status: "active",
        });
      }
    } else {
      // Videographer/Editor: remove any auto-created client record
      await supabaseAdmin.from("clients").delete().eq("user_id", userId);
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
