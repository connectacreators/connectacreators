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
 * Otherwise this falls back to a multi-strategy fuzzy match scoped to the
 * caller's user_id. Tries exact substring first, then a punctuation-stripped
 * variant, then a per-word match (every significant query word must appear
 * in the candidate name). Returns null only if nothing matches.
 *
 * Examples that all resolve to "Dr Calvin's Clinic":
 *   "Dr. Calvin"      → strip punctuation → matches
 *   "calvin clinic"   → per-word match    → matches
 *   "drcalvin"        → first-word match  → matches via fallback
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
  if (!clientName?.trim()) return null;

  // Strategy 1: direct substring (case-insensitive). Cheap, hits the common case.
  const direct = await ctx.adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", ctx.userId)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  if (direct.error) console.warn("[resolveClient] direct query failed:", direct.error.message);
  if (direct.data) return direct.data;

  // Normalize: strip punctuation (periods, commas, apostrophes, etc), collapse
  // whitespace, lowercase. "Dr. Calvin" → "dr calvin", "Dr Calvin's Clinic" → "dr calvins clinic".
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]+/g, "").replace(/\s+/g, " ").trim();
  const normalizedQuery = norm(clientName);

  // Strategy 2: normalized substring on a likely-small client list. Pull all
  // user's clients once and do the matching in JS since Postgres can't easily
  // strip punctuation in a single ilike.
  const { data: allClients, error: listErr } = await ctx.adminClient
    .from("clients")
    .select("id, name")
    .eq("user_id", ctx.userId);
  if (listErr) {
    console.warn("[resolveClient] client list query failed:", listErr.message);
    return null;
  }
  if (!allClients || allClients.length === 0) return null;

  const candidates = allClients.map((c: { id: string; name: string | null }) => ({
    id: c.id,
    name: c.name ?? "",
    normalized: norm(c.name ?? ""),
  }));

  // Substring match against normalized names
  const subMatch = candidates.find((c) => c.normalized.includes(normalizedQuery));
  if (subMatch) return { id: subMatch.id, name: subMatch.name };

  // Strategy 3: per-word — every significant (>=2 char) word in the query
  // must appear in the candidate's normalized name. Catches reordered queries
  // like "calvin clinic" → "dr calvins clinic".
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length >= 2);
  if (queryWords.length > 0) {
    const wordMatch = candidates.find((c) =>
      queryWords.every((w) => c.normalized.includes(w)),
    );
    if (wordMatch) return { id: wordMatch.id, name: wordMatch.name };
  }

  // Strategy 4: first-word reverse match — if the query is a single token,
  // see if any candidate name STARTS with it (catches "calvin" → "Calvin's…").
  if (queryWords.length === 1) {
    const startsWith = candidates.find((c) => c.normalized.startsWith(queryWords[0]));
    if (startsWith) return { id: startsWith.id, name: startsWith.name };
  }

  return null;
}
