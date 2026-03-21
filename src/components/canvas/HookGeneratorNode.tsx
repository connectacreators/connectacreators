import { useState, useMemo } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Anchor, Loader2, X, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VIRAL_HOOK_FORMULAS, HOOK_CATEGORIES, HOOK_CATEGORY_LABELS, type HookCategory } from "@/data/viralHookFormulas";

interface HookGeneratorData {
  topic?: string;
  hooks?: Array<{ category: string; text: string }>;
  selectedHook?: string;
  selectedCategory?: string;
  previousHooks?: string[];
  onUpdate?: (updates: Partial<Omit<HookGeneratorData, "onUpdate" | "onDelete">>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}

const CATEGORY_KEY_MAP: Record<string, string> = {
  randomInspo: "random",
  authorityInspo: "authority",
  comparisonInspo: "comparison",
  storytellingInspo: "storytelling",
};

function normalizeCategory(key: string): string {
  return CATEGORY_KEY_MAP[key] ?? key;
}

const CATEGORY_LABELS: Record<string, string> = {
  educational: "Educational",
  random: "Random",
  authority: "Authority",
  comparison: "Comparison",
  storytelling: "Storytelling",
  mythBusting: "Myth Busting",
  dayInTheLife: "Day in the Life",
};

export default function HookGeneratorNode({ data: d }: NodeProps) {
  const [topic, setTopic] = useState((d as HookGeneratorData).topic ?? "");
  const [loading, setLoading] = useState(false);
  const hooks = (d as HookGeneratorData).hooks ?? [];
  const selectedHook = (d as HookGeneratorData).selectedHook ?? null;

  const [showFormulas, setShowFormulas] = useState(false);
  const [formulaCategory, setFormulaCategory] = useState<HookCategory | null>(null);
  const [formulaSearch, setFormulaSearch] = useState("");

  const filteredFormulas = useMemo(() => {
    let results = VIRAL_HOOK_FORMULAS;
    if (formulaCategory) {
      results = results.filter(f => f.category === formulaCategory);
    }
    if (formulaSearch.trim()) {
      const q = formulaSearch.toLowerCase();
      results = results.filter(f => f.template.toLowerCase().includes(q));
    }
    return results;
  }, [formulaCategory, formulaSearch]);

  const generate = async () => {
    if (!topic.trim()) { toast.error("Enter a topic first"); return; }
    setLoading(true);
    const dd = d as HookGeneratorData;
    dd.onUpdate?.({ topic });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = dd.authToken || session?.access_token;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          step: "generate-hooks",
          topic: topic.trim(),
          previousHooks: dd.previousHooks ?? [],
        }),
      });
      const json = await res.json();
      if (json.hooks) {
        const newHookTexts = json.hooks.map((h: any) => h.text);
        const prevHooks = [...(dd.previousHooks ?? []), ...newHookTexts].slice(-20);
        dd.onUpdate?.({ hooks: json.hooks, selectedHook: undefined, selectedCategory: undefined, previousHooks: prevHooks });
      } else {
        toast.error("Failed to generate hooks");
      }
    } catch { toast.error("Error generating hooks"); }
    finally { setLoading(false); }
  };

  const selectHook = (hook: { category: string; text: string }) => {
    (d as HookGeneratorData).onUpdate?.({ selectedHook: hook.text, selectedCategory: hook.category });
  };

  const handleFormulaClick = (template: string, category: string) => {
    const dd = d as HookGeneratorData;
    let filled = template;
    if (topic.trim()) {
      filled = template.replace(/\(insert [^)]+\)/i, topic.trim());
    }
    const newHook = { category, text: filled };
    const currentHooks = dd.hooks ?? [];
    dd.onUpdate?.({
      hooks: [...currentHooks, newHook],
      selectedHook: filled,
      selectedCategory: category,
    });
    setShowFormulas(false);
  };

  return (
    <div className="glass-card rounded-2xl min-w-[300px] max-w-[360px] overflow-hidden">
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70" />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70" />
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.06)] border-b border-[rgba(8,145,178,0.12)]">
        <div className="flex items-center gap-2">
          <Anchor className="w-3.5 h-3.5 text-[#22d3ee]" />
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
          onClick={() => setShowFormulas(!showFormulas)}
          className={`px-2 py-1.5 text-xs rounded-lg border transition-colors flex items-center ${
            showFormulas
              ? "bg-[rgba(8,145,178,0.15)] border-[rgba(8,145,178,0.3)] text-[#22d3ee]"
              : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          title="Browse hook formulas"
        >
          <Search className="w-3 h-3" />
        </button>
        <button
          onClick={generate}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[rgba(8,145,178,0.12)] text-[#22d3ee] border border-[rgba(8,145,178,0.25)] hover:bg-[rgba(8,145,178,0.2)] disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
        </button>
      </div>
      {/* Formula browser popover */}
      {showFormulas && (
        <div className="px-3 pb-2">
          <div className="rounded-lg border border-border/60 bg-background/95 backdrop-blur-sm overflow-hidden">
            {/* Category chips */}
            <div className="flex flex-wrap gap-1 px-2.5 pt-2.5 pb-1.5">
              {HOOK_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFormulaCategory(formulaCategory === cat ? null : cat)}
                  className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                    formulaCategory === cat
                      ? "bg-[rgba(8,145,178,0.15)] border-[rgba(8,145,178,0.3)] text-[#22d3ee]"
                      : "bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {HOOK_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            {/* Search input */}
            <div className="px-2.5 pb-1.5">
              <input
                value={formulaSearch}
                onChange={(e) => setFormulaSearch(e.target.value)}
                placeholder="Search formulas..."
                className="w-full text-[11px] bg-muted/40 border border-border/60 rounded-md px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            {/* Formula list */}
            <div className="max-h-[280px] overflow-y-auto px-2.5 pb-2.5 space-y-1">
              {filteredFormulas.slice(0, 50).map((formula, i) => (
                <button
                  key={i}
                  onClick={() => handleFormulaClick(formula.template, formula.category)}
                  className="w-full text-left rounded-md border border-border/30 bg-muted/20 hover:bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="text-[9px] uppercase tracking-wide text-[#22d3ee]/70 font-medium">
                    {HOOK_CATEGORY_LABELS[formula.category as HookCategory]}
                  </span>
                  <p className="leading-relaxed mt-0.5">{formula.template}</p>
                </button>
              ))}
              {filteredFormulas.length > 50 && (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  {filteredFormulas.length - 50} more — narrow your search
                </p>
              )}
              {filteredFormulas.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">No formulas match</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Hook results */}
      {hooks.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {hooks.map((hook, i) => (
            <button
              key={i}
              onClick={() => selectHook(hook)}
              className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                selectedHook === hook.text
                  ? "bg-[rgba(8,145,178,0.12)] border-[rgba(8,145,178,0.3)] text-foreground"
                  : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-start gap-1.5">
                {selectedHook === hook.text && <Check className="w-3 h-3 text-[#22d3ee] mt-0.5 flex-shrink-0" />}
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-[#22d3ee]/80 font-medium">
                    {CATEGORY_LABELS[normalizeCategory(hook.category)] ?? hook.category}
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
