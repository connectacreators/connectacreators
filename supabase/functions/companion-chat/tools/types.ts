// supabase/functions/companion-chat/tools/types.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface ToolContext {
  adminClient: SupabaseClient;
  userId: string;
  client: { id: string; name: string | null; onboarding_data?: any };
  /** Mutable array — handlers push action objects here */
  actions: Array<{ type: string; [key: string]: unknown }>;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolResult = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

/**
 * Look up a client by name (case-insensitive partial match) scoped to a user.
 * Returns null and does NOT throw if not found.
 */
export async function resolveClient(
  adminClient: SupabaseClient,
  userId: string,
  clientName: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  if (error) console.warn("[resolveClient] query failed:", error.message);
  return data ?? null;
}
