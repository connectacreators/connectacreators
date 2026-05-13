import { useQuery } from "@tanstack/react-query";
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
  created_at: string;
  targets: TargetRow[];
}

export type PostFilter = "all" | "drafts" | "scheduled" | "published" | "failed";

export function useScheduledPosts(clientId: string | null, filter: PostFilter = "all") {
  return useQuery({
    queryKey: ["scheduled_posts", clientId, filter],
    enabled: Boolean(clientId),
    queryFn: async () => {
      let query = supabase
        .from("scheduled_posts")
        .select(
          "id, client_id, video_url, caption, mode, scheduled_at, status, created_at, targets:scheduled_post_targets(id, platform, status, platform_post_url, last_error, attempt_count)",
        )
        .eq("client_id", clientId!)
        .order("scheduled_at", { ascending: true, nullsFirst: false });

      if (filter === "drafts")    query = query.eq("status", "draft");
      if (filter === "scheduled") query = query.in("status", ["scheduled", "publishing"]);
      if (filter === "published") query = query.in("status", ["published", "partial"]);
      if (filter === "failed")    query = query.eq("status", "failed");

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledPostRow[];
    },
  });
}
