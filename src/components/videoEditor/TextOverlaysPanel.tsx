// src/components/videoEditor/TextOverlaysPanel.tsx
// Right-panel "Text" tab. Lets the user add static text overlays (title
// cards, CTAs, lower-thirds, subtle labels) that appear on the video for
// a defined source-time range.
import { useState } from "react";
import type { TextOverlay, TextOverlayPreset } from "@/lib/videoEditor/edl";
import { TEXT_OVERLAY_PRESETS } from "@/lib/videoEditor/textOverlayPresets";

const SIZE_MIN = 0.5;
const SIZE_MAX = 2.5;
const SIZE_STEP = 0.05;

type Props = {
  overlays: TextOverlay[];
  // Total source duration in ms — used as the default end_ms upper bound.
  sourceDurationMs: number;
  // Current playhead in SOURCE time — used as the default start when
  // adding a new overlay (start = playhead, end = playhead + 3s).
  sourcePlayheadMs: number;
  onAdd: (preset: TextOverlayPreset, text: string, startMs: number, endMs: number) => void;
  onChange: (id: string, patch: Partial<TextOverlay>) => void;
  onDelete: (id: string) => void;
  onSeek: (sourceMs: number) => void;
};

function SizeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="range"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={SIZE_STEP}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-blue-500"
      />
      <span className="text-[9px] text-neutral-400 w-8 text-right tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.round(s) + "s";
}

export function TextOverlaysPanel(props: Props) {
  const [draftText, setDraftText] = useState("");
  const sorted = [...props.overlays].sort((a, b) => a.start_ms - b.start_ms);

  const handleAdd = (preset: TextOverlayPreset) => {
    const text = draftText.trim() || TEXT_OVERLAY_PRESETS[preset].label;
    const start = props.sourcePlayheadMs;
    // Default 3s duration, clamped to source end.
    const end = Math.min(start + 3000, props.sourceDurationMs);
    if (end <= start) return;
    props.onAdd(preset, text, start, end);
    setDraftText("");
  };

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <div className="bg-neutral-900/60 rounded p-2 space-y-2">
        <div className="text-[9px] uppercase tracking-wider text-neutral-500">
          Add overlay
        </div>
        <input
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Text (or use preset's default label)"
          className="w-full bg-neutral-800 text-neutral-100 text-[11px] rounded px-2 py-1 border border-neutral-700"
        />
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(TEXT_OVERLAY_PRESETS) as TextOverlayPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => handleAdd(p)}
              title={TEXT_OVERLAY_PRESETS[p].description}
              className="text-[10px] px-2 py-1 bg-neutral-800 hover:bg-emerald-700 text-white rounded leading-tight"
            >
              + {TEXT_OVERLAY_PRESETS[p].label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-neutral-500">
          Adds at the current playhead, 3 seconds long. Tweak below.
        </p>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        Overlays ({props.overlays.length})
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-[11px] text-neutral-500 py-6">
          No overlays yet — type some text and pick a style above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[calc(100vh-340px)] overflow-y-auto">
          {sorted.map((ov) => (
            <OverlayRow
              key={ov.id}
              overlay={ov}
              onChange={props.onChange}
              onDelete={props.onDelete}
              onSeek={props.onSeek}
              sourceDurationMs={props.sourceDurationMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OverlayRow({
  overlay,
  onChange,
  onDelete,
  onSeek,
  sourceDurationMs,
}: {
  overlay: TextOverlay;
  onChange: (id: string, patch: Partial<TextOverlay>) => void;
  onDelete: (id: string) => void;
  onSeek: (sourceMs: number) => void;
  sourceDurationMs: number;
}) {
  const size = overlay.size ?? 1;

  return (
    <div className="bg-neutral-900 rounded p-2 text-[11px] space-y-1.5">
      <input
        value={overlay.text}
        onChange={(e) => onChange(overlay.id, { text: e.target.value })}
        className="w-full bg-neutral-800 text-neutral-100 text-[11px] rounded px-1 py-0.5 border border-neutral-700"
      />

      <div className="flex items-center gap-1">
        <select
          value={overlay.preset}
          onChange={(e) => onChange(overlay.id, { preset: e.target.value as TextOverlayPreset })}
          className="flex-1 bg-neutral-800 text-neutral-200 text-[10px] rounded px-1 py-0.5 border border-neutral-700"
        >
          {(Object.keys(TEXT_OVERLAY_PRESETS) as TextOverlayPreset[]).map((p) => (
            <option key={p} value={p}>{TEXT_OVERLAY_PRESETS[p].label}</option>
          ))}
        </select>
        <button
          onClick={() => onDelete(overlay.id)}
          className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5"
          title="Delete overlay"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[9px] text-neutral-500 w-8">Size</span>
        <SizeSlider value={size} onChange={(v) => onChange(overlay.id, { size: v })} />
      </div>

      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <label className="flex items-center gap-1">
          <span className="text-neutral-500 w-8">Start</span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={sourceDurationMs / 1000}
            value={(overlay.start_ms / 1000).toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(sourceDurationMs, parseFloat(e.target.value) * 1000));
              if (v < overlay.end_ms) onChange(overlay.id, { start_ms: Math.round(v) });
            }}
            className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-neutral-500 w-8">End</span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={sourceDurationMs / 1000}
            value={(overlay.end_ms / 1000).toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(sourceDurationMs, parseFloat(e.target.value) * 1000));
              if (v > overlay.start_ms) onChange(overlay.id, { end_ms: Math.round(v) });
            }}
            className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
          />
        </label>
      </div>

      <button
        onClick={() => onSeek(overlay.start_ms)}
        className="text-[9px] text-blue-400 hover:text-blue-300"
      >
        Jump to {formatTime(overlay.start_ms)}–{formatTime(overlay.end_ms)}
      </button>
    </div>
  );
}
