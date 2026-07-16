// supabase/functions/viral-analyze-failure-summary/index.ts
//
// Daily failure digest for the viral analyze queue. pg_cron captures
// yesterday's failures into viral_analyze_failure_summary (job 25,
// capture_analyze_failure_summary(), 08:15 UTC); this function (job 26,
// 08:25 UTC) reads that snapshot and emails a breakdown so yt-dlp/IG/VPS
// degradation pages us instead of surprising users mid-batch.
//
// No email is sent on zero-failure days.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const CRON_SECRET = "connectacreators-cron-2026";
// A day whose failure rate crosses this marks the subject line as degraded —
// it means retries-with-backoff are being exhausted, not just blips.
const DEGRADED_RATE = 0.2;

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await admin
    .from("viral_analyze_failure_summary")
    .select("day, error_class, cnt, done_that_day")
    .eq("day", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .order("cnt", { ascending: false });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const failed = (rows ?? []).reduce((sum, r) => sum + r.cnt, 0);
  if (failed === 0) {
    return new Response(JSON.stringify({ sent: false, reason: "no failures yesterday" }), { status: 200 });
  }

  const day = rows![0].day;
  const done = rows![0].done_that_day;
  const rate = failed / Math.max(1, failed + done);
  const pct = Math.round(rate * 100);

  const subject =
    rate >= DEGRADED_RATE
      ? `⚠️ Viral analyze DEGRADED — ${failed} failed / ${done} done on ${day} (${pct}%)`
      : `Viral analyze daily: ${failed} failed / ${done} done on ${day} (${pct}%)`;
  const body = [
    `Analyze queue results for ${day} (UTC):`,
    ``,
    `  done:   ${done}`,
    `  failed: ${failed}  (${pct}%)`,
    ``,
    `Failures by class:`,
    ...rows!.map((r) => `  ${r.error_class.padEnd(28)} ${r.cnt}`),
    ``,
    `Class hints:`,
    `  download_failed      → Cobalt + /stream-reel both missed (check VPS load, IG CDN)`,
    `  audio_extract_failed → /extract-audio; if yt-dlp errors, IG broke yt-dlp again`,
    `  ig_rate_limit        → IG throttling; check cookie accounts on the VPS`,
    `  retry_exhausted      → transient errors that outlived 5 attempts (systemic)`,
    `  whisper_no_text_...  → silent videos, expected noise`,
    ``,
    `Failed rows stay in viral_analyze_queue (status='failed') — the batch modal's`,
    `"Retry failed" re-queues them once the underlying cause is fixed.`,
  ].join("\n");

  const smtpUser = Deno.env.get("SMTP_USER") || "";
  const smtpPass = Deno.env.get("SMTP_PASS") || "";
  const smtpTo = Deno.env.get("SMTP_TO") || "creatorsconnecta@gmail.com";
  if (!smtpUser || !smtpPass) {
    return new Response(JSON.stringify({ sent: false, reason: "smtp not configured", failed }), { status: 200 });
  }

  const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
      port: parseInt(Deno.env.get("SMTP_PORT") || "465"),
      tls: (Deno.env.get("SMTP_PORT") || "465") === "465",
      auth: { username: smtpUser, password: smtpPass },
    },
  });
  try {
    await client.send({
      from: smtpUser,
      to: smtpTo.split(",").map((e: string) => e.trim()),
      subject,
      content: body,
    });
  } finally {
    await client.close();
  }

  return new Response(JSON.stringify({ sent: true, failed, done, pct }), { status: 200 });
});
