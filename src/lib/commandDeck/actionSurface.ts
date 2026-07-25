// Recognizes the one navigate action the Command Deck intercepts and
// resolves in-page instead of leaving /ai: open_editing_item's "revisions"
// / "review" modal (supabase/functions/companion-chat/tools/editing.ts).
// Every other navigate action (and every other modal value) is untouched —
// this only ever matches the exact shape that tool emits.
export interface EditingReviewTarget {
  itemId: string;
  clientId: string | null;
}

// Live snapshot of the open Action Surface, sent to companion-chat on every
// message so the model can resolve "it"/"pause it"/"leave a note here" to a
// specific open item and target it directly with control_review_surface —
// see index.ts's active_surface handling and the ACTIVE ACTION SURFACE
// context block it builds from this shape.
export interface ActionSurfaceSnapshot {
  itemId: string;
  itemTitle: string;
  clientId: string | null;
  clientName: string | null;
  playing: boolean;
  currentTimeSeconds: number;
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
