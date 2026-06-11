import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, CheckCircle2, AlertTriangle, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/getAuthToken";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Mirror analyze-viral-video-user: 50 credits per video.
const CREDIT_COST = 50;
// Hard cap per run, by product decision.
const MAX_BATCH = 100;
// Simultaneous in-flight dispatches (mirrors the page categorize semaphore).
const CONCURRENCY = 4;

export interface BulkVideo {
  id: string;
  analysis_status?: "pending" | "analyzing" | "analyzed" | "failed" | null;
}

interface Props {
  /** Filtered videos in current display order (ascending→descending as shown). */
  videos: BulkVideo[];
  /** True when the current user analyzes for free (admin / videographer). */
  isFree: boolean;
  /** Spendable balance: regular credits + top-ups. */
  balance: number;
  onClose: () => void;
  /** Called once a run finishes (any outcome) so the grid can refresh statuses. */
  onDone?: () => void;
}

type Phase = "confirm" | "running" | "done";

// Eligible = never finished and not already in flight. null/"pending"/"failed" run.
function isEligible(v: BulkVideo): boolean {
  const s = v.analysis_status;
  return s !== "analyzed" && s !== "analyzing";
}

export default function BulkAnalyzeModal({ videos, isFree, balance, onClose, onDone }: Props) {
  const eligibleAll = useMemo(() => videos.filter(isEligible), [videos]);

  const skippedDone = videos.length - eligibleAll.length;
  // Most we can run this round: eligible count, hard-capped at 100.
  const maxRun = Math.min(eligibleAll.length, MAX_BATCH);
  const droppedByCap = Math.max(0, eligibleAll.length - MAX_BATCH);
  const affordableCount = Math.floor(balance / CREDIT_COST);

  // How many to analyze — typed by the user (not a dropdown).
  const [countInput, setCountInput] = useState("");
  const parsed = parseInt(countInput, 10);
  const hasInput = countInput.trim() !== "";
  const validNumber = hasInput && Number.isInteger(parsed) && parsed >= 1;
  // Clamp the requested count to what's actually available.
  const runCount = validNumber ? Math.min(parsed, maxRun) : 0;
  const toRun = eligibleAll.slice(0, runCount);

  const cost = runCount * CREDIT_COST;
  const canAfford = isFree || cost <= balance;

  const inputError = !hasInput
    ? null
    : !Number.isInteger(parsed) || parsed < 1
      ? "Enter a whole number of 1 or more"
      : parsed > maxRun
        ? `Only ${maxRun} available right now — will analyze ${maxRun}`
        : null;
  const inputBlocks = hasInput && !validNumber; // typed something invalid

  const [phase, setPhase] = useState<Phase>("confirm");
  const [progress, setProgress] = useState({ done: 0, queued: 0, skipped: 0, failed: 0 });
  const [stoppedOOC, setStoppedOOC] = useState(false);
  const cancelRef = useRef(false);

  const total = runCount;

  async function run() {
    setPhase("running");
    cancelRef.current = false;
    let queued = 0;
    let skipped = 0;
    let failed = 0;
    let ooc = false;
    let idx = 0;

    async function worker() {
      // Single-threaded JS: `idx++` is atomic before the await, so no two
      // workers pull the same index.
      while (!cancelRef.current && !ooc) {
        const i = idx++;
        if (i >= toRun.length) return;
        const v = toRun[i];
        try {
          const token = await getAuthToken();
          const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-viral-video-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ viral_video_id: v.id }),
          });
          if (res.status === 402) {
            ooc = true; // out of credits — stop pulling new work
          } else if (res.status === 409) {
            skipped++; // already in flight; its card's realtime sub will update it
          } else if (!res.ok) {
            failed++;
          } else {
            queued++;
          }
        } catch {
          failed++;
        }
        setProgress({ done: queued + skipped + failed, queued, skipped, failed });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, toRun.length) }, () => worker()),
    );

    setStoppedOOC(ooc);
    window.dispatchEvent(new Event("credits-updated"));
    setPhase("done");
    onDone?.();

    const parts = [`${queued} queued`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed) parts.push(`${failed} failed`);
    if (ooc) parts.push("stopped — out of credits");
    toast.success(`Bulk analyze: ${parts.join(", ")}`);
  }

  const pct = total > 0 ? Math.round((progress.done / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground font-serif">
              {phase === "done" ? "Bulk analyze complete" : "Bulk analyze filtered videos"}
            </h2>
          </div>
          {phase !== "running" && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          {/* ── Confirm ── */}
          {phase === "confirm" && (
            <div className="space-y-4">
              {maxRun === 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Nothing to analyze — every filtered video is already analyzed or in progress.
                  </p>
                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="bulk-count" className="text-sm font-medium text-foreground">
                      How many videos do you want to analyze?
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Runs from the top of your current filtered view, in the order shown.
                    </p>
                    <input
                      id="bulk-count"
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={countInput}
                      onChange={(e) => setCountInput(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder={`Up to ${maxRun}`}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                      {maxRun} un-analyzed video{maxRun === 1 ? "" : "s"} available
                    </li>
                    {skippedDone > 0 && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {skippedDone} already analyzed or in progress — skipped
                      </li>
                    )}
                    {droppedByCap > 0 && (
                      <li className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        {eligibleAll.length} eligible total · max {MAX_BATCH} per run
                      </li>
                    )}
                    {runCount > 0 && (
                      <li className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                        {isFree ? (
                          <span>Free — your role isn't charged credits</span>
                        ) : (
                          <span>
                            ~<span className="font-semibold text-foreground">{cost.toLocaleString()}</span>{" "}
                            credits for {runCount} · balance {balance.toLocaleString()}
                          </span>
                        )}
                      </li>
                    )}
                  </ul>

                  {inputError && (
                    <p className="text-xs text-amber-600">{inputError}</p>
                  )}

                  {runCount > 0 && !canAfford && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                      Not enough credits for {runCount} videos. You can afford{" "}
                      <span className="font-semibold">{affordableCount}</span>. Enter a smaller
                      number or top up, then try again.
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={run}
                      disabled={runCount === 0 || inputBlocks || !canAfford}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Analyze{runCount > 0 ? ` ${runCount}` : ""}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Running ── */}
          {phase === "running" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Dispatching {progress.done} / {total}…
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{progress.queued} queued</span>
                {progress.skipped > 0 && <span>{progress.skipped} skipped</span>}
                {progress.failed > 0 && (
                  <span className="text-destructive">{progress.failed} failed</span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Analyses run in the background — each card updates itself as it finishes. You can
                stop dispatching new ones below.
              </p>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  Stop
                </Button>
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {phase === "done" && (
            <div className="space-y-4">
              <ul className="space-y-1.5 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {progress.queued} video{progress.queued === 1 ? "" : "s"} queued for analysis
                </li>
                {progress.skipped > 0 && (
                  <li className="flex items-center gap-2 text-muted-foreground text-xs">
                    {progress.skipped} skipped (already in progress)
                  </li>
                )}
                {progress.failed > 0 && (
                  <li className="flex items-center gap-2 text-destructive text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {progress.failed} failed to start
                  </li>
                )}
                {stoppedOOC && (
                  <li className="flex items-center gap-2 text-amber-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Stopped early — ran out of credits
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground">
                Cards update automatically as each analysis completes.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
