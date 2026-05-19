// src/components/videoEditor/TrimTimeline.tsx
import { useCallback, useRef } from "react";
import type { EDL, Music } from "@/lib/videoEditor/edl";

type Props = {
  edl: EDL;
  onChange: (next: EDL) => void;
};

export function TrimTimeline({ edl, onChange }: Props) {
  const clip = edl.clips[0];
  const totalSourceMs = edl.source.duration_ms;
  const trackRef = useRef<HTMLDivElement | null>(null);
  const musicTrackRef = useRef<HTMLDivElement | null>(null);

  const pctFromMs = (ms: number) => (ms / totalSourceMs) * 100;

  const handleDrag = useCallback(
    (which: "in" | "out") => (e: React.MouseEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();

      const move = (ev: MouseEvent) => {
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const ms = Math.round(pct * totalSourceMs);
        const next: EDL = {
          ...edl,
          clips: [
            which === "in"
              ? { ...clip, source_start_ms: Math.min(ms, clip.source_end_ms - 100) }
              : { ...clip, source_end_ms: Math.max(ms, clip.source_start_ms + 100) },
          ],
        };
        onChange(next);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [clip, edl, onChange, totalSourceMs],
  );

  // Drag the music block left/right to shift its `music_start_ms` (the
  // offset INTO the music file where playback begins). Dragging left makes
  // the music start earlier in its own file; dragging right starts later.
  const handleMusicDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const music = edl.music;
      if (!music) return;
      const track = musicTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const startPx = e.clientX;
      const startOffset = music.music_start_ms ?? 0;

      const move = (ev: MouseEvent) => {
        const deltaPx = ev.clientX - startPx;
        // Same pixel-to-ms scale as the video track: full width = totalSourceMs.
        const deltaMs = Math.round((deltaPx / rect.width) * totalSourceMs);
        // Dragging right shifts the music LATER in the output, which is
        // equivalent to a NEGATIVE music_start_ms (we'd want to skip
        // backward in the file). Since we can't go before t=0, clamp at 0.
        // Dragging left effectively skips forward in the music file.
        const nextOffset = Math.max(0, startOffset - deltaMs);
        onChange({ ...edl, music: { ...music, music_start_ms: nextOffset } });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [edl, onChange, totalSourceMs],
  );

  return (
    <div className="bg-neutral-950 border-t border-neutral-800 p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Video</div>
      <div ref={trackRef} className="relative h-10 bg-neutral-900 rounded select-none">
        <div
          className="absolute top-0 bottom-0 bg-blue-900/40 border border-blue-500"
          style={{
            left: `${pctFromMs(clip.source_start_ms)}%`,
            width: `${pctFromMs(clip.source_end_ms - clip.source_start_ms)}%`,
          }}
        />
        <div
          onMouseDown={handleDrag("in")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_start_ms)}%` }}
        />
        <div
          onMouseDown={handleDrag("out")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_end_ms)}%` }}
        />
      </div>
      <div className="text-[10px] text-neutral-500">
        Trim: {(clip.source_start_ms / 1000).toFixed(1)}s → {(clip.source_end_ms / 1000).toFixed(1)}s
        ({((clip.source_end_ms - clip.source_start_ms) / 1000).toFixed(1)}s out)
      </div>

      {/* Music track. Only renders when there's a music file in the EDL —
          otherwise we keep the timeline compact. The block spans the full
          video width because music plays under the whole output by default.
          Dragging shifts music_start_ms (offset into the music file). */}
      {edl.music && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Music — {edl.music.storage_path.split("/").pop()}
          </div>
          <div ref={musicTrackRef} className="relative h-6 bg-neutral-900 rounded select-none">
            <div
              onMouseDown={handleMusicDrag}
              className="absolute top-0 bottom-0 left-0 right-0 bg-emerald-900/50 border border-emerald-500 rounded cursor-grab active:cursor-grabbing flex items-center px-2"
              title={`Drag to shift the start point inside the music file (currently ${(((edl.music.music_start_ms ?? 0) / 1000)).toFixed(1)}s in)`}
            >
              <span className="text-[9px] text-emerald-300 truncate">
                ♪ Offset {((edl.music.music_start_ms ?? 0) / 1000).toFixed(1)}s · Volume {Math.round(edl.music.volume * 100)}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
