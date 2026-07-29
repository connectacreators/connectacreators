import { STAGE_FIELDS, type StageKey } from "@/hooks/useOutboundMetrics";

/**
 * The six funnel stages in sheet order. A prospect's `stage_reached` is an
 * index into this list PLUS ONE — 0 means "sourced but not yet targeted",
 * which writes to no counter at all.
 *
 * That offset is deliberate. Every overall rate on /outbound (IMSR, IR, PRR,
 * CSR, ABR) divides by pre_initiated, so counting scraped-but-unreviewed
 * handles as A1 would inflate the funnel base and silently depress every
 * conversion percentage on the page.
 */
export const STAGE_ORDER: StageKey[] = STAGE_FIELDS.map((f) => f.key);

export const MAX_STAGE = STAGE_ORDER.length;

export interface StageDelta {
  stage: StageKey;
  delta: number;
}

function clampStage(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_STAGE, Math.round(n)));
}

/**
 * Signed counter deltas for moving one prospect from stage `from` to `to`.
 *
 * Advancing counts every stage in (from, to]; retreating un-counts every
 * stage in (to, from]. This keeps the funnel monotone — a booked prospect is
 * also counted at engaged and calendly_sent — so a stage conversion like
 * C -> D can never read above 100%.
 *
 * Returns [] for a no-op, which makes repeated writes idempotent.
 */
export function stageDeltas(from: number, to: number): StageDelta[] {
  const a = clampStage(from);
  const b = clampStage(to);
  if (a === b) return [];
  const sign = b > a ? 1 : -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: StageDelta[] = [];
  for (let i = lo; i < hi; i++) out.push({ stage: STAGE_ORDER[i], delta: sign });
  return out;
}

/** Human label for a stage_reached value; 0 is the pre-funnel state. */
export function stageLabel(stage: number): string {
  const s = clampStage(stage);
  return s === 0 ? "Sourced" : STAGE_FIELDS[s - 1].label;
}
