// src/components/companion/BuildBanner.tsx
import { Loader2, Pause, Play, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveBuildSession } from "@/hooks/useActiveBuildSessions";

interface Props {
  session: ActiveBuildSession;
}

export function BuildBanner({ session }: Props) {
  const label = session.phase || "Building script...";
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";

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
      .update({ status: "paused", phase: "Paused" })
      .eq("id", session.id);
  }

  async function handleResume() {
    await supabase
      .from("companion_build_sessions")
      .update({ status: "running", phase: "Resuming..." })
      .eq("id", session.id);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5">
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-400 flex-shrink-0" />
      )}
      <span className="text-xs flex-1 text-foreground truncate">{label}</span>
      {isRunning && (
        <button
          onClick={handlePause}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Pause build"
          title="Pause"
        >
          <Pause className="w-3 h-3" />
        </button>
      )}
      {isPaused && (
        <button
          onClick={handleResume}
          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground"
          aria-label="Resume build"
          title="Resume"
        >
          <Play className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={handleCancel}
        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
        aria-label="Cancel build"
        title="Cancel"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
