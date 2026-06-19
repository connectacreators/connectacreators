import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors send-lead-notification (Reto funnel): saves the lead, then emails
// Roberto via the shared SMTP secrets. Built for the English /doctors page —
// every discovery-call request is emailed so no booking is missed.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      name, practice_name, email, phone,
      specialty, city, goal, on_camera, timeline, preferred_time,
      qualified, status,
    } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: dbError } = await supabase.from("doctor_leads").insert({
      name, practice_name, email, phone,
      specialty, city, goal, on_camera, timeline, preferred_time,
      qualified: qualified ?? true,
      status: status || (qualified === false ? "unqualified" : "qualified"),
      source: "doctors-landing",
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    // Email on every submission — a booking request is too valuable to drop.
    const subject = `New doctor booking — ${name}${practice_name ? `, ${practice_name}` : ""}${city ? ` (${city})` : ""}`;
    const emailBody = [
      `New discovery-call request from the /doctors page`,
      ``,
      `Name: ${name}`,
      `Practice: ${practice_name || "—"}`,
      `Specialty: ${specialty || "—"}`,
      `City / market: ${city || "—"}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      ``,
      `Goal: ${goal || "—"}`,
      `Willing to be on camera: ${on_camera || "—"}`,
      `Timeline: ${timeline || "—"}`,
      `Preferred call time: ${preferred_time || "—"}`,
      ``,
      `Qualified: ${qualified === false ? "No" : "Yes"}`,
      `Submitted: ${new Date().toLocaleString("en-US", { timeZone: "America/Denver" })}`,
    ].join("\n");

    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
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
            tls: smtpPort === 465,
            auth: { username: smtpUser, password: smtpPass },
          },
        });
        await client.send({
          from: smtpUser,
          to: smtpTo.split(",").map((e: string) => e.trim()),
          replyTo: email,
          subject,
          content: emailBody,
        });
        await client.close();
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-doctor-lead error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
