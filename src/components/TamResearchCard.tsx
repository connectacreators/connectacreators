// src/components/TamResearchCard.tsx
//
// "Research" for the script detail page: estimates the video topic's TAM
// (total addressable market — how many people would actually find this
// topic relevant) via the ai-build-script "research-tam" step, which runs
// 2-3 quick web searches server-side and returns a structured estimate.
// Strictly on-demand — nothing runs until the user clicks Research. The
// result persists to scripts.tam_research (saved by the edge fn under the
// caller's RLS) so revisits show the last estimate without re-spending.

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface TamResult {
  tam_people: number;
  tam_label: string;
  audience: string;
  relevance: "low" | "medium" | "high";
  reasoning: string;
  researched_at?: string;
}

/** Crowd meter: how many of the 5 person icons light up for a given TAM. */
function peopleIconCount(n: number): number {
  if (n >= 10_000_000) return 5;
  if (n >= 1_000_000) return 4;
  if (n >= 100_000) return 3;
  if (n >= 10_000) return 2;
  return 1;
}

const RELEVANCE_COLOR: Record<TamResult["relevance"], string> = {
  low: "hsl(var(--destructive))",
  medium: "hsl(var(--honey))",
  high: "hsl(var(--aqua))",
};

const RELEVANCE_LABEL: Record<TamResult["relevance"], { en: string; es: string }> = {
  low: { en: "Low relevance", es: "Relevancia baja" },
  medium: { en: "Medium relevance", es: "Relevancia media" },
  high: { en: "High relevance", es: "Relevancia alta" },
};

interface Props {
  scriptId: string;
  /** Topic sent to the researcher (winning idea / title). */
  topic: string;
  /** Full script text — grounds the estimate in the exact angle. */
  scriptBody: string;
  /** Language of the script — the estimate comes back in it. */
  scriptLanguage: "en" | "es";
  /** UI language for the card's own labels. */
  uiLanguage: "en" | "es";
}

export function TamResearchCard({ scriptId, topic, scriptBody, scriptLanguage, uiLanguage }: Props) {
  const { showOutOfCreditsModal } = useOutOfCredits();
  const [result, setResult] = useState<TamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const es = uiLanguage === "es";

  // Load the saved estimate (if any) — read-only, no research triggered.
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    // tam_research isn't in the generated Database types yet — untyped read.
    (supabase as any)
      .from("scripts")
      .select("tam_research")
      .eq("id", scriptId)
      .maybeSingle()
      .then(({ data }: { data: { tam_research: TamResult | null } | null }) => {
        if (!cancelled && data?.tam_research?.tam_people != null) setResult(data.tam_research);
      });
    return () => {
      cancelled = true;
    };
  }, [scriptId]);

  const runResearch = useCallback(async () => {
    if (!topic.trim() && !scriptBody.trim()) {
      toast.error(es ? "El guion está vacío — no hay tema que investigar." : "The script is empty — nothing to research.");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          step: "research-tam",
          topic: topic.trim() || scriptBody.trim().slice(0, 200),
          scriptBody,
          language: scriptLanguage,
          scriptId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        toast.error(json.error || (es ? "La investigación falló — intenta de nuevo." : "Research failed — try again."));
        return;
      }
      if (json.tam?.tam_people != null) setResult(json.tam);
      else toast.error(es ? "No se pudo estimar — intenta de nuevo." : "Couldn't estimate — try again.");
    } catch {
      toast.error(es ? "Error investigando el tema." : "Error researching the topic.");
    } finally {
      setLoading(false);
    }
  }, [topic, scriptBody, scriptLanguage, scriptId, es, showOutOfCreditsModal]);

  const lit = result ? peopleIconCount(result.tam_people) : 0;
  const color = result ? RELEVANCE_COLOR[result.relevance] ?? "hsl(var(--honey))" : undefined;

  return (
    <div className="editorial-card" style={{ padding: "16px 20px" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {/* Crowd meter — 5 person slots, lit count scales with audience size */}
          <div className="flex items-end gap-0.5 shrink-0" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <User
                key={i}
                className="w-4 h-4"
                style={{
                  color: result && i < lit ? color : "hsl(var(--bone) / 0.18)",
                  fill: result && i < lit ? color : "none",
                }}
              />
            ))}
          </div>

          {result ? (
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-serif font-semibold text-foreground" style={{ fontSize: 22, lineHeight: 1 }}>
                  {result.tam_label || Intl.NumberFormat(es ? "es" : "en", { notation: "compact" }).format(result.tam_people)}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {es ? "personas interesadas en este tema" : "people interested in this topic"}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ color, background: "hsl(var(--bone) / 0.06)" }}
                >
                  {RELEVANCE_LABEL[result.relevance]?.[uiLanguage] ?? result.relevance}
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground mt-1 truncate" title={result.audience}>
                {result.audience}
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground">
                {es ? "Tamaño de audiencia (TAM)" : "Audience size (TAM)"}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {es
                  ? "Investiga cuántas personas encuentran relevante este tema."
                  : "Research how many people actually find this topic relevant."}
              </div>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={runResearch}
          disabled={loading}
          className="gap-1.5 shrink-0"
          title={es ? "50 créditos por investigación" : "50 credits per research"}
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {es ? "Investigando…" : "Researching…"}
            </>
          ) : result ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              {es ? "Reinvestigar" : "Re-run"}
            </>
          ) : (
            <>
              <Search className="w-3.5 h-3.5" />
              {es ? "Investigar" : "Research"}
            </>
          )}
        </Button>
      </div>

      {result?.reasoning && (
        <div className="text-[11.5px] text-muted-foreground/80 mt-2 leading-relaxed">
          {result.reasoning}
          <span className="text-muted-foreground/50">
            {" · "}
            {es ? "50 créditos por ronda" : "50 credits per round"}
          </span>
        </div>
      )}
    </div>
  );
}
