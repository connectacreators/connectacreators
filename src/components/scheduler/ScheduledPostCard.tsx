import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, AlertCircle, RefreshCcw } from "lucide-react";
import { PostStatusBadge } from "./PostStatusBadge";
import { resolveVideoUrl } from "@/lib/videoUrl";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  useApproveScheduledPost,
  useUnapproveScheduledPost,
  type ScheduledPostRow,
} from "@/lib/hooks/useScheduledPosts";

interface Props {
  post: ScheduledPostRow;
  onClick: () => void;
}

export function ScheduledPostCard({ post, onClick }: Props) {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const approve = useApproveScheduledPost();
  const unapprove = useUnapproveScheduledPost();
  const qc = useQueryClient();

  const failedTargets = post.targets.filter((t) => t.status === "failed");
  const hasFailures = failedTargets.length > 0 || post.status === "partial" || post.status === "failed";
  const firstError = failedTargets[0]?.last_error ?? null;

  useEffect(() => {
    let cancelled = false;
    void resolveVideoUrl(post.video_url).then((u) => { if (!cancelled) setVideoSrc(u); });
    return () => { cancelled = true; };
  }, [post.video_url]);

  const canApprove =
    !post.client_approved_at &&
    post.status !== "draft" &&
    post.status !== "published" &&
    post.status !== "partial" &&
    post.status !== "failed";

  const canUnapprove =
    Boolean(post.client_approved_at) &&
    post.status !== "published" &&
    post.status !== "partial" &&
    post.status !== "publishing";

  const scheduledLabel = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      })
    : "—";

  const retryFailed = async () => {
    if (failedTargets.length === 0) return;
    setRetrying(true);
    try {
      const ids = failedTargets.map((t) => t.id);
      const { error } = await supabase
        .from("scheduled_post_targets")
        .update({ status: "pending", next_attempt_at: new Date().toISOString(), last_error: null })
        .in("id", ids);
      if (error) throw error;
      // Kick the dispatcher so it doesn't wait for the next cron tick.
      await supabase.functions.invoke("publish-scheduled-posts", { body: { force_post_id: post.id } });
      qc.invalidateQueries({ queryKey: ["scheduled_posts"] });
      toast.success(`Retrying ${ids.length} failed ${ids.length === 1 ? "platform" : "platforms"}…`);
    } catch (e: any) {
      toast.error("Retry failed: " + (e?.message ?? String(e)));
    } finally {
      setRetrying(false);
    }
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-border/50 rounded-lg p-3 hover:bg-accent/30 transition-colors flex gap-3 items-start"
    >
      {/* 9:16 thumbnail */}
      <div className="w-16 h-28 shrink-0 bg-black rounded overflow-hidden flex items-center justify-center">
        {videoSrc ? (
          <video src={videoSrc} muted playsInline preload="metadata" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-muted/40" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium line-clamp-2 leading-snug">
            {post.caption.slice(0, 120) || "(no caption)"}
          </p>
          <PostStatusBadge post={post} />
        </div>
        <p className="text-xs text-muted-foreground">{scheduledLabel}</p>

        {hasFailures && firstError && (
          <div className="flex items-start gap-1.5 rounded border border-red-500/30 bg-red-500/5 p-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400 line-clamp-2 leading-snug">
              {failedTargets.length === 1
                ? `${failedTargets[0].platform} failed: ${firstError}`
                : `${failedTargets.length} platforms failed. First error (${failedTargets[0].platform}): ${firstError}`}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {canApprove && (
            <Button
              size="sm"
              className="h-7"
              disabled={approve.isPending}
              onClick={async () => {
                try {
                  await approve.mutateAsync(post.id);
                  toast.success("Approved — will publish when ready");
                } catch (e: any) {
                  toast.error("Approve failed: " + (e?.message ?? e));
                }
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Approve
            </Button>
          )}
          {canUnapprove && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={unapprove.isPending}
              onClick={async () => {
                if (!confirm("Un-approve this post? It won't publish until re-approved.")) return;
                try {
                  await unapprove.mutateAsync(post.id);
                  toast.success("Un-approved");
                } catch (e: any) {
                  toast.error("Un-approve failed: " + (e?.message ?? e));
                }
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Un-approve
            </Button>
          )}
          {hasFailures && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-red-500/40 text-red-400 hover:bg-red-500/10"
              disabled={retrying}
              onClick={retryFailed}
            >
              <RefreshCcw className={`w-3.5 h-3.5 mr-1 ${retrying ? "animate-spin" : ""}`} />
              Retry {failedTargets.length > 1 ? `all ${failedTargets.length}` : ""}
            </Button>
          )}
        </div>
      </div>
    </button>
  );
}
