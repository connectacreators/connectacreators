// supabase/functions/_shared/assistant/memory.ts
import type { AssistantMemory } from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadRelevantMemories(
  supabase: SupabaseClient,
  userId: string,
  activeClientId?: string | null,
): Promise<AssistantMemory[]> {
  // Load user-scope + (optionally) client-scope memories in one query
  let query = supabase
    .from("assistant_memories")
    .select("id, scope, client_id, key, value")
    .eq("user_id", userId);

  if (activeClientId) {
    // Guard against PostgREST .or() string injection — clientId must be a UUID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeClientId)) {
      console.warn("loadRelevantMemories: rejecting non-UUID clientId", activeClientId);
      return [];
    }
    query = query.or(`scope.eq.user,and(scope.eq.client,client_id.eq.${activeClientId})`);
  } else {
    query = query.eq("scope", "user");
  }

  const { data, error } = await query;
  if (error) {
    console.warn("loadRelevantMemories: failed", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    scope: r.scope,
    clientId: r.client_id ?? undefined,
    key: r.key,
    value: r.value,
  }));
}

export async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  mem: AssistantMemory,
  sourceThreadId?: string,
): Promise<void> {
  if (mem.scope === "client" && !mem.clientId) {
    throw new Error("client-scope memory requires clientId");
  }
  const row = {
    user_id: userId,
    scope: mem.scope,
    client_id: mem.scope === "client" ? mem.clientId : null,
    key: mem.key,
    value: mem.value,
    source_thread_id: sourceThreadId ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("assistant_memories")
    .upsert(row, { onConflict: "user_id,scope,client_id,key" });
  if (error) throw new Error(`saveMemory: ${error.message}`);
}

export async function deleteMemory(
  supabase: SupabaseClient,
  userId: string,
  memoryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("assistant_memories")
    .delete()
    .eq("id", memoryId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteMemory: ${error.message}`);
}

/**
 * Pure function: format memories as a system-prompt section.
 */
export function formatMemoriesForPrompt(memories: AssistantMemory[]): string {
  if (memories.length === 0) return "";
  const userMems = memories.filter((m) => m.scope === "user");
  const clientMems = memories.filter((m) => m.scope === "client");
  const sections: string[] = [];
  if (userMems.length > 0) {
    sections.push(
      "About the user (agency owner):\n" +
        userMems.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }
  if (clientMems.length > 0) {
    sections.push(
      "About the active client:\n" +
        clientMems.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }
  return sections.join("\n\n");
}
