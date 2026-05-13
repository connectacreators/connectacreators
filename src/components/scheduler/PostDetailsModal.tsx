import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ScheduledPostRow } from "@/lib/hooks/useScheduledPosts";
import { useQueryClient } from "@tanstack/react-query";

interface Props { post: ScheduledPostRow | null; onClose: () => void }

export function PostDetailsModal({ post, onClose }: Props) {
  const qc = useQueryClient();
  if (!post) return null;

  const retryTarget = async (targetId: string) => {
    const { error } = await supabase.from("scheduled_post_targets").update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", targetId);
    if (error) { toast.error("Retry failed: " + error.message); return; }
    // Kick the dispatcher so we don't wait for the next cron tick.
    await supabase.functions.invoke("publish-scheduled-posts", { body: { force_post_id: post.id } });
    qc.invalidateQueries({ queryKey: ["scheduled_posts"] });
    toast.success("Retry queued");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{post.caption || "(no caption)"}</p>
          <div className="space-y-2">
            {post.targets.map((t) => (
              <div key={t.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  <p className="font-medium capitalize">{t.platform}</p>
                  <p className="text-xs text-muted-foreground">Status: {t.status} · attempts: {t.attempt_count}</p>
                  {t.last_error && <p className="text-xs text-red-600 mt-1">{t.last_error}</p>}
                  {t.platform_post_url && (
                    <a
                      href={t.platform_post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      View live post
                    </a>
                  )}
                </div>
                {t.status === "failed" && (
                  <Button size="sm" onClick={() => retryTarget(t.id)}>Retry</Button>
                )}
              </div>
            ))}
            {post.targets.length === 0 && (
              <p className="text-xs text-muted-foreground">No platforms targeted (this post is a draft).</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
