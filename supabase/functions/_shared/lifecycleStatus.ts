// Deno-compatible mirror of src/lib/lifecycleStatus.ts. Edge functions
// can't import from the React app source tree, so this is a parallel
// helper kept in sync by convention.

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

export function lifecycleUpdate(
  lifecycle_status: LifecycleStatus,
): { lifecycle_status: LifecycleStatus; status: string; post_status: string } {
  return { lifecycle_status, ...splitLegacy(lifecycle_status) };
}
