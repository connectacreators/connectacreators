import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "./encryption.ts";

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube";

export interface SocialConnection {
  id: string;
  client_id: string;
  platform: Platform;
  account_label: string;
  platform_account_id: string;
  access_token: string;          // decrypted
  refresh_token: string | null;  // decrypted, null if none
  token_expires_at: string | null;
  scopes: string[];
  status: "active" | "needs_reauth" | "revoked";
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function upsertConnection(
  sb: SupabaseClient,
  args: {
    client_id: string;
    platform: Platform;
    account_label: string;
    platform_account_id: string;
    access_token: string;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    scopes: string[];
    connected_by?: string | null;
  },
) {
  const access_token_enc = await encryptToken(args.access_token);
  const refresh_token_enc = args.refresh_token ? await encryptToken(args.refresh_token) : null;
  const { data, error } = await sb
    .from("social_connections")
    .upsert(
      {
        client_id: args.client_id,
        platform: args.platform,
        account_label: args.account_label,
        platform_account_id: args.platform_account_id,
        access_token_enc,
        refresh_token_enc,
        token_expires_at: args.token_expires_at ?? null,
        scopes: args.scopes,
        status: "active",
        connected_by: args.connected_by ?? null,
        last_error: null,
      },
      { onConflict: "client_id,platform,platform_account_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getConnection(sb: SupabaseClient, id: string): Promise<SocialConnection> {
  const { data, error } = await sb
    .from("social_connections")
    .select(
      "id, client_id, platform, account_label, platform_account_id, access_token_enc, refresh_token_enc, token_expires_at, scopes, status",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    client_id: data.client_id,
    platform: data.platform,
    account_label: data.account_label,
    platform_account_id: data.platform_account_id,
    access_token: await decryptToken(data.access_token_enc),
    refresh_token: data.refresh_token_enc ? await decryptToken(data.refresh_token_enc) : null,
    token_expires_at: data.token_expires_at,
    scopes: data.scopes ?? [],
    status: data.status,
  };
}

export async function markNeedsReauth(sb: SupabaseClient, id: string, reason: string) {
  await sb
    .from("social_connections")
    .update({ status: "needs_reauth", last_error: reason })
    .eq("id", id);
}

export async function recordUse(sb: SupabaseClient, id: string) {
  await sb.from("social_connections").update({ last_used_at: new Date().toISOString() }).eq("id", id);
}
