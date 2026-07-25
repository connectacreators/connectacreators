// Scopes every Command Deck fleet-wide query to the clients that actually
// belong on an admin's dashboard: active Connecta+ clients, plus the
// admin's own client row if they have one. Without this, every fleet query
// pulls every row in `clients` — including canceled "starter" trial rows,
// inactive subclient rows, and other admins' rosters — which is exactly
// the bug this hook exists to prevent (see the same pattern already
// established for staff client pickers: clients.user_id = auth.uid()
// merged with the connecta_plus filter).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ManagedClient {
  id: string;
  name: string;
}

export function useManagedClientIds(): { loading: boolean; clients: ManagedClient[] } {
  const [state, setState] = useState<{ loading: boolean; clients: ManagedClient[] }>({
    loading: true,
    clients: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const { data, error } = await supabase
        .from("clients")
        .select("id, name, plan_type, subscription_status, user_id, owner_user_id");
      if (cancelled) return;
      if (error || !data) {
        setState({ loading: false, clients: [] });
        return;
      }

      const managed = data.filter(
        (c) =>
          (c.plan_type === "connecta_plus" && c.subscription_status === "active") ||
          (userId && (c.user_id === userId || c.owner_user_id === userId)),
      );

      setState({ loading: false, clients: managed.map((c) => ({ id: c.id, name: c.name })) });
    }

    load().catch((err) => {
      console.error("useManagedClientIds failed", err);
      if (!cancelled) setState({ loading: false, clients: [] });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
