// src/hooks/useAssistantMode.ts
// URL → assistant mode (agency vs client). Pure derivation from React Router.
//
// Used by the companion drawer + /ai page + (eventually) canvas surfaces to
// determine which tools/context the assistant should expose.

import { useLocation } from "react-router-dom";

export type AssistantMode =
  | { mode: "agency"; clientId: null }
  | { mode: "client"; clientId: string };

/**
 * Derives mode from the current URL pathname.
 * - `/clients/:clientId/*` → client mode with that clientId
 * - everything else → agency mode
 *
 * Uses `useLocation()` (not `useParams()`) so it works for components
 * mounted outside the matched <Route> subtree (e.g. the floating drawer).
 */
export function useAssistantMode(): AssistantMode {
  const location = useLocation();
  return detectAssistantModeFromPath(location.pathname);
}

/**
 * Same as useAssistantMode but with manual path override — useful when
 * a component wants to compute the mode for a specific path (e.g. previews).
 */
export function detectAssistantModeFromPath(path: string): AssistantMode {
  // Server-side mirror — keeps the regex consistent with the edge function's mode.ts
  // Match /clients/<id> with anything after — the original regex required a
  // trailing /, ?, or # which broke for the bare /clients/:id pathname.
  const re = /^\/clients\/([^/?#]+)/;
  const m = re.exec(path);
  if (m && m[1] && m[1] !== "" && m[1] !== "/") {
    return { mode: "client", clientId: m[1] };
  }
  return { mode: "agency", clientId: null };
}

/**
 * Returns the current path string from React Router (useful when the
 * caller wants to pass the path to a consumer that doesn't have access
 * to React Router context).
 */
export function useCurrentPath(): string {
  const location = useLocation();
  return location.pathname + location.search;
}
