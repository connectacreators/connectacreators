// src/hooks/useDashboardPendingItems.ts
//
// Resolves per-client "what needs attention" pills for the dashboard
// roster. A client appears in the roster ONLY when its pendingItems
// array is non-empty.
//
// Pending items derived from existing tables:
//   - "N to approve"   → video_edits.lifecycle_status = 'Needs Revisions'
//   - "N in editing"   → video_edits.lifecycle_status = 'In progress'
//   - "N scheduled"    → video_edits.lifecycle_status = 'Scheduled'
//   - "N new leads"    → leads.created_at > now() - 24h (per client)

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PendingItemVariant = "honey" | "aqua" | "ink";

export interface PendingItem {
  label: string;
  variant: PendingItemVariant;
}

export type PendingItemsByClient = Record<string, PendingItem[]>;

interface UseDashboardPendingItemsResult {
  data: PendingItemsByClient;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useDashboardPendingItems(clientIds: string[]): UseDashboardPendingItemsResult {
  const [data, setData] = useState<PendingItemsByClient>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (clientIds.length === 0) {
      setData({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from("video_edits")
        .select("client_id, lifecycle_status")
        .in("client_id", clientIds)
        .in("lifecycle_status", ["Needs Revisions", "In progress", "Scheduled"]),
      supabase
        .from("leads")
        .select("client_id")
        .in("client_id", clientIds)
        .gte("created_at", yesterday),
    ])
      .then(([editsRes, leadsRes]) => {
        if (cancelled) return;
        if (editsRes.error) throw editsRes.error;
        if (leadsRes.error) throw leadsRes.error;

        const buckets: Record<string, { approve: number; editing: number; scheduled: number; leads: number }> = {};
        for (const id of clientIds) {
          buckets[id] = { approve: 0, editing: 0, scheduled: 0, leads: 0 };
        }
        for (const row of editsRes.data ?? []) {
          const b = buckets[row.client_id as string];
          if (!b) continue;
          if (row.lifecycle_status === "Needs Revisions") b.approve += 1;
          else if (row.lifecycle_status === "In progress") b.editing += 1;
          else if (row.lifecycle_status === "Scheduled") b.scheduled += 1;
        }
        for (const row of leadsRes.data ?? []) {
          const b = buckets[row.client_id as string];
          if (b) b.leads += 1;
        }

        const out: PendingItemsByClient = {};
        for (const id of clientIds) {
          const b = buckets[id];
          const items: PendingItem[] = [];
          if (b.approve > 0) items.push({ label: `${b.approve} to approve`, variant: "honey" });
          if (b.leads > 0)   items.push({ label: `${b.leads} new lead${b.leads === 1 ? "" : "s"}`, variant: "aqua" });
          if (b.editing > 0) items.push({ label: `${b.editing} in editing`, variant: "ink" });
          if (b.scheduled > 0) items.push({ label: `${b.scheduled} scheduled`, variant: "ink" });
          out[id] = items;
        }
        setData(out);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientIds.join(","), tick]);

  return { data, loading, error, refresh };
}
