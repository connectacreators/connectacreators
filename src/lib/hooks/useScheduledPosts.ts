import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TargetRow {
  id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  status: "pending" | "publishing" | "published" | "failed";
  platform_post_url: string | null;
  last_error: string | null;
  attempt_count: number;
}

export interface ScheduledPostRow {
  id: string;
  client_id: string;
  video_url: string;
  caption: string;
  mode: "draft" | "scheduled" | "autopost";
  scheduled_at: string | null;
  status: "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
  client_approved_at: string | null;
  client_approved_by: string | null;
  created_at: string;
  targets: TargetRow[];
}

export type PostFilter = "all" | "awaiting_approval" | "approved" | "drafts" | "published" | "failed";

const SELECT = "id, client_id, video_url, caption, mode, scheduled_at, status, client_approved_at, client_approved_by, created_at, targets:scheduled_post_targets(id, platform, status, platform_post_url, last_error, attempt_count)";

export function useScheduledPosts(clientId: string | null, filter: PostFilter = "all") {
  return useQuery({
    queryKey: ["scheduled_posts", clientId, filter],
    enabled: Boolean(clientId),
    queryFn: async () => {
      let query = supabase
        .from("scheduled_posts")
        .select(SELECT)
        .eq("client_id", clientId!)
        .order("scheduled_at", { ascending: true, nullsFirst: false });

      if (filter === "drafts")             query = query.eq("status", "draft");
      if (filter === "awaiting_approval")  query = query.in("status", ["scheduled", "publishing"]).is("client_approved_at", null);
      if (filter === "approved")           query = query.in("status", ["scheduled", "publishing"]).not("client_approved_at", "is", null);
      if (filter === "published")          query = query.in("status", ["published", "partial"]);
      if (filter === "failed")             query = query.eq("status", "failed");

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledPostRow[];
    },
  });
}

/** Approve a scheduled post — sets client_approved_at and kicks the dispatcher. */
export function useApproveScheduledPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ client_approved_at: new Date().toISOString(), client_approved_by: user?.id ?? null })
        .eq("id", postId);
      if (error) throw error;
      // If the post is autopost or scheduled_at is in the past, fire the dispatcher
      // so it publishes without waiting for the next cron tick.
      await supabase.functions.invoke("publish-scheduled-posts", { body: { force_post_id: postId } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled_posts"] }),
  });
}

/** Un-approve (e.g. client wants to revise) — clears client_approved_at. */
export function useUnapproveScheduledPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ client_approved_at: null, client_approved_by: null })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled_posts"] }),
  });
}
