// src/hooks/useTriageClients.ts
//
// Returns the list of Connecta Plus clients. Server-side filter via two joins:
//   clients
//     ← subscriber_clients (client_id)
//         ← user_roles (user_id, role='connecta_plus')
//
// Deduplicated (a client can have multiple linked subscribers).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TriageClient } from "@/lib/triage/types";

interface Result {
  clients: TriageClient[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useTriageClients(): Result {
  const [clients, setClients] = useState<TriageClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      // Step 1: find user_ids with role connecta_plus
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "connecta_plus");
      if (roleErr) {
        if (!cancelled) { setError(roleErr); setLoading(false); }
        return;
      }
      const userIds = (roleRows ?? []).map((r) => r.user_id);
      if (userIds.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }

      // Step 2: find client_ids linked to those subscribers
      const { data: linkRows, error: linkErr } = await supabase
        .from("subscriber_clients")
        .select("client_id")
        .in("subscriber_user_id", userIds);
      if (linkErr) {
        if (!cancelled) { setError(linkErr); setLoading(false); }
        return;
      }
      const clientIds = Array.from(new Set((linkRows ?? []).map((r) => r.client_id)));
      if (clientIds.length === 0) {
        if (!cancelled) { setClients([]); setLoading(false); }
        return;
      }

      // Step 3: load client names
      const { data: clientRows, error: clientErr } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds)
        .order("name");
      if (clientErr) {
        if (!cancelled) { setError(clientErr); setLoading(false); }
        return;
      }

      if (!cancelled) {
        setClients((clientRows ?? []) as TriageClient[]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tick]);

  return { clients, loading, error, refresh };
}
