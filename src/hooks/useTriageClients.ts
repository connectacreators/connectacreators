// src/hooks/useTriageClients.ts
//
// Returns the list of Connecta Plus clients. Uses the canonical source of
// truth that Subscribers.tsx uses — clients.user_id linked to a user_roles
// row with role='connecta_plus'. The older subscriber_clients junction is
// not consulted; a Connecta+ subscriber added via the Subscribers UI gets
// their primary clients row's user_id set directly, no junction row.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TriageClient } from "@/lib/triage/types";

interface Result {
  clients: TriageClient[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

// Subscription statuses considered "live" for the triage view. Mirrors the
// states Subscribers.tsx folds into its Active tab (active + canceling, which
// stays serviced until period end) plus trials still in progress. Everything
// else (canceled, inactive, past_due, subclient, null) is a deactivated
// account and must not surface here.
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "canceling", "trialing", "trial"] as const;

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

      // Step 2: load primary clients owned by those users. parent_subscriber_id
      // IS NULL gates this to billing/primary clients (not sub-clients of an
      // agency), matching how Subscribers.tsx reads the table. The
      // subscription_status filter drops deactivated accounts (canceled,
      // inactive, past_due, subclient, null) so the triage view only surfaces
      // clients we're actively servicing — otherwise a churned client lingers
      // with stale counts. 'canceling'/'trialing' are kept (still live) to
      // match how Subscribers.tsx maps statuses to its "active" tab.
      const { data: clientRows, error: clientErr } = await supabase
        .from("clients")
        .select("id, name")
        .in("user_id", userIds)
        .is("parent_subscriber_id", null)
        .in("subscription_status", ACTIVE_SUBSCRIPTION_STATUSES)
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
