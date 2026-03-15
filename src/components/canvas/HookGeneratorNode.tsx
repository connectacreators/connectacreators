import { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Anchor, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HookGeneratorData {
  topic?: string;
  hooks?: Array<{ category: string; text: string }>;
  selectedHook?: string;
  selectedCategory?: string;
  onUpdate?: (updates: Partial<Omit<HookGeneratorData, "onUpdate" | "onDelete">>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  educational: "Educational",
  randomInspo: "Random/Unexpected",
  authorityInspo: "Authority",
  comparisonInspo: "Comparison",
  storytellingInspo: "Story",
};

export default function HookGeneratorNode({ data: d }: NodeProps) {
  const [topic, setTopic] = useState((d as HookGeneratorData).topic ?? "");
  const [loading, setLoading] = useState(false);
  const hooks = (d as HookGeneratorData).hooks ?? [];
  const selectedHook = (d as HookGeneratorData).selectedHook ?? null;

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic first"); return; }
    setLoading(true);
    (d as HookGeneratorData).onUpdate?.({ topic });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = (d as HookGeneratorData).authToken || session?.access_token;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "generate-hooks", topic: topic.trim() }),
      });
      const json = await res.json();
      if (json.hooks) {
        (d as HookGeneratorData).onUpdate?.({ hooks: json.hooks, selectedHook: undefined, selectedCategory: undefined });
      } else {
        toast.error("Failed to generate hooks");
      }
    } catch { toast.error("Error generating hooks"); }
    finally { setLoading(false); }
  };

  const selectHook = (hook: { category: string; text: string }) => {
    (d as HookGeneratorData).onUpdate?.({ selectedHook: hook.text, selectedCategory: hook.category });
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm min-w-[300px] max-w-[360px] overflow-hidden">
      <Handle type="source" position={Position.Right} />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <Anchor className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-foreground">Hook Generator</span>
        </div>
        <button onClick={() => (d as HookGeneratorData).onDelete?.()} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Input */}
      <div className="px-3 pt-3 pb-2 flex gap-2">
        <input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            (d as HookGeneratorData).onUpdate?.({ topic: e.target.value });
          }}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="Topic (e.g. lower back pain)"
          className="flex-1 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
        </button>
      </div>
      {/* Hook results */}
      {hooks.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {hooks.map((hook, i) => (
            <button
              key={i}
              onClick={() => selectHook(hook)}
              className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                selectedHook === hook.text
                  ? "bg-amber-500/20 border-amber-500/40 text-foreground"
                  : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-start gap-1.5">
                {selectedHook === hook.text && <Check className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />}
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-amber-400/80 font-medium">
                    {CATEGORY_LABELS[hook.category] ?? hook.category}
                  </span>
                  <p className="leading-relaxed mt-0.5">{hook.text}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
