// src/components/videoEditor/BRollPanel.tsx
// Right-panel "B-roll" tab. Upload a secondary video and place it on the
// main timeline as either a full-screen cutaway or a picture-in-picture
// box. The worker pulls the file at render time and composites it.
import { useRef, useState } from "react";
import type { BRollClip } from "@/lib/videoEditor/edl";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  brolls: BRollClip[];
  videoEditId: string;
  // Output-time playhead in ms — used as the default placement when adding.
  outputPlayheadMs: number;
  // Total output duration for clamping inputs.
  outputDurationMs: number;
  onAdd: (clip: BRollClip) => void;
  onChange: (id: string, patch: Partial<BRollClip>) => void;
  onDelete: (id: string) => void;
};

function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.addEventListener("loadedmetadata", () => {
      URL.revokeObjectURL(url);
      resolve(Math.round((v.duration || 0) * 1000));
    });
    v.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not probe video metadata"));
    });
  });
}

export function BRollPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const durationMs = await probeVideoDuration(file);
      const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(0, 80);
      const storagePath = `broll/${props.videoEditId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("footage")
        .upload(storagePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      props.onAdd({
        id: crypto.randomUUID(),
        source_storage_path: storagePath,
        source_duration_ms: durationMs,
        trim_start_ms: 0,
        trim_end_ms: durationMs,
        output_start_ms: props.outputPlayheadMs,
        mode: "fullscreen",
        position: { x_pct: 50, y_pct: 50, width_pct: 40 },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const sorted = [...props.brolls].sort((a, b) => a.output_start_ms - b.output_start_ms);

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        B-roll clips
      </div>

      <div className="bg-neutral-900/60 rounded p-2 space-y-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "+ Add b-roll clip"}
        </button>
        <p className="text-[9px] text-neutral-500">
          Drops at the current playhead. Fullscreen by default — switch to
          PIP per clip below.
        </p>
      </div>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.currentTarget.value = "";
        }}
      />

      {sorted.length === 0 ? (
        <p className="text-center text-[11px] text-neutral-500 py-4">
          No b-roll yet. Upload a video above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto">
          {sorted.map((br) => (
            <BRollRow
              key={br.id}
              clip={br}
              onChange={props.onChange}
              onDelete={props.onDelete}
              outputDurationMs={props.outputDurationMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BRollRow({
  clip,
  onChange,
  onDelete,
  outputDurationMs,
}: {
  clip: BRollClip;
  onChange: (id: string, patch: Partial<BRollClip>) => void;
  onDelete: (id: string) => void;
  outputDurationMs: number;
}) {
  const filename = clip.source_storage_path.split("/").pop();
  const clipDurationMs = clip.trim_end_ms - clip.trim_start_ms;

  return (
    <div className="bg-neutral-900 rounded p-2 text-[11px] space-y-1.5">
      <div className="text-neutral-200 truncate text-[11px]" title={filename}>{filename}</div>

      <div className="flex items-center gap-1">
        <span className="text-[9px] text-neutral-500 w-10">Mode</span>
        {(["fullscreen", "pip"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(clip.id, { mode: m })}
            className={`flex-1 text-[10px] px-1 py-0.5 rounded ${
              clip.mode === m
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {m === "fullscreen" ? "Full" : "PIP"}
          </button>
        ))}
        <button
          onClick={() => onDelete(clip.id)}
          className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <label className="flex items-center gap-1">
          <span className="text-neutral-500 w-12">Trim in</span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={clip.source_duration_ms / 1000}
            value={(clip.trim_start_ms / 1000).toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(clip.source_duration_ms, parseFloat(e.target.value) * 1000));
              if (v < clip.trim_end_ms) onChange(clip.id, { trim_start_ms: Math.round(v) });
            }}
            className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-neutral-500 w-12">Trim out</span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={clip.source_duration_ms / 1000}
            value={(clip.trim_end_ms / 1000).toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(clip.source_duration_ms, parseFloat(e.target.value) * 1000));
              if (v > clip.trim_start_ms) onChange(clip.id, { trim_end_ms: Math.round(v) });
            }}
            className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
          />
        </label>
      </div>

      <label className="flex items-center gap-1 text-[10px]">
        <span className="text-neutral-500 w-12">Plays at</span>
        <input
          type="number"
          step="0.1"
          min={0}
          max={outputDurationMs / 1000}
          value={(clip.output_start_ms / 1000).toFixed(1)}
          onChange={(e) => {
            const v = Math.max(0, Math.min(outputDurationMs, parseFloat(e.target.value) * 1000));
            onChange(clip.id, { output_start_ms: Math.round(v) });
          }}
          className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
        />
        <span className="text-neutral-500 text-[9px]">
          → {((clip.output_start_ms + clipDurationMs) / 1000).toFixed(1)}s
        </span>
      </label>

      {clip.mode === "pip" && (
        <div className="space-y-1 pt-1 border-t border-neutral-800">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-neutral-500 w-12">Width %</span>
            <input
              type="range"
              min={10}
              max={90}
              step={1}
              value={clip.position.width_pct}
              onChange={(e) =>
                onChange(clip.id, {
                  position: { ...clip.position, width_pct: parseInt(e.target.value) },
                })
              }
              className="flex-1 accent-blue-500"
            />
            <span className="text-neutral-400 w-8 text-right">{clip.position.width_pct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <label className="flex items-center gap-1">
              <span className="text-neutral-500 w-8">X %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={clip.position.x_pct}
                onChange={(e) =>
                  onChange(clip.id, {
                    position: { ...clip.position, x_pct: parseInt(e.target.value) || 0 },
                  })
                }
                className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="text-neutral-500 w-8">Y %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={clip.position.y_pct}
                onChange={(e) =>
                  onChange(clip.id, {
                    position: { ...clip.position, y_pct: parseInt(e.target.value) || 0 },
                  })
                }
                className="flex-1 bg-neutral-800 text-neutral-200 rounded px-1 py-0.5 border border-neutral-700"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
