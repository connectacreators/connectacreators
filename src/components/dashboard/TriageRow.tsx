// src/components/dashboard/TriageRow.tsx
//
// Renders one triage row inside a client block. Each row is a clickable Link
// composed of: a colored icon tile, a serif numeral (for count rows) or
// milestone label (for pipeline rows), the descriptive text, and an
// optional aging marker.

import { Link } from "react-router-dom";
import {
  FileText, Film, Send, PhoneCall, PenLine, Scissors, Camera, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { relativeDate, type RelativeBucket } from "@/lib/triage/relativeDate";
import { pipelineMilestoneLabel, type TriageRow as TriageRowData, type PipelineMilestone } from "@/lib/triage/types";
import { useLanguage } from "@/hooks/useLanguage";
import { t } from "@/i18n/translations";

interface Props {
  row: TriageRowData;
  clientId: string;
}

const AGING_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const PIPELINE_ICON: Record<PipelineMilestone, LucideIcon> = {
  onboarding_call: PhoneCall,
  script_due:      PenLine,
  editing_due:     Scissors,
  filming:         Camera,
  boosting:        TrendingUp,
  posting:         Send,
};

// Tile color + accent for each bucket of urgency on pipeline rows.
const BUCKET_TINT: Record<RelativeBucket, { bg: string; iconFg: string; labelFg: string }> = {
  overdue:   { bg: 'rgba(178,58,42,0.10)',  iconFg: '#B23A2A', labelFg: '#B23A2A' },
  soon:      { bg: 'rgba(197,136,47,0.14)', iconFg: '#A85B1F', labelFg: '#A85B1F' },
  today:     { bg: 'rgba(197,136,47,0.14)', iconFg: '#A85B1F', labelFg: '#A85B1F' },
  tomorrow:  { bg: 'rgba(197,136,47,0.14)', iconFg: '#A85B1F', labelFg: '#A85B1F' },
  thisweek:  { bg: 'hsl(var(--ink-on-cream) / 0.06)',   iconFg: 'hsl(var(--ink-on-cream))', labelFg: 'hsl(var(--ink-on-cream))' },
  twoweeks:  { bg: 'hsl(var(--ink-on-cream) / 0.06)',   iconFg: 'hsl(var(--ink-on-cream))', labelFg: 'hsl(var(--ink-on-cream) / 0.65)' },
  farfuture: { bg: 'hsl(var(--ink-on-cream) / 0.05)',   iconFg: 'hsl(var(--ink-on-cream) / 0.55)', labelFg: 'hsl(var(--ink-on-cream) / 0.55)' },
};

// Color theme per count row type.
const TYPE_THEME: Record<'scripts_review' | 'videos_revision' | 'posts_scheduled', { icon: LucideIcon; bg: string; iconFg: string }> = {
  scripts_review:  { icon: FileText, bg: 'rgba(197,136,47,0.14)', iconFg: '#A85B1F' },
  videos_revision: { icon: Film,     bg: 'rgba(74,149,136,0.14)', iconFg: '#2F6B62' },
  posts_scheduled: { icon: Send,     bg: 'rgba(45,95,138,0.12)',  iconFg: '#1F4D72' },
};

function buildHref(row: TriageRowData, clientId: string): string {
  switch (row.type) {
    case 'pipeline':         return `/clients/${clientId}/strategy#pipeline`;
    case 'scripts_review':   return `/clients/${clientId}/scripts?filter=needs_review`;
    case 'videos_revision':  return `/clients/${clientId}/editing-queue?status=Needs%20Revisions`;
    case 'posts_scheduled':  return `/clients/${clientId}/content-calendar?window=upcoming`;
  }
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

function truncateList(names: string[], joiner = ', ', max = 56): string {
  const joined = names.join(joiner);
  if (joined.length <= max) return joined;
  return joined.slice(0, max - 1).trimEnd() + '…';
}

function Tile({ Icon, bg, fg }: { Icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: 30, height: 30, borderRadius: 9, background: bg }}
    >
      <Icon size={15} color={fg} strokeWidth={1.75} />
    </div>
  );
}

