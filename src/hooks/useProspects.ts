import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { stageDeltas } from "@/lib/prospects/stageDeltas";
import type { StageKey } from "@/hooks/useOutboundMetrics";

export interface IgProspect {
  id: string;
  username: string;
  full_name: string | null;
  follower_count: number | null;
  following_count: number | null;
  profile_pic_url: string | null;
  is_verified: boolean;
  is_private: boolean;
  biography: string | null;
  external_url: string | null;
  category: string | null;
  is_business: boolean | null;
  media_count: number | null;
  public_email: string | null;
  public_phone: string | null;
  city_name: string | null;
  enrichment_status: "pending" | "done" | "failed";
  stage_reached: number;
  followed: boolean;
  followed_back: boolean;
  notes: string | null;
  created_at: string;
}

const tbl = () => (supabase as any).from("ig_prospects");
const dailyLogTbl = () => (supabase as any).from("outbound_daily_log");

const PLATFORM = "instagram";
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Every counter column on outbound_metrics. `follows` / `follow_backs` are
 * parallel counters, not funnel stages, so they are not StageKey members —
 * but they are written through the same path.
 */
type CounterKey = StageKey | "follows" | "follow_backs";

/**
 * Applies signed stage deltas to the SAME two tables the /outbound steppers
 * write to, with the same semantics: monthly rollup in outbound_metrics, plus
 * a day-level signed row in outbound_daily_log for the current month only
 * (editing a past month is backfill, not activity today).
 *
 * Counters credit the ACTING user, not whoever originally sourced the handle —
 * outbound_metrics is per-admin.
 */
async function applyFunnelDeltas(
  userId: string,
  deltas: { stage: CounterKey; delta: number }[],
) {
  if (deltas.length === 0) return;
  const month = thisMonth();

  // Sum per counter first: one transition can touch a counter once, but callers
  // may bundle, and the RPC takes one value per column.
  const payload: Record<string, number> = {};
  for (const d of deltas) payload[d.stage] = (payload[d.stage] ?? 0) + d.delta;

  // Atomic server-side increment. This deliberately does NOT read the current
  // counters into the client: the previous read-modify-write lost data two ways
  // -- a failed read looked like an empty month and zeroed all eight counters,
  // and two quick clicks both read the same value and both wrote value+1. The
  // RPC clamps at 0 in SQL to satisfy the table's `>= 0` CHECKs.
  const { error } = await (supabase as any).rpc("apply_outbound_deltas", {
    p_platform: PLATFORM,
    p_month: month,
    p_deltas: payload,
  });
  if (error) {
    toast.error(`Couldn't update funnel: ${error.message}`);
    return;
  }

  // Day-level audit trail. Surfaced on failure rather than swallowed: if this
  // silently no-ops, the monthly rollup and the day log drift apart and the
  // /outbound Monthly view stops agreeing with the daily gauges.
  const { error: logError } = await dailyLogTbl().insert(
    deltas.map((d) => ({ user_id: userId, platform: PLATFORM, stage: d.stage, delta: d.delta })),
  );
  if (logError) {
    console.error("[useProspects] day-log insert failed", logError);
    toast.error("Funnel updated, but the daily log didn't record it");
  }
}

export function useProspects() {
  const { user } = useAuth();
  const [prospects, setProspects] = useState<IgProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await tbl().select("*").order("created_at", { ascending: false }).limit(500);
    setProspects((data ?? []) as IgProspect[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const anyPending = prospects.some((p) => p.enrichment_status === "pending");

  // Poll only while something on screen is still filling in, then stop.
  useEffect(() => {
    if (!anyPending) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = setInterval(load, 5000);
    return () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [anyPending, load]);

  const search = useCallback(async (query: string, limit = 15) => {
    if (!query.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.functions.invoke("ig-prospect-search", {
      body: { query: query.trim(), limit },
    });
    setSearching(false);
    if (error) { toast.error(`Search failed: ${error.message}`); return; }
    const known = data?.already_known ?? 0;
    toast.success(
      `${data?.inserted ?? 0} new prospect${data?.inserted === 1 ? "" : "s"}` +
      (known > 0 ? ` · ${known} already known` : ""),
    );
    await load();
  }, [load]);

  const setStage = useCallback(async (p: IgProspect, next: number) => {
    if (!user || next === p.stage_reached) return;
    const deltas = stageDeltas(p.stage_reached, next);
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, stage_reached: next } : x)));
    const { error } = await tbl()
      .update({ stage_reached: next, stage_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) {
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, stage_reached: p.stage_reached } : x)));
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    await applyFunnelDeltas(user.id, deltas);
  }, [user]);

  const toggleFollow = useCallback(async (p: IgProspect, field: "followed" | "followed_back") => {
    if (!user) return;
    const next = !p[field];
    const counter: CounterKey = field === "followed" ? "follows" : "follow_backs";
    setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
    const { error } = await tbl().update({ [field]: next }).eq("id", p.id);
    if (error) {
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: !next } : x)));
      toast.error(`Couldn't save: ${error.message}`);
      return;
    }
    await applyFunnelDeltas(user.id, [{ stage: counter, delta: next ? 1 : -1 }]);
  }, [user]);

  return { prospects, loading, searching, anyPending, search, setStage, toggleFollow };
}
