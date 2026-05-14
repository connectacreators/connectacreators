import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Youtube, Music2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ScheduledPostRow, TargetRow } from "@/lib/hooks/useScheduledPosts";

const ICON: Record<TargetRow["platform"], LucideIcon> = {
  facebook:  Facebook,
  instagram: Instagram,
  tiktok:    Music2,
  youtube:   Youtube,
};

const STATUS_COLOR: Record<TargetRow["status"], string> = {
  pending:    "text-muted-foreground",
  publishing: "text-amber-500",
  published:  "text-emerald-600",
  failed:     "text-red-600",
};

const STATUS_LABEL: Record<ScheduledPostRow["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:      { label: "Draft",      variant: "secondary" },
  scheduled:  { label: "Scheduled",  variant: "outline" },
  publishing: { label: "Publishing", variant: "default" },
  published:  { label: "Published",  variant: "default" },
  partial:    { label: "Partial",    variant: "destructive" },
  failed:     { label: "Failed",     variant: "destructive" },
};

export function PostStatusBadge({ post }: { post: ScheduledPostRow }) {
  const isAwaitingApproval =
    post.status !== "draft" &&
    post.status !== "published" &&
    post.status !== "partial" &&
    post.status !== "failed" &&
    !post.client_approved_at;

  const s = isAwaitingApproval
    ? { label: "Awaiting approval", variant: "secondary" as const }
    : STATUS_LABEL[post.status];

  return (
    <div className="flex items-center gap-2">
      <Badge variant={s.variant}>{s.label}</Badge>
      <div className="flex items-center gap-1">
        {post.targets.map((t) => {
          const Icon = ICON[t.platform];
          return <Icon key={t.id} className={`h-3.5 w-3.5 ${STATUS_COLOR[t.status]}`} />;
        })}
      </div>
    </div>
  );
}
