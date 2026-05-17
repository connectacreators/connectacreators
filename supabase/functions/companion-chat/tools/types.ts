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
  /** True when the caller has the "admin" role in user_roles. Admins (agency
   *  owners) can look up any client; resolveClient skips access filtering
   *  entirely when isAdmin is true. */
  isAdmin: boolean;
  /** For non-admins, the set of client_ids the caller has access to: union
   *  of clients they own directly (clients.user_id = caller) and clients
   *  they subscribe to via the subscriber_clients junction table. null
   *  when isAdmin is true (no filter). */
  accessibleClientIds: string[] | null;
  /** Mutable array — handlers push action objects here */
  actions: Array<{ type: string; [key: string]: unknown }>;
  /** Caller's current URL path (e.g. "/editing-queue" or "/clients/<id>/editing-queue").
   *  Tools use it to decide whether a navigate action is needed — if the user
   *  is already on a page that would show the affected items, skip the nav. */
  currentPath?: string;
}

/**
 * Resolve every client_id the caller can act on. Returns null for admins
 * (no filter — they see everything) and a deduped array of UUIDs for
 * non-admins. Combines:
 *   - clients owned directly (clients.user_id = caller)
 *   - clients granted via the subscriber_clients junction table
 *
 * Cheap: at most two indexed selects against tiny tables. Cache once per
 * request rather than per tool call.
 */
export async function getAccessibleClientIds(
  adminClient: SupabaseClient,
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (isAdmin) return null;
  const [ownedRes, subscribedRes] = await Promise.all([
    adminClient.from("clients").select("id").eq("user_id", userId),
    adminClient.from("subscriber_clients").select("client_id").eq("subscriber_user_id", userId),
  ]);
  const owned = (ownedRes.data ?? []).map((r: { id: string }) => r.id);
  const subscribed = (subscribedRes.data ?? []).map((r: { client_id: string }) => r.client_id);
  return Array.from(new Set([...owned, ...subscribed]));
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

  // Build the base query. Admins look up any client (agency model). Non-admins
  // are restricted to the union of clients they own + clients they subscribe
  // to via subscriber_clients (computed once per request and cached on ctx).
  const baseQuery = () => {
    let q = ctx.adminClient.from("clients").select("id, name");
    if (!ctx.isAdmin) {
      const allowed = ctx.accessibleClientIds ?? [];
      if (allowed.length === 0) {
        // Empty allow-list still needs an unsatisfiable filter so we don't
        // accidentally return all rows. Use a sentinel UUID that can't exist.
        q = q.eq("id", "00000000-0000-0000-0000-000000000000");
      } else {
        q = q.in("id", allowed);
      }
    }
    return q;
  };

  // Strategy 1: direct substring (case-insensitive). Cheap, hits the common case.
  const direct = await baseQuery()
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
  // accessible clients once and do the matching in JS since Postgres can't
  // easily strip punctuation in a single ilike.
  const { data: allClients, error: listErr } = await baseQuery();
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

  // Strategy 5: typo-tolerant edit-distance match. Catches "Boby" → "Bobby",
  // "calvinns" → "Calvin's", missing/doubled letters, etc. Compares the
  // query against the first token of each candidate name (clients are usually
  // referenced by first name / brand). Threshold scales with length so short
  // names need a tight match and long names allow slightly more drift.
  const editDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp: number[] = Array(b.length + 1).fill(0);
    for (let j = 0; j <= b.length; j++) dp[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = a[i - 1] === b[j - 1]
          ? prev
          : Math.min(prev, dp[j], dp[j - 1]) + 1;
        prev = tmp;
      }
    }
    return dp[b.length];
  };
  const queryFirst = queryWords[0] ?? normalizedQuery;
  // Tight on short queries (<=4 chars: 1 typo allowed), looser on longer
  // ones. Never allow more than 3 — beyond that it's not a typo.
  const threshold = Math.min(3, Math.max(1, Math.floor(queryFirst.length / 4)));
  let bestMatch: { id: string; name: string; dist: number } | null = null;
  for (const c of candidates) {
    const candidateFirst = c.normalized.split(/\s+/)[0] ?? "";
    if (!candidateFirst) continue;
    const dist = editDistance(queryFirst, candidateFirst);
    if (dist <= threshold && (bestMatch === null || dist < bestMatch.dist)) {
      bestMatch = { id: c.id, name: c.name, dist };
    }
  }
  if (bestMatch) return { id: bestMatch.id, name: bestMatch.name };

  return null;
}
