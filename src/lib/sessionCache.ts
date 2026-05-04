import type { User } from "@supabase/supabase-js";

/**
 * Read Supabase's own cached session synchronously from localStorage.
 * Supabase normally exposes this via async getSession() — reading the raw
 * key lets us hydrate React state on the very first render so display name,
 * role, etc. don't pop in after auth resolves.
 */
export function getCachedSupabaseUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!url) return null;
    const projectRef = url.split("//")[1]?.split(".")[0];
    if (!projectRef) return null;
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user || session?.currentSession?.user || null;
  } catch {
    return null;
  }
}

/** Generic localStorage cache, keyed by an opaque key (often includes user id). */
export function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage disabled — silently ignore
  }
}
