// src/hooks/useClientProfilePics.ts
//
// Returns a map of client_id -> Instagram profile picture for a set of clients.
// The picture is a self-contained base64 data URI that analyze-audience-alignment
// downloads and stores in client_strategies.audience_analysis.profilePicUrl
// ("so it's browser-safe"), so there's no network fetch or expiring CDN URL at
// render time. Clients without a stored picture are simply absent from the map;
// callers fall back to initials.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useClientProfilePics(clientIds: string[]): Record<string, string> {
  const [pics, setPics] = useState<Record<string, string>>({});

  // Stable dependency: re-fetch only when the *set* of ids changes, not on every
  // render that produces a fresh array reference.
  const key = useMemo(() => [...clientIds].sort().join(","), [clientIds]);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setPics({});
      return;
    }
    let cancelled = false;
    supabase
      .from("client_strategies")
      .select("client_id, profilePicUrl:audience_analysis->>profilePicUrl")
      .in("client_id", ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as Array<{ client_id: string; profilePicUrl: string | null }>) {
          if (row.profilePicUrl) map[row.client_id] = row.profilePicUrl;
        }
        setPics(map);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return pics;
}
