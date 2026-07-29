// Read-only iCal feed of production dates, for subscribing from Google
// Calendar ("Other calendars → From URL"). Google fetches this from its own
// servers with no session and no way to complete an OAuth flow, so the
// token in the query string IS the credential — see the
// calendar_feed_tokens migration.
//
// Deliberately one-way: this publishes what's in the app, it never reads
// or writes the user's Google account. Google re-polls subscribed URLs on
// its own schedule (typically every few hours, not instantly) — that lag
// is inherent to ICS subscriptions, not something this function controls.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getManagedClients } from "../_shared/managed-clients.ts";

const PIPELINE_EVENTS: Array<{ column: string; label: string }> = [
  { column: "onboarding_call_at", label: "Onboarding call" },
  { column: "next_filming_at", label: "Filming" },
  { column: "script_due_at", label: "Scripts due" },
  { column: "editing_due_at", label: "Editing due" },
  { column: "boosting_at", label: "Boosting" },
  { column: "posting_at", label: "Posting" },
];

/** RFC 5545 escaping: backslash first, or it double-escapes what follows. */
function icsEscape(text: string): string {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Long lines must be folded at 75 octets or strict parsers reject them. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tokenRow } = await adminClient
    .from("calendar_feed_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRow) {
    return new Response("Invalid or revoked token", { status: 403 });
  }
  const userId = tokenRow.user_id;

  const clients = await getManagedClients(adminClient, userId);
  const clientIds = clients.map((c) => c.id);
  const nameById: Record<string, string> = Object.fromEntries(
    clients.map((c) => [c.id, c.name]),
  );

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Connecta Creators//Production Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Connecta Production",
    "X-WR-CALDESC:Filming, scripts, editing and posting dates from Connecta",
    // Hint to clients (Google included) not to hammer the endpoint.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  const stamp = icsStamp(new Date());
  let count = 0;

  const pushEvent = (uid: string, start: Date, summary: string, description: string) => {
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${uid}@connectacreators.com`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsStamp(start)}`,
      // Fixed 30-minute blocks: these are milestones, not scheduled
      // meetings with a real end time, and a zero-length event renders
      // inconsistently across calendar clients.
      `DTEND:${icsStamp(new Date(start.getTime() + 30 * 60 * 1000))}`,
      fold(`SUMMARY:${icsEscape(summary)}`),
      fold(`DESCRIPTION:${icsEscape(description)}`),
      "END:VEVENT",
    );
    count++;
  };

  if (clientIds.length) {
    const { data: strategies } = await adminClient
      .from("client_strategies")
      .select(`client_id, ${PIPELINE_EVENTS.map((e) => e.column).join(", ")}`)
      .in("client_id", clientIds);

    for (const row of (strategies ?? []) as Record<string, unknown>[]) {
      const clientName = nameById[row.client_id as string] ?? "Unknown client";
      for (const ev of PIPELINE_EVENTS) {
        const raw = row[ev.column];
        if (!raw) continue;
        const when = new Date(raw as string);
        if (isNaN(when.getTime())) continue;
        pushEvent(
          `strategy-${row.client_id}-${ev.column}`,
          when,
          `${ev.label} · ${clientName}`,
          `${ev.label} for ${clientName} — from the Connecta production pipeline.`,
        );
      }
    }

    // Scheduled posts carry a date-only schedule_date; anchor them at 9am
    // local-ish so they don't all pile onto midnight.
    const { data: posts } = await adminClient
      .from("video_edits")
      .select("id, reel_title, client_id, schedule_date")
      .in("client_id", clientIds)
      .is("deleted_at", null)
      .not("schedule_date", "is", null)
      .limit(500);

    for (const p of (posts ?? []) as Record<string, unknown>[]) {
      const when = new Date(`${String(p.schedule_date).slice(0, 10)}T09:00:00Z`);
      if (isNaN(when.getTime())) continue;
      pushEvent(
        `post-${p.id}`,
        when,
        `Post · ${nameById[p.client_id as string] ?? "Unknown"} · ${p.reel_title || "Untitled"}`,
        `Scheduled post for ${nameById[p.client_id as string] ?? "Unknown"}.`,
      );
    }
  }

  lines.push("END:VCALENDAR");

  // Best-effort: a failed touch must not break the feed itself.
  adminClient
    .from("calendar_feed_tokens")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("token", token)
    .then(() => {}, () => {});

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="connecta-production.ics"',
      "Cache-Control": "public, max-age=900",
      "X-Event-Count": String(count),
    },
  });
});
