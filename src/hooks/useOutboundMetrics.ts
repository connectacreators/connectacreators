import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const OUTBOUND_PLATFORMS = ["instagram", "tiktok", "facebook", "linkedin", "x"] as const;
export type OutboundPlatform = (typeof OUTBOUND_PLATFORMS)[number];

// Funnel counter fields, in funnel order. Labels mirror the spreadsheet.
export const STAGE_FIELDS = [
  { key: "pre_initiated", label: "Pre-Initiated", code: "A1" },
  { key: "message_seen", label: "Message Seen", code: "IMS" },
  { key: "initiated", label: "Initiated", code: "A2" },
  { key: "engaged", label: "Engaged", code: "B" },
  { key: "calendly_sent", label: "Calendly'd", code: "C" },
  { key: "booked", label: "Booked", code: "D" },
] as const;
export type StageKey = (typeof STAGE_FIELDS)[number]["key"];

export interface OutboundRow {
  platform: string;
  month: string;
  pre_initiated: number;
  message_seen: number;
  initiated: number;
  engaged: number;
  calendly_sent: number;
  booked: number;
  follows: number;
  follow_backs: number;
}

export const EMPTY_COUNTS: Omit<OutboundRow, "platform" | "month"> = {
  pre_initiated: 0, message_seen: 0, initiated: 0,
  engaged: 0, calendly_sent: 0, booked: 0, follows: 0, follow_backs: 0,
};

const tbl = () => (supabase as any).from("outbound_metrics");

/** One platform+month row with debounced autosave upsert. */
export function useOutboundMonth(platform: string, month: string) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ ...EMPTY_COUNTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Autosave writes the LATEST counts — ref dodges stale-closure snapshots.
  const latest = useRef(counts);
  latest.current = counts;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    tbl()
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .eq("month", month)
      .maybeSingle()
      .then(({ data }: { data: OutboundRow | null }) => {
        if (cancelled) return;
        setCounts(data ? {
          pre_initiated: data.pre_initiated, message_seen: data.message_seen,
          initiated: data.initiated, engaged: data.engaged,
          calendly_sent: data.calendly_sent, booked: data.booked,
          follows: data.follows, follow_backs: data.follow_backs,
        } : { ...EMPTY_COUNTS });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, platform, month]);

  const scheduleSave = useCallback(() => {
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await tbl().upsert(
        { user_id: user.id, platform, month, ...latest.current, updated_at: new Date().toISOString() },
        { onConflict: "user_id,platform,month" },
      );
      setSaving(false);
      if (error) toast.error(`Couldn't save: ${error.message}`);
    }, 600);
  }, [user, platform, month]);

  const update = useCallback((key: keyof typeof EMPTY_COUNTS, value: number) => {
    setCounts((prev) => ({ ...prev, [key]: Math.max(0, Math.round(value) || 0) }));
    scheduleSave();
  }, [scheduleSave]);

  return { counts, update, loading, saving };
}

/** All rows for a platform+year — powers the annual dashboard grid. */
export function useOutboundYear(platform: string, year: number) {
  const { user } = useAuth();
  const [rows, setRows] = useState<OutboundRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    tbl()
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .gte("month", `${year}-01`)
      .lte("month", `${year}-12`)
      .order("month", { ascending: true })
      .then(({ data }: { data: OutboundRow[] | null }) => {
        if (cancelled) return;
        setRows(data ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, platform, year]);

  return { rows, loading };
}

export const pct = (num: number, den: number): string =>
  den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

/** Overall rates (each stage from the top, like the sheet's IMSR/IR/PRR/CSR/ABR)
 *  and stage→stage conversions (A1>MS … C>D), plus FBR%. */
export function computeRates(c: Omit<OutboundRow, "platform" | "month">) {
  return {
    overall: [
      { label: "IMSR", hint: "Message Seen / Pre-Initiated", value: pct(c.message_seen, c.pre_initiated) },
      { label: "IR", hint: "Initiated / Pre-Initiated", value: pct(c.initiated, c.pre_initiated) },
      { label: "PRR", hint: "Engaged / Pre-Initiated", value: pct(c.engaged, c.pre_initiated) },
      { label: "CSR", hint: "Calendly'd / Pre-Initiated", value: pct(c.calendly_sent, c.pre_initiated) },
      { label: "ABR", hint: "Booked / Pre-Initiated", value: pct(c.booked, c.pre_initiated) },
    ],
    steps: [
      { label: "A1 → MS", value: pct(c.message_seen, c.pre_initiated) },
      { label: "MS → A2", value: pct(c.initiated, c.message_seen) },
      { label: "A2 → B", value: pct(c.engaged, c.initiated) },
      { label: "B → C", value: pct(c.calendly_sent, c.engaged) },
      { label: "C → D", value: pct(c.booked, c.calendly_sent) },
    ],
    fbr: pct(c.follow_backs, c.follows),
  };
}
