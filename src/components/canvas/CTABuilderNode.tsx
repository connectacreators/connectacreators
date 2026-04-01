import { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Target, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CTABuilderData {
  topic?: string;
  ctas?: string[];
  selectedCTA?: string;
  onUpdate?: (updates: Partial<Omit<CTABuilderData, "onUpdate" | "onDelete">>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

export default function CTABuilderNode({ data: d }: NodeProps) {
  const cd = d as CTABuilderData;
  const [topic, setTopic] = useState(cd.topic ?? "");
  const [loading, setLoading] = useState(false);
  const ctas = cd.ctas ?? [];
  const selectedCTA = cd.selectedCTA ?? null;

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic first"); return; }
    setLoading(true);
    cd.onUpdate?.({ topic });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = cd.authToken || session?.access_token;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "generate-ctas", topic: topic.trim() }),
      });
      const json = await res.json();
      if (json.ctas) {
        cd.onUpdate?.({ ctas: json.ctas, selectedCTA: undefined });
      } else {
        toast.error("Failed to generate CTAs");
      }
    } catch { toast.error("Error generating CTAs"); }
    finally { setLoading(false); }
  };

  return (
    <div className="glass-card rounded-2xl min-w-[300px] max-w-[360px] relative">
      <div className="overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(132,204,22,0.06)] border-b border-[rgba(132,204,22,0.12)]">
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-[#a3e635]" />
          <span className="text-xs font-semibold text-foreground">CTA Builder</span>
        </div>
        <button onClick={() => cd.onDelete?.()} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Input */}
      <div className="px-3 pt-3 pb-2 flex gap-2">
        <input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            cd.onUpdate?.({ topic: e.target.value });
          }}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="Topic or action"
          className="flex-1 text-xs bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(132,204,22,0.08)] text-[#a3e635] border border-[rgba(132,204,22,0.2)] hover:bg-[rgba(132,204,22,0.15)] disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
        </button>
      </div>
      {/* CTA results */}
      {ctas.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {ctas.map((cta, i) => (
            <button
              key={i}
              onClick={() => cd.onUpdate?.({ selectedCTA: cta })}
              className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                selectedCTA === cta
                  ? "bg-[rgba(132,204,22,0.1)] border-[rgba(132,204,22,0.25)] text-foreground"
                  : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-start gap-1.5">
                {selectedCTA === cta && <Check className="w-3 h-3 text-[#a3e635] mt-0.5 flex-shrink-0" />}
                <span className="leading-relaxed">{cta}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      </div>{/* end content wrapper */}
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
}
