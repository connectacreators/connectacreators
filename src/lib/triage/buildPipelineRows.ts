// src/lib/triage/buildPipelineRows.ts
//
// Pure transform: a client_strategies row → an array of pipeline TriageRows
// filtered to dates within the next `windowDays` (default 7) and not in the past.

import type { PipelineMilestone, PipelineTriageRow } from "./types";

export interface PipelineSource {
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  ads_budget:         number | null;
}

interface FieldMap {
  field: keyof PipelineSource;
  milestone: PipelineMilestone;
}

const FIELDS: FieldMap[] = [
  { field: 'onboarding_call_at', milestone: 'onboarding_call' },
  { field: 'script_due_at',      milestone: 'script_due' },
  { field: 'editing_due_at',     milestone: 'editing_due' },
  { field: 'next_filming_at',    milestone: 'filming' },
  { field: 'boosting_at',        milestone: 'boosting' },
  { field: 'posting_at',         milestone: 'posting' },
];

// Filming + onboarding need lead time to prepare — surface them earlier.
const PREP_WINDOW_DAYS = 10;
const PREP_MILESTONES: ReadonlySet<PipelineMilestone> = new Set(['filming', 'onboarding_call']);

export function buildPipelineRows(
  source: PipelineSource | null,
  options: { windowDays?: number; now?: Date } = {},
): PipelineTriageRow[] {
  if (!source) return [];
  const windowDays = options.windowDays ?? 7;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoffFor = (m: PipelineMilestone) =>
    nowMs + (PREP_MILESTONES.has(m) ? Math.max(windowDays, PREP_WINDOW_DAYS) : windowDays) * dayMs;

  const out: PipelineTriageRow[] = [];

  for (const { field, milestone } of FIELDS) {
    const raw = source[field];
    if (!raw || typeof raw !== 'string') continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t) || t < nowMs || t > cutoffFor(milestone)) continue;

    let label: string | undefined;
    if (milestone === 'boosting' && typeof source.ads_budget === 'number' && source.ads_budget > 0) {
      label = `$${source.ads_budget} budget`;
    }

    out.push({ type: 'pipeline', milestone, at: raw, label });
  }

  // Chronological — soonest first
  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}
