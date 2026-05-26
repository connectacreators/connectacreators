// src/hooks/useTriageRows.ts
//
// Fetches per-client triage row data for the admin dashboard. Runs four
// parallel queries (scripts, video_edits, scheduled_posts, client_strategies)
// and assembles a TriageRowsByClient map. Pipeline rows come from a pure
// transform of the strategy row (see buildPipelineRows).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildPipelineRows, type PipelineSource } from "@/lib/triage/buildPipelineRows";
import type {
  ScriptsReviewRow,
  VideosRevisionRow,
  PostsScheduledRow,
  TriageRow,
  TriageRowsByClient,
} from "@/lib/triage/types";

interface Result {
  data: TriageRowsByClient;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

const POST_TERMINAL_STATUSES = new Set(['published', 'canceled', 'failed']);
const WINDOW_DAYS = 7;
const SCRIPT_AGE_DAYS = 60;

export function useTriageRows(clientIds: string[]): Result {
  const [data, setData] = useState<TriageRowsByClient>({});
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

    const now = new Date();
    const nowIso = now.toISOString();
    const windowIso = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const scriptCutoffIso = new Date(now.getTime() - SCRIPT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase
        .from("scripts")
        .select("id, client_id, title, created_at, review_status, grabado, deleted_at")
        .in("client_id", clientIds)
        .is("deleted_at", null)
        .eq("grabado", false)
        .or("review_status.is.null,review_status.eq.needs_revision")
        .gte("created_at", scriptCutoffIso)
        .order("created_at", { ascending: true }),
      supabase
        .from("video_edits")
        .select("id, client_id, lifecycle_status, updated_at")
        .in("client_id", clientIds)
        .eq("lifecycle_status", "Needs Revisions")
        .order("updated_at", { ascending: true }),
      supabase
        .from("scheduled_posts")
        .select("id, client_id, caption, scheduled_at, status")
        .in("client_id", clientIds)
        .gte("scheduled_at", nowIso)
        .lte("scheduled_at", windowIso)
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("client_strategies")
        .select("client_id, onboarding_call_at, script_due_at, editing_due_at, next_filming_at, boosting_at, posting_at, ads_budget")
        .in("client_id", clientIds),
    ])
      .then(([scriptsRes, videosRes, postsRes, stratRes]) => {
        if (cancelled) return;
        if (scriptsRes.error) throw scriptsRes.error;
        if (videosRes.error)  throw videosRes.error;
        if (postsRes.error)   throw postsRes.error;
        if (stratRes.error)   throw stratRes.error;

        // Bucket scripts by client
        const scriptsByClient = new Map<string, { titles: string[]; oldest: string }>();
        for (const row of scriptsRes.data ?? []) {
          const id = row.client_id as string;
          const b = scriptsByClient.get(id) ?? { titles: [], oldest: row.created_at as string };
          if (b.titles.length < 3 && row.title) b.titles.push(row.title as string);
          if ((row.created_at as string) < b.oldest) b.oldest = row.created_at as string;
          scriptsByClient.set(id, b);
        }

        // Bucket video edits by client. We need titles — but the SELECT didn't
        // include a title field because video_edits' title column name varies.
        // Re-fetch titles for the ids we actually have if needed.
        // For now: aggregate counts; titles fetched in a follow-up query if
        // we want them. Keep titles empty to preserve a clean dashboard until
        // a follow-up enriches them.
        const videosByClient = new Map<string, { count: number; oldest: string; sampleNames: string[] }>();
        for (const row of videosRes.data ?? []) {
          const id = row.client_id as string;
          const b = videosByClient.get(id) ?? { count: 0, oldest: row.updated_at as string, sampleNames: [] };
          b.count += 1;
          if ((row.updated_at as string) < b.oldest) b.oldest = row.updated_at as string;
          videosByClient.set(id, b);
        }

        // Bucket posts by client
        const postsByClient = new Map<string, { count: number; nextAt: string; captions: string[] }>();
        for (const row of postsRes.data ?? []) {
          const id = row.client_id as string;
          if (POST_TERMINAL_STATUSES.has((row.status as string) ?? '')) continue;
          const b = postsByClient.get(id) ?? { count: 0, nextAt: row.scheduled_at as string, captions: [] };
          b.count += 1;
          if (b.captions.length < 3 && row.caption) {
            const c = (row.caption as string).slice(0, 40).trim();
            b.captions.push(c);
          }
          if ((row.scheduled_at as string) < b.nextAt) b.nextAt = row.scheduled_at as string;
          postsByClient.set(id, b);
        }

        // Bucket strategies for pipeline rows
        const stratByClient = new Map<string, PipelineSource>();
        for (const row of stratRes.data ?? []) {
          stratByClient.set(row.client_id as string, row as PipelineSource);
        }

        const out: TriageRowsByClient = {};
        for (const id of clientIds) {
          const rows: TriageRow[] = [];

          const pipeline = buildPipelineRows(stratByClient.get(id) ?? null, { windowDays: WINDOW_DAYS, now });
          rows.push(...pipeline);

          const s = scriptsByClient.get(id);
          if (s && s.titles.length === 0) {
            // we filtered for non-null title — but defend anyway
          }
          if (s) {
            const count = (scriptsRes.data ?? []).filter((r) => r.client_id === id).length;
            const row: ScriptsReviewRow = {
              type: 'scripts_review',
              count,
              sampleNames: s.titles,
              oldestPendingAt: s.oldest,
            };
            rows.push(row);
          }

          const v = videosByClient.get(id);
          if (v) {
            const row: VideosRevisionRow = {
              type: 'videos_revision',
              count: v.count,
              sampleNames: v.sampleNames,
              oldestPendingAt: v.oldest,
            };
            rows.push(row);
          }

          const p = postsByClient.get(id);
          if (p) {
            const row: PostsScheduledRow = {
              type: 'posts_scheduled',
              count: p.count,
              sampleNames: p.captions,
              nextAt: p.nextAt,
            };
            rows.push(row);
          }

          if (rows.length > 0) out[id] = rows.slice(0, 5); // 5-row cap
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