function rowHoverIn(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.background = 'hsl(var(--ink-on-cream) / 0.045)';
}
function rowHoverOut(e: React.MouseEvent<HTMLAnchorElement>) {
  e.currentTarget.style.background = 'transparent';
}

export function TriageRow({ row, clientId }: Props) {
  const { language } = useLanguage();
  const es = language === 'es';
  const href = buildHref(row, clientId);

  // PIPELINE ROW — icon tile + milestone label + relative date chip + optional context
  if (row.type === 'pipeline') {
    const rel = relativeDate(row.at, new Date(), language);
    const tint = BUCKET_TINT[rel.bucket];
    const Icon = PIPELINE_ICON[row.milestone];
    const baseLabel = pipelineMilestoneLabel(row.milestone, language);

    return (
      <Link
        to={href}
        className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors"
        style={{ textDecoration: 'none' }}
        onMouseEnter={rowHoverIn}
        onMouseLeave={rowHoverOut}
      >
        <Tile Icon={Icon} bg={tint.bg} fg={tint.iconFg} />
        <div className="flex-1 min-w-0 truncate" style={{ fontFamily: 'var(--font-body, Figtree), sans-serif', fontSize: 14, color: 'hsl(var(--ink-on-cream))' }}>
          <span style={{ fontWeight: 500 }}>{baseLabel}</span>
          <span
            className="ml-2 px-2 py-0.5 rounded-full text-[11.5px] align-middle"
            style={{
              background: tint.bg,
              color: tint.labelFg,
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            {rel.label}
          </span>
          {row.label && (
            <>
              <span style={{ color: 'hsl(var(--ink-on-cream) / 0.4)' }}>{'  ·  '}</span>
              <span style={{ color: 'hsl(var(--ink-on-cream) / 0.6)' }}>{row.label}</span>
            </>
          )}
        </div>
      </Link>
    );
  }

  // COUNT ROW — icon tile + big serif numeral + descriptive text + optional aging dot
  const theme = TYPE_THEME[row.type];
  const Icon = theme.icon;

  let count = 0;
  let label = '';
  let detail = '';
  let aging = false;

  if (row.type === 'scripts_review') {
    count = row.count;
    label = es
      ? `${pluralize(count, 'script')} por revisar`
      : `${pluralize(count, 'script')} ${pluralize(count, 'needs', 'need')} review`;
    detail = truncateList(row.sampleNames);
    aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
  } else if (row.type === 'videos_revision') {
    count = row.count;
    label = es
      ? `${pluralize(count, 'video')} con revisiones`
      : `${pluralize(count, 'video')} ${pluralize(count, 'needs', 'need')} revisions`;
    detail = truncateList(row.sampleNames);
    aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
  } else {
    count = row.count;
    const rel = relativeDate(row.nextAt, new Date(), language);
    label = es
      ? `${pluralize(count, 'post')} ${count === 1 ? 'programado' : 'programados'} · ${rel.label}`
      : `${pluralize(count, 'post')} scheduled · ${rel.label}`;
    detail = truncateList(row.sampleNames);
    aging = rel.bucket === 'today';
  }

  return (
    <Link
      to={href}
      className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={rowHoverIn}
      onMouseLeave={rowHoverOut}
    >
      <Tile Icon={Icon} bg={theme.bg} fg={theme.iconFg} />
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span
          style={{
            fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
            fontSize: 22,
            fontWeight: 500,
            color: 'hsl(var(--ink-on-cream))',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            minWidth: 14,
          }}
        >
          {count}
        </span>
        <span className="truncate flex-1 min-w-0" style={{ fontFamily: 'var(--font-body, Figtree), sans-serif', fontSize: 14, color: 'hsl(var(--ink-on-cream))' }}>
          <span>{label}</span>
          {detail && (
            <>
              <span style={{ color: 'hsl(var(--ink-on-cream) / 0.4)' }}>{'  ·  '}</span>
              <span style={{ color: 'hsl(var(--ink-on-cream) / 0.6)' }}>{detail}</span>
            </>
          )}
        </span>
      </div>
      {aging && (
        <span
          aria-hidden
          className="shrink-0"
          title={t.dashboard.agingTitle[language]}
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: '#C5882F',
          }}
        />
      )}
    </Link>
  );
}
