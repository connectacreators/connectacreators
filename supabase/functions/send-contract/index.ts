import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contract_id, send_method, client_email, message } = await req.json();

    if (!contract_id || !send_method) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: fetchErr } = await supabase
      .from("contracts").select("*").eq("id", contract_id).single();
    if (fetchErr || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.admin_signed_at) {
      return new Response(JSON.stringify({ error: "Admin must sign before sending" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signingToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await supabase.from("contracts").update({
      status: "awaiting_client",
      send_method,
      client_email: client_email ?? contract.client_email,
      send_message: message ?? null,
      signing_token: signingToken,
      signing_token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", contract_id);

    if (send_method === "email" && client_email) {
      const appUrl = Deno.env.get("APP_URL") ?? "https://connectacreators.com";
      const signingUrl = `${appUrl}/contract/${signingToken}`;

      const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
      const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
      const smtpUser = Deno.env.get("SMTP_USER") ?? "";
      const smtpPass = Deno.env.get("SMTP_PASS") ?? "";

      if (smtpUser && smtpPass) {
        const subject = `Please sign: ${contract.title}`;
        const bodyText = [
          message ? `${message}\n\n` : "",
          `Please review and sign the contract "${contract.title}" using the link below:\n`,
          signingUrl,
          "\n\nThis link expires in 30 days.",
        ].join("");

        const htmlBody = `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="margin:0 0 16px;font-size:18px;">Contract ready for your signature</h2>
            ${message ? `<p style="color:#555;margin:0 0 16px;">${message}</p>` : ""}
            <p style="color:#333;margin:0 0 24px;">
              Please review and sign <strong>${contract.title}</strong>.
            </p>
            <a href="${signingUrl}"
               style="display:inline-block;background:#d4af37;color:#000;font-weight:700;
                      padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;">
              Review &amp; Sign
            </a>
            <p style="color:#999;font-size:12px;margin-top:24px;">
              This link expires in 30 days. If you did not expect this, you can ignore it.
            </p>
          </div>`;

        try {
          const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
          const client = new SMTPClient({
            connection: {
              hostname: smtpHost,
              port: smtpPort,
              tls: false,
              auth: { username: smtpUser, password: smtpPass },
            },
          });
          await client.send({
            from: smtpUser,
            to: client_email,
            subject,
            content: bodyText,
            html: htmlBody,
          });
          await client.close();
        } catch (emailErr) {
          console.error("Email send error:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-contract error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
