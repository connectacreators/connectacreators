import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SocialConnectionRow {
  id: string;
  client_id: string;
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  account_label: string;
  platform_account_id: string;
  status: "active" | "needs_reauth" | "revoked";
  scopes: string[];
  connected_at: string;
  last_used_at: string | null;
  last_error: string | null;
}

export function useSocialConnections(clientId: string | null) {
  return useQuery({
    queryKey: ["social_connections", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_connections")
        .select(
          "id, client_id, platform, account_label, platform_account_id, status, scopes, connected_at, last_used_at, last_error",
        )
        .eq("client_id", clientId!)
        .order("platform");
      if (error) throw error;
      return data as SocialConnectionRow[];
    },
  });
}

export function useDisconnectSocialConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("social_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social_connections"] });
    },
  });
}

/** Kicks off the Facebook OAuth flow for the scheduler (purpose=scheduler). */
export function useStartFacebookOAuth() {
  return useMutation({
    mutationFn: async (args: { clientId: string; returnPath: string }) => {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = new URL(`${SUPABASE_URL}/functions/v1/facebook-oauth`);
      url.searchParams.set("action", "get_url");
      url.searchParams.set("client_id", args.clientId);
      url.searchParams.set("return_path", args.returnPath);
      url.searchParams.set("purpose", "scheduler");
      const res = await fetch(url, { headers: { apikey: ANON } });
      if (!res.ok) throw new Error(`Failed to start OAuth: ${res.status}`);
      const { url: oauthUrl } = await res.json();
      window.location.href = oauthUrl;
    },
  });
}
