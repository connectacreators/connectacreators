// src/components/videoEditor/PreviewStage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { EDL } from "@/lib/videoEditor/edl";
import { supabase } from "@/integrations/supabase/client";
import { CaptionOverlay } from "./CaptionOverlay";
import { useVideoPictureBox } from "./useVideoPictureBox";
import { BRollPreview } from "./BRollPreview";

type Props = {
  sourceUrl: string;
  edl: EDL;
  // Controlled playhead in ms (0 to totalDurationMs(edl)).
  playheadMs: number;
  playing: boolean;
  onPlayheadChange: (ms: number) => void;
  onEnded: () => void;
  onMoveCaption?: (captionId: string, x_pct: number, y_pct: number) => void;
  onResizeCaption?: (captionId: string, size: number) => void;
  onMoveOverlay?: (overlayId: string, x_pct: number, y_pct: number) => void;
  onEditOverlayText?: (overlayId: string, newText: string) => void;
};

// Find which clip the EDL output time `edlMs` is inside, and how far in.
function locateClip(edl: EDL, edlMs: number): { clipIdx: number; sourceMs: number } | null {
  let acc = 0;
  for (let i = 0; i < edl.clips.length; i++) {
    const c = edl.clips[i];
    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
    if (edlMs <= acc + len) {
      return { clipIdx: i, sourceMs: c.source_start_ms + (edlMs - acc) };
    }
    acc += len;
  }
  const last = edl.clips[edl.clips.length - 1];
  return last ? { clipIdx: edl.clips.length - 1, sourceMs: last.source_end_ms } : null;
}

