// src/components/dashboard/AgendaLane.tsx
//
// One urgency lane in the Tasks agenda: a sticky label + hairline rule, then
// its items. The parent supplies the client_id -> profile-pic map so each item
// can show the client's photo (initials fallback).

import { AgendaItem } from "./AgendaItem";
import type { AgendaLane as AgendaLaneData } from "@/lib/triage/buildAgenda";

const LANE_ACCENT: Record<string, string> = {
  overdue:  '#B23A2A',
  today:    '#A85B1F',
  tomorrow: 'hsl(var(--ink-on-cream) / 0.5)',
  thisweek: 'hsl(var(--ink-on-cream) / 0.5)',
  later:    'hsl(var(--ink-on-cream) / 0.5)',
};

export function AgendaLane({ lane, picByClient }: { lane: AgendaLaneData; picByClient: Record<string, string> }) {
  const accent = LANE_ACCENT[lane.key];
  return (
    <section>
      <div
        className="flex items-center gap-2"
        style={{
          position: 'sticky', top: 46, zIndex: 4, background: 'hsl(var(--cream))',
          padding: '14px 0 8px', fontSize: 10.5, letterSpacing: '0.14em',
          textTransform: 'uppercase', fontWeight: 700, color: accent,
        }}
      >
        <span>{lane.label}</span>
        <span style={{ flex: 1, height: 1, background: 'hsl(var(--ink-on-cream) / 0.1)' }} />
      </div>
      {lane.items.map((item) => (
        <AgendaItem key={item.key} item={item} picUrl={picByClient[item.clientId]} />
      ))}
    </section>
  );
}
