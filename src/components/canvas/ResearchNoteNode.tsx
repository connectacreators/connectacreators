import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Search, X, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Fact { fact: string; impact_score: number; }

interface ResearchData {
  topic?: string;
  facts?: Fact[];
  onUpdate?: (updates: Partial<ResearchData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

const impactColor = (score: number) =>
  score >= 9.5 ? "text-[#22d3ee] border-[rgba(8,145,178,0.5)] bg-[rgba(8,145,178,0.15)]" :
  score >= 9   ? "text-[#a3e635] border-[rgba(132,204,22,0.4)] bg-[rgba(132,204,22,0.1)]" :
                 "text-[#94a3b8] border-[rgba(148,163,184,0.3)] bg-[rgba(148,163,184,0.08)]";

const ResearchNoteNode = memo(({ data }: NodeProps) => {
  const d = data as ResearchData;
  const { showOutOfCreditsModal } = useOutOfCredits();
  const [loading, setLoading] = useState(false);
  const [topicInput, setTopicInput] = useState(d.topic || "");

  const runResearch = async () => {
    if (!topicInput.trim()) { toast.error("Enter a topic first."); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = d.authToken || session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ step: "research", topic: topicInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        throw new Error(json.error || "Research failed");
      }
      d.onUpdate?.({ topic: topicInput.trim(), facts: json.facts || [] });
    } catch (e: any) {
      toast.error(e.message || "Research failed");
    } finally {
      setLoading(false);
    }
  };

  const hasFacts = (d.facts || []).length > 0;

  return (
    <div className="glass-card rounded-2xl shadow-xl relative" style={{ width: "100%", minWidth: "280px" }}>
      <div className="overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(13,148,136,0.08)] border-b border-[rgba(13,148,136,0.15)]">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary/80">Research Note</span>
          {hasFacts && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">{d.facts!.length} facts</span>}
        </div>
        {d.onDelete && (
          <button onClick={d.onDelete} className="nodrag p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Topic input */}
        <div className="flex gap-2">
          <input
            className="nodrag flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            placeholder="Research topic..."
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runResearch()}
            disabled={loading}
          />
          <button
            onClick={runResearch}
            disabled={loading || !topicInput.trim()}
            className="nodrag px-3 py-2 rounded-xl bg-primary/15 border border-primary/30 text-primary/80 hover:bg-primary/25 hover:text-primary transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-medium"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {loading ? "..." : "Research"}
          </button>
        </div>

        {/* Facts list */}
        {hasFacts && (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
            {d.facts!.map((f, i) => (
              <div key={i} className="flex gap-2 p-2 rounded-xl bg-muted/20 border border-border/60">
                <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border ${impactColor(f.impact_score)}`}>
                  {f.impact_score.toFixed(0)}
                </span>
                <p className="text-[11px] text-foreground/90 leading-snug">{f.fact}</p>
              </div>
            ))}
          </div>
        )}

        {!hasFacts && !loading && (
          <p className="text-[10px] text-muted-foreground text-center py-2">Enter a topic and click Research to find 5 viral facts.</p>
        )}
      </div>

      </div>{/* end content wrapper */}
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
});

ResearchNoteNode.displayName = "ResearchNoteNode";
export default ResearchNoteNode;
