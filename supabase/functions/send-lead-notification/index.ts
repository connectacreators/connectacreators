import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { niche, business_type, city, state, revenue_range, investment_ready, name, phone, email, status } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auto-create table on first run (uses the query RPC already deployed)
    await supabase.rpc("query", { sql: `
      create table if not exists connecta_leads (
        id uuid primary key default gen_random_uuid(),
        niche text, business_type text, city text, state text,
        revenue_range text, investment_ready text,
        name text not null, phone text not null, email text not null,
        status text not null default 'calificado',
        created_at timestamptz not null default now()
      );
      alter table if exists connecta_leads enable row level security;
    ` }).catch(() => null);

    // Save lead to database
    const { error: dbError } = await supabase.from("connecta_leads").insert({
      niche, business_type, city, state, revenue_range, investment_ready,
      name, phone, email, status: status || "calificado",
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    // Send email notification only for qualified leads
    if (status !== "no_calificado") {
      const location = city ? `${city}, ${state || ""}`.trim().replace(/,$/, "") : "Online";
      const subject = `Nuevo lead calificado — ${name} (${location})`;
      const body = [
        `Nombre: ${name}`,
        `WhatsApp: ${phone}`,
        `Email: ${email}`,
        `Nicho: ${niche || "—"}`,
        `Tipo de negocio: ${business_type || "—"}`,
        city ? `Ciudad: ${city}, ${state || ""}` : null,
        `Ingresos actuales: ${revenue_range || "—"}`,
        `Disposición a invertir: ${investment_ready || "—"}`,
        `Fecha: ${new Date().toLocaleString("es-MX", { timeZone: "America/Denver" })}`,
      ].filter(Boolean).join("\n");

      const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
      const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
      const smtpUser = Deno.env.get("SMTP_USER") || "";
      const smtpPass = Deno.env.get("SMTP_PASS") || "";
      const smtpTo = Deno.env.get("SMTP_TO") || "creatorsconnecta@gmail.com";

      if (smtpUser && smtpPass) {
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
            to: smtpTo.split(",").map((e: string) => e.trim()),
            subject,
            content: body,
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
    console.error("send-lead-notification error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
