// supabase/functions/companion-chat/tools/types.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface ToolContext {
  adminClient: SupabaseClient;
  userId: string;
  client: { id: string; name: string | null; onboarding_data?: any };
  /** When the user is on /clients/:id/* the URL pins the active client.
   *  All tool calls that take a client_name MUST resolve to this client and
   *  ignore the model's name argument. Null on /ai (admin multi-client) or
   *  any other surface without a URL lock. */
  lockedClient: { id: string; name: string | null } | null;
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
 * Resolve the client a tool should operate on.
 *
 * If the URL is locked to a specific client (ctx.lockedClient is set), this
 * returns that client unconditionally and ignores `clientName`. The model can
 * pass any string; it's not trusted on a locked surface.
 *
 * Otherwise this falls back to a case-insensitive name match scoped to the
 * caller's user_id. Returns null if no client matches.
 */
export async function resolveClient(
  ctx: ToolContext,
  clientName: string,
): Promise<{ id: string; name: string } | null> {
  if (ctx.lockedClient) {
    const locked = ctx.lockedClient;
    if (
      clientName &&
      locked.name &&
      !locked.name.toLowerCase().includes(clientName.toLowerCase().split(/\s+/)[0])
    ) {
      console.warn(
        `[resolveClient] URL is locked to "${locked.name}"; ignoring requested name "${clientName}"`,
      );
    }
    return { id: locked.id, name: locked.name ?? "" };
  }
  const { data, error } = await ctx.adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  if (error) console.warn("[resolveClient] query failed:", error.message);
  return data ?? null;
}
