// src/pages/VideoEditor.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { useEditorProject } from "@/hooks/useEditorProject";
import { useRenderJob } from "@/hooks/useRenderJob";
import { EditorTopBar } from "@/components/videoEditor/EditorTopBar";
import { PreviewStage } from "@/components/videoEditor/PreviewStage";
import { TrimTimeline } from "@/components/videoEditor/TrimTimeline";
import { TranscriptPanel } from "@/components/videoEditor/TranscriptPanel";
import { CaptionsList } from "@/components/videoEditor/CaptionsList";
import { ExportDialog } from "@/components/videoEditor/ExportDialog";
import { useTranscript, type TranscriptWord } from "@/hooks/useTranscript";
import {
  captionsFromTranscript,
  clipsFromSilences,
  sourceTimeToEdlTime,
  type AspectRatio,
  type Caption,
  type CaptionPreset,
} from "@/lib/videoEditor/edl";

type SourceMeta = { storagePath: string; signedUrl: string; durationMs: number; title: string };

// Storage bucket confirmed from codebase: FootagePanel.tsx + videoUrl.ts both use "footage".
// The plan guessed "video-edits" — that bucket does not exist.
const STORAGE_BUCKET = "footage";

async function loadSourceMeta(videoEditId: string): Promise<SourceMeta | null> {
  // Pull the video_edits row to discover storage path + title.
  // Columns confirmed from EditingQueue.tsx line 317:
  //   - storage_path  (in-Supabase-Storage path)
  //   - reel_title    (display title; "footage_url" does not exist in schema)
  const { data, error } = await supabase
    .from("video_edits")
    .select("*")
    .eq("id", videoEditId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // For Phase 1 we require an in-Storage source. If only an external URL exists,
  // surface a clear error rather than guessing.
  const storagePath: string | null = (data as any).storage_path ?? null;
  if (!storagePath) return null;

  const { data: signed, error: signErr } = await supabase
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (signErr) throw signErr;

  const durationMs = await probeDurationMs(signed.signedUrl);

  // Title derivation mirrors EditingQueue.tsx lines 326-328:
  // prefer reel_title unless it's a placeholder, then fall back to id.
  const raw: string | null | undefined = (data as any).reel_title;
  const isPlaceholder = !raw || raw === "Sin titulo" || raw === "Sin título";
  const title = isPlaceholder ? `Edit ${videoEditId.slice(0, 8)}` : raw;

  return {
    storagePath,
    signedUrl: signed.signedUrl,
    durationMs,
    title,
  };
}

function probeDurationMs(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.addEventListener("loadedmetadata", () => {
      resolve(Math.round((v.duration || 0) * 1000));
    });
    v.addEventListener("error", () => reject(new Error("probe failed")));
  });
}

