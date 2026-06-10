// src/components/dashboard/AgendaItem.tsx
//
// One row in the dashboard Tasks agenda: milestone icon tile · verb (+ PREP) /
// client avatar + name + folded count · relative-date chip. Links to the same
// destination the per-client triage rows use.

import { Link } from "react-router-dom";
import {
  FileText, Film, Send, PhoneCall, PenLine, Scissors, Camera, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { ClientAvatar } from "./ClientAvatar";
import { colorFor, initials } from "@/lib/triage/clientMonogram";
import type { RelativeBucket } from "@/lib/triage/relativeDate";
import type { AgendaItem as AgendaItemData, AgendaKind } from "@/lib/triage/buildAgenda";

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  onboarding_call: PhoneCall,
  script_due:      PenLine,
  editing_due:     Scissors,
  filming:         Camera,
  boosting:        TrendingUp,
  posting:         Send,
  scripts_review:  FileText,
  videos_revision: Film,
  posts_scheduled: Send,
};

// Tile + chip tint per urgency bucket (mirrors TriageRow's palette).
const BUCKET_TINT: Record<RelativeBucket, { bg: string; fg: string }> = {
  overdue:   { bg: 'rgba(178,58,42,0.12)',  fg: '#B23A2A' },
  soon:      { bg: 'rgba(197,136,47,0.14)', fg: '#A85B1F' },
  today:     { bg: 'rgba(197,136,47,0.14)', fg: '#A85B1F' },
  tomorrow:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream))' },
  thisweek:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream))' },
  twoweeks:  { bg: 'hsl(var(--ink-on-cream) / 0.06)', fg: 'hsl(var(--ink-on-cream) / 0.7)' },
  farfuture: { bg: 'hsl(var(--ink-on-cream) / 0.05)', fg: 'hsl(var(--ink-on-cream) / 0.55)' },
};

function rowHoverIn(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.transform = 'translateY(-1px)';
  e.currentTarget.style.boxShadow = '0 10px 26px hsl(var(--ink-on-cream) / 0.06)';
}
function rowHoverOut(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.transform = 'none';
  e.currentTarget.style.boxShadow = 'none';
}

export function AgendaItem({ item, picUrl }: { item: AgendaItemData; picUrl?: string | null }) {
  const Icon = KIND_ICON[item.kind];
  const tint = BUCKET_TINT[item.bucket];
  const mono = colorFor(item.clientName);

  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-[13px] transition-all"
      style={{
        textDecoration: 'none',
        background: 'rgba(255,255,255,0.62)',
        border: '1px solid hsl(var(--ink-on-cream) / 0.07)',
        padding: '12px 14px',
        marginBottom: 9,
      }}
      onMouseEnter={rowHoverIn}
      onMouseLeave={rowHoverOut}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 36, height: 36, borderRadius: 10, background: tint.bg }}
      >
        <Icon size={17} color={tint.fg} strokeWidth={1.75} />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", fontSize: 16, color: 'hsl(var(--ink-on-cream))', lineHeight: 1.15 }}
        >
          <span className="truncate">{item.verb}</span>
          {item.isPrep && (
            <span
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: '#A85B1F',
                background: 'rgba(197,136,47,0.18)', padding: '2px 7px', borderRadius: 999, flexShrink: 0,
              }}
            >
              PREP
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1.5 mt-0.5 min-w-0"
          style={{ fontSize: 12, color: 'hsl(var(--ink-on-cream) / 0.55)', fontFamily: 'var(--font-body, Figtree), sans-serif' }}
        >
          <ClientAvatar
            picUrl={picUrl}
            alt={item.clientName}
            size={17}
            fallback={
              <span
                style={{
                  width: 17, height: 17, borderRadius: 999, background: mono.bg, color: mono.fg,
                  fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif", fontSize: 8, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {initials(item.clientName)}
              </span>
            }
            style={{ width: 17, height: 17 }}
          />
          <span className="truncate">{item.clientName}</span>
          {item.countLabel && (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: '#A85B1F', fontWeight: 600, flexShrink: 0 }}>{item.countLabel}</span>
            </>
          )}
          {!item.countLabel && item.context && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.context}</span>
            </>
          )}
        </div>
      </div>

      <span
        style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
          whiteSpace: 'nowrap', background: tint.bg, color: tint.fg, flexShrink: 0,
        }}
      >
        {item.chipLabel}
      </span>
    </Link>
  );
}
