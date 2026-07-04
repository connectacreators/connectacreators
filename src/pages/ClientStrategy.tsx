import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { ProductionPipelineSection } from "@/components/strategy/ProductionPipelineSection";
import { StrategySetupCard } from "@/components/strategy/StrategySetupCard";
import { Loader2, Save } from "lucide-react";
import { toProfilesArray } from "@/lib/onboarding/richText";
import { monthWindow, pacePct, paceState, expectedByToday, fulfillmentScore } from "@/lib/strategy/pace";

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
  // Production pipeline (Task 1 migration)
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  pipeline_notes:     string | null;
  pipeline_state:     Record<string, { done_at: string }>;
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
  videos_published: number;
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
  onboarding_call_at: null,
  script_due_at:      null,
  editing_due_at:     null,
  next_filming_at:    null,
  boosting_at:        null,
  posting_at:         null,
  pipeline_notes:     null,
  pipeline_state:     {},
  audience_analysis: null,
  audience_analyzed_at: null,
};

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number, en: boolean, isCurrent: boolean, dayOf: number): string {
  if (score >= 80) return en ? "On Track" : "En Camino";
  if (score >= 50) {
    if (isCurrent && dayOf <= 7) return en ? "Tracking — early in month" : "En seguimiento — inicio de mes";
    return en ? "Needs Attention" : "Necesita Atención";
  }
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

function ProgressBar({ pct, color, tickPct }: { pct: number; color: string; tickPct?: number }) {
  return (
    <div className="relative h-1.5 rounded-full bg-white/10 mt-1.5">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }} />
      {tickPct !== undefined && (
        <div className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-white/55"
          style={{ left: `${Math.min(100, tickPct)}%` }} />
      )}
    </div>
  );
}