export default function VideoEditor() {
  if (!IS_VIDEO_EDITOR_ENABLED) return <Navigate to="/editing-queue" replace />;

  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [source, setSource] = useState<SourceMeta | null>(null);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [resultSignedUrl, setResultSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to hydrate. Storage RLS allows authenticated reads only —
    // signing before the JWT is attached returns "Object not found".
    if (!id || authLoading || !user) return;
    loadSourceMeta(id)
      .then((s) => {
        if (!s) setSourceErr("No Supabase-Storage source for this video_edits row.");
        else setSource(s);
      })
      .catch((e: Error) => setSourceErr(e.message));
  }, [id, authLoading, user]);

  const initialSource = useMemo(
    () => source && { storage_path: source.storagePath, duration_ms: source.durationMs },
    [source],
  );

  const { state: projState, setEdl } = useEditorProject({
    videoEditId: id!,
    initialSource: initialSource ?? { storage_path: "", duration_ms: 0 },
  });

  const { state: jobState, submit: submitJob, reset: resetJob } = useRenderJob();

  const { state: transcriptState, start: startTranscribe } = useTranscript(id);

  // Auto-start a transcription when the editor opens and none exists yet.
  // The user can re-trigger manually from the panel if they want different
  // silence thresholds later.
  useEffect(() => {
    if (transcriptState.phase === "missing") {
      startTranscribe();
    }
  }, [transcriptState.phase, startTranscribe]);

  const handleSeekFromTranscript = (sourceMs: number) => {
    if (projState.phase !== "ready") return;
    setPlayheadMs(sourceTimeToEdlTime(projState.edl, sourceMs));
  };

  const handleRemoveSilences = () => {
    if (projState.phase !== "ready") return;
    if (transcriptState.phase !== "ready") return;
    const clips = clipsFromSilences(
      projState.edl.source.duration_ms,
      transcriptState.silences,
    );
    if (clips.length === 0) return;
    setEdl({ ...projState.edl, clips });
    setPlayheadMs(0);
  };

  const handleCreateCaption = (words: TranscriptWord[], preset: CaptionPreset) => {
    if (projState.phase !== "ready") return;
    const newCaption: Caption = {
      id: crypto.randomUUID(),
      preset,
      words: words.map((w) => ({ text: w.text, start_ms: w.start_ms, end_ms: w.end_ms })),
      // Default to bottom-center, a common short-form caption position.
      position: { x_pct: 50, y_pct: 80, anchor: "center" },
    };
    setEdl({
      ...projState.edl,
      captions: [...(projState.edl.captions ?? []), newCaption],
    });
  };

  const handleChangeCaptionPreset = (id: string, preset: CaptionPreset) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        c.id === id ? { ...c, preset } : c,
      ),
    });
  };

  const handleChangeCaptionSize = (id: string, size: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        c.id === id ? { ...c, size } : c,
      ),
    });
  };

  const handleChangeAllCaptionSizes = (size: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) => ({ ...c, size })),
    });
  };

  const handleChangeAllCaptionPresets = (preset: CaptionPreset) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) => ({ ...c, preset })),
    });
  };

  const handleDeleteCaption = (id: string) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).filter((c) => c.id !== id),
    });
  };

  const handleAutoCaption = (preset: CaptionPreset) => {
    if (projState.phase !== "ready") return;
    if (transcriptState.phase !== "ready") return;
    if (transcriptState.words.length === 0) return;
    // Replace any existing auto-generated captions wholesale. Users who want
    // to keep manual blocks should drag-select instead — that's the design.
    const generated = captionsFromTranscript(transcriptState.words, preset);
    setEdl({ ...projState.edl, captions: generated });
  };

  useEffect(() => {
    if (jobState.phase === "done" && jobState.job.output_storage_path) {
      let cancelled = false;
      // Derive a friendly download filename from the source title.
      const safeTitle = (source?.title ?? "edit").replace(/[^\w.-]+/g, "-").slice(0, 80);
      const downloadName = `${safeTitle}-export.mp4`;
      supabase.storage
        .from("footage")
        .createSignedUrl(jobState.job.output_storage_path, 3600, { download: downloadName })
        .then(({ data, error }) => {
          if (cancelled) return;
          setResultSignedUrl(error ? null : data?.signedUrl ?? null);
        });
      return () => { cancelled = true; };
    }
    setResultSignedUrl(null);
  }, [jobState, source]);

  if (!id) return <Navigate to="/editing-queue" replace />;
  if (authLoading) {
    return <div className="p-8 text-neutral-400">Loading editor…</div>;
  }
  if (!user) return <Navigate to="/" replace />;
  if (sourceErr) {
    return <div className="p-8 text-red-400">Source error: {sourceErr}</div>;
  }
  if (!source || projState.phase === "loading") {
    return <div className="p-8 text-neutral-400">Loading editor…</div>;
  }
  if (projState.phase === "error") {
    return <div className="p-8 text-red-400">Project error: {projState.message}</div>;
  }

  const handleExport = async (aspect: AspectRatio) => {
    await submitJob({
      editorProjectId: projState.projectId,
      edl: projState.edl,
      aspectRatio: aspect,
    });
  };

  const exportPolling =
    jobState.phase === "polling" ? jobState.job.progress : null;
  const exportResultUrl = resultSignedUrl;
  const exportError = jobState.phase === "error" ? jobState.message : null;

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col">
      <EditorTopBar
        title={source.title}
        saveStatus={projState.saving ? "saving" : "saved"}
        onExportClick={() => {
          // Reset any previous render result before re-opening — otherwise
          // the dialog keeps showing the old download link and the user
          // can't kick off a fresh render with the latest EDL.
          if (jobState.phase === "done" || jobState.phase === "error") resetJob();
          setExportOpen(true);
        }}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <PreviewStage
            sourceUrl={source.signedUrl}
            edl={projState.edl}
            playheadMs={playheadMs}
            playing={playing}
            onPlayheadChange={setPlayheadMs}
            onEnded={() => setPlaying(false)}
          />
          <div className="flex justify-center gap-3 py-2 bg-neutral-950 border-t border-neutral-900 text-xs">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="px-3 py-1 bg-neutral-800 rounded"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="text-neutral-500 self-center">
              {(playheadMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
        <div className="w-[280px] shrink-0 flex flex-col bg-neutral-950 border-l border-neutral-800 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <TranscriptPanel
              state={transcriptState}
              playheadMs={playheadMs}
              hasCaptions={(projState.edl.captions?.length ?? 0) > 0}
              onSeek={handleSeekFromTranscript}
              onStart={startTranscribe}
              onRemoveSilences={handleRemoveSilences}
              onCreateCaption={handleCreateCaption}
              onAutoCaption={handleAutoCaption}
            />
          </div>
          <CaptionsList
            captions={projState.edl.captions ?? []}
            onChangePreset={handleChangeCaptionPreset}
            onChangeSize={handleChangeCaptionSize}
            onChangeAllSizes={handleChangeAllCaptionSizes}
            onChangeAllPresets={handleChangeAllCaptionPresets}
            onDelete={handleDeleteCaption}
            onSeek={handleSeekFromTranscript}
          />
        </div>
      </div>

      <div className="shrink-0">
        <TrimTimeline edl={projState.edl} onChange={setEdl} />
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={(o) => {
          // Closing after a finished render returns the dialog to its
          // pristine state so the next Export click shows the aspect picker
          // again instead of the stale result URL.
          if (!o && (jobState.phase === "done" || jobState.phase === "error")) resetJob();
          setExportOpen(o);
        }}
        onSubmit={handleExport}
        onResetJob={resetJob}
        submitting={jobState.phase === "submitting"}
        pollingProgress={exportPolling}
        resultUrl={exportResultUrl}
        errorMessage={exportError}
      />
    </div>
  );
}
