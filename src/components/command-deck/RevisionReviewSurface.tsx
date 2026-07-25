// The Command Deck's "Action Surface" — lets an admin watch a video, leave
// timestamped revision notes, change status, and reassign an editing-queue
// item without ever leaving /ai. Triggered when open_editing_item's
// navigate action is intercepted (see parseEditingReviewNavigation +
// CommandCenter.tsx's action-dispatch loop) instead of routing to
// /clients/:id/editing-queue. Reuses the real VideoReviewModal — same
// playback, same timestamped/ranged notes, same footage references — so
// this is the actual production review flow, not a re-implementation.
import { useEffect, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { useEditingReviewItem } from "@/hooks/useEditingReviewItem";
import { LIFECYCLE_VALUES, type LifecycleStatus } from "@/lib/lifecycleStatus";
import VideoReviewModal, { type ReviewSurfaceCommand } from "@/components/VideoReviewModal";
import type { ActionSurfaceSnapshot } from "@/lib/commandDeck/actionSurface";
import { toast } from "sonner";

const LIFECYCLE_HUD_COLOR: Record<LifecycleStatus, string> = {
  "Not started": "hsl(var(--bone) / 0.4)",
  "In progress": "hsl(var(--honey))",
  "Needs Revisions": "hsl(4 68% 63%)",
  Scheduled: "hsl(var(--aqua))",
  Published: "hsl(var(--good, 141 33% 61%))",
};

export default function RevisionReviewSurface({
  itemId,
  clientId,
  onClose,
  externalCommand,
  onExternalCommandHandled,
  onSurfaceStateChange,
}: {
  itemId: string;
  clientId: string | null;
  onClose: () => void;
  /** Remote-controls the open VideoReviewModal — see control_review_surface. */
  externalCommand?: ReviewSurfaceCommand | null;
  onExternalCommandHandled?: () => void;
  /** Fired whenever the open item or its live playback state changes, and
   *  once more with `null` on unmount — lets the caller (CommandCenter)
   *  keep a fresh snapshot to send as AI context without polling. */
  onSurfaceStateChange?: (state: ActionSurfaceSnapshot | null) => void;
}) {
  const {
    item,
    loading,
    error,
    teamMembers,
    clientAssignee,
    savingLifecycle,
    savingAssignee,
    setLifecycle,
    syncLifecycleFromLegacyStatus,
    setAssignee,
  } = useEditingReviewItem(itemId, clientId);
  // Opens immediately (not on a manual "Watch" click) so "open the revisions
  // for X" is actually a continuous, ready-to-control review session, not a
  // summary panel that still requires a manual tap before anything useful
  // is on screen. The button below becomes a "reopen" affordance for if the
  // video dialog itself gets manually closed.
  const [reviewOpen, setReviewOpen] = useState(true);

  useEffect(() => {
    if (!item) return;
    onSurfaceStateChange?.({
      itemId: item.id,
      itemTitle: item.title,
      clientId: item.clientId,
      clientName: item.clientName,
      playing: false,
      currentTimeSeconds: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.title, item?.clientName]);

  useEffect(() => {
    return () => onSurfaceStateChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-2xl flex-1 flex flex-col min-h-0 items-center justify-center overflow-y-auto py-4">
      <div className="w-full flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase" style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.6)" }}>
            <span className="inline-block w-1 h-1 rounded-full" style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }} />
            Action Surface
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase transition-colors px-2 py-1 rounded-full"
            style={{ letterSpacing: "0.1em", color: "hsl(var(--bone) / 0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.85)"; e.currentTarget.style.borderColor = "hsl(var(--aqua) / 0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "hsl(var(--bone) / 0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to deck
          </button>
        </div>

        {loading ? (
          <div className="text-[13px] font-mono" style={{ color: "hsl(var(--bone) / 0.4)" }}>
            Loading item…
          </div>
        ) : error || !item ? (
          <div className="text-[13px] font-mono" style={{ color: "hsl(4 68% 63%)" }}>
            {error || "Item not found."}
          </div>
        ) : (
          <>
            <div>
              <div className="font-mono text-[10px] uppercase mb-1.5" style={{ letterSpacing: "0.12em", color: "hsl(var(--bone) / 0.4)" }}>
                {item.clientName || "Master queue"}
              </div>
              <h2 className="font-serif" style={{ fontSize: 24, lineHeight: 1.25, color: "hsl(var(--bone))", letterSpacing: "-0.01em" }}>
                {item.title}
              </h2>
            </div>

            <button
              onClick={() => setReviewOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-3 font-mono text-[11px] uppercase transition-all"
              style={{
                letterSpacing: "0.14em",
                color: "hsl(var(--ink))",
                background: "hsl(var(--aqua))",
                borderRadius: 999,
                boxShadow: "0 0 24px hsl(var(--aqua) / 0.3)",
              }}
            >
              <Play className="w-3.5 h-3.5" fill="currentColor" />
              Watch &amp; Leave Revisions
            </button>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase" style={{ letterSpacing: "0.14em", color: "hsl(var(--bone) / 0.3)" }}>
                Status
              </span>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_VALUES.map((s) => {
                  const active = item.lifecycleStatus === s;
                  const color = LIFECYCLE_HUD_COLOR[s];
                  return (
                    <button
                      key={s}
                      disabled={savingLifecycle}
                      onClick={() =>
                        setLifecycle(s).then(
                          () => toast.success(`Status set to "${s}"`),
                          () => toast.error("Failed to update status"),
                        )
                      }
                      className="font-mono text-[9.5px] uppercase px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        letterSpacing: "0.06em",
                        color: active ? color : "hsl(var(--bone) / 0.4)",
                        border: `1px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                        opacity: savingLifecycle ? 0.5 : 1,
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase" style={{ letterSpacing: "0.14em", color: "hsl(var(--bone) / 0.3)" }}>
                Assignee
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  disabled={savingAssignee}
                  onClick={() =>
                    setAssignee(null).then(
                      () => toast.success("Unassigned"),
                      () => toast.error("Failed to update assignee"),
                    )
                  }
                  className="font-mono text-[9.5px] uppercase px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    letterSpacing: "0.06em",
                    color: !item.assigneeUserId ? "hsl(var(--aqua))" : "hsl(var(--bone) / 0.4)",
                    border: `1px solid ${!item.assigneeUserId ? "hsl(var(--aqua) / 0.5)" : "rgba(255,255,255,0.1)"}`,
                    opacity: savingAssignee ? 0.5 : 1,
                  }}
                >
                  Unassigned
                </button>
                {teamMembers
                  .filter((m) => m.user_id !== clientAssignee?.user_id)
                  .map((m) => {
                    const active = item.assigneeUserId === m.user_id;
                    return (
                      <button
                        key={m.user_id}
                        disabled={savingAssignee}
                        onClick={() =>
                          setAssignee(m.user_id).then(
                            () => toast.success(`Assigned to ${m.display_name}`),
                            () => toast.error("Failed to update assignee"),
                          )
                        }
                        className="font-mono text-[9.5px] uppercase px-2.5 py-1 rounded-full transition-colors"
                        style={{
                          letterSpacing: "0.06em",
                          color: active ? "hsl(var(--aqua))" : "hsl(var(--bone) / 0.4)",
                          border: `1px solid ${active ? "hsl(var(--aqua) / 0.5)" : "rgba(255,255,255,0.1)"}`,
                          opacity: savingAssignee ? 0.5 : 1,
                        }}
                      >
                        {m.display_name}
                      </button>
                    );
                  })}
                {clientAssignee && (
                  <button
                    disabled={savingAssignee}
                    onClick={() =>
                      setAssignee(clientAssignee.user_id).then(
                        () => toast.success(`Assigned to ${clientAssignee.name}`),
                        () => toast.error("Failed to update assignee"),
                      )
                    }
                    className="font-mono text-[9.5px] uppercase px-2.5 py-1 rounded-full transition-colors"
                    style={{
                      letterSpacing: "0.06em",
                      color: item.assigneeUserId === clientAssignee.user_id ? "hsl(var(--honey))" : "hsl(var(--bone) / 0.4)",
                      border: `1px solid ${item.assigneeUserId === clientAssignee.user_id ? "hsl(var(--honey) / 0.5)" : "rgba(255,255,255,0.1)"}`,
                      opacity: savingAssignee ? 0.5 : 1,
                    }}
                  >
                    {clientAssignee.name} (Client)
                  </button>
                )}
              </div>
            </div>

            <VideoReviewModal
              open={reviewOpen}
              onClose={() => setReviewOpen(false)}
              videoEditId={item.id}
              clientId={item.clientId}
              title={item.title}
              uploadSource={item.uploadSource}
              storagePath={item.storagePath}
              fileSubmissionUrl={item.fileSubmissionUrl}
              associatedFootage={item.footageUrl}
              onStatusChanged={syncLifecycleFromLegacyStatus}
              externalCommand={externalCommand}
              onExternalCommandHandled={onExternalCommandHandled}
              onPlaybackStateChange={(state) =>
                onSurfaceStateChange?.({
                  itemId: item.id,
                  itemTitle: item.title,
                  clientId: item.clientId,
                  clientName: item.clientName,
                  playing: !state.isPaused,
                  currentTimeSeconds: state.currentTime,
                })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
