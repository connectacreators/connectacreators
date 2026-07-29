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
const metricsTbl = () => (supabase as any).from("outbound_metrics");
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

  const { data: existing } = await metricsTbl()
    .select("*")
    .eq("user_id", userId)
    .eq("platform", PLATFORM)
    .eq("month", month)
    .maybeSingle();

  const row: Record<string, unknown> = {
    user_id: userId, platform: PLATFORM, month,
    pre_initiated: existing?.pre_initiated ?? 0,
    message_seen: existing?.message_seen ?? 0,
    initiated: existing?.initiated ?? 0,
    engaged: existing?.engaged ?? 0,
    calendly_sent: existing?.calendly_sent ?? 0,
    booked: existing?.booked ?? 0,
    follows: existing?.follows ?? 0,
    follow_backs: existing?.follow_backs ?? 0,
    updated_at: new Date().toISOString(),
  };
  for (const d of deltas) {
    // The table has `>= 0` checks on every counter; clamp so a correction can
    // never push a rollup negative and reject the whole upsert.
    row[d.stage] = Math.max(0, (row[d.stage] as number) + d.delta);
  }

  const { error } = await metricsTbl().upsert(row, { onConflict: "user_id,platform,month" });
  if (error) { toast.error(`Couldn't update funnel: ${error.message}`); return; }

  await dailyLogTbl().insert(
    deltas.map((d) => ({ user_id: userId, platform: PLATFORM, stage: d.stage, delta: d.delta })),
  );
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