export function PreviewStage({ sourceUrl, edl, playheadMs, playing, onPlayheadChange, onEnded, onMoveCaption, onResizeCaption, onMoveOverlay, onEditOverlayText }: Props) {
  // Two-layer playback. Two <video> elements alternate as "active" (visible
  // and playing) and "standby" (hidden and pre-seeked to the next clip's
  // start). At a clip boundary we just pause active and play standby, then
  // flip CSS visibility — the cut is instant, with no seek latency, no
  // frozen frame, and no audio bleed across the silent range. This is the
  // standard pattern for seamless multi-clip playback in the browser; the
  // single-element seek-on-boundary approach we used before is too slow
  // because browser seeks to non-keyframe positions can take 100–300ms.
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const [activeLayer, setActiveLayer] = useState<"A" | "B">("A");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Picture box for caption / b-roll overlays. Both videos share the same
  // source so their bounding rects match — measuring A is enough.
  const videoBox = useVideoPictureBox(videoARef);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  // Sign the music track on demand so the preview can play it.
  const musicStoragePath = edl.music?.storage_path ?? null;
  useEffect(() => {
    if (!musicStoragePath) {
      setMusicUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("footage")
      .createSignedUrl(musicStoragePath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        setMusicUrl(error ? null : data?.signedUrl ?? null);
      });
    return () => { cancelled = true; };
  }, [musicStoragePath]);

  // Music audio stays continuous — the worker's amix mixes it under both
  // clips, so the preview matches by never seeking the music in step with
  // the source-video swaps.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const music = edl.music;
    if (!music) return;
    a.volume = Math.max(0, Math.min(1, music.volume ?? 0.3));
    const desired = (music.music_start_ms ?? 0) / 1000 + playheadMs / 1000;
    if (Math.abs(a.currentTime - desired) > 0.15) {
      try { a.currentTime = desired; } catch { /* ignore */ }
    }
    if (playing) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [playing, playheadMs, edl.music]);

  // Derive the current clip / source offset from the controlled playhead.
  const playheadInfo = useMemo(() => locateClip(edl, playheadMs), [edl, playheadMs]);
  const currentClipIdx = playheadInfo?.clipIdx ?? 0;
  const currentSourceMs = playheadInfo?.sourceMs ?? 0;

  // Sync the active <video>'s currentTime with the playhead. Skip tiny
  // diffs to avoid re-triggering seeks on every RAF tick.
  useEffect(() => {
    const v = activeLayer === "A" ? videoARef.current : videoBRef.current;
    if (!v) return;
    const desiredSec = currentSourceMs / 1000;
    if (Math.abs(v.currentTime - desiredSec) > 0.1) {
      try { v.currentTime = desiredSec; } catch { /* before metadata */ }
    }
  }, [activeLayer, currentSourceMs]);

  // Pre-seek the standby <video> to the NEXT clip's start so the swap at
  // clip-end is instant. If there's no next clip the standby sits paused at
  // 0 — it'll just not get used.
  useEffect(() => {
    const v = activeLayer === "A" ? videoBRef.current : videoARef.current;
    if (!v) return;
    const next = edl.clips[currentClipIdx + 1];
    const targetSec = next ? next.source_start_ms / 1000 : 0;
    if (Math.abs(v.currentTime - targetSec) > 0.1) {
      try { v.currentTime = targetSec; } catch { /* before metadata */ }
    }
    if (!v.paused) v.pause();
  }, [activeLayer, currentClipIdx, edl.clips]);

  // Drive play/pause. Only the active element plays; standby always paused.
  useEffect(() => {
    const active = activeLayer === "A" ? videoARef.current : videoBRef.current;
    const standby = activeLayer === "A" ? videoBRef.current : videoARef.current;
    if (!active) return;
    if (standby && !standby.paused) standby.pause();
    if (playing) {
      void active.play().catch(() => {});
    } else {
      active.pause();
    }
  }, [playing, activeLayer]);

  // Schedule the layer swap at the current clip's source_end_ms. Fires
  // exactly when active's currentTime reaches the clip end — at that
  // instant we pause active, play standby (already pre-seeked), and flip
  // activeLayer. The visible frame transitions in one paint cycle.
  //
  // We also reschedule on the active video's 'seeked' event so that user
  // scrubs *within* the current clip (which don't change currentClipIdx)
  // still produce an accurate end-of-clip timer.
  useEffect(() => {
    if (!playing) return;
    const active = activeLayer === "A" ? videoARef.current : videoBRef.current;
    const standby = activeLayer === "A" ? videoBRef.current : videoARef.current;
    if (!active || !standby) return;
    const c = edl.clips[currentClipIdx];
    const next = edl.clips[currentClipIdx + 1];
    if (!c) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      const sourceMs = active.currentTime * 1000;
      const msUntilEnd = c.source_end_ms - sourceMs;
      const rate = active.playbackRate || 1;
      const wallMs = Math.max(0, msUntilEnd / rate);
      timer = setTimeout(() => {
        timer = null;
        if (!next) {
          active.pause();
          onEnded();
          return;
        }
        // Defensive: make sure standby is exactly at next.source_start_ms
        // before we hand off, in case pre-seek hadn't landed yet.
        const targetSec = next.source_start_ms / 1000;
        if (Math.abs(standby.currentTime - targetSec) > 0.05) {
          try { standby.currentTime = targetSec; } catch { /* ignore */ }
        }
        active.pause();
        void standby.play().catch(() => {});
        setActiveLayer((l) => (l === "A" ? "B" : "A"));
      }, wallMs);
    };
    schedule();
    active.addEventListener("seeked", schedule);
    active.addEventListener("ratechange", schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      active.removeEventListener("seeked", schedule);
      active.removeEventListener("ratechange", schedule);
    };
  }, [activeLayer, currentClipIdx, edl.clips, playing, onEnded]);

  // RAF: emit EDL playhead based on the active video's currentTime. We do
  // this every frame instead of relying solely on setTimeout so scrubs,
  // pauses, and rate changes all surface their position to the parent
  // immediately. No gap-detection logic anymore — the timer above handles
  // boundaries, so RAF only needs to translate active.currentTime → edlMs
  // within the current clip.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const active = activeLayer === "A" ? videoARef.current : videoBRef.current;
      if (active && !active.paused) {
        const sourceMs = active.currentTime * 1000;
        let edlMs = 0;
        for (let i = 0; i < currentClipIdx; i++) {
          edlMs += Math.max(0, edl.clips[i].source_end_ms - edl.clips[i].source_start_ms);
        }
        const c = edl.clips[currentClipIdx];
        if (c && sourceMs >= c.source_start_ms && sourceMs <= c.source_end_ms) {
          edlMs += sourceMs - c.source_start_ms;
        }
        onPlayheadChange(edlMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeLayer, currentClipIdx, edl.clips, onPlayheadChange]);

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black min-h-0">
      {/* Two layered <video>s sharing the same source. Toggling CSS
          visibility on swap gives an instant cut without re-seeking the
          element that's about to play. */}
      <video
        ref={videoARef}
        src={sourceUrl}
        className="absolute max-h-full max-w-full"
        style={{
          visibility: activeLayer === "A" ? "visible" : "hidden",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
        playsInline
        controls={false}
      />
      <video
        ref={videoBRef}
        src={sourceUrl}
        className="absolute max-h-full max-w-full"
        style={{
          visibility: activeLayer === "B" ? "visible" : "hidden",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
        playsInline
        controls={false}
      />
      {musicUrl && (
        <audio ref={audioRef} src={musicUrl} preload="auto" className="hidden" />
      )}
      <BRollPreview
        brolls={edl.b_roll ?? []}
        playheadMs={playheadMs}
        playing={playing}
        videoBox={videoBox}
      />
      <CaptionOverlay
        captions={edl.captions ?? []}
        overlays={edl.text_overlays ?? []}
        sourceMs={currentSourceMs}
        videoBox={videoBox}
        onMoveCaption={onMoveCaption}
        onResizeCaption={onResizeCaption}
        onMoveOverlay={onMoveOverlay}
        onEditOverlayText={onEditOverlayText}
      />
    </div>
  );
}
