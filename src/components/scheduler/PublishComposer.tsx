import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSocialConnections } from "@/lib/hooks/useSocialConnections";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveVideoUrl } from "@/lib/videoUrl";
import { AlertTriangle } from "lucide-react";

const SKIP_APPROVAL_WARNING_KEY = "scheduler_skip_approval_warning_v1";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  editingQueueId: string;
  videoUrl: string;
  initialCaption: string;
  /** Browser timezone, e.g. "America/New_York" */
  defaultTimezone?: string;
}

type Mode = "autopost" | "scheduled" | "draft";
type Plat = "facebook" | "instagram" | "tiktok" | "youtube";

const SUPPORTED_NOW: Plat[] = ["facebook", "instagram"]; // Phase A
const PLAT_LABEL: Record<Plat, string> = {
  facebook:  "Facebook Reels",
  instagram: "Instagram Reels",
  tiktok:    "TikTok",
  youtube:   "YouTube Shorts",
};

export function PublishComposer(p: Props) {
  const { data: conns = [] } = useSocialConnections(p.clientId);
  const [caption, setCaption] = useState(p.initialCaption);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Plat[]>([]);
  const [mode, setMode] = useState<Mode>("scheduled");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tz, setTz] = useState(p.defaultTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [submitting, setSubmitting] = useState(false);
  const [resolvedVideo, setResolvedVideo] = useState<string | null>(null);
  const [skipApprovalConfirmOpen, setSkipApprovalConfirmOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (p.open) {
      setCaption(p.initialCaption);
      setSelectedPlatforms([]);
      setMode("scheduled");
      setDate("");
      setTime("");
      // Resolve storage path / drive URL to something playable
      setResolvedVideo(null);
      void resolveVideoUrl(p.videoUrl).then(setResolvedVideo);
    }
  }, [p.open, p.initialCaption, p.videoUrl]);

  const connByPlatform = useMemo(() => {
    const m: Partial<Record<Plat, typeof conns[number]>> = {};
    for (const c of conns) if (c.status === "active") m[c.platform] = c;
    return m;
  }, [conns]);

  const togglePlatform = (plat: Plat) => {
    setSelectedPlatforms((prev) =>
      prev.includes(plat) ? prev.filter((x) => x !== plat) : [...prev, plat],
    );
  };

  const buttonLabel =
    mode === "autopost"  ? "Publish now" :
    mode === "scheduled" ? "Schedule" :
    "Save draft";

  /**
   * Submit entrypoint. For "Publish now" (autopost) mode, gates behind a
   * confirmation modal warning that this voids client verification — UNLESS
   * the user has previously checked "don't show again".
   */
  const handleSubmit = () => {
    if (selectedPlatforms.length === 0 && mode !== "draft") {
      toast.error("Select at least one platform");
      return;
    }
    if (mode === "scheduled") {
      if (!date || !time) { toast.error("Pick a date and time"); return; }
      const local = new Date(`${date}T${time}`);
      if (Number.isNaN(local.getTime())) { toast.error("Invalid date/time"); return; }
      if (local.getTime() <= Date.now())  { toast.error("Scheduled time must be in the future"); return; }
    }
    if (mode === "autopost") {
      const skipWarning = localStorage.getItem(SKIP_APPROVAL_WARNING_KEY) === "true";
      if (skipWarning) {
        void doSubmit({ bypassApproval: true });
      } else {
        setDontShowAgain(false);
        setSkipApprovalConfirmOpen(true);
      }
      return;
    }
    void doSubmit({ bypassApproval: false });
  };

  /** Actual insertion + side-effects. bypassApproval auto-approves the post. */
  const doSubmit = async ({ bypassApproval }: { bypassApproval: boolean }) => {
    let scheduledAt: string | null = null;
    if (mode === "scheduled") {
      scheduledAt = new Date(`${date}T${time}`).toISOString();
    } else if (mode === "autopost") {
      scheduledAt = new Date().toISOString();
    }

    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;

      const { data: post, error: postErr } = await supabase.from("scheduled_posts").insert({
        client_id: p.clientId,
        editing_queue_id: p.editingQueueId,
        video_url: p.videoUrl,
        caption,
        mode,
        scheduled_at: scheduledAt,
        timezone: tz,
        status: mode === "draft" ? "draft" : "scheduled",
        created_by: user?.id ?? null,
        // Admin override: skip the approval gate for "Publish now" submissions.
        // Voids client-verification audit trail by design.
        client_approved_at: bypassApproval ? new Date().toISOString() : null,
        client_approved_by: bypassApproval ? (user?.id ?? null) : null,
      }).select().single();
      if (postErr) throw postErr;

      if (mode !== "draft" && selectedPlatforms.length > 0) {
        const targets = selectedPlatforms
          .map((plat) => {
            const conn = connByPlatform[plat];
            if (!conn) return null;
            return {
              scheduled_post_id: post.id,
              social_connection_id: conn.id,
              platform: plat,
              status: "pending" as const,
            };
          })
          .filter(Boolean);
        const { error: tErr } = await supabase.from("scheduled_post_targets").insert(targets as any);
        if (tErr) throw tErr;
      }

      // If we bypassed approval, kick the dispatcher so it fires immediately
      // instead of waiting for the next 60-second cron tick.
      if (bypassApproval) {
        await supabase.functions.invoke("publish-scheduled-posts", {
          body: { force_post_id: post.id },
        });
      }

      // Surface what just happened
      let successMsg: string;
      if (mode === "draft") {
        successMsg = "Saved as draft";
      } else if (bypassApproval) {
        successMsg = "Publishing now — client approval bypassed";
      } else if (mode === "scheduled" && scheduledAt) {
        const when = new Date(scheduledAt).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        });
        successMsg = `Scheduled for ${when} — must be approved before then or it'll fail`;
      } else {
        successMsg = "Sent for approval — will publish as soon as the client approves";
      }
      toast.success(successMsg);
      p.onClose();
    } catch (e: any) {
      toast.error("Submit failed: " + (e?.message ?? String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Publish</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="aspect-[9/16] bg-black rounded overflow-hidden flex items-center justify-center">
            {resolvedVideo ? (
              <video src={resolvedVideo} controls playsInline className="w-full h-full object-contain" />
            ) : p.videoUrl ? (
              <p className="text-xs text-muted-foreground">Loading preview…</p>
            ) : (
              <p className="text-sm text-muted-foreground">No video</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="caption">Caption</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">{caption.length} characters</p>
            </div>

            <div className="space-y-2">
              <Label>Publish to</Label>
              {(["facebook", "instagram", "tiktok", "youtube"] as Plat[]).map((plat) => {
                const conn = connByPlatform[plat];
                const supportedNow = SUPPORTED_NOW.includes(plat);
                const disabled = !supportedNow || !conn;
                return (
                  <div key={plat} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedPlatforms.includes(plat)}
                      disabled={disabled}
                      onCheckedChange={() => togglePlatform(plat)}
                      id={`plat-${plat}`}
                    />
                    <Label htmlFor={`plat-${plat}`} className={disabled ? "text-muted-foreground" : ""}>
                      {PLAT_LABEL[plat]}
                      {conn ? ` — ${conn.account_label}` : !supportedNow ? " — coming soon" : " — connect first ↗"}
                    </Label>
                    {!conn && supportedNow && (
                      <a
                        className="text-xs text-primary underline ml-auto"
                        href={`/clients/${p.clientId}/social-accounts`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Connect
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>When</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="autopost" id="m-now" />
                  <Label htmlFor="m-now">Publish now (skip client approval)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="scheduled" id="m-sched" />
                  <Label htmlFor="m-sched">Schedule for a specific time (needs approval first)</Label>
                </div>
                {mode === "scheduled" && (
                  <div className="flex gap-2 pl-6">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                    <Input value={tz} onChange={(e) => setTz(e.target.value)} className="w-40" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="draft" id="m-draft" />
                  <Label htmlFor="m-draft">Save as draft</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={p.onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{buttonLabel}</Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmation modal for the "Publish now" admin override */}
      <AlertDialog open={skipApprovalConfirmOpen} onOpenChange={setSkipApprovalConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Publish without client approval?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                The post will go live on the selected platforms immediately and will not
                be reviewed by the client first.
              </span>
              <span className="block pt-2 font-medium text-amber-600 dark:text-amber-400">
                This voids client verification for this post.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            <Label htmlFor="dont-show-again" className="text-sm font-normal cursor-pointer">
              Don't show this again
            </Label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={async () => {
                if (dontShowAgain) {
                  localStorage.setItem(SKIP_APPROVAL_WARNING_KEY, "true");
                }
                setSkipApprovalConfirmOpen(false);
                await doSubmit({ bypassApproval: true });
              }}
            >
              Publish now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
