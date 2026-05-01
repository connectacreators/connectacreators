interface StatusBadgeProps {
  status: string;
  className?: string;
}

type BadgeColor = "cyan" | "lime" | "amber" | "neutral";

const statusToBadge: Record<string, BadgeColor> = {
  // Cyan — draft / pending / info / new / in-progress
  "Not started": "cyan",
  "In progress": "cyan",
  "Scheduled": "cyan",
  "draft": "cyan",
  "new": "cyan",
  "pending": "cyan",
  "info": "cyan",
  "New Lead": "cyan",
  "Follow-up 1": "cyan",
  "Follow-up 2": "cyan",
  "Follow-up 3": "cyan",
  "follow up #1": "cyan",
  "follow up #2": "cyan",
  "follow up #3": "cyan",
  "trialing": "cyan",
  "active": "lime",

  // Lime — success / done / approved / published / booked
  "Done": "lime",
  "Approved": "lime",
  "Published": "lime",
  "published": "lime",
  "completed": "lime",
  "Booked": "lime",
  "appointment booked": "lime",

  // Amber — warning / needs revision / past due
  "Needs Revision": "amber",
  "Needs revision": "amber",
  "Need Revision": "amber",
  "needs_revision": "amber",
  "warning": "amber",
  "review": "amber",
  "past_due": "amber",
  "Unpublished": "neutral",

  // Neutral — inactive / canceled
  "Canceled": "neutral",
  "canceled": "neutral",
  "inactive": "neutral",
};

const badgeClasses: Record<BadgeColor, string> = {
  cyan: "badge-cyan",
  lime: "badge-lime",
  amber: "badge-amber",
  neutral: "badge-neutral",
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const color = statusToBadge[status] ?? "neutral";
  const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`${badgeClasses[color]} ${className}`}>
      {normalizedStatus}
    </span>
  );
}

export function getStatusBadgeColor(status: string): BadgeColor {
  return statusToBadge[status] ?? "neutral";
}
