import { useState, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { ClipboardList, X, ChevronDown, ChevronRight, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingFormNodeData {
  onboarding_data?: Record<string, string> | null;
  status?: "idle" | "loading" | "done" | "error";
  errorMessage?: string | null;
  expandedSection?: number | null;
  onUpdate?: (updates: Partial<OnboardingFormNodeData>) => void;
  onDelete?: () => void;
  clientId?: string;
}

const SECTIONS = [
  {
    title: "Basic Info",
    fields: [
      { key: "clientName", label: "Name" },
      { key: "email", label: "Email" },
    ],
  },
  {
    title: "Social Media",
    fields: [
      { key: "instagram", label: "Instagram" },
      { key: "tiktok", label: "TikTok" },
      { key: "youtube", label: "YouTube" },
      { key: "facebook", label: "Facebook" },
    ],
  },
  {
    title: "Business",
    fields: [
      { key: "industry", label: "Industry" },
      { key: "package", label: "Package" },
      { key: "adBudget", label: "Ad Budget" },
      { key: "state", label: "State" },
    ],
  },
  {
    title: "Brand & Messaging",
    fields: [
      { key: "uniqueOffer", label: "Unique Offer" },
      { key: "uniqueValues", label: "Values" },
      { key: "competition", label: "Competition" },
      { key: "story", label: "Story" },
    ],
  },
  {
    title: "Market & Goals",
    fields: [
      { key: "targetClient", label: "Target Client" },
      { key: "top3Profiles", label: "Top Profiles" },
      { key: "callLink", label: "Call Link" },
      { key: "additionalNotes", label: "Notes" },
    ],
  },
];

export default function OnboardingFormNode({ data }: NodeProps) {
  const d = data as OnboardingFormNodeData;

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(d.status ?? "idle");
  const [onboardingData, setOnboardingData] = useState<Record<string, string> | null>(d.onboarding_data ?? null);
  const [expandedSection, setExpandedSection] = useState<number | null>(d.expandedSection ?? 0);

  useEffect(() => {
    if (!d.clientId || status === "done" || status === "loading") return;
    setStatus("loading");
    supabase
      .from("clients")
      .select("onboarding_data")
      .eq("id", d.clientId)
      .single()
      .then(({ data: row, error }) => {
        if (error || !row) {
          setStatus("error");
          d.onUpdate?.({ status: "error", errorMessage: "Failed to load onboarding data" });
          return;
        }
        const od = (row.onboarding_data as Record<string, string>) ?? null;
        setOnboardingData(od);
        setStatus("done");
        d.onUpdate?.({ onboarding_data: od, status: "done", errorMessage: null });
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

  const getValue = (key: string): string => {
    if (!onboardingData) return "";
    // industryOther overrides industry
    if (key === "industry") return onboardingData.industryOther || onboardingData.industry || "";
    return onboardingData[key] || "";
  };

  return (
    <div className="glass-card rounded-2xl min-w-[280px] max-w-[340px] relative">
      <div className="overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.10)] border-b border-[rgba(8,145,178,0.20)]">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-3.5 h-3.5 text-[#22d3ee]" />
            <span className="text-xs font-semibold text-foreground">Onboarding Form</span>
          </div>
          <div className="flex items-center gap-1">
            {status === "done" && (
              <button
                onClick={handleRefresh}
                title="Refresh"
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
              <span className="text-xs">Loading...</span>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-2 py-4 justify-center text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs">Failed to load</span>
              <button onClick={handleRefresh} className="text-xs underline text-muted-foreground hover:text-foreground ml-1">Retry</button>
            </div>
          )}

          {status === "done" && (
            <div className="space-y-1">
              {SECTIONS.map((section, idx) => {
                const isOpen = expandedSection === idx;
                const hasContent = section.fields.some(f => getValue(f.key));
                return (
                  <div key={idx} className="rounded-lg overflow-hidden border border-border/30">
                    {/* Section header */}
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

                    {/* Section content */}
                    {isOpen && (
                      <div className="px-2.5 py-2 space-y-1.5 bg-muted/10">
                        {section.fields.map(field => {
                          const val = getValue(field.key);
                          if (!val) return null;
                          return (
                            <div key={field.key}>
                              <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-medium">{field.label}</div>
                              <div className="text-[11px] text-foreground leading-snug mt-0.5 break-words whitespace-pre-wrap">{val}</div>
                            </div>
                          );
                        })}
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
