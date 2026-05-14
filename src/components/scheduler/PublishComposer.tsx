import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSocialConnections } from "@/lib/hooks/useSocialConnections";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveVideoUrl } from "@/lib/videoUrl";
import { AlertTriangle, X, Link2, Image as ImageIcon, Hash, MapPin, Sparkles } from "lucide-react";
import { ComposerPreview } from "./ComposerPreview";
import { ComposerPlatformTabs } from "./ComposerPlatformTabs";
import { ComposerFooter } from "./ComposerFooter";

const SKIP_APPROVAL_WARNING_KEY = "scheduler_skip_approval_warning_v1";

interface ExistingPost {
  id: string;
  caption: string;
  mode: "draft" | "scheduled" | "autopost";
  scheduled_at: string | null;
  status: string;
  client_approved_at: string | null;
  /** Platforms currently targeted by this post */
  targetedPlatforms: Array<"facebook" | "instagram" | "tiktok" | "youtube">;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  editingQueueId: string;
  videoUrl: string;
  initialCaption: string;
  /** Browser timezone, e.g. "America/New_York" */
  defaultTimezone?: string;
  /**
   * When set, the composer opens in EDIT mode: hydrates fields from the
   * existing scheduled_posts row, and submit performs an UPDATE instead
   * of an INSERT. Targets are reconciled (deletes removed platforms,
   * inserts new ones).
   */
  existingPost?: ExistingPost;
}

type Mode = "autopost" | "scheduled" | "draft";
type Plat = "facebook" | "instagram" | "tiktok" | "youtube";

// Per-platform caption character limits. Hints only — not enforced.
const CHAR_LIMITS: Record<Plat, number> = {
  facebook:  63206,
  instagram: 2200,
  tiktok:    2200,
  youtube:   5000,
};

const PLATFORM_LABEL: Record<Plat, string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

