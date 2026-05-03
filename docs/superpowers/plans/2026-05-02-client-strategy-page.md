# Client Strategy Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Strategy tab on each client's profile page showing a fulfillment score (0–100), traffic-light health indicators, and editable strategy settings that Robby reads when making content decisions.

**Architecture:** New `client_strategies` DB table (one row per client, defaults to 20 posts/month). New `ClientStrategy.tsx` page at `/clients/:clientId/strategy`. Added as a sub-card in ClientDetail's "Setup" folder. `get_client_strategy` tool added to companion-chat so Robby reads strategy before making decisions.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Supabase (DB + edge functions), Lucide icons, existing PageTransition + glass-card patterns

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260502_client_strategies.sql` | New table + RLS |
| Create | `src/pages/ClientStrategy.tsx` | Full strategy page with score + sections |
| Modify | `src/pages/ClientDetail.tsx` | Add Strategy card to Setup sub-cards |
| Modify | `src/App.tsx` | Add `/clients/:clientId/strategy` route |
| Modify | `supabase/functions/companion-chat/index.ts` | Add `get_client_strategy` tool |

---

### Task 1: DB Migration — client_strategies table

**Files:**
- Create: `supabase/migrations/20260502_client_strategies.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- client_strategies: one row per client, stores content strategy config
CREATE TABLE IF NOT EXISTS client_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  -- Monthly targets
  posts_per_month integer NOT NULL DEFAULT 20,
  scripts_per_month integer NOT NULL DEFAULT 20,
  videos_edited_per_month integer NOT NULL DEFAULT 20,
  stories_per_week integer NOT NULL DEFAULT 10,
  -- Content mix percentages (must sum to 100)
  mix_reach integer NOT NULL DEFAULT 60,
  mix_trust integer NOT NULL DEFAULT 30,
  mix_convert integer NOT NULL DEFAULT 10,
  -- Platform
  primary_platform text NOT NULL DEFAULT 'instagram',
  -- ManyChat
  manychat_active boolean NOT NULL DEFAULT false,
  manychat_keyword text,
  cta_goal text NOT NULL DEFAULT 'manychat',
  -- Ads
  ads_active boolean NOT NULL DEFAULT false,
  ads_budget integer NOT NULL DEFAULT 0,
  ads_goal text,
  -- Audience alignment scores (0-10, set manually by agency)
  audience_score integer NOT NULL DEFAULT 5,
  uniqueness_score integer NOT NULL DEFAULT 5,
  -- Monetization
  monthly_revenue_goal integer NOT NULL DEFAULT 0,
  monthly_revenue_actual integer NOT NULL DEFAULT 0,
  -- Content pillars
  content_pillars jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

CREATE OR REPLACE FUNCTION update_client_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_strategies_updated_at
  BEFORE UPDATE ON client_strategies
  FOR EACH ROW EXECUTE FUNCTION update_client_strategies_updated_at();

