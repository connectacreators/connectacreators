// Recognizes the one navigate action the Command Deck intercepts and
// resolves in-page instead of leaving /ai: open_editing_item's "revisions"
// / "review" modal (supabase/functions/companion-chat/tools/editing.ts).
// Every other navigate action (and every other modal value) is untouched —
// this only ever matches the exact shape that tool emits.
export interface EditingReviewTarget {
  itemId: string;
  clientId: string | null;
}

export function parseEditingReviewNavigation(path: string): EditingReviewTarget | null {
  const [pathname, query] = path.split("?");
  if (!pathname || !query) return null;

  const params = new URLSearchParams(query);
  const itemId = params.get("item_id");
  const modal = params.get("modal");
  if (!itemId || (modal !== "revisions" && modal !== "review")) return null;

  const clientMatch = pathname.match(/^\/clients\/([^/]+)\/editing-queue$/);
  if (clientMatch) return { itemId, clientId: clientMatch[1] };
  if (pathname === "/editing-queue") return { itemId, clientId: null };
  return null;
}
