import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, CheckCircle2, AlertTriangle, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/getAuthToken";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Mirror analyze-viral-video-user: 50 credits per video.
const CREDIT_COST = 50;
// Hard cap per run, by product decision.
const MAX_BATCH = 100;
// Queue progress poll cadence while the modal stays open.
const POLL_MS = 5000;

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

type Phase = "confirm" | "enqueueing" | "running" | "done";

// Eligible = never finished and not already in flight. null/"pending"/"failed" run.
function isEligible(v: BulkVideo): boolean {
  const s = v.analysis_status;
  return s !== "analyzed" && s !== "analyzing";
}

interface QueueProgress {
  queued: number;
  running: number;
  done: number;
  failed: number;
  skipped: number;
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
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState(0);
  const [enqueueSkipped, setEnqueueSkipped] = useState(0);
  const [progress, setProgress] = useState<QueueProgress>({ queued: 0, running: 0, done: 0, failed: 0, skipped: 0 });

  // Hand the batch to the server-side queue. This returns in ~1s — the actual
  // analyses run from pg_cron on the backend, so closing the tab loses nothing.
  async function enqueue() {
    setPhase("enqueueing");
    try {
      const token = await getAuthToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/viral-analyze-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "enqueue", viral_video_ids: toRun.map((v) => v.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `enqueue failed (${res.status})`);
      setBatchId(data.batch_id);
      setBatchSize(data.queued ?? 0);
      setEnqueueSkipped(data.skipped ?? 0);
      setPhase("running");
      toast.success(`Queued ${data.queued} video${data.queued === 1 ? "" : "s"} for background analysis`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to queue batch");
      setPhase("confirm");
    }
  }

  // Poll the queue (RLS lets the requester read their own rows) while open.
  useEffect(() => {
    if (phase !== "running" || !batchId) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("viral_analyze_queue")
        .select("status")
        .eq("batch_id", batchId);
      if (cancelled || !data) return;
      const counts: QueueProgress = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0 };
      for (const r of data as { status: keyof QueueProgress }[]) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      setProgress(counts);
      if (counts.queued === 0 && counts.running === 0) {
        setPhase("done");
        window.dispatchEvent(new Event("credits-updated"));
        onDone?.();
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [phase, batchId]);

  const finished = progress.done + progress.failed + progress.skipped;
  const pct = batchSize > 0 ? Math.round((finished / batchSize) * 100) : 0;

  // Escape closes — safe even mid-run: the batch executes server-side.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground font-serif">
              {phase === "done" ? "Bulk analyze complete" : "Bulk analyze filtered videos"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
            title={phase === "running" ? "Close — the queue keeps processing on the server" : "Close"}
          >
            <X className="w-4 h-4" />
          </button>
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
                      onClick={enqueue}
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

          {/* ── Enqueueing ── */}
          {phase === "enqueueing" && (
            <div className="flex items-center gap-2 py-4 text-sm text-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Queueing batch…
            </div>
          )}

          {/* ── Running (server-side) ── */}
          {phase === "running" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Analyzed {finished} / {batchSize}
                {progress.running > 0 && (
                  <span className="text-xs text-muted-foreground">· {progress.running} in progress</span>
                )}
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{progress.done} done</span>
                <span>{progress.queued} waiting</span>
                {progress.failed > 0 && (
                  <span className="text-destructive">{progress.failed} failed</span>
                )}
                {enqueueSkipped > 0 && <span>{enqueueSkipped} skipped</span>}
              </div>

              <p className="text-xs text-muted-foreground">
                The batch runs on the server — you can close this window or the whole tab and it
                keeps going. Cards update automatically as each analysis completes.
              </p>

              <div className="flex justify-end">
                <Button size="sm" onClick={onClose}>
                  Close — runs in background
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
                  {progress.done} video{progress.done === 1 ? "" : "s"} analyzed
                </li>
                {(progress.skipped > 0 || enqueueSkipped > 0) && (
                  <li className="flex items-center gap-2 text-muted-foreground text-xs">
                    {progress.skipped + enqueueSkipped} skipped (already analyzed or in progress)
                  </li>
                )}
                {progress.failed > 0 && (
                  <li className="flex items-center gap-2 text-destructive text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {progress.failed} failed — their cards show a red "Failed — Retry" badge
                  </li>
                )}
              </ul>
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
