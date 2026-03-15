import { useState, useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { BookOpen, X } from "lucide-react";

interface BrandGuideData {
  tone?: "Casual" | "Formal" | "Funny" | "Bold";
  brand_values?: string;
  forbidden_words?: string;
  tagline?: string;
  onUpdate?: (updates: Partial<Omit<BrandGuideData, "onUpdate" | "onDelete">>) => void;
  onDelete?: () => void;
}

export default function BrandGuideNode({ data: d }: NodeProps) {
  const bd = d as BrandGuideData;
  const [tone, setTone] = useState(bd.tone ?? "Casual");
  const [values, setValues] = useState(bd.brand_values ?? "");
  const [forbidden, setForbidden] = useState(bd.forbidden_words ?? "");
  const [tagline, setTagline] = useState(bd.tagline ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (patch: Partial<Omit<BrandGuideData, "onUpdate" | "onDelete">>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => bd.onUpdate?.(patch), 400);
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm min-w-[280px] max-w-[340px] overflow-hidden">
      <Handle type="source" position={Position.Right} />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-foreground">Brand Guide</span>
        </div>
        <button onClick={() => bd.onDelete?.()} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Form */}
      <div className="px-3 py-3 space-y-2.5">
        {/* Tone */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tone</label>
          <select
            value={tone}
            onChange={(e) => { setTone(e.target.value as any); update({ tone: e.target.value as any }); }}
            className="mt-1 w-full text-xs bg-transparent border border-border/50 rounded-lg px-2.5 py-1.5 text-muted-foreground focus:outline-none focus:border-primary/50 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            {["Casual", "Formal", "Funny", "Bold"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Brand values */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Brand Values</label>
          <input
            value={values}
            onChange={(e) => { setValues(e.target.value); update({ brand_values: e.target.value }); }}
            placeholder="e.g. trustworthy, educational, human"
            className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        {/* Forbidden words */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Forbidden Words</label>
          <textarea
            value={forbidden}
            onChange={(e) => { setForbidden(e.target.value); update({ forbidden_words: e.target.value }); }}
            placeholder="e.g. synergy, leverage, utilize"
            rows={2}
            className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
          />
        </div>
        {/* Tagline */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Tagline</label>
          <input
            value={tagline}
            onChange={(e) => { setTagline(e.target.value); update({ tagline: e.target.value }); }}
            placeholder="e.g. Your spine, your life"
            className="mt-1 w-full text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>
    </div>
  );
}
