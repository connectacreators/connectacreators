import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Readable temp password (no ambiguous chars) for the admin to hand to a client.
function makeTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).maybeSingle();
    if (callerRole?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const clientId: string = body.clientId;
    const email: string = (body.email || "").trim().toLowerCase();
    const fullName: string = body.fullName || "";
    if (!clientId || !email) return json({ error: "clientId and email are required" }, 400);

    // Confirm the client exists.
    const { data: client } = await adminClient
      .from("clients").select("id, name").eq("id", clientId).maybeSingle();
    if (!client) return json({ error: "Client not found" }, 404);

    // Find or create the auth user for this email.
    let userId: string;
    let created = false;
    let tempPassword: string | null = null;

    const pw = makeTempPassword();
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
      user_metadata: { full_name: fullName || client.name || "" },
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() || "";
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!existing) throw createErr;
        userId = existing.id;
      } else {
        throw createErr;
      }
    } else {
      userId = newUser.user.id;
      created = true;
      tempPassword = pw;
    }

    // Assign the 'client' role only if the account has no role yet (don't
    // downgrade an existing user/admin/etc.).
    const { data: existingRole } = await adminClient
      .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (!existingRole) {
      await adminClient.from("user_roles").insert({ user_id: userId, role: "client" });
    }

    // Link the account to this client and open access.
    const { error: updErr } = await adminClient
      .from("clients")
      .update({ user_id: userId, onboarding_access_open: true })
      .eq("id", clientId);
    if (updErr) throw updErr;

    return json({
      success: true,
      userId,
      email,
      created,
      tempPassword, // null when the account already existed
      role: existingRole?.role || "client",
    });
  } catch (err) {
    console.error("grant-onboarding-access error:", err);
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