ALTER TABLE client_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_strategies_access" ON client_strategies FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT id FROM clients c WHERE EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'user', 'videographer')
    )
  )
);
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/admin/Documents/connectacreators
npx supabase db push 2>&1 | tail -5
```

Expected: `Applying migration 20260502_client_strategies.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502_client_strategies.sql
git commit -m "feat(strategy): add client_strategies table with RLS"
```

---

### Task 2: ClientStrategy.tsx — full page

**Files:**
- Create: `src/pages/ClientStrategy.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === "en";

  const [strategy, setStrategy] = useState<ClientStrategy | null>(null);
  const [counts, setCounts] = useState<MonthCounts>({ scripts: 0, videos_edited: 0, posts_scheduled: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ClientStrategy | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      // Load strategy (or use defaults)
      const { data: strat } = await supabase
        .from("client_strategies")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();

      const resolved: ClientStrategy = strat
        ? { ...strat, content_pillars: Array.isArray(strat.content_pillars) ? strat.content_pillars : [] }
        : { client_id: clientId, ...DEFAULTS };
      setStrategy(resolved);

      // Load this month's counts
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

  useEffect(() => { load(); }, [load]);

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
    } catch (e: any) {
      toast.error(e.message || "Error saving strategy");
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof ClientStrategy, value: any) => setDraft(prev => prev ? { ...prev, [field]: value } : prev);

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

  // Section statuses
  const paceStatus: StatusLevel = Math.min(counts.scripts / s.scripts_per_month, counts.videos_edited / s.videos_edited_per_month, counts.posts_scheduled / s.posts_per_month) >= 0.7 ? "green" : Math.min(counts.scripts / s.scripts_per_month, counts.videos_edited / s.videos_edited_per_month, counts.posts_scheduled / s.posts_per_month) >= 0.3 ? "yellow" : "red";
  const manchatStatus: StatusLevel = s.manychat_active && s.manychat_keyword ? "green" : s.manychat_active ? "yellow" : "red";
  const audienceStatus: StatusLevel = (s.audience_score + s.uniqueness_score) / 2 >= 7 ? "green" : (s.audience_score + s.uniqueness_score) / 2 >= 4 ? "yellow" : "red";
  const adsStatus: StatusLevel = s.ads_active ? "green" : "yellow";

  const input = (field: keyof ClientStrategy, type: "text" | "number" | "boolean" = "text") => {
    if (!editing) return null;
    if (type === "boolean") {
      return (
        <button
          onClick={() => set(field, !s[field])}
          className="text-[11px] font-semibold px-3 py-1 rounded-md transition-colors"
          style={{ background: s[field] ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", color: s[field] ? "#22c55e" : "rgba(255,255,255,0.4)", border: s[field] ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)" }}
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
          <p className="text-xs text-muted-foreground mt-0.5">{en ? "20 posts/month goal · Robby reads this before every decision" : "Meta de 20 publicaciones/mes · Robby lee esto antes de cada decisión"}</p>
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
        {/* Dial */}
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
        {/* Score breakdown */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: scoreC }}>{scoreLabel(score, en)}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-2">{en ? "Robby is tracking your content pace, mix, and automation health." : "Robby está monitoreando tu ritmo de contenido, mezcla y salud de automatización."}</p>
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
              { label: en ? "Reach (gets new people)" : "Alcance (gente nueva)", value: s.mix_reach, color: "#22d3ee", field: "mix_reach" as keyof ClientStrategy },
              { label: en ? "Trust (builds authority)" : "Confianza (autoridad)", value: s.mix_trust, color: "#a3e635", field: "mix_trust" as keyof ClientStrategy },
              { label: en ? "Convert (gets bookings)" : "Conversión (reservas)", value: s.mix_convert, color: "#f59e0b", field: "mix_convert" as keyof ClientStrategy },
            ].map(item => (
              <div key={item.field} className="flex items-center gap-1.5">
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
        <StatusCard status={audienceStatus} title={en ? "Audience Alignment" : "Alineación con Audiencia"} badge={audienceStatus === "green" ? (en ? "Strong" : "Fuerte") : audienceStatus === "yellow" ? (en ? "Needs Work" : "Necesita Trabajo") : (en ? "Weak" : "Débil")}>
          <div className="flex flex-col gap-3">
            {[
              { label: en ? "Talking to the right people?" : "¿Hablando con las personas correctas?", field: "audience_score" as keyof ClientStrategy, value: s.audience_score },
              { label: en ? "Content shocking / unique enough to stop the scroll?" : "¿El contenido es lo suficientemente impactante?", field: "uniqueness_score" as keyof ClientStrategy, value: s.uniqueness_score },
            ].map(item => {
              const pct = (item.value / 10) * 100;
              const c = item.value >= 7 ? "#22c55e" : item.value >= 4 ? "#f59e0b" : "#ef4444";
              return (
                <div key={String(item.field)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-white/50">{item.label}</span>
                    {editing
                      ? <input type="number" min={0} max={10} value={item.value} onChange={e => set(item.field, Math.min(10, Math.max(0, Number(e.target.value))))} className="bg-white/[0.06] border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-white w-12 outline-none text-center" />
                      : <span className="text-[11px] font-bold" style={{ color: c }}>{item.value}/10</span>
                    }
                  </div>
                  <ProgressBar pct={pct} color={c} />
                </div>
              );
            })}
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
                    : <span className="font-semibold text-white">{item.type === "boolean" ? (s[item.field] ? (en ? "Yes" : "Sí") : "No") : (item.field === "ads_budget" ? `$${s.ads_budget.toLocaleString()}` : String(s[item.field] || "—"))}</span>
                  }
                </div>
              ))}
            </div>
          </StatusCard>
        </div>

        {/* Monetization */}
        {(s.monthly_revenue_goal > 0 || editing) && (() => {
          const revPct = s.monthly_revenue_goal > 0 ? Math.min(100, (s.monthly_revenue_actual / s.monthly_revenue_goal) * 100) : 0;
          const revStatus: StatusLevel = revPct >= 70 ? "green" : revPct >= 30 ? "yellow" : "red";
          return (
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
                  <div className="text-lg font-black" style={{ color: revStatus === "green" ? "#22c55e" : "#ef4444" }}>
                    {s.monthly_revenue_actual >= s.monthly_revenue_goal ? "✓" : "-$" + (s.monthly_revenue_goal - s.monthly_revenue_actual).toLocaleString()}
                  </div>
                </div>
              </div>
              <ProgressBar pct={revPct} color={STATUS_COLORS[revStatus]} />
            </StatusCard>
          );
        })()}

      </div>
    </PageTransition>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/admin/Documents/connectacreators && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClientStrategy.tsx
git commit -m "feat(strategy): add ClientStrategy page with fulfillment score and traffic light sections"
```

---

### Task 3: Wire into App.tsx and ClientDetail.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/ClientDetail.tsx`

- [ ] **Step 1: Add lazy import in App.tsx**

After the existing lazy imports (find `const ChangePassword = lazy...`), add:

```tsx
const ClientStrategy = lazy(() => import("./pages/ClientStrategy"));
```

- [ ] **Step 2: Add route in App.tsx**

Inside the `<Route element={<DashboardLayout />}>` block, add near the other `/clients/:clientId/...` routes:

```tsx
<Route path="/clients/:clientId/strategy" element={<ClientStrategy />} />
```

- [ ] **Step 3: Add Strategy card in ClientDetail.tsx**

In `ClientDetail.tsx`, find the `setup` sub-cards array:

```tsx
setup: [
  { label: language === "en" ? "Brand Setup" : "Configuración de Marca", ...
```

Add at the top of that array:

```tsx
{ label: language === "en" ? "Content Strategy" : "Estrategia de Contenido", description: language === "en" ? "Goals, mix, ManyChat & fulfillment score" : "Metas, mezcla, ManyChat y puntuación", icon: BarChart3, color: "text-[#22d3ee]", path: `/clients/${clientId}/strategy` },
```

Note: `BarChart3` is already imported in `ClientDetail.tsx` (it's used for the Sales folder icon).

- [ ] **Step 4: Type check and commit**

```bash
npx tsc --noEmit 2>&1 | head -10
git add src/App.tsx src/pages/ClientDetail.tsx
git commit -m "feat(strategy): add /clients/:clientId/strategy route and Setup card"
```

---

### Task 4: Add get_client_strategy tool to companion-chat

**Files:**
- Modify: `supabase/functions/companion-chat/index.ts`

- [ ] **Step 1: Add tool definition**

In the `TOOLS` array, after the `get_client_info` tool, add:

```typescript
{
  name: "get_client_strategy",
  description: "Get a client's content strategy — their monthly posting targets, content mix, ManyChat keyword, CTA goal, ads status, and current month's progress. Call this before making any content decisions for a client so Robby knows exactly what the goals are.",
  input_schema: {
    type: "object",
    properties: {
      client_name: { type: "string", description: "The client's name to look up" },
    },
    required: ["client_name"],
  },
},
```

- [ ] **Step 2: Add tool handler**

In the tool processing loop, after the `get_client_info` handler, add:

```typescript
if (block.name === "get_client_strategy") {
  const { client_name } = block.input;
  const { data: targetClient } = await adminClient
    .from("clients")
    .select("id, name")
    .ilike("name", "%" + client_name + "%")
    .limit(1)
    .maybeSingle();

  if (!targetClient) {
    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Client not found: " + client_name });
  } else {
    const { data: strat } = await adminClient
      .from("client_strategies")
      .select("*")
      .eq("client_id", targetClient.id)
      .maybeSingle();

    // Get this month's counts
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const iso = monthStart.toISOString();

    const [{ count: scriptCount }, { count: videoCount }, { count: calCount }] = await Promise.all([
      adminClient.from("scripts").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("created_at", iso),
      adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).eq("status", "Done").is("deleted_at", null).gte("created_at", iso),
      adminClient.from("video_edits").select("id", { count: "exact", head: true }).eq("client_id", targetClient.id).gte("schedule_date", iso.slice(0,10)).is("deleted_at", null),
    ]);

    const s = strat || { posts_per_month: 20, scripts_per_month: 20, videos_edited_per_month: 20, stories_per_week: 10, mix_reach: 60, mix_trust: 30, mix_convert: 10, manychat_active: false, manychat_keyword: null, cta_goal: "manychat", ads_active: false, ads_budget: 0 };

    const summary = [
      "Strategy for " + targetClient.name + ":",
      "Monthly targets: " + s.scripts_per_month + " scripts, " + s.videos_edited_per_month + " videos edited, " + s.posts_per_month + " posts scheduled",
      "This month so far: " + (scriptCount || 0) + " scripts, " + (videoCount || 0) + " videos done, " + (calCount || 0) + " posts scheduled",
      "Content mix: " + s.mix_reach + "% reach / " + s.mix_trust + "% trust / " + s.mix_convert + "% convert",
      "Stories per week: " + s.stories_per_week,
      "ManyChat: " + (s.manychat_active ? "active, keyword: " + (s.manychat_keyword || "not set") : "not set up"),
      "CTA goal: " + s.cta_goal,
      "Ads: " + (s.ads_active ? "running, budget $" + s.ads_budget + "/month" : "not running"),
    ].join("\n");

    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: summary });
  }
}
```

- [ ] **Step 3: Update system prompt to mention the tool**

Find rule 14 in the system prompt and update it:

```typescript
// Change:
"14. TOOLS AVAILABLE: You have tools for everything..."
// Add get_client_strategy to the list
```

Find the existing rule 14 text and append:

```
get_client_strategy (reads client's monthly targets, content mix, ManyChat keyword — ALWAYS call this before making content decisions for a client).
```

- [ ] **Step 4: Deploy and commit**

```bash
npx supabase functions deploy companion-chat --no-verify-jwt 2>&1 | tail -3
git add supabase/functions/companion-chat/index.ts
git commit -m "feat(strategy): add get_client_strategy tool to companion-chat"
```

---

### Task 5: Push and verify

- [ ] **Step 1: Final type check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Manual verification**

1. Navigate to any client's profile page (e.g. `/clients/:id`)
2. Click "Client Set Up" folder → verify "Content Strategy" card appears
3. Click "Content Strategy" → verify page loads at `/clients/:id/strategy`
4. Verify fulfillment score dial renders with correct color
5. Verify all 5 sections render with traffic light colors
6. Click "Edit Strategy" → verify all fields become editable
7. Change posts_per_month to 15 → click Save → verify it persists on reload
8. Open Robby → type "what's Roger's content strategy?" → verify Robby calls get_client_strategy and returns the strategy summary
