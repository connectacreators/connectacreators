// Fleet-wide Strategy Health — runs every client through the same
// fulfillmentScore() formula the Strategy page uses for one client at a
// time (src/pages/ClientStrategy.tsx), batching the video_edits counts
// (the useTriageRows.in("client_id", ids) pattern) and calling the
// per-client count_scripts_attributed RPC in parallel across clients,
// since it has no batch variant.
//
// `count_scripts_attributed` and `video_edits.file_submitted_at`/
// `schedule_date` are real, live columns (ClientStrategy.tsx already reads
// them the same way) that the generated Supabase types haven't caught up
// with — see project memory "DB migration drift". Filter-builder methods
// (.eq/.gte/.rpc) tolerate this; a typed .select() column list does not,
// so counts are fetched per-condition rather than selected by name.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthWindow, type ScoreInputs } from "@/lib/strategy/pace";
import { rankFleetStrategyHealth, type RankedStrategyHealth } from "@/lib/commandDeck/fleetStrategyHealth";
import { useManagedClientIds } from "@/hooks/useManagedClientIds";

async function countScriptsAttributed(clientId: string, startIso: string, endIso: string): Promise<number> {
  try {
    const { data } = await (supabase as any).rpc("count_scripts_attributed", {
      p_client_id: clientId,
      p_start: startIso,
      p_end: endIso,
    });
    return (data as number) || 0;
  } catch {
    return 0;
  }
}

async function countVideoEdits(clientId: string, dateColumn: "file_submitted_at" | "schedule_date", startIso: string, endIso: string): Promise<number> {
  const { count } = await supabase
    .from("video_edits")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .gte(dateColumn, startIso)
    .lt(dateColumn, endIso);
  return count || 0;
}

export function useFleetStrategyHealth(): { loading: boolean; ranked: RankedStrategyHealth[] } {
  const { loading: clientsLoading, clients: managedClients } = useManagedClientIds();
  const [state, setState] = useState<{ loading: boolean; ranked: RankedStrategyHealth[] }>({
    loading: true,
    ranked: [],
  });

  useEffect(() => {
    if (clientsLoading) return;
    let cancelled = false;
    const now = new Date();
    const w = monthWindow(now.getFullYear(), now.getMonth(), now);

    async function load() {
      if (managedClients.length === 0) {
        setState({ loading: false, ranked: [] });
        return;
      }
      const managedIds = managedClients.map((c) => c.id);
      const { data: strategies } = await supabase
        .from("client_strategies")
        .select(
          "client_id, scripts_per_month, videos_edited_per_month, posts_per_month, manychat_active, audience_score, uniqueness_score",
        )
        .in("client_id", managedIds);
      if (cancelled) return;
      if (!strategies) {
        setState({ loading: false, ranked: [] });
        return;
      }

      const strategyByClient = new Map(strategies.map((s) => [s.client_id, s]));
      const clientsWithStrategy = managedClients.filter((c) => strategyByClient.has(c.id));
      if (clientsWithStrategy.length === 0) {
        setState({ loading: false, ranked: [] });
        return;
      }

      const fleetInputs = await Promise.all(
        clientsWithStrategy.map(async (c) => {
          const s = strategyByClient.get(c.id)!;
          const [scripts, edited, scheduled] = await Promise.all([
            countScriptsAttributed(c.id, w.startIso, w.endIso),
            countVideoEdits(c.id, "file_submitted_at", w.startIso, w.endIso),
            countVideoEdits(c.id, "schedule_date", w.startIso, w.endIso),
          ]);
          const inputs: ScoreInputs = {
            scripts,
            edited,
            scheduled,
            scriptsTarget: s.scripts_per_month,
            editedTarget: s.videos_edited_per_month,
            scheduledTarget: s.posts_per_month,
            manychatActive: Boolean(s.manychat_active),
            audienceScore: s.audience_score,
            uniquenessScore: s.uniqueness_score,
          };
          return { clientId: c.id, clientName: c.name, inputs };
        }),
      );
      if (cancelled) return;

      setState({ loading: false, ranked: rankFleetStrategyHealth(fleetInputs, w) });
    }

    load().catch((err) => {
      console.error("useFleetStrategyHealth failed", err);
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientsLoading, managedClients.map((c) => c.id).join(",")]);

  return state;
}
