// supabase/functions/_shared/credits.ts
// Atomic credit deduction + refund via the deduct_credits_atomic RPC.
// Skips deduction for admin/videographer/editor/connecta_plus roles.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

export async function getPrimaryClientId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  // Try junction table first.
  const { data } = await admin
    .from("subscriber_clients")
    .select("client_id")
    .eq("subscriber_user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.client_id) return data.client_id as string;

  // Fallback: direct clients.user_id lookup.
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (client?.id as string | undefined) ?? null;
}

/**
 * Deduct `cost` credits for `action`. Returns null on success, a stringified
 * error/result on failure. Cost==0 is a no-op. Privileged roles skip deduction.
 */
export async function deductCredits(
  admin: SupabaseClient,
  userId: string,
  action: string,
  cost: number,
): Promise<string | null> {
  if (cost === 0) return null;

  const { data: roleData } = await admin
    .from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = (roleData as { role?: string } | null)?.role;
  if (role === "admin" || role === "videographer" || role === "editor" || role === "connecta_plus") {
    return null;
  }

  const primaryClientId = await getPrimaryClientId(admin, userId);
  if (!primaryClientId) return null;

  const { data: result, error } = await admin.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId, p_action: action, p_cost: cost,
  });
  if (error) {
    console.error("Credit deduction error:", error);
    return JSON.stringify({ error: error.message });
  }
  if (!(result as { ok?: boolean } | null)?.ok) return JSON.stringify(result);
  return null;
}

/**
 * Refund credits previously deducted for `action`. Fire-and-forget — logs but
 * doesn't throw, since refunds happen during error paths and we don't want to
 * cascade failures.
 */
export async function refundCredits(
  admin: SupabaseClient,
  userId: string,
  action: string,
  cost: number,
): Promise<void> {
  if (cost === 0) return;
  const primaryClientId = await getPrimaryClientId(admin, userId);
  if (!primaryClientId) return;
  const { error } = await admin.rpc("deduct_credits_atomic", {
    p_client_id: primaryClientId, p_action: `refund:${action}`, p_cost: -cost,
  });
  if (error) console.warn("Credit refund failed:", error);
}
