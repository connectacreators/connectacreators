// src/components/companion/BuildBanner.tsx
import { Loader2, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveBuildSession } from "@/hooks/useActiveBuildSessions";

const STATE_LABEL: Record<string, string> = {
  INIT: "Getting started",
  RESOLVE_CHAT: "Confirming canvas",
  AWAITING_IDEA: "Asking for an idea",
  READING_CONTEXT: "Reading canvas notes",
  IDEAS_GENERATED: "Showing ideas",
  FINDING_FRAMEWORKS: "Finding viral frameworks",
  FRAMEWORKS_PRESENTED: "Showing frameworks",
  ADDING_VIDEOS: "Adding videos to canvas",
  TRANSCRIBING: "Transcribing video",
  DRAFTING_SCRIPT: "Drafting script",
  DRAFT_PRESENTED: "Awaiting your approval",
  GENERATING_SCRIPT: "Saving script",
  SCRIPT_SAVED: "Script saved",
  LOOPING_NEXT: "Moving to next idea",
  DONE: "Done",
};

interface Props {
  session: ActiveBuildSession;
}

export function BuildBanner({ session }: Props) {
  const label = STATE_LABEL[session.current_state] ?? session.current_state;
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";
  const isAwaiting = session.status === "awaiting_user";

  async function handleCancel() {
    if (!confirm("Cancel this build? You can start over anytime.")) return;
    await supabase
      .from("companion_build_sessions")
      .update({ status: "cancelled" })
      .eq("id", session.id);
  }

  async function handlePause() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "paused" })
      .eq("id", session.id);
  }

  async function handleResume() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "running" })
      .eq("id", session.id);
    // Kick off the worker again
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return;
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://hxojqrilwhhrvloiwmfo.supabase.co";
    void fetch(`${SUPABASE_URL}/functions/v1/process-build-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession.access_token}`,
      },
      body: JSON.stringify({ build_session_id: session.id }),
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
      ) : isPaused ? (
        <span className="w-3.5 h-3.5 rounded-full bg-muted-foreground" />
      ) : isAwaiting ? (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-400" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-primary" />
      )}
      <span className="text-xs flex-1 text-foreground truncate">
        {isPaused ? "Paused — " : ""}
        {label}
      </span>
      {isPaused ? (
        <button
          onClick={handleResume}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Resume build"
          title="Resume build"
        >
          <Play className="w-3 h-3" />
        </button>
      ) : isRunning ? (
        <button
          onClick={handlePause}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Pause build"
          title="Pause build"
        >
          <Pause className="w-3 h-3" />
        </button>
      ) : null}
      <button
        onClick={handleCancel}
        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
        aria-label="Cancel build"
        title="Cancel build"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
