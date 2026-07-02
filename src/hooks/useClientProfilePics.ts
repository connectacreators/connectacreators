// src/hooks/useClientProfilePics.ts
//
// Returns a map of client_id -> Instagram profile picture for a set of clients.
// The picture is a self-contained base64 data URI that analyze-audience-alignment
// downloads and stores in client_strategies.audience_analysis.profilePicUrl
// ("so it's browser-safe"), so there's no network fetch or expiring CDN URL at
// render time. Clients without a stored picture are simply absent from the map;
// callers fall back to initials.
//
// Cached in-memory (module scope) + localStorage so avatars paint on the FIRST
// frame after a remount/reload instead of popping in after the Supabase round
// trip; the fetch still runs in the background and refreshes stale entries.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "cac:client-profile-pics";

let memCache: Record<string, string> | null = null;

function readCache(): Record<string, string> {
  if (memCache) return memCache;
  try {
    memCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    memCache = {};
  }
  return memCache!;
}

function persistCache() {
  if (!memCache) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memCache));
  } catch {
    // Base64 avatars can outgrow the localStorage quota — the in-memory
    // cache still covers the rest of the session.
  }
}

function fromCache(ids: string[]): Record<string, string> {
  const cache = readCache();
  const map: Record<string, string> = {};
  for (const id of ids) {
    if (cache[id]) map[id] = cache[id];
  }
  return map;
}

export function useClientProfilePics(clientIds: string[]): Record<string, string> {
  // Stable dependency: re-fetch only when the *set* of ids changes, not on every
  // render that produces a fresh array reference.
  const key = useMemo(() => [...clientIds].sort().join(","), [clientIds]);

  const [pics, setPics] = useState<Record<string, string>>(() =>
    fromCache(key ? key.split(",") : []),
  );

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setPics({});
      return;
    }
    // Paint whatever we already have immediately; refresh in the background.
    setPics(fromCache(ids));
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
        const cache = readCache();
        for (const id of ids) {
          if (map[id]) cache[id] = map[id];
          else delete cache[id];
        }
        persistCache();
        setPics(map);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return pics;
}
