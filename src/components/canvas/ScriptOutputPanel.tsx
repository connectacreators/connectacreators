import { useState, useRef } from "react";
import { CheckCircle2, Loader2, Camera, Mic, Scissors, Type, Wand2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ScriptLine {
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: "hook" | "body" | "cta";
  text: string;
}

interface ScriptResult {
  lines: ScriptLine[];
  idea_ganadora: string;
  target: string;
  formato: string;
  virality_score: number;
}

interface Props {
  script: ScriptResult;
  onSave: (editedScript: ScriptResult) => Promise<void>;
  onClear: () => void;
  onRefine: (scriptText: string) => void;
}

const LINE_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; icon: any; label: string }> = {
  filming: {
    color: "text-orange-400",
    bg: "bg-gradient-to-br from-orange-500/10 to-orange-900/5",
    border: "border-orange-500/25",
    dot: "bg-orange-500",
    icon: Camera,
    label: "FILMING",
  },
  actor: {
    color: "text-[#e0e0e0]",
    bg: "bg-gradient-to-br from-[rgba(255,255,255,0.05)] to-transparent",
    border: "border-[rgba(255,255,255,0.08)]",
    dot: "bg-[#707278]",
    icon: Mic,
    label: "ACTOR",
  },
  editor: {
    color: "text-[#a3e635]",
    bg: "bg-gradient-to-br from-[rgba(132,204,22,0.08)] to-[rgba(132,204,22,0.02)]",
    border: "border-[rgba(132,204,22,0.2)]",
    dot: "bg-[#84CC16]",
    icon: Scissors,
    label: "EDITOR",
  },
  text_on_screen: {
    color: "text-[#94a3b8]",
    bg: "bg-gradient-to-br from-[rgba(148,163,184,0.06)] to-[rgba(148,163,184,0.02)]",
    border: "border-[rgba(148,163,184,0.15)]",
    dot: "bg-[#64748b]",
    icon: Type,
    label: "TEXT",
  },
};

const SECTION_HEADERS: Record<string, { label: string; color: string; bar: string }> = {
  hook: { label: "HOOK", color: "text-[#e0e0e0]", bar: "bg-[rgba(255,255,255,0.1)]" },
  body: { label: "BODY", color: "text-[#94a3b8]", bar: "bg-[rgba(148,163,184,0.3)]" },
  cta:  { label: "CTA",  color: "text-[#a3e635]", bar: "bg-[rgba(132,204,22,0.35)]" },
};

export default function ScriptOutputPanel({ script, onSave, onClear, onRefine }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [lines, setLines] = useState<ScriptLine[]>(Array.isArray(script.lines) ? script.lines : []);

  const savingRef = useRef(false);
  const handleSave = async () => {
    if (savingRef.current) return; // prevent double-fire from pointerDown + click
    savingRef.current = true;
    setSaving(true);
    try {
      const saveFn = onSave || (window as any).__canvasSaveScript;
      if (!saveFn) {
        toast.error("Save function not available");
        return;
      }
      await saveFn({ ...script, lines });
      setSaved(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save script");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const handleRefine = () => {
    const text = lines.map(l => `[${l.line_type.toUpperCase()}] ${l.text}`).join("\n");
    onRefine(text);
  };

  const handleLineChange = (idx: number, text: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, text } : l));
  };

  // Group lines by section in order: hook → body → cta
  const sections: Array<"hook" | "body" | "cta"> = ["hook", "body", "cta"];

  const scoreColor = script.virality_score >= 8 ? "text-[#a3e635]" : script.virality_score >= 6 ? "text-[#22d3ee]" : "text-orange-400";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-foreground">{script.idea_ganadora}</p>
          <p className="text-[11px] text-muted-foreground">{script.formato} · {script.target}</p>
        </div>
        <div className={`text-xl font-bold ${scoreColor}`}>{script.virality_score.toFixed(1)}</div>
      </div>

      {/* Script lines */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 min-h-0">
        {sections.map((section) => {
          const sectionLines = lines.map((l, idx) => ({ ...l, idx })).filter(l => l.section === section);
          if (sectionLines.length === 0) return null;
          const sh = SECTION_HEADERS[section];
          return (
            <div key={section}>
              {/* Section divider */}
              <div className="flex items-center gap-2 my-2">
                <div className={`h-px flex-1 ${sh.bar}`} />
                <span className={`text-[10px] font-bold tracking-widest ${sh.color}`}>{sh.label}</span>
                <div className={`h-px flex-1 ${sh.bar}`} />
              </div>

              {/* Lines */}
              {sectionLines.map(({ idx, line_type, text }) => {
                const cfg = LINE_CONFIG[line_type] || LINE_CONFIG.actor;
                const Icon = cfg.icon;
                const isEditing = editingIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`flex gap-2 p-2 rounded-xl border ${cfg.bg} ${cfg.border} mb-1`}
                    onClick={() => !isEditing && setEditingIdx(idx)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                        <Icon className={`w-3 h-3 ${cfg.color}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                      {isEditing ? (
                        <textarea
                          autoFocus
                          className="w-full mt-1 bg-transparent text-sm text-foreground resize-none focus:outline-none border-b border-white/20 pb-1"
                          value={text}
                          rows={3}
                          onChange={(e) => handleLineChange(idx, e.target.value)}
                          onBlur={() => setEditingIdx(null)}
                        />
                      ) : (
                        <p className="text-xs text-foreground/90 leading-relaxed mt-0.5 cursor-text">{text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border flex-shrink-0 space-y-2">
        <p className="text-[10px] text-muted-foreground text-center">Click any line to edit it inline</p>
        {saved ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4" /> Script saved!
            </div>
            <button
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onClear(); }}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              type="button"
              className="w-full flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-lg cursor-pointer select-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", position: "relative", zIndex: 100 }}
            >
              <ArrowLeft className="w-3 h-3" /> Back to Chat
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (!saving) handleSave();
              }}
              disabled={saving}
              type="button"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold cursor-pointer select-none"
              style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", color: "#22d3ee", opacity: saving ? 0.5 : 1, position: "relative", zIndex: 100 }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Script"}
            </button>
            <div className="flex gap-2">
              <button
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onClear(); }}
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                type="button"
                className="flex-1 flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-lg cursor-pointer select-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", position: "relative", zIndex: 100 }}
              >
                <ArrowLeft className="w-3 h-3" /> Back to Chat
              </button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleRefine(); }}
                onClick={(e) => { e.stopPropagation(); handleRefine(); }}
                type="button"
                className="flex-1 flex items-center justify-center gap-1 text-xs py-2 px-3 rounded-lg cursor-pointer select-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", position: "relative", zIndex: 100 }}
              >
                <Wand2 className="w-3 h-3" /> Refine
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
