// Single source of truth for the merged lifecycle_status column on
// video_edits. Phase 1: dual-write — any write to lifecycle_status also
// writes the corresponding legacy status + post_status fields so anything
// still reading the old columns continues to work during the rollout.
// Phase 2 (later spec) drops the legacy columns and removes splitLegacy.

export const LIFECYCLE_VALUES = [
  "Not started",
  "In progress",
  "Needs Revisions",
  "Scheduled",
  "Published",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_VALUES)[number];

export function isLifecycleStatus(v: unknown): v is LifecycleStatus {
  return typeof v === "string" && (LIFECYCLE_VALUES as readonly string[]).includes(v);
}

/**
 * Decompose a lifecycle_status value into the equivalent legacy (status,
 * post_status) pair. Used by writers that update lifecycle_status — they
 * spread the result onto the same UPDATE payload so legacy readers keep
 * working until Phase 2 drops the columns.
 *
 * Mapping:
 *   Not started     → status=Not started,   post_status=Unpublished
 *   In progress     → status=In progress,   post_status=Unpublished
 *   Needs Revisions → status=Needs Revision,post_status=Unpublished
 *   Scheduled       → status=Done,          post_status=Scheduled
 *   Published       → status=Done,          post_status=Published
 */
export function splitLegacy(
  lifecycle_status: LifecycleStatus,
): { status: string; post_status: string } {
  switch (lifecycle_status) {
    case "Not started":
      return { status: "Not started", post_status: "Unpublished" };
    case "In progress":
      return { status: "In progress", post_status: "Unpublished" };
    case "Needs Revisions":
      return { status: "Needs Revision", post_status: "Unpublished" };
    case "Scheduled":
      return { status: "Done", post_status: "Scheduled" };
    case "Published":
      return { status: "Done", post_status: "Published" };
  }
}

/**
 * Reverse: derive lifecycle_status from a legacy (status, post_status)
 * pair. Mirrors the SQL backfill in 20260514_lifecycle_status.sql.
 * Used during the migration window for any code path that only has the
 * legacy fields available (e.g. an old row that hasn't been touched
 * since the migration ran but somehow has lifecycle_status reset).
 */
export function deriveFromLegacy(
  status: string | null | undefined,
  post_status: string | null | undefined,
): LifecycleStatus {
  if (post_status === "Published") return "Published";
  if (post_status === "Scheduled") return "Scheduled";
  if (status && /^Needs Revision/i.test(status)) return "Needs Revisions";
  if (status === "Not started") return "Not started";
  if (
    (status === "In progress" || status === "In review" || status === "Done") &&
    (!post_status || post_status === "Unpublished")
  ) {
    return "In progress";
  }
  return "Not started";
}

/**
 * Builds the full UPDATE payload to set lifecycle_status — includes the
 * legacy columns so dual-write is automatic. Use this whenever you'd
 * write { lifecycle_status: X } directly.
 *
 *   await supabase
 *     .from("video_edits")
 *     .update(lifecycleUpdate("Scheduled"))
 *     .eq("id", id);
 */
export function lifecycleUpdate(
  lifecycle_status: LifecycleStatus,
): { lifecycle_status: LifecycleStatus; status: string; post_status: string } {
  return { lifecycle_status, ...splitLegacy(lifecycle_status) };
}

/**
 * Display color + class for badges/chips. Centralized so the UI
 * doesn't have to repeat the value→color map everywhere.
 */
export const LIFECYCLE_STYLE: Record<
  LifecycleStatus,
  { bg: string; text: string; border: string; label: string }
> = {
  "Not started": {
    bg: "bg-white/[0.04]",
    text: "text-white/45",
    border: "border-white/10",
    label: "Not started",
  },
  "In progress": {
    bg: "bg-yellow-500/15",
    text: "text-yellow-300",
    border: "border-yellow-400/30",
    label: "In progress",
  },
  "Needs Revisions": {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-400/30",
    label: "Needs Revisions",
  },
  Scheduled: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-300",
    border: "border-cyan-400/30",
    label: "Scheduled",
  },
  Published: {
    bg: "bg-green-500/15",
    text: "text-green-300",
    border: "border-green-400/30",
    label: "Published",
  },
};