export default function ClientStrategy() {
  const { clientId } = useParams<{ clientId: string }>();
  const { language } = useLanguage();
  const en = language === "en";

  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [counts, setCounts] = useState<MonthCounts>({ scripts: 0, videos_edited: 0, videos_published: 0, posts_scheduled: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ClientStrategy | null>(null);
  const [clientOnboarding, setClientOnboarding] = useState<Record<string, unknown>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const analyzingRef = useRef(false);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>({
    year: now.getFullYear(), month: now.getMonth(),
  });
  const [firstActive, setFirstActive] = useState<{ year: number; month: number } | null>(null);
  const win = monthWindow(viewMonth.year, viewMonth.month);

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

      const [{ data: firstScript }, { data: firstVideo }] = await Promise.all([
        supabase
          .from("scripts").select("created_at").eq("client_id", clientId)
          .neq("status", "draft")
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase
          .from("video_edits").select("created_at").eq("client_id", clientId)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);
      const candidateDates = [firstScript?.created_at, firstVideo?.created_at].filter(
        (v): v is string => !!v,
      );
      if (candidateDates.length > 0) {
        const minIso = candidateDates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
        const d = new Date(minIso);
        setFirstActive({ year: d.getFullYear(), month: d.getMonth() });
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const loadCounts = useCallback(async (w: { startIso: string; endIso: string }) => {
    if (!clientId) return;
    const [{ count: scriptCount }, { count: videoCount }, { count: publishedCount }, { count: calCount }] = await Promise.all([
      supabase.from("scripts").select("id", { count: "exact", head: true })
        .eq("client_id", clientId).neq("status", "draft")
        .gte("created_at", w.startIso).lt("created_at", w.endIso),
      supabase.from("video_edits").select("id", { count: "exact", head: true })
        .eq("client_id", clientId).is("deleted_at", null)
        .gte("file_submitted_at", w.startIso).lt("file_submitted_at", w.endIso),
      supabase.from("video_edits").select("id", { count: "exact", head: true })
        .eq("client_id", clientId).is("deleted_at", null)
        .gte("published_at", w.startIso).lt("published_at", w.endIso),
      supabase.from("video_edits").select("id", { count: "exact", head: true })
        .eq("client_id", clientId).is("deleted_at", null)
        .gte("schedule_date", w.startIso).lt("schedule_date", w.endIso),
    ]);
    setCounts({
      scripts: scriptCount || 0,
      videos_edited: videoCount || 0,
      videos_published: publishedCount || 0,
      posts_scheduled: calCount || 0,
    });
  }, [clientId]);

  useEffect(() => { loadCounts(monthWindow(viewMonth.year, viewMonth.month)); }, [viewMonth, loadCounts]);

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

  // Multi-field variant of persistField: one upsert for related fields that
  // must land together (e.g. Done flow writes pipeline_state + the date field).
  // Two sequential persistField calls would both close over the same stale
  // `strategy` snapshot and the second write would erase the first.
  const persistFields = useCallback(async (patch: Partial<ClientStrategy>) => {
    if (!clientId || !strategy) return;
    const next: ClientStrategy = { ...strategy, ...patch };
    try {
      const { error } = await supabase
        .from("client_strategies")
        .upsert({ ...next, client_id: clientId }, { onConflict: "client_id" });
      if (error) throw error;
      setStrategy(next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (en ? "Error saving" : "Error al guardar");
      toast.error(msg);
    }
  }, [clientId, strategy, en]);

  // Inline edit (production pipeline): persist a single field immediately
  // without entering global edit mode. Used by double-click-to-edit on the
  // pipeline rows. Silent on success; toasts only on error.
  const persistField = useCallback(async <K extends keyof ClientStrategy>(field: K, value: ClientStrategy[K]) => {
    return persistFields({ [field]: value } as Partial<ClientStrategy>);
  }, [persistFields]);

  if (loading) {
    return (
      <PageTransition className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </PageTransition>
    );
  }

  const s = (editing ? draft : strategy) || { client_id: clientId || "", ...DEFAULTS };
  const score = strategy ? fulfillmentScore({
    scripts: counts.scripts, edited: counts.videos_edited, scheduled: counts.posts_scheduled,
    scriptsTarget: s.scripts_per_month, editedTarget: s.videos_edited_per_month,
    scheduledTarget: s.posts_per_month,
    manychatActive: s.manychat_active, audienceScore: s.audience_score, uniquenessScore: s.uniqueness_score,
  }, win) : 0;
  const scoreC = scoreColor(score);

  const behind = [
    paceState(counts.scripts, s.scripts_per_month, win),
    paceState(counts.videos_edited, s.videos_edited_per_month, win),
    paceState(counts.videos_published, s.videos_edited_per_month, win),
    paceState(counts.posts_scheduled, s.posts_per_month, win),
  ].filter(st => st === "behind").length;
  const paceStatus: StatusLevel = behind === 0 ? "green" : behind <= 2 ? "yellow" : "red";
  const audienceAvg = (s.audience_score + s.uniqueness_score) / 2;
  const audienceStatus: StatusLevel = audienceAvg >= 7 ? "green" : audienceAvg >= 4 ? "yellow" : "red";

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
        <div className="flex items-center gap-3">
          {/* Instagram profile picture */}
          {(s.audience_analysis as any)?.profilePicUrl ? (
            <img
              src={(s.audience_analysis as any).profilePicUrl}
              alt="Instagram"
              className="w-11 h-11 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid hsl(var(--aqua) / 0.3)" }}
            />
          ) : clientOnboarding.instagram ? (
            <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
              style={{ background: "hsl(var(--aqua) / 0.1)", border: "2px solid hsl(var(--aqua) / 0.2)", color: "hsl(var(--aqua))" }}>
              {String(clientOnboarding.instagram).replace(/^@/, "").slice(0, 2).toUpperCase()}
            </div>
          ) : null}
          <div>
            <h1 className="text-xl font-black text-foreground font-serif">{en ? "Content Strategy" : "Estrategia de Contenido"}</h1>
            {clientOnboarding.instagram ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                @{String(clientOnboarding.instagram).replace(/^@/, "")}
                {(s.audience_analysis as any)?.followers ? ` · ${((s.audience_analysis as any).followers as number).toLocaleString()} followers` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">{en ? "Robby reads this before every content decision" : "Robby lee esto antes de cada decisión de contenido"}</p>
            )}
          </div>
        </div>
        {(() => {
          const monthNames = en
            ? ["January","February","March","April","May","June","July","August","September","October","November","December"]
            : ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
          const atCurrent = viewMonth.year === now.getFullYear() && viewMonth.month === now.getMonth();
          const atFirst = !!firstActive && viewMonth.year === firstActive.year && viewMonth.month === firstActive.month;
          const shift = (d: number) => setViewMonth(v => {
            const m = new Date(v.year, v.month + d, 1);
            return { year: m.getFullYear(), month: m.getMonth() };
          });
          return (
            <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 px-1 py-1">
              <button onClick={() => shift(-1)} disabled={atFirst}
                className="w-7 h-7 rounded-full text-white/60 hover:bg-white/10 disabled:opacity-25"
                aria-label={en ? "Previous month" : "Mes anterior"}>‹</button>
              <div className="min-w-[120px] text-center">
                <div className="text-[13px] font-semibold leading-tight">{monthNames[viewMonth.month]} {viewMonth.year}</div>
                <div className="text-[9px] uppercase tracking-widest text-white/35">
                  {win.isCurrent
                    ? (en ? `day ${win.dayOf} of ${win.daysInMonth}` : `día ${win.dayOf} de ${win.daysInMonth}`)
                    : (en ? "final" : "final")}
                </div>
              </div>
              <button onClick={() => shift(1)} disabled={atCurrent}
                className="w-7 h-7 rounded-full text-white/60 hover:bg-white/10 disabled:opacity-25"
                aria-label={en ? "Next month" : "Mes siguiente"}>›</button>
            </div>
          );
        })()}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="text-xs font-semibold px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors">{en ? "Cancel" : "Cancelar"}</button>
              <button
                onClick={saveStrategy}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,hsl(var(--aqua)),hsl(var(--honey)))" }}
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
          <p className="text-sm font-bold" style={{ color: scoreC }}>{scoreLabel(score, en, win.isCurrent, win.dayOf)}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            {win.isCurrent
              ? (en ? "Scored against where the month should be by today." : "Calificado contra dónde debería ir el mes hoy.")
              : (en ? "Final score for this month." : "Puntaje final de este mes.")}
          </p>
          <div className="flex flex-col gap-1">
            {[
              { label: en ? "Scripts" : "Guiones", pct: pacePct(counts.scripts, s.scripts_per_month, win) },
              { label: en ? "Videos edited" : "Videos editados", pct: pacePct(counts.videos_edited, s.videos_edited_per_month, win) },
              { label: en ? "Published" : "Publicados", pct: pacePct(counts.videos_published, s.videos_edited_per_month, win) },
              { label: en ? "Posts scheduled" : "Posts programados", pct: pacePct(counts.posts_scheduled, s.posts_per_month, win) },
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
        <StatusCard
          status={paceStatus}
          title={en ? "Monthly Pace" : "Ritmo Mensual"}
          badge={
            win.isCurrent
              ? (behind === 0 ? (en ? "On pace" : "Al día") : (en ? `${behind} behind pace` : `${behind} atrasados`))
              : (behind === 0 ? (en ? "Hit all targets" : "Todas las metas") : (en ? `${4 - behind}/4 targets` : `${4 - behind}/4 metas`))
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { label: en ? "Scripts" : "Guiones", count: counts.scripts, target: s.scripts_per_month, field: "scripts_per_month" },
              { label: en ? "Videos Edited" : "Videos Editados", count: counts.videos_edited, target: s.videos_edited_per_month, field: "videos_edited_per_month" },
              { label: en ? "Published" : "Publicados", count: counts.videos_published, target: s.videos_edited_per_month, field: null },
              { label: en ? "Posts Scheduled" : "Posts Programados", count: counts.posts_scheduled, target: s.posts_per_month, field: "posts_per_month" },
            ] as { label: string; count: number; target: number; field: keyof ClientStrategy | null }[]).map(item => {
              const exp = expectedByToday(item.target, win);
              const st = paceState(item.count, item.target, win);
              const c = st === "ahead" ? "#22c55e" : st === "close" ? "#f59e0b" : "#ef4444";
              const fillPct = Math.min(100, (item.count / Math.max(1, item.target)) * 100);
              return (
                <div key={item.label}>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{item.label}</div>
                  <div className="text-lg font-black" style={{ color: c }}>
                    {item.count} <span className="text-xs font-normal text-white/25">/ {item.target}</span>
                  </div>
                  {editing && item.field && <div className="mt-1">{input(item.field, "number")}</div>}
                  <ProgressBar pct={fillPct} color={c}
                    tickPct={win.isCurrent ? (exp / Math.max(1, item.target)) * 100 : undefined} />
                  <div className="text-[10px] mt-1" style={{ color: c }}>
                    {win.isCurrent
                      ? (st === "ahead"
                          ? (en ? `ahead — expected ~${exp} by today` : `adelantado — esperado ~${exp} hoy`)
                          : (en ? `behind — expected ~${exp} by today` : `atrasado — esperado ~${exp} hoy`))
                      : (item.count >= item.target
                          ? (en ? "target hit" : "meta cumplida")
                          : (en ? `finished at ${item.count} of ${item.target}` : `terminó en ${item.count} de ${item.target}`))}
                  </div>
                </div>
              );
            })}
          </div>
        </StatusCard>

        {/* Production Pipeline */}
        <ProductionPipelineSection
          s={{
            onboarding_call_at: s.onboarding_call_at,
            script_due_at:      s.script_due_at,
            editing_due_at:     s.editing_due_at,
            next_filming_at:    s.next_filming_at,
            boosting_at:        s.boosting_at,
            posting_at:         s.posting_at,
            pipeline_notes:     s.pipeline_notes,
            pipeline_state:     s.pipeline_state,
            ads_active:         s.ads_active,
            ads_budget:         s.ads_budget,
          }}
          editing={editing}
          set={set as any}
          onPersistField={persistField as any}
          onPersistFields={persistFields as any}
          en={en}
        />

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
          {clientOnboarding.instagram && toProfilesArray(clientOnboarding.top3Profiles).length === 0 && (
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
              style={{ background: "hsl(var(--aqua) / 0.07)", color: "hsl(var(--aqua))", border: "1px solid hsl(var(--aqua) / 0.15)" }}
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
                background: "hsl(var(--aqua) / 0.1)",
                color: "hsl(var(--aqua))",
                border: "1px solid hsl(var(--aqua) / 0.2)",
              }}
            >
              {analyzing
                ? (en ? "Analyzing..." : "Analizando...")
                : (en ? "Re-analyze" : "Re-analizar")}
            </button>
          </div>
        </StatusCard>

        {/* Strategy setup (Content Mix, ManyChat & CTAs, Stories, Ads, Monetization, Monthly targets) */}
        <StrategySetupCard
          s={s}
          editing={editing}
          en={en}
          onPersistField={persistField as any}
          onPersistFields={persistFields as any}
          setDraftField={set as any}
        />

      </div>
    </PageTransition>
  );
}
