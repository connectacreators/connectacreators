// src/hooks/useActiveBuildSessions.ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BuildStatus =
  | "running"
  | "awaiting_user"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

export interface ActiveBuildSession {
  id: string;
  client_id: string;
  thread_id: string;
  status: BuildStatus;
  current_state: string;
  auto_pilot: boolean;
  updated_at: string;
}

const ACTIVE_STATUSES: BuildStatus[] = ["running", "awaiting_user", "paused"];

export function useActiveBuildSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ActiveBuildSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      if (!user) return;
      const { data, error } = await supabase
        .from("companion_build_sessions")
        .select("id, client_id, thread_id, status, current_state, auto_pilot, updated_at")
        .eq("user_id", user.id)
        .in("status", ACTIVE_STATUSES)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (!error && data) setSessions(data as ActiveBuildSession[]);
      setLoading(false);
    }
    void load();

    const channel = supabase
      .channel(`build-sessions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "companion_build_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  return { sessions, loading };
}
