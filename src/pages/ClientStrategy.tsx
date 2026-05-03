import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { Loader2, Save } from "lucide-react";

interface ClientStrategy {
  id?: string;
  client_id: string;
  posts_per_month: number;
  scripts_per_month: number;
  videos_edited_per_month: number;
  stories_per_week: number;
  mix_reach: number;
  mix_trust: number;
  mix_convert: number;
  primary_platform: string;
  manychat_active: boolean;
  manychat_keyword: string;
  cta_goal: string;
  ads_active: boolean;
  ads_budget: number;
  ads_goal: string;
  audience_score: number;
  uniqueness_score: number;
  monthly_revenue_goal: number;
  monthly_revenue_actual: number;
  content_pillars: string[];
  audience_analysis?: {
    summary: string;
    audience_detail: string;
    uniqueness_detail: string;
    client_posts_analyzed: number;
    emulation_posts_analyzed: number;
    emulation_profiles: string[];
    analyzed_at: string;
    language?: string;
  } | null;
  audience_analyzed_at?: string | null;
}

interface MonthCounts {
  scripts: number;
  videos_edited: number;
  posts_scheduled: number;
}

const DEFAULTS: Omit<ClientStrategy, "client_id"> = {
  posts_per_month: 20,
  scripts_per_month: 20,
  videos_edited_per_month: 20,
  stories_per_week: 10,
  mix_reach: 60,
  mix_trust: 30,
  mix_convert: 10,
  primary_platform: "instagram",
  manychat_active: false,
  manychat_keyword: "",
  cta_goal: "manychat",
  ads_active: false,
  ads_budget: 0,
  ads_goal: "",
  audience_score: 5,
  uniqueness_score: 5,
  monthly_revenue_goal: 0,
  monthly_revenue_actual: 0,
  content_pillars: [],
  audience_analysis: null,
  audience_analyzed_at: null,
};

function calcScore(strategy: ClientStrategy, counts: MonthCounts): number {
  const scriptsPct = Math.min(100, (counts.scripts / Math.max(1, strategy.scripts_per_month)) * 100);
  const videosPct = Math.min(100, (counts.videos_edited / Math.max(1, strategy.videos_edited_per_month)) * 100);
  const calendarPct = Math.min(100, (counts.posts_scheduled / Math.max(1, strategy.posts_per_month)) * 100);
  const manchatPct = strategy.manychat_active ? 100 : 0;
  const audiencePct = ((strategy.audience_score + strategy.uniqueness_score) / 2) * 10;
  return Math.round(scriptsPct * 0.25 + videosPct * 0.25 + calendarPct * 0.20 + manchatPct * 0.15 + audiencePct * 0.15);
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number, en: boolean): string {
  if (score >= 80) return en ? "On Track" : "En Camino";
  if (score >= 50) return en ? "Needs Attention" : "Necesita Atención";
  return en ? "Action Required" : "Acción Requerida";
}

type StatusLevel = "green" | "yellow" | "red";
const STATUS_COLORS: Record<StatusLevel, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
};
const STATUS_BG: Record<StatusLevel, string> = {
  green: "rgba(34,197,94,0.07)",
  yellow: "rgba(245,158,11,0.07)",
  red: "rgba(239,68,68,0.07)",
};
const STATUS_BORDER: Record<StatusLevel, string> = {
  green: "rgba(34,197,94,0.22)",
  yellow: "rgba(245,158,11,0.22)",
  red: "rgba(239,68,68,0.22)",
};

