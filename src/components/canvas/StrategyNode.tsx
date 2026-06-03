import { useState, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { BarChart3, X, ChevronDown, ChevronRight, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ClientStrategyRow {
  posts_per_month?: number | null;
  scripts_per_month?: number | null;
  videos_edited_per_month?: number | null;
  stories_per_week?: number | null;
  mix_reach?: number | null;
  mix_trust?: number | null;
  mix_convert?: number | null;
  primary_platform?: string | null;
  manychat_active?: boolean | null;
  manychat_keyword?: string | null;
  cta_goal?: string | null;
  ads_active?: boolean | null;
  ads_budget?: number | null;
  ads_goal?: string | null;
  audience_score?: number | null;
  uniqueness_score?: number | null;
  monthly_revenue_goal?: number | null;
  monthly_revenue_actual?: number | null;
  content_pillars?: string[] | null;
  pipeline_notes?: string | null;
  updated_at?: string | null;
}

interface StrategyNodeData {
  strategy?: ClientStrategyRow | null;
  status?: "idle" | "loading" | "done" | "error";
  errorMessage?: string | null;
  expandedSection?: number | null;
  onUpdate?: (updates: Partial<StrategyNodeData>) => void;
  onDelete?: () => void;
  clientId?: string;
}

export default function StrategyNode({ data }: NodeProps) {
  const d = data as StrategyNodeData;

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(d.status ?? "idle");
  const [strategy, setStrategy] = useState<ClientStrategyRow | null>(d.strategy ?? null);
  const [expandedSection, setExpandedSection] = useState<number | null>(d.expandedSection ?? 0);

  useEffect(() => {
    if (!d.clientId || status === "loading") return;
    if (status === "done" && strategy) return;
    setStatus("loading");
    supabase
      .from("client_strategies")
      .select("*")
      .eq("client_id", d.clientId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error) {
          setStatus("error");
          d.onUpdate?.({ status: "error", errorMessage: "Failed to load strategy" });
          return;
        }
        const s = (row as ClientStrategyRow) ?? null;
        setStrategy(s);
        setStatus("done");
        d.onUpdate?.({ strategy: s, status: "done", errorMessage: null });
      });
  }, [d.clientId, status]);

  const handleRefresh = () => {
    setStatus("idle");
    d.onUpdate?.({ status: "idle" });
  };

  const toggleSection = (idx: number) => {
    const next = expandedSection === idx ? null : idx;
    setExpandedSection(next);
    d.onUpdate?.({ expandedSection: next });
  };

  const fmtCount = (n: number | null | undefined) => (typeof n === "number" ? String(n) : "—");
  const fmtMoney = (n: number | null | undefined) => (typeof n === "number" ? `$${n.toLocaleString()}` : "—");
  const fmtBool = (b: boolean | null | undefined) => (b === true ? "Yes" : b === false ? "No" : "—");

  const sections = strategy
    ? [
        {
          title: "Cadence",
          rows: [
            ["Posts/mo", fmtCount(strategy.posts_per_month)],
            ["Scripts/mo", fmtCount(strategy.scripts_per_month)],
            ["Edits/mo", fmtCount(strategy.videos_edited_per_month)],
            ["Stories/wk", fmtCount(strategy.stories_per_week)],
            ["Primary platform", strategy.primary_platform || "—"],
          ],
        },
        {
          title: "Content Mix",
          rows: [
            ["Reach", strategy.mix_reach != null ? `${strategy.mix_reach}%` : "—"],
            ["Trust", strategy.mix_trust != null ? `${strategy.mix_trust}%` : "—"],
            ["Convert", strategy.mix_convert != null ? `${strategy.mix_convert}%` : "—"],
            ["Pillars", (strategy.content_pillars && strategy.content_pillars.length > 0)
              ? strategy.content_pillars.join(", ")
              : "—"],
          ],
        },
        {
          title: "Conversion",
          rows: [
            ["CTA goal", strategy.cta_goal || "—"],
            ["ManyChat", fmtBool(strategy.manychat_active)],
            ["Keyword", strategy.manychat_keyword || "—"],
          ],
        },
        {
          title: "Ads",
          rows: [
            ["Running", fmtBool(strategy.ads_active)],
            ["Budget/mo", fmtMoney(strategy.ads_budget)],
            ["Goal", strategy.ads_goal || "—"],
          ],
        },
        {
          title: "Revenue & Scores",
          rows: [
            ["Goal/mo", fmtMoney(strategy.monthly_revenue_goal)],
            ["Actual/mo", fmtMoney(strategy.monthly_revenue_actual)],
            ["Audience score", strategy.audience_score != null ? `${strategy.audience_score}/100` : "—"],
            ["Uniqueness", strategy.uniqueness_score != null ? `${strategy.uniqueness_score}/100` : "—"],
          ],
        },
        {
          title: "Pipeline Notes",
          rows: [["Notes", strategy.pipeline_notes || "—"]],
        },
      ]
    : [];

  return (
    <div className="glass-card rounded-2xl min-w-[280px] max-w-[340px] relative">
      <div className="overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(20,20,20,0.05)] border-b border-[rgba(20,20,20,0.12)]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-[#8FD0D5]" />
            <span className="text-xs font-semibold text-foreground">Strategy</span>
          </div>
          <div className="flex items-center gap-1">
            {status === "done" && (
              <button
                onClick={handleRefresh}
                title="Refresh from live strategy"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
            <button onClick={() => d.onDelete?.()} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-2 py-2">
          {status === "loading" && (
            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Loading strategy…</span>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 py-4 justify-center text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs">Failed to load</span>
              <button onClick={handleRefresh} className="text-xs underline text-muted-foreground hover:text-foreground ml-1">Retry</button>
            </div>
          )}

          {status === "done" && !strategy && (
            <p className="text-[11px] text-muted-foreground/70 italic px-2 py-3 text-center">
              No strategy filled in yet for this client.
            </p>
          )}

          {status === "done" && strategy && (
            <div className="space-y-1">
              {sections.map((section, idx) => {
                const isOpen = expandedSection === idx;
                const hasContent = section.rows.some(([, v]) => v && v !== "—");
                return (
                  <div key={idx} className="rounded-lg overflow-hidden border border-border/30">
                    <button
                      onClick={() => toggleSection(idx)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</span>
                        {!hasContent && (
                          <span className="text-[9px] text-muted-foreground/50">· empty</span>
                        )}
                      </div>
                      {isOpen
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                        : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      }
                    </button>

                    {isOpen && (
                      <div className="px-2.5 py-2 space-y-1.5 bg-muted/10">
                        {section.rows.map(([label, val]) => (
                          <div key={label}>
                            <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-medium">{label}</div>
                            <div className="text-[11px] text-foreground leading-snug mt-0.5 break-words whitespace-pre-wrap">{val}</div>
                          </div>
                        ))}
                        {!hasContent && (
                          <p className="text-[11px] text-muted-foreground/50 italic">Not filled in yet</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary/70 !w-3 !h-3" style={{ zIndex: 50 }} />
    </div>
  );
}
