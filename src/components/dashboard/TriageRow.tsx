// src/components/dashboard/TriageRow.tsx
//
// Renders one triage row inside a client block. Discriminates on row.type
// and builds the href for the matching destination page.

import { Link } from "react-router-dom";
import { relativeDate } from "@/lib/triage/relativeDate";
import { PIPELINE_MILESTONE_LABEL, type TriageRow as TriageRowData } from "@/lib/triage/types";

interface Props {
  row: TriageRowData;
  clientId: string;
}

const AGING_THRESHOLD_MS = 48 * 60 * 60 * 1000;

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

function renderContent(row: TriageRowData): { lead: string; detail: string; aging: boolean } {
  switch (row.type) {
    case 'pipeline': {
      const rel = relativeDate(row.at);
      const baseLabel = PIPELINE_MILESTONE_LABEL[row.milestone];
      const lead = `${baseLabel} ${rel.label.toLowerCase().startsWith('in ') || rel.label === 'Tomorrow' || rel.label === 'Today' ? rel.label : `· ${rel.label}`}`;
      const detail = row.label ?? '';
      return { lead, detail, aging: rel.bucket === 'overdue' || rel.bucket === 'today' };
    }
    case 'scripts_review': {
      const lead = `${row.count} ${pluralize(row.count, 'script')} ${pluralize(row.count, 'needs', 'need')} review`;
      const detail = truncateList(row.sampleNames);
      const aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
      return { lead, detail, aging };
    }
    case 'videos_revision': {
      const lead = `${row.count} ${pluralize(row.count, 'video')} ${pluralize(row.count, 'needs', 'need')} revisions`;
      const detail = truncateList(row.sampleNames);
      const aging = (Date.now() - new Date(row.oldestPendingAt).getTime()) > AGING_THRESHOLD_MS;
      return { lead, detail, aging };
    }
    case 'posts_scheduled': {
      const rel = relativeDate(row.nextAt);
      const lead = `${row.count} ${pluralize(row.count, 'post')} scheduled · ${rel.label}`;
      const detail = truncateList(row.sampleNames);
      return { lead, detail, aging: rel.bucket === 'today' };
    }
  }
}

export function TriageRow({ row, clientId }: Props) {
  const { lead, detail, aging } = renderContent(row);
  const href = buildHref(row, clientId);

  return (
    <Link
      to={href}
      className="group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20,20,20,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {aging ? (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: '#141414',
            marginRight: 4,
            flexShrink: 0,
          }}
        />
      ) : (
        <span style={{ width: 6, marginRight: 4, flexShrink: 0 }} />
      )}
      <span className="truncate" style={{ fontFamily: 'Figtree, sans-serif', fontSize: 14.5, color: '#141414' }}>
        <span>{lead}</span>
        {detail && (
          <>
            <span style={{ color: 'rgba(20,20,20,0.55)' }}> · </span>
            <span style={{ color: 'rgba(20,20,20,0.6)' }}>{detail}</span>
          </>
        )}
      </span>
    </Link>
  );
}
