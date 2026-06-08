import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let token: string | null = url.searchParams.get("token");
  if (!token && req.method === "POST") {
    try { token = (await req.json())?.token ?? null; } catch { /* ignore */ }
  }

  if (!token || !TOKEN_RE.test(token)) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Resolve the share row (must be active).
  const { data: share } = await admin
    .from("script_folder_shares")
    .select("folder_id, permission, revoked_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (!share) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rootFolderId: string = share.folder_id;

  // 2. Load the share-root folder itself.
  const { data: rootFolder } = await admin
    .from("script_folders")
    .select("id, name, client_id, parent_id, created_at")
    .eq("id", rootFolderId)
    .maybeSingle();

  if (!rootFolder) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2b. Resolve the owning account's branding (palette + fonts + logo) so the
  //     public reader matches the theme the sender selected in-app. The chain is
  //     folder.client_id → clients.user_id → user_branding. user_branding is
  //     RLS-protected, so only this service-role function can read it for an
  //     unauthenticated viewer. Missing at any step → null (reader falls back to
  //     the editorial default).
  let branding:
    | { palette: string; font_pairing: string; logo_url: string | null; logo_alt: string | null }
    | null = null;
  if (rootFolder.client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("user_id")
      .eq("id", rootFolder.client_id)
      .maybeSingle();
    if (client?.user_id) {
      const { data: ub } = await admin
        .from("user_branding")
        .select("palette, font_pairing, logo_url, logo_alt")
        .eq("user_id", client.user_id)
        .maybeSingle();
      if (ub) branding = ub;
    }
  }

  // 3. Walk the subtree (BFS). script_folders has `parent_id` so we
  //    iteratively fetch children levels until there are no more.
  const folders: Array<{
    id: string;
    name: string;
    parent_id: string | null;
    created_at: string;
  }> = [{
    id: rootFolder.id,
    name: rootFolder.name,
    parent_id: null, // treat the share root as the new root of the view
    created_at: rootFolder.created_at,
  }];

  let frontier: string[] = [rootFolderId];
  const seen = new Set<string>([rootFolderId]);
  const SAFETY_LIMIT = 20; // depth cap — prevents runaway loops

  for (let depth = 0; depth < SAFETY_LIMIT && frontier.length > 0; depth++) {
    const { data: children } = await admin
      .from("script_folders")
      .select("id, name, parent_id, created_at")
      .in("parent_id", frontier);

    if (!children || children.length === 0) break;

    const nextFrontier: string[] = [];
    for (const c of children) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      folders.push(c);
      nextFrontier.push(c.id);
    }
    frontier = nextFrontier;
  }

  const allFolderIds = Array.from(seen);

  // 4. Load all non-deleted scripts whose folder_id is in the subtree.
  const { data: scripts } = await admin
    .from("scripts")
    .select("id, title, idea_ganadora, target, formato, format_reference_url, inspiration_url, inspiration_urls, caption, folder_id, created_at, updated_at")
    .in("folder_id", allFolderIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // 5. Load all lines for those scripts so the reader can render both the
  //    preview feed (first couple of actor lines per card) and the detail
  //    view without a second round-trip.
  const scriptIds = (scripts ?? []).map((s) => s.id);
  let linesByScriptId: Record<string, Array<{
    line_type: string;
    section: string;
    text: string;
    line_number: number;
  }>> = {};

  if (scriptIds.length > 0) {
    const { data: lines } = await admin
      .from("script_lines")
      .select("script_id, line_type, section, text, line_number")
      .in("script_id", scriptIds)
      .order("line_number");

    for (const l of lines ?? []) {
      (linesByScriptId[l.script_id] ??= []).push({
        line_type: l.line_type,
        section: l.section,
        text: l.text,
        line_number: l.line_number,
      });
    }
  }

  return new Response(
    JSON.stringify({
      permission: share.permission as "viewer" | "editor",
      root: { id: rootFolder.id, name: rootFolder.name, client_id: rootFolder.client_id ?? null },
      branding,                     // owning account's palette/fonts/logo (or null)
      folders,                      // includes the root (with parent_id = null)
      scripts: (scripts ?? []).map((s) => ({
        ...s,
        lines: linesByScriptId[s.id] ?? [],
      })),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
