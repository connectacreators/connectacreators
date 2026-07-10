// src/components/videoEditor/ExportDialog.tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AspectRatio } from "@/lib/videoEditor/edl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (aspect: AspectRatio) => void;
  onResetJob: () => void;
  submitting: boolean;
  pollingProgress: number | null;
  resultUrl: string | null;
  errorMessage: string | null;
  // Fires when the user clicks "Schedule this post" after a successful
  // render. Parent opens the PublishComposer with the export URL.
  onSchedulePost?: () => void;
};

export function ExportDialog(props: Props) {
  const [aspect, setAspect] = useState<AspectRatio>("source");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
        </DialogHeader>

        {props.resultUrl ? (
          <div className="space-y-3">
            <p className="text-sm">Render complete.</p>
            {/* Inline preview — strip the ?download= query param so the
                browser plays the file instead of treating it as an
                attachment. */}
            <video
              src={props.resultUrl.replace(/[?&]download=[^&]*/, "")}
              controls
              className="w-full max-h-[55vh] bg-black rounded"
            />
            <div className={`grid ${props.onSchedulePost ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              <a
                href={props.resultUrl.replace(/[?&]download=[^&]*/, "")}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 bg-neutral-800 text-neutral-100 rounded text-sm text-center"
              >
                Open in tab
              </a>
              <a
                href={props.resultUrl}
                className="px-3 py-2 bg-emerald-900 text-emerald-100 rounded text-sm text-center"
              >
                Download
              </a>
              {props.onSchedulePost && (
                <button
                  onClick={props.onSchedulePost}
                  className="px-3 py-2 bg-blue-900 text-blue-100 rounded text-sm"
                >
                  Schedule post
                </button>
              )}
            </div>
          </div>
        ) : props.errorMessage ? (
          <p className="text-sm text-red-400">Error: {props.errorMessage}</p>
        ) : props.pollingProgress !== null ? (
          <div className="space-y-2 text-sm">
            <p>Rendering on VPS…</p>
            <div className="h-2 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${props.pollingProgress}%` }}
              />
            </div>
            <p className="text-neutral-500 text-xs">{props.pollingProgress}%</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-neutral-400 uppercase tracking-wider">Aspect</label>
              <div className="flex gap-2 mt-2">
                {(["source", "9:16", "1:1", "16:9"] as AspectRatio[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-3 py-1 text-xs rounded border ${
                      aspect === a
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-neutral-900 border-neutral-700 text-neutral-300"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                Phase 1: only "source" actually re-frames. Other options ignored by worker until Phase 5.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {props.resultUrl || props.errorMessage ? (
            <>
              <Button variant="outline" onClick={() => props.onOpenChange(false)}>Close</Button>
              <Button onClick={() => { props.onResetJob(); props.onSubmit(aspect); }}>
                Render again
              </Button>
            </>
          ) : props.pollingProgress !== null ? (
            <Button variant="outline" disabled>Cancel (not yet)</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => props.onSubmit(aspect)} disabled={props.submitting}>
                {props.submitting ? "Submitting…" : "Start render"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
