// src/hooks/useAssistantMode.ts
// URL → assistant mode (agency vs client). Pure derivation from React Router.
//
// Used by the companion drawer + /ai page + (eventually) canvas surfaces to
// determine which tools/context the assistant should expose.

import { useLocation, useParams } from "react-router-dom";

export type AssistantMode =
  | { mode: "agency"; clientId: null }
  | { mode: "client"; clientId: string };

/**
 * Derives mode from the current URL.
 * - `/clients/:clientId/*` → client mode with that clientId
 * - everything else → agency mode
 *
 * The `clientId` is read from `useParams()`; routes that don't define
 * a `:clientId` param will return agency mode automatically.
 */
export function useAssistantMode(): AssistantMode {
  const params = useParams();
  const clientId = params.clientId;

  if (clientId && clientId !== "" && clientId !== "/") {
    return { mode: "client", clientId };
  }
  return { mode: "agency", clientId: null };
}

/**
 * Same as useAssistantMode but with manual path override — useful when
 * a component wants to compute the mode for a specific path (e.g. previews).
 */
export function detectAssistantModeFromPath(path: string): AssistantMode {
  // Server-side mirror — keeps the regex consistent with the edge function's mode.ts
  const re = /^\/clients\/([^/?#]+)(?:[/?#].*)?$/;
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
