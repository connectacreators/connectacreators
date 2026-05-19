// src/components/videoEditor/CaptionsPanel.tsx
// Dedicated captions panel — used when the right-side tab switcher is on
// "Captions". Owns the "Apply to all" toggle that controls whether
// per-block edits propagate to every block (CapCut-style).
import { useRef, useState } from "react";
import type { Caption, CaptionPreset } from "@/lib/videoEditor/edl";
import { CAPTION_PRESETS } from "@/lib/videoEditor/captionPresets";

const SIZE_MIN = 0.375;
const SIZE_MAX = 2.0;
const SIZE_STEP = 0.05;

const POSITION_PRESETS = [
  { label: "Top", y: 15 },
  { label: "Mid", y: 50 },
  { label: "Btm", y: 80 },
];

type Props = {
  captions: Caption[];
  applyToAll: boolean;
  onSetApplyToAll: (v: boolean) => void;
  onChangePreset: (id: string, preset: CaptionPreset) => void;
  onChangeSize: (id: string, size: number) => void;
  onDelete: (id: string) => void;
  onSeek: (sourceMs: number) => void;
  // Old per-direction reorder (kept for arrow keyboards / accessibility) —
  // the visible UX is drag-to-reorder now.
  onReorder: (id: string, direction: "up" | "down") => void;
  // Move a caption to land at the target caption's timeslot. Receives both
  // ids in the order they were dropped.
  onReorderTo: (draggedId: string, targetId: string) => void;
  onSplit: (id: string, atWordIdx: number) => void;
  // Replace the entire word array (preserves timing by re-splitting the
  // input text by spaces and reassigning durations proportionally).
  onReplaceText: (id: string, newText: string) => void;
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

export function CaptionsPanel(props: Props) {
  const { captions, applyToAll } = props;

  if (captions.length === 0) {
    return (
      <div className="p-4 text-center text-[11px] text-neutral-500">
        No captions yet. Use the Transcript tab → drag-select words or hit
        Auto captions to create some.
      </div>
    );
  }

  const sorted = [...captions].sort(
    (a, b) => (a.words[0]?.start_ms ?? 0) - (b.words[0]?.start_ms ?? 0),
  );

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Apply-to-all toggle. When on, any per-block edit (size/style/
          position/drag) propagates to every other block — matches CapCut's
          'Apply to all' checkbox behavior. */}
      <label className="flex items-center gap-2 bg-neutral-900/60 rounded p-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={applyToAll}
          onChange={(e) => props.onSetApplyToAll(e.target.checked)}
          className="accent-blue-500"
        />
        <span className="text-[11px] text-neutral-200">
          Apply changes to all captions
        </span>
        {applyToAll && (
          <span className="ml-auto text-[9px] text-blue-400 uppercase">linked</span>
        )}
      </label>

      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        Captions ({captions.length})
      </div>

      <div className="space-y-1.5 max-h-[calc(100vh-260px)] overflow-y-auto">
        {sorted.map((c) => (
          <CaptionBlockRow
            key={c.id}
            caption={c}
            {...props}
          />
        ))}
      </div>
    </div>
  );
}

function CaptionBlockRow({
  caption: c,
  applyToAll,
  onChangePreset,
  onChangeSize,
  onDelete,
  onSeek,
  onReorderTo,
  onSetPosition,
  onSplit,
  onReplaceText,
}: Props & { caption: Caption } & { onSetPosition: (id: string, y_pct: number) => void }) {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const [isDraggedOver, setIsDraggedOver] = useState(false);

  const size = c.size ?? 1;
  const yPct = c.position.y_pct;
  const joinedText = c.words.map((w) => w.text).join(" ");

  // Map a character offset within the joined text to a word index. Used by
  // Enter-to-split: cursor at offset N → split AFTER the word containing N.
  const offsetToSplitIndex = (offset: number): number => {
    let cursor = 0;
    for (let i = 0; i < c.words.length; i++) {
      const wordLen = c.words[i].text.length;
      // Cursor inside word i, OR at its trailing space.
      if (offset <= cursor + wordLen) return i + 1;
      cursor += wordLen + 1; // +1 for the joining space
    }
    return c.words.length;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = window.getSelection();
      const root = editableRef.current;
      if (!sel || !root || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      // Compute the character offset of the cursor relative to the root.
      const pre = range.cloneRange();
      pre.selectNodeContents(root);
      pre.setEnd(range.startContainer, range.startOffset);
      const offset = pre.toString().length;
      const splitAt = offsetToSplitIndex(offset);
      if (splitAt >= 1 && splitAt < c.words.length) {
        onSplit(c.id, splitAt);
      }
    }
  };

  // Commit text edits on blur — re-distribute word timings to the new word
  // list. If word count is unchanged we just rename in place; if changed,
  // we evenly redistribute the block's total time across the new words.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const newText = (e.currentTarget.textContent ?? "").trim();
    if (newText === joinedText.trim()) return;
    if (newText.length === 0) return;
    onReplaceText(c.id, newText);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/caption-id", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDraggedOver(true);
      }}
      onDragLeave={() => setIsDraggedOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggedOver(false);
        const draggedId = e.dataTransfer.getData("text/caption-id");
        if (draggedId && draggedId !== c.id) onReorderTo(draggedId, c.id);
      }}
      className={`bg-neutral-900 rounded p-2 text-[11px] space-y-1.5 cursor-grab ${
        applyToAll ? "ring-1 ring-blue-700/40" : ""
      } ${isDraggedOver ? "ring-2 ring-emerald-500" : ""}`}
      title="Drag this card up/down to reorder · click a word to seek"
    >
      {/* Editable textbox. Enter at the cursor position splits the block;
          editing the text and blurring rewrites the words in place. */}
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onClick={(e) => {
          // Allow click-to-seek on the first word's timestamp if the user
          // just clicks (not selects). Useful for jumping to this block.
          if (window.getSelection()?.isCollapsed) {
            onSeek(c.words[0]?.start_ms ?? 0);
          }
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="text-neutral-100 outline-none focus:bg-neutral-800 rounded px-1 py-0.5 leading-relaxed"
        style={{ caretColor: "white" }}
      >
        {joinedText}
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

      <div className="flex items-center gap-2">
        <span className="text-[9px] text-neutral-500 w-8">Size</span>
        <SizeSlider value={size} onChange={(v) => onChangeSize(c.id, v)} />
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

      <p className="text-[9px] text-neutral-500 italic">
        Press Enter inside the text to split here · drag this card to reorder
      </p>
    </div>
  );
}
