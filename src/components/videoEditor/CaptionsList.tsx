// src/components/videoEditor/CaptionsList.tsx
// Compact list of caption blocks attached to the EDL. Lets the user swap a
// caption's preset, resize it, reorder, edit words, split, merge, position,
// or delete it. Lives below the transcript panel.
import { useState } from "react";
import type { Caption, CaptionPreset } from "@/lib/videoEditor/edl";
import { CAPTION_PRESETS, CAPTION_SIZE_OPTIONS } from "@/lib/videoEditor/captionPresets";

type Props = {
  captions: Caption[];
  onChangePreset: (id: string, preset: CaptionPreset) => void;
  onChangeSize: (id: string, size: number) => void;
  onChangeAllSizes: (size: number) => void;
  onChangeAllPresets: (preset: CaptionPreset) => void;
  onDelete: (id: string) => void;
  onSeek: (sourceMs: number) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onEditWord: (id: string, wordIdx: number, newText: string) => void;
  onSetPosition: (id: string, y_pct: number) => void;
  onSplit: (id: string, atWordIdx: number) => void;
  onMergeWithNext: (id: string) => void;
};

const POSITION_PRESETS = [
  { label: "Top", y: 15 },
  { label: "Mid", y: 50 },
  { label: "Btm", y: 80 },
];

export function CaptionsList(props: Props) {
  const { captions } = props;
  if (captions.length === 0) return null;

  // Sort by first-word start so display order matches playback order.
  const sorted = [...captions].sort(
    (a, b) => (a.words[0]?.start_ms ?? 0) - (b.words[0]?.start_ms ?? 0),
  );

  const uniformSize = captions.every((c) => (c.size ?? 1) === (captions[0].size ?? 1))
    ? captions[0].size ?? 1
    : null;
  const uniformPreset = captions.every((c) => c.preset === captions[0].preset)
    ? captions[0].preset
    : null;

  return (
    <div className="p-3 border-t border-neutral-800 space-y-3">
      <div className="text-xs uppercase tracking-wider text-neutral-500">
        Captions ({captions.length})
      </div>

      <div className="bg-neutral-900/60 rounded p-2 space-y-1.5">
        <div className="text-[9px] uppercase tracking-wider text-neutral-500">All blocks</div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-neutral-500 w-8">Size</span>
          {CAPTION_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => props.onChangeAllSizes(opt.value)}
              className={`flex-1 text-[10px] px-1 py-0.5 rounded ${
                uniformSize !== null && Math.abs(uniformSize - opt.value) < 0.01
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-neutral-500 w-8">Style</span>
          <select
            value={uniformPreset ?? ""}
            onChange={(e) => e.target.value && props.onChangeAllPresets(e.target.value as CaptionPreset)}
            className="flex-1 bg-neutral-800 text-neutral-200 text-[10px] rounded px-1 py-0.5 border border-neutral-700"
          >
            {uniformPreset === null && <option value="">Mixed…</option>}
            {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map((p) => (
              <option key={p} value={p}>{CAPTION_PRESETS[p].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {sorted.map((c, idx) => (
          <CaptionBlockRow
            key={c.id}
            caption={c}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            {...props}
          />
        ))}
      </div>
    </div>
  );
}

// One row per caption block with all manipulation controls.
function CaptionBlockRow({
  caption: c,
  isFirst,
  isLast,
  onChangePreset,
  onChangeSize,
  onDelete,
  onSeek,
  onReorder,
  onEditWord,
  onSetPosition,
  onSplit,
  onMergeWithNext,
}: Props & { caption: Caption; isFirst: boolean; isLast: boolean }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const size = c.size ?? 1;
  const yPct = c.position.y_pct;

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditingValue(c.words[i].text);
  };
  const commitEdit = () => {
    if (editingIdx !== null && editingValue.trim() !== "") {
      onEditWord(c.id, editingIdx, editingValue.trim());
    }
    setEditingIdx(null);
  };

  return (
    <div className="bg-neutral-900 rounded p-2 text-[11px] space-y-1.5">
      {/* Word strip — click a word to edit, the ✂ icon between words splits here. */}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 leading-relaxed">
        {c.words.map((w, i) =>
          editingIdx === i ? (
            <input
              key={i}
              autoFocus
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditingIdx(null);
              }}
              className="bg-neutral-800 text-white text-[11px] px-1 py-0 rounded border border-blue-600 w-20"
            />
          ) : (
            <span key={i} className="inline-flex items-center">
              <button
                onClick={() => onSeek(w.start_ms)}
                onDoubleClick={() => startEdit(i)}
                title="Click to seek · double-click to edit"
                className="text-neutral-200 hover:text-blue-400"
              >
                {w.text}
              </button>
              {i < c.words.length - 1 && (
                <button
                  onClick={() => onSplit(c.id, i + 1)}
                  title="Split block here"
                  className="text-[8px] text-neutral-600 hover:text-emerald-400 px-0.5"
                >
                  ✂
                </button>
              )}
            </span>
          ),
        )}
      </div>

      <div className="flex items-center gap-1">
        <select
          value={c.preset}
          onChange={(e) => onChangePreset(c.id, e.target.value as CaptionPreset)}
          className="flex-1 bg-neutral-800 text-neutral-200 text-[10px] rounded px-1 py-0.5 border border-neutral-700"
        >
          {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map((p) => (
            <option key={p} value={p}>{CAPTION_PRESETS[p].label}</option>
          ))}
        </select>
        <button
          onClick={() => onDelete(c.id)}
          className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5"
          title="Delete caption"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[9px] text-neutral-500 w-8">Size</span>
        {CAPTION_SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onChangeSize(c.id, opt.value)}
            className={`flex-1 text-[9px] px-1 py-0.5 rounded ${
              Math.abs(size - opt.value) < 0.01
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[9px] text-neutral-500 w-8">Pos</span>
        {POSITION_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onSetPosition(c.id, p.y)}
            className={`flex-1 text-[9px] px-1 py-0.5 rounded ${
              Math.abs(yPct - p.y) < 5
                ? "bg-blue-600 text-white"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[9px] text-neutral-500 w-8">Order</span>
        <button
          onClick={() => onReorder(c.id, "up")}
          disabled={isFirst}
          className="flex-1 text-[10px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Swap timeslot with the previous block"
        >
          ↑
        </button>
        <button
          onClick={() => onReorder(c.id, "down")}
          disabled={isLast}
          className="flex-1 text-[10px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Swap timeslot with the next block"
        >
          ↓
        </button>
        <button
          onClick={() => onMergeWithNext(c.id)}
          disabled={isLast}
          className="flex-[1.4] text-[9px] px-1 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Merge this block with the next one"
        >
          Merge ↓
        </button>
      </div>
    </div>
  );
}
