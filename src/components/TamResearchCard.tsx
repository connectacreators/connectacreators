// src/components/TamResearchCard.tsx
//
// "Research" for the script detail page: estimates the video topic's TAM
// (total addressable market — how many people would actually find this
// topic relevant) via the ai-build-script "research-tam" step, which runs
// 2-3 quick web searches server-side and returns a structured estimate.
// Strictly on-demand — nothing runs until the user clicks Research. The
// result persists to scripts.tam_research (saved by the edge fn under the
// caller's RLS) so revisits show the last estimate without re-spending.
//
// Card stays compact: crowd meter + count + one-line audience. The full
// breakdown (anchor figures, reasoning, re-run) lives in the See-more
// dialog. While researching, the person icons pulse in a wave.

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, User, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface TamResult {
  tam_people: number;
  tam_label: string;
  audience: string;
  relevance: "low" | "medium" | "high";
  reasoning: string;
  /** 2-4 anchor-figure bullets (newer results only). */
  breakdown?: string[];
  researched_at?: string;
}

/** Crowd meter: how many of the 5 person icons light up for a given TAM.
 *  Scaled so only world-scale topics (World Cup / Messi tier, 200M+) max out. */
function peopleIconCount(n: number): number {
  if (n >= 200_000_000) return 5;
  if (n >= 50_000_000) return 4;
  if (n >= 5_000_000) return 3;
  if (n >= 500_000) return 2;
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

/** 5-slot person meter. While loading, the icons pulse in a rolling wave. */
function CrowdMeter({
  lit,
  color,
  loading,
  size = 16,
}: {
  lit: number;
  color?: string;
  loading?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-end gap-0.5 shrink-0" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => {
        const on = !loading && lit > i;
        return (
          <User
            key={i}
            style={{
              width: size,
              height: size,
              color: loading
                ? "hsl(var(--honey))"
                : on
                  ? color
                  : "hsl(var(--bone) / 0.18)",
              fill: loading || on ? "currentColor" : "none",
              opacity: loading ? 0.2 : 1,
              animation: loading ? `tam-wave 1.1s ease-in-out ${i * 0.14}s infinite` : undefined,
            }}
          />
        );
      })}
      {loading && (
        <style>{`
          @keyframes tam-wave {
            0%, 100% { opacity: 0.15; transform: translateY(0); }
            35% { opacity: 1; transform: translateY(-2px); }
            70% { opacity: 0.15; transform: translateY(0); }
          }
        `}</style>
      )}
    </div>
  );
}

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
  const [detailOpen, setDetailOpen] = useState(false);
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
  const label = result
    ? result.tam_label ||
      Intl.NumberFormat(es ? "es" : "en", { notation: "compact" }).format(result.tam_people)
    : "";

  return (
    <div className="editorial-card" style={{ padding: "14px 20px" }}>
      <div className="flex items-center gap-3">
        <CrowdMeter lit={lit} color={color} loading={loading} />

        {loading ? (
          <div className="text-[13px] text-muted-foreground flex-1 min-w-0">
            {es ? "Investigando el tamaño de la audiencia…" : "Researching audience size…"}
          </div>
        ) : result ? (
          <>
            <span className="font-serif font-semibold text-foreground shrink-0" style={{ fontSize: 22, lineHeight: 1 }}>
              {label}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
              style={{ color, background: "hsl(var(--bone) / 0.06)" }}
            >
              {RELEVANCE_LABEL[result.relevance]?.[uiLanguage] ?? result.relevance}
            </span>
            <span className="text-[12px] text-muted-foreground truncate flex-1 min-w-0" title={result.audience}>
              {result.audience}
            </span>
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              {es ? "Tamaño de audiencia (TAM)" : "Audience size (TAM)"}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">
              {es
                ? "Investiga cuántas personas encuentran relevante este tema."
                : "Research how many people actually find this topic relevant."}
            </div>
          </div>
        )}

        {!loading && (
          result ? (
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)} className="shrink-0 ml-auto">
              {es ? "Ver más" : "See more"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={runResearch}
              className="gap-1.5 shrink-0 ml-auto"
              title={es ? "50 créditos por investigación" : "50 credits per research"}
            >
              <Search className="w-3.5 h-3.5" />
              {es ? "Investigar" : "Research"}
            </Button>
          )
        )}
      </div>

      {/* ── Detail dialog — full breakdown + re-run ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              {es ? "Investigación de audiencia" : "Audience research"}
            </DialogTitle>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CrowdMeter lit={lit} color={color} loading={loading} size={20} />
                <span className="font-serif font-semibold text-foreground" style={{ fontSize: 30, lineHeight: 1 }}>
                  {label}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ color, background: "hsl(var(--bone) / 0.06)" }}
                >
                  {RELEVANCE_LABEL[result.relevance]?.[uiLanguage] ?? result.relevance}
                </span>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold mb-1">
                  {es ? "Quiénes son" : "Who they are"}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{result.audience}</p>
              </div>

              {(result.breakdown?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold mb-1">
                    {es ? "Cifras encontradas" : "Figures found"}
                  </div>
                  <ul className="space-y-1.5">
                    {result.breakdown!.map((b, i) => (
                      <li key={i} className="text-sm text-foreground/90 leading-relaxed flex gap-2">
                        <span className="text-primary/70 shrink-0 mt-[1px]">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-semibold mb-1">
                  {es ? "Cómo se estimó" : "How it was estimated"}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{result.reasoning}</p>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground">
                  {result.researched_at
                    ? new Date(result.researched_at).toLocaleDateString(es ? "es" : "en", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : ""}
                  {" · "}
                  {es ? "50 créditos por ronda" : "50 credits per round"}
                </span>
                <Button variant="outline" size="sm" onClick={runResearch} disabled={loading} className="gap-1.5">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {es ? "Reinvestigar" : "Re-run"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
