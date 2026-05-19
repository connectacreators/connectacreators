// src/components/videoEditor/CaptionsList.tsx
// Compact list of caption blocks attached to the EDL. Lets the user swap a
// caption's preset, resize it, or delete it. Lives below the transcript panel.
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
};

function previewText(c: Caption): string {
  const words = c.words.map((w) => w.text).join(" ");
  return words.length > 60 ? words.slice(0, 57) + "…" : words;
}

export function CaptionsList({
  captions,
  onChangePreset,
  onChangeSize,
  onChangeAllSizes,
  onChangeAllPresets,
  onDelete,
  onSeek,
}: Props) {
  if (captions.length === 0) return null;

  // Detect a uniform size/preset across all blocks so we can highlight the
  // currently-active global button. If captions mix sizes/presets, no button
  // is highlighted and the user can still set them all to one value.
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

      {/* Global controls — apply to every caption at once. */}
      <div className="bg-neutral-900/60 rounded p-2 space-y-1.5">
        <div className="text-[9px] uppercase tracking-wider text-neutral-500">All blocks</div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-neutral-500 w-8">Size</span>
          {CAPTION_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => onChangeAllSizes(opt.value)}
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
            onChange={(e) => e.target.value && onChangeAllPresets(e.target.value as CaptionPreset)}
            className="flex-1 bg-neutral-800 text-neutral-200 text-[10px] rounded px-1 py-0.5 border border-neutral-700"
          >
            {uniformPreset === null && <option value="">Mixed…</option>}
            {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map((p) => (
              <option key={p} value={p}>{CAPTION_PRESETS[p].label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {captions.map((c) => {
          const size = c.size ?? 1;
          return (
            <div key={c.id} className="bg-neutral-900 rounded p-2 text-[11px] space-y-1.5">
              <button
                onClick={() => onSeek(c.words[0]?.start_ms ?? 0)}
                className="text-left w-full text-neutral-200 hover:text-blue-400 line-clamp-2"
              >
                {previewText(c)}
              </button>
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
                <span className="text-[9px] text-neutral-500 w-6">Size</span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
