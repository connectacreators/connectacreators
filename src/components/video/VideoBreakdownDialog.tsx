// src/components/video/VideoBreakdownDialog.tsx
//
// Full video breakdown inside the script editor — playback PLUS the analysis
// the Viral Today detail page shows (transcript, hook template, category,
// niche) and the same Analyze / Retry button with identical credit logic.
// Opening the dialog also registers the URL in viral_videos (via
// viral-video-resolve) so manually pasted inspiration links join the Viral
// Today library exactly like canvas drops do.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InspirationVideoEmbed } from "@/components/video/InspirationVideoEmbed";
import { ensureViralVideo, type ResolvedViralVideo } from "@/lib/ensureViralVideo";
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/getAuthToken";
import { CONTENT_FORMATS, nicheLabel } from "@/lib/video-taxonomy";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Props {
  open: boolean;
  onClose: () => void;
  url: string | null;
  /** Dialog heading, e.g. "Winning idea" or "Format reference". */
  title?: string;
}

export function VideoBreakdownDialog({ open, onClose, url, title = "Video breakdown" }: Props) {
  const [row, setRow] = useState<ResolvedViralVideo | null>(null);
  const [resolving, setResolving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve (and implicitly register) the URL whenever the dialog opens.
  useEffect(() => {
    if (!open || !url) {
      setRow(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    ensureViralVideo(url).then((r) => {
      if (cancelled) return;
      setRow(r);
      setResolving(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  // While an analysis is in flight, poll the row until it lands.
  useEffect(() => {
    const inFlight = analyzing || row?.analysis_status === "analyzing";
    if (!open || !row?.id || !inFlight) return;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("viral_videos")
        .select(
          "id, video_url, platform, caption, channel_username, thumbnail_url, views_count, outlier_score, transcript, hook_text, cta_text, framework_meta, analysis_status, analysis_error, content_format, primary_niche, video_file_url, video_file_expires_at",
        )
        .eq("id", row.id)
        .maybeSingle();
      if (data && data.analysis_status !== "analyzing") {
        setRow(data as ResolvedViralVideo);
        setAnalyzing(false);
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, row?.id, row?.analysis_status, analyzing]);

  const handleAnalyze = async () => {
    if (!row?.id) return;
    setAnalyzing(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-viral-video-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ viral_video_id: row.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        toast.error("Not enough credits to analyze this video.");
        setAnalyzing(false);
        return;
      }
      if (!res.ok && res.status !== 409) {
        toast.error(data.message || data.error || "Analysis failed — try again.");
        setAnalyzing(false);
        return;
      }
      if (data.row) {
        setRow(data.row as ResolvedViralVideo);
        setAnalyzing(false);
        window.dispatchEvent(new Event("credits-updated"));
      }
      // 409 (already in flight) → the poll effect picks it up.
    } catch {
      toast.error("Analysis failed — try again.");
      setAnalyzing(false);
    }
  };

  const meta = (row?.framework_meta ?? {}) as {
    hook_template?: string;
    niche_tags?: string[];
    body_structure?: string;
  };
  const analyzed = row?.analysis_status === "analyzed";
  const inFlight = analyzing || row?.analysis_status === "analyzing";
  const formatLabel = CONTENT_FORMATS.find((f) => f.slug === row?.content_format)?.label ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>{title}</span>
            {row?.id && (
              <Link
                to={`/viral-today/video/${row.id}`}
                className="text-xs font-normal text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Open full breakdown <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr]">
          {/* Player — hand over the already-resolved cached file URL so the
              embed skips its own lookup and playback starts immediately. */}
          <div>
            {url && (
              <InspirationVideoEmbed
                url={url}
                cachedFileUrl={
                  row?.video_file_url &&
                  (!row.video_file_expires_at || new Date(row.video_file_expires_at) > new Date())
                    ? row.video_file_url
                    : undefined
                }
              />
            )}
          </div>

          {/* Breakdown */}
          <div className="min-w-0 space-y-4 text-sm">
            {resolving ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Looking up this video…
              </div>
            ) : !row ? (
              <p className="text-muted-foreground py-6">
                This link isn't a recognizable video URL (Instagram / TikTok / YouTube / Facebook),
                so no breakdown is available — playback only.
              </p>
            ) : (
              <>
                {/* Channel + stats */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {row.channel_username && <span className="font-medium text-foreground">@{row.channel_username}</span>}
                  {typeof row.views_count === "number" && row.views_count > 0 && (
                    <span>{row.views_count.toLocaleString()} views</span>
                  )}
                  {typeof row.outlier_score === "number" && row.outlier_score > 0 && (
                    <span>{row.outlier_score.toFixed(1)}x outlier</span>
                  )}
                </div>

                {analyzed ? (
                  <>
                    {(formatLabel || row.primary_niche) && (
                      <div className="flex flex-wrap gap-1.5">
                        {formatLabel && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-medium">
                            {formatLabel}
                          </span>
                        )}
                        {row.primary_niche && (
                          <span className="px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-medium">
                            {nicheLabel(row.primary_niche)}
                          </span>
                        )}
                        {(meta.niche_tags ?? []).slice(0, 4).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {(meta.hook_template || row.hook_text) && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Hook</p>
                        <p className="text-foreground">{meta.hook_template || row.hook_text}</p>
                      </div>
                    )}

                    {meta.body_structure && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Structure</p>
                        <p className="text-foreground">{meta.body_structure}</p>
                      </div>
                    )}

                    {row.transcript && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Transcript</p>
                        <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 whitespace-pre-wrap text-[13px] leading-relaxed">
                          {row.transcript}
                        </div>
                      </div>
                    )}

                    {row.caption && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Caption</p>
                        <p className="text-muted-foreground text-[13px] whitespace-pre-wrap max-h-24 overflow-y-auto">{row.caption}</p>
                      </div>
                    )}
                  </>
                ) : inFlight ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing… this takes 30–90 seconds. You can close this — it finishes in the background.
                  </div>
                ) : (
                  <div className="space-y-3 py-2">
                    <p className="text-muted-foreground">
                      This video hasn't been analyzed yet. Analyze it to get the transcript, hook
                      template, structure and category — same as Viral Today.
                    </p>
                    {row.analysis_status === "failed" && row.analysis_error && (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Last attempt failed: {row.analysis_error.slice(0, 160)}
                      </p>
                    )}
                    <Button size="sm" onClick={handleAnalyze} className="gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {row.analysis_status === "failed" ? "Retry analysis" : "Analyze (50 credits)"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
