// src/pages/VideoEditor.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { useEditorProject } from "@/hooks/useEditorProject";
import { useRenderJob } from "@/hooks/useRenderJob";
import { EditorTopBar } from "@/components/videoEditor/EditorTopBar";
import { PreviewStage } from "@/components/videoEditor/PreviewStage";
import { MultiTrackTimeline, type TimelineSelection } from "@/components/videoEditor/MultiTrackTimeline";
import { TranscriptPanel } from "@/components/videoEditor/TranscriptPanel";
import { CaptionsPanel } from "@/components/videoEditor/CaptionsPanel";
import { TextOverlaysPanel } from "@/components/videoEditor/TextOverlaysPanel";
import { MusicPanel } from "@/components/videoEditor/MusicPanel";
import { BRollPanel } from "@/components/videoEditor/BRollPanel";
import { ExportDialog } from "@/components/videoEditor/ExportDialog";
import { useTranscript, type TranscriptWord } from "@/hooks/useTranscript";
import {
  captionsFromTranscript,
  clipsFromSilences,
  sourceTimeToEdlTime,
  type AspectRatio,
  type Caption,
  type BRollClip,
  type CaptionPreset,
  type Music,
  type TextOverlay,
  type TextOverlayPreset,
} from "@/lib/videoEditor/edl";
import { TEXT_OVERLAY_PRESETS } from "@/lib/videoEditor/textOverlayPresets";

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
  // Right-panel tab: Transcript / Captions / Text / Music / B-roll.
  const [rightTab, setRightTab] = useState<
    "transcript" | "captions" | "text" | "music" | "broll"
  >("transcript");
  // CapCut-style "Apply changes to all captions" toggle. When on, any
  // per-block edit (size/style/position/drag) propagates to every block.
  const [applyToAll, setApplyToAll] = useState(true);
  // Currently selected timeline item — drives the yellow ring + keyboard
  // shortcuts (Delete, Esc, copy/paste).
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection>(null);
  // In-memory clipboard for copy/cut/paste. Stored in a ref so it survives
  // re-renders without causing extra work. v1 = single item only.
  type ClipboardItem =
    | { kind: "caption"; payload: Caption }
    | { kind: "text"; payload: TextOverlay }
    | { kind: "broll"; payload: BRollClip }
    | null;
  const clipboardRef = useRef<ClipboardItem>(null);

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

  // Style/size/position handlers all check the applyToAll flag — when on,
  // the change propagates to every caption block (CapCut-style linked edit).
  // When off, only the targeted block is mutated.
  const handleChangeCaptionPreset = (id: string, preset: CaptionPreset) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        applyToAll || c.id === id ? { ...c, preset } : c,
      ),
    });
  };

  const handleChangeCaptionSize = (id: string, size: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        applyToAll || c.id === id ? { ...c, size } : c,
      ),
    });
  };

  const handleDeleteCaption = (id: string) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).filter((c) => c.id !== id),
    });
  };

  // Swap two caption blocks in the list. Captions are time-bound, so we
  // also swap their word ranges' start/end offsets — that way "move up"
  // makes this block play at the previous block's spot in the timeline,
  // and the previous block plays where this one used to.
  const handleReorderCaption = (id: string, direction: "up" | "down") => {
    if (projState.phase !== "ready") return;
    const captions = projState.edl.captions ?? [];
    // Display order = chronological. Sort by first-word start_ms to be safe.
    const sorted = [...captions].sort(
      (a, b) => (a.words[0]?.start_ms ?? 0) - (b.words[0]?.start_ms ?? 0),
    );
    const idx = sorted.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const otherIdx = direction === "up" ? idx - 1 : idx + 1;
    if (otherIdx < 0 || otherIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[otherIdx];
    // Shift A into B's timeslot and B into A's timeslot by translating word
    // start/end timestamps. Anchor each shift on the first word so internal
    // word gaps within a block are preserved.
    const aOrigin = a.words[0].start_ms;
    const bOrigin = b.words[0].start_ms;
    const shiftWords = (words: typeof a.words, origin: number, newOrigin: number) =>
      words.map((w) => ({
        text: w.text,
        start_ms: w.start_ms - origin + newOrigin,
        end_ms: w.end_ms - origin + newOrigin,
      }));
    const newA = { ...a, words: shiftWords(a.words, aOrigin, bOrigin) };
    const newB = { ...b, words: shiftWords(b.words, bOrigin, aOrigin) };
    sorted[idx] = newA;
    sorted[otherIdx] = newB;
    setEdl({ ...projState.edl, captions: sorted });
  };

  const handleEditCaptionWord = (id: string, wordIdx: number, newText: string) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        c.id !== id
          ? c
          : {
              ...c,
              words: c.words.map((w, i) => (i === wordIdx ? { ...w, text: newText } : w)),
            },
      ),
    });
  };

  // Rewrite the entire word list of a block from a new text string. Tries
  // to preserve timing: if the word count is unchanged, rename in place;
  // otherwise redistribute the block's total duration evenly across the
  // new words (so caption playback still tracks the same time range).
  const handleReplaceCaptionText = (id: string, newText: string) => {
    if (projState.phase !== "ready") return;
    const tokens = newText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) => {
        if (c.id !== id) return c;
        if (tokens.length === c.words.length) {
          return { ...c, words: c.words.map((w, i) => ({ ...w, text: tokens[i] })) };
        }
        const blockStart = c.words[0]?.start_ms ?? 0;
        const blockEnd = c.words[c.words.length - 1]?.end_ms ?? blockStart + 1000;
        const totalMs = Math.max(1, blockEnd - blockStart);
        const slotMs = totalMs / tokens.length;
        const newWords = tokens.map((tok, i) => ({
          text: tok,
          start_ms: Math.round(blockStart + i * slotMs),
          end_ms: Math.round(blockStart + (i + 1) * slotMs),
        }));
        return { ...c, words: newWords };
      }),
    });
  };

  // Drag-to-reorder: place the dragged caption into the target's timeslot.
  // Both blocks swap their word time ranges so playback order changes.
  const handleReorderCaptionTo = (draggedId: string, targetId: string) => {
    if (projState.phase !== "ready") return;
    const captions = projState.edl.captions ?? [];
    const a = captions.find((c) => c.id === draggedId);
    const b = captions.find((c) => c.id === targetId);
    if (!a || !b || a.id === b.id) return;
    const aOrigin = a.words[0].start_ms;
    const bOrigin = b.words[0].start_ms;
    const shift = (words: typeof a.words, from: number, to: number) =>
      words.map((w) => ({
        text: w.text,
        start_ms: w.start_ms - from + to,
        end_ms: w.end_ms - from + to,
      }));
    setEdl({
      ...projState.edl,
      captions: captions.map((c) => {
        if (c.id === a.id) return { ...a, words: shift(a.words, aOrigin, bOrigin) };
        if (c.id === b.id) return { ...b, words: shift(b.words, bOrigin, aOrigin) };
        return c;
      }),
    });
  };

  // Shift an entire caption block in source time so the first word starts
  // at the given timestamp. All other words preserve their internal gaps
  // (same delta applied to all).
  const handleShiftCaption = (id: string, newFirstWordStartMs: number) => {
    if (projState.phase !== "ready") return;
    const captions = projState.edl.captions ?? [];
    const c = captions.find((cap) => cap.id === id);
    if (!c) return;
    const currentFirst = c.words[0]?.start_ms ?? 0;
    const delta = newFirstWordStartMs - currentFirst;
    if (delta === 0) return;
    const newWords = c.words.map((w) => ({
      text: w.text,
      start_ms: w.start_ms + delta,
      end_ms: w.end_ms + delta,
    }));
    setEdl({
      ...projState.edl,
      captions: captions.map((cap) =>
        cap.id === id ? { ...cap, words: newWords } : cap,
      ),
    });
  };

  // Trim handler for the multi-track timeline: replace clip 0 with a new
  // [start, end] range. Other clips (added by 'Remove all silences' later)
  // are preserved.
  const handleChangeTrim = (sourceStartMs: number, sourceEndMs: number) => {
    if (projState.phase !== "ready") return;
    const clips = projState.edl.clips;
    if (clips.length === 0) return;
    const next = [...clips];
    next[0] = { ...clips[0], source_start_ms: sourceStartMs, source_end_ms: sourceEndMs };
    setEdl({ ...projState.edl, clips: next });
  };

  const handleSetCaptionPosition = (id: string, y_pct: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        applyToAll || c.id === id ? { ...c, position: { ...c.position, y_pct } } : c,
      ),
    });
  };

  // ===== Text overlay handlers =====
  const handleAddOverlay = (preset: TextOverlayPreset, text: string, start_ms: number, end_ms: number) => {
    if (projState.phase !== "ready") return;
    const defaultPos = TEXT_OVERLAY_PRESETS[preset].defaultPosition;
    const newOverlay: TextOverlay = {
      id: crypto.randomUUID(),
      text,
      preset,
      start_ms,
      end_ms,
      position: { x_pct: defaultPos.x_pct, y_pct: defaultPos.y_pct, anchor: "center" },
    };
    setEdl({
      ...projState.edl,
      text_overlays: [...(projState.edl.text_overlays ?? []), newOverlay],
    });
  };

  const handleChangeOverlay = (id: string, patch: Partial<TextOverlay>) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      text_overlays: (projState.edl.text_overlays ?? []).map((o) =>
        o.id === id ? { ...o, ...patch } : o,
      ),
    });
  };

  const handleDeleteOverlay = (id: string) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      text_overlays: (projState.edl.text_overlays ?? []).filter((o) => o.id !== id),
    });
  };

  // ===== B-roll handlers =====
  const handleAddBRoll = (clip: BRollClip) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      b_roll: [...(projState.edl.b_roll ?? []), clip],
    });
  };
  const handleChangeBRoll = (id: string, patch: Partial<BRollClip>) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      b_roll: (projState.edl.b_roll ?? []).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  };
  const handleDeleteBRoll = (id: string) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      b_roll: (projState.edl.b_roll ?? []).filter((c) => c.id !== id),
    });
  };

  const handleSetMusic = (music: Music | null) => {
    if (projState.phase !== "ready") return;
    const next = { ...projState.edl };
    if (music) next.music = music;
    else delete (next as { music?: Music }).music;
    setEdl(next);
  };

  const handleMoveOverlay = (id: string, x_pct: number, y_pct: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      text_overlays: (projState.edl.text_overlays ?? []).map((o) =>
        o.id === id ? { ...o, position: { ...o.position, x_pct, y_pct } } : o,
      ),
    });
  };

  // Drag handler for the on-preview overlay — accepts both x and y.
  // Respects applyToAll so dragging one caption moves them all when linked.
  const handleMoveCaption = (id: string, x_pct: number, y_pct: number) => {
    if (projState.phase !== "ready") return;
    setEdl({
      ...projState.edl,
      captions: (projState.edl.captions ?? []).map((c) =>
        applyToAll || c.id === id
          ? { ...c, position: { ...c.position, x_pct, y_pct } }
          : c,
      ),
    });
  };

  const handleSplitCaption = (id: string, atWordIdx: number) => {
    if (projState.phase !== "ready") return;
    const captions = projState.edl.captions ?? [];
    const idx = captions.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const c = captions[idx];
    // Need at least one word on each side of the split.
    if (atWordIdx < 1 || atWordIdx >= c.words.length) return;
    const left = { ...c, id: crypto.randomUUID(), words: c.words.slice(0, atWordIdx) };
    const right = { ...c, id: crypto.randomUUID(), words: c.words.slice(atWordIdx) };
    const next = [...captions];
    next.splice(idx, 1, left, right);
    setEdl({ ...projState.edl, captions: next });
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

  // Keyboard: Delete / Backspace removes the currently-selected timeline
  // item; Cmd/Ctrl+C/X/V/D copy/cut/paste/duplicate it. Inputs and
  // contenteditable surfaces are skipped so caption-text edits aren't
  // hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (projState.phase !== "ready") return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      const selectedPayload = (): ClipboardItem => {
        if (!timelineSelection) return null;
        if (timelineSelection.kind === "caption") {
          const c = projState.edl.captions?.find((x) => x.id === timelineSelection.id);
          return c ? { kind: "caption", payload: structuredClone(c) } : null;
        }
        if (timelineSelection.kind === "text") {
          const x = projState.edl.text_overlays?.find((o) => o.id === timelineSelection.id);
          return x ? { kind: "text", payload: structuredClone(x) } : null;
        }
        if (timelineSelection.kind === "broll") {
          const b = projState.edl.b_roll?.find((c) => c.id === timelineSelection.id);
          return b ? { kind: "broll", payload: structuredClone(b) } : null;
        }
        return null;
      };

      // Compute SOURCE-time playhead since captions/text live in source time.
      const playheadSource = (() => {
        let acc = 0;
        for (const c of projState.edl.clips) {
          const len = Math.max(0, c.source_end_ms - c.source_start_ms);
          if (playheadMs <= acc + len) return c.source_start_ms + (playheadMs - acc);
          acc += len;
        }
        return projState.edl.clips[projState.edl.clips.length - 1]?.source_end_ms ?? 0;
      })();
      const totalSource = projState.edl.source.duration_ms;

      // Paste places the clipboard payload at the current playhead.
      const pasteFromClipboard = () => {
        const item = clipboardRef.current;
        if (!item) return;
        if (item.kind === "caption") {
          const oldFirst = item.payload.words[0]?.start_ms ?? 0;
          const targetSource = Math.min(playheadSource, totalSource - 1000);
          const delta = targetSource - oldFirst;
          const newWords = item.payload.words.map((w) => ({
            text: w.text,
            start_ms: Math.max(0, w.start_ms + delta),
            end_ms: Math.max(0, w.end_ms + delta),
          }));
          const newCap: Caption = { ...item.payload, id: crypto.randomUUID(), words: newWords };
          setEdl({ ...projState.edl, captions: [...(projState.edl.captions ?? []), newCap] });
          setTimelineSelection({ kind: "caption", id: newCap.id });
        } else if (item.kind === "text") {
          const dur = item.payload.end_ms - item.payload.start_ms;
          const nextStart = Math.max(0, Math.min(totalSource - dur, playheadSource));
          const newOv: TextOverlay = {
            ...item.payload,
            id: crypto.randomUUID(),
            start_ms: nextStart,
            end_ms: nextStart + dur,
          };
          setEdl({ ...projState.edl, text_overlays: [...(projState.edl.text_overlays ?? []), newOv] });
          setTimelineSelection({ kind: "text", id: newOv.id });
        } else if (item.kind === "broll") {
          const newBr: BRollClip = {
            ...item.payload,
            id: crypto.randomUUID(),
            // For b-roll, the playhead is in EDL output time already.
            output_start_ms: Math.max(0, playheadMs),
          };
          setEdl({ ...projState.edl, b_roll: [...(projState.edl.b_roll ?? []), newBr] });
          setTimelineSelection({ kind: "broll", id: newBr.id });
        }
      };

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!timelineSelection) return;
        e.preventDefault();
        switch (timelineSelection.kind) {
          case "caption": handleDeleteCaption(timelineSelection.id); break;
          case "text":    handleDeleteOverlay(timelineSelection.id); break;
          case "broll":   handleDeleteBRoll(timelineSelection.id); break;
          case "music":   handleSetMusic(null); break;
          default: return;
        }
        setTimelineSelection(null);
        return;
      }

      if (mod && key === "c") {
        const item = selectedPayload();
        if (item) { clipboardRef.current = item; e.preventDefault(); }
        return;
      }
      if (mod && key === "x") {
        const item = selectedPayload();
        if (!item) return;
        e.preventDefault();
        clipboardRef.current = item;
        if (item.kind === "caption") handleDeleteCaption(item.payload.id);
        else if (item.kind === "text") handleDeleteOverlay(item.payload.id);
        else if (item.kind === "broll") handleDeleteBRoll(item.payload.id);
        setTimelineSelection(null);
        return;
      }
      if (mod && key === "v") {
        if (!clipboardRef.current) return;
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if (mod && key === "d") {
        // Duplicate = copy current selection then immediately paste at playhead.
        const item = selectedPayload();
        if (!item) return;
        e.preventDefault();
        clipboardRef.current = item;
        pasteFromClipboard();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timelineSelection, projState, playheadMs]);

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
            onMoveCaption={handleMoveCaption}
            onResizeCaption={handleChangeCaptionSize}
            onMoveOverlay={handleMoveOverlay}
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
          {/* Tab switcher: Script / Captions / Text / Music / B-roll */}
          <div className="flex border-b border-neutral-800 shrink-0">
            {(["transcript", "captions", "text", "music", "broll"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-2 text-[9px] uppercase tracking-wider transition-colors ${
                  rightTab === tab
                    ? "text-white border-b-2 border-blue-500"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {tab === "transcript"
                  ? "Script"
                  : tab === "captions"
                  ? `Caps ${projState.edl.captions?.length ?? 0}`
                  : tab === "text"
                  ? `Text ${projState.edl.text_overlays?.length ?? 0}`
                  : tab === "music"
                  ? (projState.edl.music ? "Music ●" : "Music")
                  : `B-roll ${projState.edl.b_roll?.length ?? 0}`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === "transcript" ? (
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
            ) : rightTab === "captions" ? (
              <CaptionsPanel
                captions={projState.edl.captions ?? []}
                applyToAll={applyToAll}
                onSetApplyToAll={setApplyToAll}
                onChangePreset={handleChangeCaptionPreset}
                onChangeSize={handleChangeCaptionSize}
                onDelete={handleDeleteCaption}
                onSeek={handleSeekFromTranscript}
                onReorder={handleReorderCaption}
                onReorderTo={handleReorderCaptionTo}
                onSetPosition={handleSetCaptionPosition}
                onSplit={handleSplitCaption}
                onReplaceText={handleReplaceCaptionText}
              />
            ) : rightTab === "text" ? (
              <TextOverlaysPanel
                overlays={projState.edl.text_overlays ?? []}
                sourceDurationMs={projState.edl.source.duration_ms}
                // Convert EDL playhead → source time for the "add at playhead" UX.
                sourcePlayheadMs={(() => {
                  let edlMs = 0;
                  for (const c of projState.edl.clips) {
                    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
                    if (playheadMs <= edlMs + len) {
                      return c.source_start_ms + (playheadMs - edlMs);
                    }
                    edlMs += len;
                  }
                  return projState.edl.clips[projState.edl.clips.length - 1]?.source_end_ms ?? 0;
                })()}
                onAdd={handleAddOverlay}
                onChange={handleChangeOverlay}
                onDelete={handleDeleteOverlay}
                onSeek={handleSeekFromTranscript}
              />
            ) : rightTab === "music" ? (
              <MusicPanel
                music={projState.edl.music ?? null}
                videoEditId={id!}
                onSet={handleSetMusic}
              />
            ) : (
              <BRollPanel
                brolls={projState.edl.b_roll ?? []}
                videoEditId={id!}
                outputPlayheadMs={playheadMs}
                outputDurationMs={(projState.edl.clips ?? []).reduce(
                  (acc, c) => acc + Math.max(0, c.source_end_ms - c.source_start_ms),
                  0,
                )}
                onAdd={handleAddBRoll}
                onChange={handleChangeBRoll}
                onDelete={handleDeleteBRoll}
              />
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <MultiTrackTimeline
          edl={projState.edl}
          playheadMs={playheadMs}
          selection={timelineSelection}
          onSelect={setTimelineSelection}
          onSeek={handleSeekFromTranscript}
          onChangeTrim={handleChangeTrim}
          onShiftCaption={handleShiftCaption}
          onChangeOverlay={handleChangeOverlay}
          onChangeBRoll={handleChangeBRoll}
          onChangeMusic={(music) => handleSetMusic(music)}
        />
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
