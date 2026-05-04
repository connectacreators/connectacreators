// supabase/functions/_shared/assistant/identity.ts
import type { AssistantIdentity } from "./types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Loads the companion identity for a user given an active client context.
 * Today, companion_state is keyed by client_id. If no client_id is given,
 * we look up the user's first owned client to fetch their default companion name.
 */
export async function getCompanionIdentity(
  supabase: SupabaseClient,
  userId: string,
  clientId?: string | null,
): Promise<AssistantIdentity> {
  let queryClientId = clientId;

  if (!queryClientId) {
    // Fall back to the user's first owned client for the companion_name lookup.
    const { data: ownedClient } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    queryClientId = ownedClient?.id ?? null;
  }

  let name = "AI";
  if (queryClientId) {
    const { data } = await supabase
      .from("companion_state")
      .select("companion_name")
      .eq("client_id", queryClientId)
      .maybeSingle();
    if (data?.companion_name) name = data.companion_name;
  }

  // Language preference is per-user; default to English for now (the existing
  // CompanionContext reads useLanguage() on the client and passes it through).
  return { name, language: "en" };
}

/**
 * Pure function: builds the identity portion of the system prompt.
 * No DB access — easy to unit-test.
 */
export function buildIdentitySystemPrompt(identity: AssistantIdentity): string {
  const langLabel = identity.language === "es" ? "Spanish" : "English";
  return [
    `You are ${identity.name}, the user's AI assistant inside ConnectaCreators.`,
    `Always respond as ${identity.name}. Refer to yourself in the first person; users may address you by name.`,
    `Default reply language: ${langLabel}. Match the language of the user's last message when in doubt.`,
    `You are concise, direct, and action-oriented. You do things — you don't describe what you would do.`,
  ].join(" ");
}
