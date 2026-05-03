import { supabase } from "@/integrations/supabase/client";

/**
 * Always returns a fresh, valid Bearer token for the current user session.
 * Throws a user-facing error if the session is expired or missing — never
 * falls back to the anon key, which causes confusing "Unauthorized" errors
 * in authenticated Edge Functions.
 */
export async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  // Session may have expired — attempt one refresh before giving up
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session.access_token;

  throw new Error("Your session has expired. Please refresh the page and try again.");
}

export function authHeader(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
