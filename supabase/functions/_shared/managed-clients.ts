// Server-side twin of src/hooks/useManagedClientIds.ts — the definition of
// "the clients on an admin's roster".
//
// `clients.user_id` is NOT the managing admin: each client row points at
// that CLIENT's own login account. Filtering fleet queries by
// `.eq("user_id", adminId)` therefore matches almost nothing (only a
// client row the admin happens to own personally), which silently returns
// a near-empty result instead of an error. Keep this in sync with the hook.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface ManagedClient {
  id: string;
  name: string;
}

export async function getManagedClients(
  adminClient: SupabaseClient,
  userId: string,
): Promise<ManagedClient[]> {
  const { data, error } = await adminClient
    .from("clients")
    .select("id, name, plan_type, subscription_status, user_id, owner_user_id");
  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .filter(
      (c) =>
        (c.plan_type === "connecta_plus" && c.subscription_status === "active") ||
        c.user_id === userId ||
        c.owner_user_id === userId,
    )
    .map((c) => ({ id: c.id as string, name: (c.name as string) ?? "Unknown" }));
}