export function PublishComposer(p: Props) {
  const { data: conns = [] } = useSocialConnections(p.clientId);
  const [caption, setCaption] = useState(p.initialCaption);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Plat[]>([]);
  const [activePreviewPlatform, setActivePreviewPlatform] = useState<Plat>("facebook");
  const [mode, setMode] = useState<Mode>("scheduled");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [tz] = useState(p.defaultTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [submitting, setSubmitting] = useState(false);
  const [resolvedVideo, setResolvedVideo] = useState<string | null>(null);
  const [skipApprovalConfirmOpen, setSkipApprovalConfirmOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Active connections, indexed for fast lookup
  const activeConns = useMemo(
    () => conns.filter((c) => c.status === "active"),
    [conns],
  );
  const connByPlatform = useMemo(() => {
    const m: Partial<Record<Plat, typeof conns[number]>> = {};
    for (const c of activeConns) m[c.platform] = c;
    return m;
  }, [activeConns]);

  // Hydrate state when the modal opens (create OR edit)
  useEffect(() => {
    if (!p.open) return;
    setResolvedVideo(null);
    void resolveVideoUrl(p.videoUrl).then(setResolvedVideo);

    if (p.existingPost) {
      setCaption(p.existingPost.caption);
      setSelectedPlatforms(p.existingPost.targetedPlatforms);
      setMode(p.existingPost.mode);
      setScheduledAt(p.existingPost.scheduled_at);
      if (p.existingPost.targetedPlatforms[0]) {
        setActivePreviewPlatform(p.existingPost.targetedPlatforms[0]);
      }
    } else {
      setCaption(p.initialCaption);
      setSelectedPlatforms([]);
      setMode("scheduled");
      setScheduledAt(null);
      setActivePreviewPlatform("facebook");
    }
  }, [p.open, p.initialCaption, p.videoUrl, p.existingPost]);

  // When the user adds a platform, switch the preview pane to that platform so
  // they can see how their post will look on it.
  const togglePlatform = (plat: Plat) => {
    setSelectedPlatforms((prev) => {
      const isAdding = !prev.includes(plat);
      if (isAdding) setActivePreviewPlatform(plat);
      return isAdding ? [...prev, plat] : prev.filter((x) => x !== plat);
    });
  };

  const isEditing = Boolean(p.existingPost);
  const dialogTitle = isEditing ? "Edit post" : "Publish";

  /** Build a public share link for an existing post (Phase A.x — opens calendar). */
  const handleCopyLink = () => {
    if (!p.existingPost) return;
    const url = `${window.location.origin}/clients/${p.clientId}/content-calendar?post=${p.existingPost.id}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  /**
   * Submit entrypoint. For "Publish now" (autopost) mode in CREATE flow,
   * gates behind a confirmation modal warning that this voids client
   * verification — UNLESS the user has previously checked "don't show
   * again". EDIT flow skips this gate (the post already exists).
   */
  const handleSubmit = () => {
    if (selectedPlatforms.length === 0 && mode !== "draft") {
      toast.error("Select at least one platform");
      return;
    }
    if (mode === "scheduled") {
      if (!scheduledAt) { toast.error("Pick a date and time"); return; }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }
    if (mode === "autopost" && !isEditing) {
      const skipWarning = localStorage.getItem(SKIP_APPROVAL_WARNING_KEY) === "true";
      if (skipWarning) {
        void doSubmit({ bypassApproval: true });
      } else {
        setDontShowAgain(false);
        setSkipApprovalConfirmOpen(true);
      }
      return;
    }
    void doSubmit({ bypassApproval: mode === "autopost" });
  };

  /** Actual insertion / update + side-effects. */
  const doSubmit = async ({ bypassApproval }: { bypassApproval: boolean }) => {
    const submitScheduledAt: string | null =
      mode === "scheduled" ? scheduledAt :
      mode === "autopost"  ? new Date().toISOString() :
      null;

    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      let postId: string;

      if (p.existingPost) {
        postId = p.existingPost.id;
        const updatePayload: Record<string, unknown> = {
          caption,
          mode,
          scheduled_at: submitScheduledAt,
          timezone: tz,
          status: mode === "draft" ? "draft" : "scheduled",
        };
        if (bypassApproval) {
          updatePayload.client_approved_at = new Date().toISOString();
          updatePayload.client_approved_by = user?.id ?? null;
        }
        const { error: uErr } = await supabase
          .from("scheduled_posts")
          .update(updatePayload)
          .eq("id", postId);
        if (uErr) throw uErr;

        // Reconcile targets: remove ones no longer selected, add new ones.
        const wanted = new Set(selectedPlatforms);
        const had = new Set(p.existingPost.targetedPlatforms);
        const toRemove = [...had].filter((plat) => !wanted.has(plat as Plat));
        const toAdd = [...wanted].filter((plat) => !had.has(plat as Plat));

        if (toRemove.length) {
          await supabase
            .from("scheduled_post_targets")
            .delete()
            .eq("scheduled_post_id", postId)
            .in("platform", toRemove);
        }
        if (mode !== "draft" && toAdd.length) {
          const rows = toAdd
            .map((plat) => {
              const conn = connByPlatform[plat as Plat];
              if (!conn) return null;
              return {
                scheduled_post_id: postId,
                social_connection_id: conn.id,
                platform: plat,
                status: "pending" as const,
              };
            })
            .filter(Boolean);
          if (rows.length) await supabase.from("scheduled_post_targets").insert(rows as any);
        }
      } else {
        const { data: post, error: postErr } = await supabase.from("scheduled_posts").insert({
          client_id: p.clientId,
          editing_queue_id: p.editingQueueId,
          video_url: p.videoUrl,
          caption,
          mode,
          scheduled_at: submitScheduledAt,
          timezone: tz,
          status: mode === "draft" ? "draft" : "scheduled",
          created_by: user?.id ?? null,
          client_approved_at: bypassApproval ? new Date().toISOString() : null,
          client_approved_by: bypassApproval ? (user?.id ?? null) : null,
        }).select().single();
        if (postErr) throw postErr;
        postId = post.id;

        if (mode !== "draft" && selectedPlatforms.length > 0) {
          const targets = selectedPlatforms
            .map((plat) => {
              const conn = connByPlatform[plat];
              if (!conn) return null;
              return {
                scheduled_post_id: postId,
                social_connection_id: conn.id,
                platform: plat,
                status: "pending" as const,
              };
            })
            .filter(Boolean);
          const { error: tErr } = await supabase.from("scheduled_post_targets").insert(targets as any);
          if (tErr) throw tErr;
        }
      }

      // Force-dispatch on bypassApproval so it fires immediately
      if (bypassApproval) {
        await supabase.functions.invoke("publish-scheduled-posts", {
          body: { force_post_id: postId },
        });
      }

      // Surface what just happened
      let successMsg: string;
      if (p.existingPost) {
        successMsg = "Changes saved";
      } else if (mode === "draft") {
        successMsg = "Saved as draft";
      } else if (bypassApproval) {
        successMsg = "Publishing now — client approval bypassed";
      } else if (mode === "scheduled" && submitScheduledAt) {
        const when = new Date(submitScheduledAt).toLocaleString(undefined, {
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

  /** Delete the existing post entirely (only in edit mode). */
  const handleDelete = async () => {
    if (!p.existingPost) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("id", p.existingPost.id);
      if (error) throw error;
      toast.success("Post deleted");
      p.onClose();
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message ?? String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  // Per-platform character count for the bottom-right of the caption area.
  // Show the limit for the most-restrictive selected platform (or the active
  // preview platform if none selected).
  const charCountTarget: Plat = selectedPlatforms[0] ?? activePreviewPlatform;
  const charLimit = CHAR_LIMITS[charCountTarget];
  const overLimit = caption.length > charLimit;

  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent
        className="max-w-6xl w-[95vw] p-0 gap-0 overflow-hidden max-h-[92vh] flex flex-col"
        aria-describedby={undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-caslon">{dialogTitle}</h2>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyLink}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link2 className="h-3.5 w-3.5" />
                Copy link
              </Button>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={p.onClose} className="h-8 gap-1.5">
            <X className="h-4 w-4" /> Close
          </Button>
        </div>

        {/* Platform tabs */}
        <div className="px-5 pt-4 pb-2 border-b border-border/40">
          <ComposerPlatformTabs
            connections={activeConns.map((c) => ({
              platform: c.platform,
              account_label: c.account_label,
            }))}
            selected={selectedPlatforms}
            onToggle={togglePlatform}
            active={activePreviewPlatform}
            onActiveChange={setActivePreviewPlatform}
          />
        </div>

        {/* Body — two columns */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(280px,360px)] gap-0 flex-1 overflow-hidden">
          {/* LEFT: caption + presets */}
          <div className="overflow-y-auto p-5 space-y-5">
            <div className="space-y-2">
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={8}
                placeholder="Write your caption..."
                className="resize-none text-sm leading-relaxed border-border/40 bg-background/40 focus-visible:ring-1 focus-visible:ring-primary/40"
              />
              {/* Caption toolbar — placeholders for future actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled title="Add media (coming soon)">
                    <ImageIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled title="Hashtags (coming soon)">
                    <Hash className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled title="Location (coming soon)">
                    <MapPin className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled title="Generate (coming soon)">
                    <Sparkles className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={overLimit ? "text-destructive" : "text-muted-foreground"}>
                    {caption.length} / {charLimit.toLocaleString()} on {PLATFORM_LABEL[charCountTarget]}
                  </span>
                </div>
              </div>
            </div>

            {/* Per-platform presets — placeholders for future per-network overrides */}
            <Accordion type="multiple" className="border-t border-border/40 pt-2">
              <AccordionItem value="global" className="border-border/40">
                <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
                  Global presets
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground pb-3">
                  Cross-network defaults will live here (auto-publish toggle, default audience, default location).
                </AccordionContent>
              </AccordionItem>
              {(["facebook", "instagram", "tiktok", "youtube"] as Plat[]).map((plat) => (
                <AccordionItem key={plat} value={plat} className="border-border/40">
                  <AccordionTrigger className="text-xs font-medium py-3 hover:no-underline">
                    {PLATFORM_LABEL[plat]} presets
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground pb-3">
                    Per-platform overrides will live here (custom caption, pinned comment, audience, tags).
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* RIGHT: phone preview */}
          <div className="border-l border-border/40 bg-card/30 overflow-y-auto p-5">
            <ComposerPreview
              videoUrl={resolvedVideo}
              caption={caption}
              activePlatform={activePreviewPlatform}
              accountLabel={connByPlatform[activePreviewPlatform]?.account_label ?? null}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 bg-card/30">
          <ComposerFooter
            mode={mode}
            onModeChange={setMode}
            scheduledAt={scheduledAt}
            onScheduledAtChange={setScheduledAt}
            submitting={submitting}
            isEditing={isEditing}
            onSubmit={handleSubmit}
            onCancel={p.onClose}
            onDelete={isEditing ? handleDelete : undefined}
          />
        </div>
      </DialogContent>

      {/* Confirmation modal for the "Publish now" admin override (CREATE only) */}
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
