import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    const { email, password, username, full_name } = await req.json();

    // Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || username },
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });

    const userId = newUser.user.id;

    // Assign videographer role
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "videographer" });

    // Set username on profile
    await supabaseAdmin.from("profiles").update({ username }).eq("user_id", userId);

    // Remove any auto-created client record (videographers are not clients)
    await supabaseAdmin.from("clients").delete().eq("user_id", userId);

    return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
