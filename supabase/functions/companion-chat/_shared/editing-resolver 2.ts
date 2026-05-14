// supabase/functions/companion-chat/_shared/editing-resolver.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type EditingResolveOk = {
  ok: true;
  item: {
    id: string;
    reel_title: string;
    client_id: string;
    status: string | null;
    assignee: string | null;
    revisions: string | null;
    caption: string | null;
    deadline: string | null;
    deleted_at: string | null;
  };
};

export type EditingResolveErr = {
  ok: false;
  reason: "no_match" | "ambiguous";
  /** Top candidates when ambiguous. Empty when no_match. */
  candidates: Array<{ id: string; reel_title: string; client_id: string }>;
};

export type EditingResolveResult = EditingResolveOk | EditingResolveErr;

/**
 * Resolve a single video_edits row from a fuzzy title query.
 *
 * Strategy:
 *   1. Exact case-insensitive match on reel_title.
 *   2. Substring match (ilike '%query%').
 *   3. Tie-break: non-deleted before deleted, then updated_at DESC.
 *   4. If 3+ equally-good matches remain, return { ok:false, ambiguous, candidates:topN }.
 *
 * Scope:
 *   - clientId !== null: search restricted to that client's rows.
 *   - clientId === null: search across `accessibleClientIds` (master view).
 *     If accessibleClientIds is null (admin), no client filter is applied.
 *
 * Trash semantics: by default the resolver returns the best match REGARDLESS
 * of deleted_at status. Callers that need only-live or only-deleted rows
 * should pass { onlyLive: true } or { onlyDeleted: true }.
 */
export async function resolveEditingItem(
  adminClient: SupabaseClient,
  clientId: string | null,
  accessibleClientIds: string[] | null,
  query: string,
  opts: { onlyLive?: boolean; onlyDeleted?: boolean } = {},
): Promise<EditingResolveResult> {
  const q = (query ?? "").trim();
  if (!q) return { ok: false, reason: "no_match", candidates: [] };

  // 1. Exact case-insensitive match
  let exactSel = adminClient
    .from("video_edits")
    .select("id, reel_title, client_id, status, assignee, revisions, caption, deadline, deleted_at, updated_at")
    .ilike("reel_title", q);

  if (clientId) exactSel = exactSel.eq("client_id", clientId);
  else if (accessibleClientIds) exactSel = exactSel.in("client_id", accessibleClientIds);

  if (opts.onlyLive) exactSel = exactSel.is("deleted_at", null);
  if (opts.onlyDeleted) exactSel = exactSel.not("deleted_at", "is", null);

  const { data: exactRows } = await exactSel.order("updated_at", { ascending: false }).limit(2);

  if (exactRows && exactRows.length === 1) {
    return { ok: true, item: exactRows[0] as EditingResolveOk["item"] };
  }
  if (exactRows && exactRows.length > 1) {
    // Multiple exact matches — same title on different clients (only
    // possible in master mode). Tie-break by updated_at.
    return { ok: true, item: exactRows[0] as EditingResolveOk["item"] };
  }

  // 2. Substring match
  let subSel = adminClient
    .from("video_edits")
    .select("id, reel_title, client_id, status, assignee, revisions, caption, deadline, deleted_at, updated_at")
    .ilike("reel_title", `%${q}%`);

  if (clientId) subSel = subSel.eq("client_id", clientId);
  else if (accessibleClientIds) subSel = subSel.in("client_id", accessibleClientIds);

  if (opts.onlyLive) subSel = subSel.is("deleted_at", null);
  if (opts.onlyDeleted) subSel = subSel.not("deleted_at", "is", null);

  const { data: subRows } = await subSel
    .order("deleted_at", { ascending: true, nullsFirst: true }) // live first
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!subRows || subRows.length === 0) {
    return { ok: false, reason: "no_match", candidates: [] };
  }

  if (subRows.length === 1) {
    return { ok: true, item: subRows[0] as EditingResolveOk["item"] };
  }

  // 3+ matches → ambiguous. Return top 3 candidates so the caller can ask
  // the user to pick. We don't auto-pick because the cost of being wrong
  // (mutating the wrong row) is higher than asking.
  if (subRows.length >= 3) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: subRows.slice(0, 3).map((r) => ({
        id: r.id as string,
        reel_title: r.reel_title as string,
        client_id: r.client_id as string,
      })),
    };
  }

  // Exactly 2 matches — tie-break already applied via ORDER BY. Pick the
  // top one (live + most recent).
  return { ok: true, item: subRows[0] as EditingResolveOk["item"] };
}

/**
 * Helper: render an ambiguous-result error message for the tool result.
 */
export function ambiguousMessage(query: string, candidates: EditingResolveErr["candidates"]): string {
  const lines = candidates.map((c, i) => `  ${i + 1}. ${c.reel_title}`).join("\n");
  return `Multiple items match "${query}". Did you mean:\n${lines}\n\nReply with the exact title to disambiguate.`;
}