function StatusCard({ status, title, badge, children }: { status: StatusLevel; title: string; badge: string; children: React.ReactNode }) {
  const c = STATUS_COLORS[status];
  const bg = STATUS_BG[status];
  const border = STATUS_BORDER[status];
  return (
    <div className="relative overflow-hidden rounded-[14px] p-[18px_20px]" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[14px]" style={{ background: c }} />
      <div className="flex items-center justify-between mb-3 pl-2">
        <span className="text-[10px] font-bold tracking-[1px] uppercase" style={{ color: c }}>{title}</span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: bg, border: `1px solid ${border}`, color: c }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
          {badge}
        </span>
      </div>
      <div className="pl-2">{children}</div>
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-[7px] rounded-full bg-white/[0.07] overflow-hidden mt-2">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

export default function ClientStrategy() {
  const { clientId } = useParams<{ clientId: string }>();
  const { language } = useLanguage();
  const en = language === "en";

  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [counts, setCounts] = useState<MonthCounts>({ scripts: 0, videos_edited: 0, posts_scheduled: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ClientStrategy | null>(null);
  const [clientOnboarding, setClientOnboarding] = useState<Record<string, unknown>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const analyzingRef = useRef(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data: strat } = await supabase
        .from("client_strategies")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();

      const resolved: ClientStrategy = strat
        ? { ...strat, content_pillars: Array.isArray(strat.content_pillars) ? strat.content_pillars : [] }
        : { client_id: clientId, ...DEFAULTS };
      setStrategy(resolved);

      const { data: clientData } = await supabase
        .from("clients")
        .select("onboarding_data")
        .eq("id", clientId)
        .maybeSingle();
      setClientOnboarding(clientData?.onboarding_data || {});

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const iso = monthStart.toISOString();

      const [{ count: scriptCount }, { count: videoCount }, { count: calCount }] = await Promise.all([
        supabase.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", iso),
        supabase.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
        supabase.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("schedule_date", iso.slice(0, 10)).is("deleted_at", null),
      ]);

      setCounts({ scripts: scriptCount || 0, videos_edited: videoCount || 0, posts_scheduled: calCount || 0 });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const runAnalysis = useCallback(async () => {
    if (!clientId || analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.functions.invoke("analyze-audience-alignment", {
        body: { client_id: clientId, language },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.success) {
        toast.error(en ? "Analysis failed — check Instagram handle in onboarding" : "Análisis falló — revisa el usuario de Instagram");
        return;
      }
      await load();
      toast.success(en ? "Audience analysis complete" : "Análisis de audiencia completado");
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  }, [clientId, en, load]);

  useEffect(() => {
    load().then(() => {
      setStrategy((current) => {
        if (!current) return current;
        const analyzedAt = current.audience_analyzed_at;
        const isStale = !analyzedAt ||
          (Date.now() - new Date(analyzedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
        if (isStale) {
          runAnalysis();
        }
        return current;
      });
    });
  }, [load, runAnalysis]);

  const startEdit = () => { setDraft(strategy ? { ...strategy } : null); setEditing(true); };
  const cancelEdit = () => { setDraft(null); setEditing(false); };

  const saveStrategy = async () => {
    if (!draft || !clientId) return;
    setSaving(true);
    try {
      const payload = { ...draft, client_id: clientId };
      const { error } = await supabase.from("client_strategies").upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
      setStrategy(draft);
      setEditing(false);
      setDraft(null);
      toast.success(en ? "Strategy saved" : "Estrategia guardada");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error saving strategy";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof ClientStrategy, value: unknown) => setDraft(prev => prev ? { ...prev, [field]: value } : prev);

  if (loading) {
    return (
      <PageTransition className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </PageTransition>
    );
  }

  const s = (editing ? draft : strategy) || { client_id: clientId || "", ...DEFAULTS };
  const score = calcScore(s, counts);
  const scoreC = scoreColor(score);

  const paceMin = Math.min(
    counts.scripts / Math.max(1, s.scripts_per_month),
    counts.videos_edited / Math.max(1, s.videos_edited_per_month),
    counts.posts_scheduled / Math.max(1, s.posts_per_month)
  );
  const paceStatus: StatusLevel = paceMin >= 0.7 ? "green" : paceMin >= 0.3 ? "yellow" : "red";
  const manchatStatus: StatusLevel = s.manychat_active && s.manychat_keyword ? "green" : s.manychat_active ? "yellow" : "red";
  const audienceAvg = (s.audience_score + s.uniqueness_score) / 2;
  const audienceStatus: StatusLevel = audienceAvg >= 7 ? "green" : audienceAvg >= 4 ? "yellow" : "red";
  const adsStatus: StatusLevel = s.ads_active ? "green" : "yellow";
  const revPct = s.monthly_revenue_goal > 0 ? Math.min(100, (s.monthly_revenue_actual / s.monthly_revenue_goal) * 100) : 0;
  const revStatus: StatusLevel = revPct >= 70 ? "green" : revPct >= 30 ? "yellow" : "red";

  const input = (field: keyof ClientStrategy, type: "text" | "number" | "boolean" = "text") => {
    if (!editing) return null;
    if (type === "boolean") {
      return (
        <button
          onClick={() => set(field, !s[field])}
          className="text-[11px] font-semibold px-3 py-1 rounded-md transition-colors"
          style={{
            background: s[field] ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
            color: s[field] ? "#22c55e" : "rgba(255,255,255,0.4)",
            border: s[field] ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {s[field] ? (en ? "Yes" : "Sí") : "No"}
        </button>
      );
    }
    return (
      <input
        type={type}
        value={String(s[field] ?? "")}
        onChange={e => set(field, type === "number" ? Number(e.target.value) : e.target.value)}
        className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary/60 w-full"
      />
    );
  };

  return (
    <PageTransition className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-foreground">{en ? "Content Strategy" : "Estrategia de Contenido"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{en ? "Robby reads this before every content decision" : "Robby lee esto antes de cada decisión de contenido"}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="text-xs font-semibold px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">{en ? "Cancel" : "Cancelar"}</button>
              <button
                onClick={saveStrategy}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#0891B2,#84CC16)" }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {en ? "Save" : "Guardar"}
              </button>
            </>
          ) : (
            <button onClick={startEdit} className="text-xs font-semibold px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.1] text-muted-foreground hover:text-foreground transition-colors">
              {en ? "Edit Strategy" : "Editar Estrategia"}
            </button>
          )}
        </div>
      </div>

      {/* Fulfillment Score */}
      <div className="glass-card rounded-xl p-5 mb-4 flex items-center gap-6">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
            <circle cx="40" cy="40" r="32" fill="none" stroke={scoreC} strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - score / 100)}`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black" style={{ color: scoreC }}>{score}</span>
            <span className="text-[9px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: scoreC }}>{scoreLabel(score, en)}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-2">{en ? "Robby tracks your content pace, mix, and automation health." : "Robby monitorea tu ritmo de contenido, mezcla y automatizaciones."}</p>
          <div className="flex flex-col gap-1">
            {[
              { label: en ? "Scripts" : "Guiones", pct: Math.round(Math.min(100, (counts.scripts / Math.max(1, s.scripts_per_month)) * 100)) },
              { label: en ? "Videos edited" : "Videos editados", pct: Math.round(Math.min(100, (counts.videos_edited / Math.max(1, s.videos_edited_per_month)) * 100)) },
              { label: en ? "Posts scheduled" : "Posts programados", pct: Math.round(Math.min(100, (counts.posts_scheduled / Math.max(1, s.posts_per_month)) * 100)) },
              { label: "ManyChat", pct: s.manychat_active ? 100 : 0 },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: item.pct >= 70 ? "#22c55e" : item.pct >= 30 ? "#f59e0b" : "#ef4444" }} />
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
                <span className="text-[10px] font-semibold ml-auto" style={{ color: item.pct >= 70 ? "#22c55e" : item.pct >= 30 ? "#f59e0b" : "#ef4444" }}>{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">

        {/* Monthly Pace */}
        <StatusCard status={paceStatus} title={en ? "Monthly Pace" : "Ritmo Mensual"} badge={paceStatus === "green" ? (en ? "On Track" : "En Camino") : paceStatus === "yellow" ? (en ? "Needs Work" : "Necesita Trabajo") : (en ? "Behind" : "Atrasado")}>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: en ? "Scripts" : "Guiones", count: counts.scripts, target: s.scripts_per_month, field: "scripts_per_month" as keyof ClientStrategy },
              { label: en ? "Videos Edited" : "Videos Editados", count: counts.videos_edited, target: s.videos_edited_per_month, field: "videos_edited_per_month" as keyof ClientStrategy },
              { label: en ? "Posts Scheduled" : "Posts Programados", count: counts.posts_scheduled, target: s.posts_per_month, field: "posts_per_month" as keyof ClientStrategy },
            ].map(item => {
              const pct = Math.min(100, (item.count / Math.max(1, item.target)) * 100);
              const c = pct >= 70 ? "#22c55e" : pct >= 30 ? "#f59e0b" : "#ef4444";
              return (
                <div key={item.label}>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{item.label}</div>
                  <div className="text-lg font-black" style={{ color: c }}>
                    {item.count} <span className="text-xs font-normal text-white/25">/ {item.target}</span>
                  </div>
                  {editing && <div className="mt-1">{input(item.field, "number")}</div>}
                  <ProgressBar pct={pct} color={c} />
                </div>
              );
            })}
          </div>
        </StatusCard>

        {/* Content Mix */}
        <StatusCard status="green" title={en ? "Content Mix" : "Mezcla de Contenido"} badge={en ? "Configured" : "Configurado"}>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-2">
            <div style={{ width: `${s.mix_reach}%`, background: "#22d3ee", borderRadius: "999px" }} />
            <div style={{ width: `${s.mix_trust}%`, background: "#a3e635", borderRadius: "999px" }} />
            <div style={{ width: `${s.mix_convert}%`, background: "#f59e0b", borderRadius: "999px" }} />
          </div>
          <div className="flex gap-4 flex-wrap mb-2">
            {[
              { label: en ? "Reach" : "Alcance", value: s.mix_reach, color: "#22d3ee", field: "mix_reach" as keyof ClientStrategy },
              { label: en ? "Trust" : "Confianza", value: s.mix_trust, color: "#a3e635", field: "mix_trust" as keyof ClientStrategy },
              { label: en ? "Convert" : "Conversión", value: s.mix_convert, color: "#f59e0b", field: "mix_convert" as keyof ClientStrategy },
            ].map(item => (
              <div key={String(item.field)} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                <span className="text-[10px] text-white/40">{item.label}:</span>
                {editing
                  ? <input type="number" value={item.value} onChange={e => set(item.field, Number(e.target.value))} className="bg-white/[0.06] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white w-12 outline-none" />
                  : <span className="text-[11px] font-bold" style={{ color: item.color }}>{item.value}%</span>
                }
              </div>
            ))}
          </div>
          {editing && <p className="text-[10px] text-white/25">{en ? "Percentages must add up to 100" : "Los porcentajes deben sumar 100"}</p>}
        </StatusCard>

        {/* Audience Alignment */}
        <StatusCard
          status={audienceStatus}
          title={en ? "Audience Alignment" : "Alineación con Audiencia"}
          badge={
            analyzing
              ? (en ? "Analyzing..." : "Analizando...")
              : audienceStatus === "green"
                ? (en ? "Strong" : "Fuerte")
                : audienceStatus === "yellow"
                  ? (en ? "Needs Work" : "Necesita Trabajo")
                  : (en ? "Weak" : "Débil")
          }
        >
          {!clientOnboarding.instagram && (
            <p className="text-[11px] mb-3" style={{ color: "#f59e0b" }}>
              {en
                ? "Add your Instagram handle in onboarding to enable auto-analysis."
                : "Agrega tu usuario de Instagram en el onboarding para activar el análisis."}
            </p>
          )}
          {clientOnboarding.instagram && !clientOnboarding.top3Profiles && (
            <div className="flex items-start gap-2 mb-3 px-2.5 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <span style={{ color: "#f59e0b", fontSize: 13, lineHeight: 1.2, marginTop: 1 }}>⚠</span>
              <p className="text-[11px] leading-relaxed" style={{ color: "#f59e0b" }}>
                {en
                  ? "No reference accounts added. Scores are based only on stated goals — add competitor or inspiration profiles in onboarding for a real benchmark."
                  : "Sin cuentas de referencia. Los puntajes se basan solo en los objetivos declarados — agrega perfiles de referencia en el onboarding para un benchmark real."}
              </p>
            </div>
          )}

          {[
            {
              label: en ? "Talking to the right people?" : "¿Hablando con las personas correctas?",
              score: s.audience_score,
              detail: s.audience_analysis?.audience_detail,
            },
            {
              label: en ? "Content unique enough to stop the scroll?" : "¿El contenido es único para parar el scroll?",
              score: s.uniqueness_score,
              detail: s.audience_analysis?.uniqueness_detail,
            },
          ].map(({ label, score, detail }) => (
            <div key={label} className="mb-3">
              <div className="flex justify-between items-center text-[12px] text-white/70 mb-1">
                <span>{label}</span>
                <span className="font-bold text-white">{score}/10</span>
              </div>
              <ProgressBar pct={score * 10} color={STATUS_COLORS[audienceStatus]} />
              {detail && (
                <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>{detail}</p>
              )}
            </div>
          ))}

          {s.audience_analysis?.summary && (
            <p className="text-[12px] mt-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {s.audience_analysis.summary}
            </p>
          )}

          {/* Language mismatch nudge */}
          {s.audience_analysis?.language && s.audience_analysis.language !== language && !analyzing && (
            <button
              onClick={runAnalysis}
              className="w-full text-[11px] text-left px-2.5 py-2 rounded-lg mb-3 transition-opacity hover:opacity-80"
              style={{ background: "rgba(34,211,238,0.07)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.15)" }}
            >
              {en ? "Analysis is in another language — click to re-analyze in English" : "El análisis está en otro idioma — toca para re-analizar en español"}
            </button>
          )}

          <div className="flex items-center justify-between mt-4">
            {s.audience_analyzed_at ? (
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                {en ? "Analyzed" : "Analizado"}{" "}
                {Math.floor((Date.now() - new Date(s.audience_analyzed_at).getTime()) / 86400000)}
                {en ? "d ago" : "d atrás"}{" "}
                · {s.audience_analysis?.client_posts_analyzed ?? 0} posts
              </span>
            ) : (
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                {analyzing ? (en ? "Running analysis..." : "Ejecutando análisis...") : (en ? "Never analyzed" : "Sin analizar")}
              </span>
            )}
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-opacity disabled:opacity-40"
              style={{
                background: "rgba(34,211,238,0.1)",
                color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.2)",
              }}
            >
              {analyzing
                ? (en ? "Analyzing..." : "Analizando...")
                : (en ? "Re-analyze" : "Re-analizar")}
            </button>
          </div>
        </StatusCard>

        {/* ManyChat & CTAs */}
        <StatusCard status={manchatStatus} title="ManyChat & CTAs" badge={s.manychat_active ? (en ? "Active" : "Activo") : (en ? "Not Set Up" : "No Configurado")}>
          <div className="flex flex-col gap-2">
            {[
              { label: en ? "ManyChat active" : "ManyChat activo", field: "manychat_active" as keyof ClientStrategy, type: "boolean" as const },
              { label: en ? "Automation keyword" : "Palabra clave", field: "manychat_keyword" as keyof ClientStrategy, type: "text" as const },
              { label: en ? "CTA goal" : "Objetivo del CTA", field: "cta_goal" as keyof ClientStrategy, type: "text" as const },
            ].map(item => (
              <div key={String(item.field)} className="flex items-center justify-between text-[12px]">
                <span className="text-white/45">{item.label}</span>
                {editing
                  ? input(item.field, item.type)
                  : <span className="font-semibold text-white">{item.type === "boolean" ? (s[item.field] ? (en ? "Yes" : "Sí") : "No") : (String(s[item.field] || "—"))}</span>
                }
              </div>
            ))}
          </div>
        </StatusCard>

        {/* Stories + Ads */}
        <div className="grid grid-cols-2 gap-3">
          <StatusCard status="yellow" title={en ? "Stories" : "Historias"} badge={en ? "Target Set" : "Meta Definida"}>
            <div className="text-[11px] text-white/40 mb-1">{en ? "Target per week" : "Meta por semana"}</div>
            {editing
              ? input("stories_per_week", "number")
              : <div className="text-2xl font-black text-foreground">{s.stories_per_week}<span className="text-xs font-normal text-white/25"> / {en ? "week" : "semana"}</span></div>
            }
          </StatusCard>

          <StatusCard status={adsStatus} title={en ? "Ads" : "Anuncios"} badge={s.ads_active ? (en ? "Running" : "Activos") : (en ? "Not Running" : "No Activos")}>
            <div className="flex flex-col gap-2">
              {[
                { label: en ? "Running ads" : "Corriendo anuncios", field: "ads_active" as keyof ClientStrategy, type: "boolean" as const },
                { label: en ? "Monthly budget" : "Presupuesto mensual", field: "ads_budget" as keyof ClientStrategy, type: "number" as const },
              ].map(item => (
                <div key={String(item.field)} className="flex items-center justify-between text-[12px]">
                  <span className="text-white/45">{item.label}</span>
                  {editing
                    ? input(item.field, item.type)
                    : <span className="font-semibold text-white">{item.type === "boolean" ? (s[item.field] ? (en ? "Yes" : "Sí") : "No") : (item.field === "ads_budget" ? `$${(s.ads_budget || 0).toLocaleString()}` : String(s[item.field] || "—"))}</span>
                  }
                </div>
              ))}
            </div>
          </StatusCard>
        </div>

        {/* Monetization */}
        {(s.monthly_revenue_goal > 0 || editing) && (
          <StatusCard status={revStatus} title={en ? "Monetization" : "Monetización"} badge={revStatus === "green" ? (en ? "On Track" : "En Camino") : revStatus === "yellow" ? (en ? "Needs Work" : "Necesita Trabajo") : (en ? "Behind" : "Atrasado")}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{en ? "Monthly Goal" : "Meta Mensual"}</div>
                {editing
                  ? input("monthly_revenue_goal", "number")
                  : <div className="text-lg font-black text-foreground">${s.monthly_revenue_goal.toLocaleString()}</div>
                }
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{en ? "This Month" : "Este Mes"}</div>
                {editing
                  ? input("monthly_revenue_actual", "number")
                  : <div className="text-lg font-black" style={{ color: STATUS_COLORS[revStatus] }}>${s.monthly_revenue_actual.toLocaleString()}</div>
                }
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{en ? "Gap" : "Diferencia"}</div>
                <div className="text-lg font-black" style={{ color: s.monthly_revenue_actual >= s.monthly_revenue_goal ? "#22c55e" : "#ef4444" }}>
                  {s.monthly_revenue_actual >= s.monthly_revenue_goal ? "✓" : "-$" + (s.monthly_revenue_goal - s.monthly_revenue_actual).toLocaleString()}
                </div>
              </div>
            </div>
            <ProgressBar pct={revPct} color={STATUS_COLORS[revStatus]} />
          </StatusCard>
        )}

      </div>
    </PageTransition>
  );
}
