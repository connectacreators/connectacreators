import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthWindow } from "@/lib/strategy/pace";
import { scriptsPace, calendarCoverage, radarBlipsFromCounts, type RadarBlip } from "@/lib/commandDeck/deckMetrics";

interface DeckMetrics {
  loading: boolean;
  scripts: { count: number; target: number; pct: number } | null;
  editingQueueOpen: number | null;
  calendar: { daysCovered: number; daysTotal: 7 } | null;
  radarBlips: RadarBlip[];
}

const OPEN_LIFECYCLE = ["Not started", "In progress", "Needs Revisions"] as const;

export function useDeckMetrics(): DeckMetrics {
  const [state, setState] = useState<DeckMetrics>({
    loading: true,
    scripts: null,
    editingQueueOpen: null,
    calendar: null,
    radarBlips: [],
  });

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const w = monthWindow(now.getFullYear(), now.getMonth(), now);

    async function load() {
      const [scriptsRes, targetsRes, openEditsRes, needsRevRes, scheduleRes] = await Promise.all([
        supabase
          .from("scripts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .neq("status", "draft")
          .gte("created_at", w.startIso)
          .lt("created_at", w.endIso),
        supabase.from("client_strategies").select("scripts_per_month"),
        supabase
          .from("video_edits")
          .select("id", { count: "exact", head: true })
          .in("lifecycle_status", OPEN_LIFECYCLE as unknown as string[])
          .is("deleted_at", null)
          .is("archived_at", null),
        supabase
          .from("video_edits")
          .select("id", { count: "exact", head: true })
          .eq("lifecycle_status", "Needs Revisions")
          .is("deleted_at", null)
          .is("archived_at", null),
        supabase
          .from("video_edits")
          .select("schedule_date")
          .not("schedule_date", "is", null)
          .is("deleted_at", null)
          .is("archived_at", null),
      ]);

      if (cancelled) return;

      const scriptsTarget = (targetsRes.data ?? []).reduce(
        (sum, row: { scripts_per_month: number | null }) => sum + (row.scripts_per_month ?? 0),
        0,
      );
      const scriptsCount = scriptsRes.count ?? 0;
      const editingQueueOpen = openEditsRes.count ?? 0;
      const needsRevisions = needsRevRes.count ?? 0;
      const scheduleDates = (scheduleRes.data ?? [])
        .map((r: { schedule_date: string | null }) => r.schedule_date)
        .filter((d): d is string => Boolean(d));
      const calendar = calendarCoverage(scheduleDates, now);
      const emptyCalendarDays = calendar.daysTotal - calendar.daysCovered;

      setState({
        loading: false,
        scripts: scriptsPace(scriptsCount, scriptsTarget, w),
        editingQueueOpen,
        calendar,
        // Past-deadline count intentionally omitted for now (needs a
        // verified `deadline` semantics pass) — Attention Radar ships with
        // two live categories (needs-revisions, empty-calendar-days) rather
        // than a guessed third.
        radarBlips: radarBlipsFromCounts(needsRevisions, 0, emptyCalendarDays),
      });
    }

    load().catch((err) => {
      console.error("useDeckMetrics failed", err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
