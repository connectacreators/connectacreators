import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Check } from "lucide-react";
import { fmtViews, PLATFORM_ICON } from "@/lib/viral-card-utils";
import type { ClientChannelLink } from "@/hooks/useClientViralChannels";

const GUARANTEE_DAYS = 90;


// ── Views guarantee tracker ─────────────────────────────────────────────────
// "1M views in 90 days" (goal configurable): sums current view counts of all
// posts published inside the window, across every linked channel.
export function ViewsGuaranteeCard({ linked, en, viewsGoal, startedAt, fallbackStart, onPersistGoal }: {
  linked: ClientChannelLink[];
  en: boolean;
  viewsGoal: number;
  startedAt: string | null;
  fallbackStart: string | null;
  onPersistGoal?: (patch: { views_goal?: number; views_goal_started_at?: string | null }) => void;
}) {
  const [byPlatform, setByPlatform] = useState<Record<string, number> | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState(String(viewsGoal));
  const [draftStart, setDraftStart] = useState("");

  // Window: explicit start > onboarding call > trailing 90 days.
  const startIso = startedAt || fallbackStart || new Date(Date.now() - GUARANTEE_DAYS * 86_400_000).toISOString();
  const usingFallback = !startedAt;
  const start = new Date(startIso);
  const end = new Date(start.getTime() + GUARANTEE_DAYS * 86_400_000);
  const now = new Date();
  const elapsedDays = Math.max(0, Math.min(GUARANTEE_DAYS, Math.floor((now.getTime() - start.getTime()) / 86_400_000)));
  const windowOver = now >= end;
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));

  const channelIds = linked.map(l => l.channel!.id);
  const idsKey = channelIds.join(",");

  useEffect(() => {
    if (channelIds.length === 0) { setByPlatform({}); return; }
    let cancelled = false;
    supabase
      .from("viral_videos")
      .select("platform, views_count")
      .in("channel_id", channelIds)
      .gte("posted_at", start.toISOString())
      .lt("posted_at", end.toISOString())
      .limit(2000)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A transient RLS/auth blip returns no rows — keep the last good totals
        // instead of flashing 0 views.
        if (error) return;
        const sums: Record<string, number> = {};
        for (const v of (data || []) as { platform: string; views_count: number }[]) {
          sums[v.platform] = (sums[v.platform] || 0) + (v.views_count || 0);
        }
        setByPlatform(sums);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, startIso]);

  const total = Object.values(byPlatform || {}).reduce((s, n) => s + n, 0);
  const pct = Math.min(100, (total / Math.max(1, viewsGoal)) * 100);
  const expectedByNow = viewsGoal * (elapsedDays / GUARANTEE_DAYS);
  const hit = total >= viewsGoal;
  const color = hit ? "#22c55e" : windowOver ? "#ef4444" : total >= expectedByNow ? "#22c55e" : total >= expectedByNow * 0.6 ? "#f59e0b" : "#ef4444";

  const fmtDate = (d: Date) => d.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short", day: "numeric", year: "numeric" });

  const saveEdit = () => {
    const goal = Math.max(1, Math.round(Number(draftGoal) || viewsGoal));
    const patch: { views_goal: number; views_goal_started_at?: string | null } = { views_goal: goal };
    if (draftStart) {
      const [y, m, d] = draftStart.split("-").map(Number);
      patch.views_goal_started_at = new Date(y, m - 1, d).toISOString();
    }
    onPersistGoal?.(patch);
    setEditing(false);
  };

  return (
    <div className="glass-card rounded-xl p-5" style={{ border: `1px solid ${color}33` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[1px] uppercase" style={{ color }}>
          {fmtViews(viewsGoal)} {en ? "views guarantee" : "vistas garantizadas"}
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}12`, border: `1px solid ${color}38`, color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {hit
              ? (en ? "Goal hit" : "Meta cumplida")
              : windowOver
                ? (en ? "Window ended" : "Ventana terminada")
                : (en ? `Day ${elapsedDays} of ${GUARANTEE_DAYS}` : `Día ${elapsedDays} de ${GUARANTEE_DAYS}`)}
          </span>
          {onPersistGoal && (
            <button onClick={() => { setDraftGoal(String(viewsGoal)); setDraftStart(startIso.slice(0, 10)); setEditing(e => !e); }}
              className="text-white/30 hover:text-white/70 transition-colors" title={en ? "Edit goal / start date" : "Editar meta / fecha de inicio"}>
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex items-end gap-3 flex-wrap mb-3">
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Views goal" : "Meta de vistas"}
            <input type="number" value={draftGoal} onChange={e => setDraftGoal(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none w-36" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-white/40">
            {en ? "Started working on" : "Inicio de trabajo"}
            <input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none" />
          </label>
          <button onClick={saveEdit}
            className="flex items-center gap-1 text-[11px] font-semibold px-3 py-2 rounded-lg"
            style={{ background: "hsl(var(--aqua) / 0.12)", color: "hsl(var(--aqua))", border: "1px solid hsl(var(--aqua) / 0.3)" }}>
            <Check className="w-3 h-3" /> {en ? "Save" : "Guardar"}
          </button>
        </div>
      ) : null}

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black" style={{ color }}>
          {byPlatform === null ? "…" : fmtViews(total)}
        </span>
        <span className="text-xs text-white/35">/ {fmtViews(viewsGoal)} {en ? "views" : "vistas"}</span>
        {!windowOver && !hit && byPlatform !== null && (
          <span className="text-[11px] ml-auto" style={{ color }}>
            {total >= expectedByNow
              ? (en ? "on pace" : "al ritmo")
              : (en ? `expected ~${fmtViews(Math.round(expectedByNow))} by today` : `esperado ~${fmtViews(Math.round(expectedByNow))} hoy`)}
            {" · "}{daysLeft} {en ? "days left" : "días restantes"}
          </span>
        )}
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.07] overflow-hidden mt-2 mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        {!windowOver && (
          <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-white/50" style={{ left: `${Math.min(100, (expectedByNow / Math.max(1, viewsGoal)) * 100)}%` }} />
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {(["instagram", "tiktok", "youtube", "facebook"] as const).filter(p => (byPlatform?.[p] ?? 0) > 0 || linked.some(l => l.platform === p)).map(p => {
            const Icon = PLATFORM_ICON[p];
            return (
              <span key={p} className="flex items-center gap-1.5 text-[11px] text-white/60">
                {Icon && <Icon className="w-3.5 h-3.5 text-white/35" />}
                <span className="font-semibold text-white/80">{fmtViews(byPlatform?.[p] ?? 0)}</span>
              </span>
            );
          })}
        </div>
        <span className="text-[10px] text-white/30">
          {en ? "Posts published since" : "Posts publicados desde"} {fmtDate(start)}
          {usingFallback && (en ? " (auto — set an official start date)" : " (auto — define la fecha oficial de inicio)")}
        </span>
      </div>
    </div>
  );
}
