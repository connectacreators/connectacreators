// Renders a minimal HTML page with Open Graph / Twitter meta tags specific
// to a shared folder, so link-preview crawlers (iMessage, WhatsApp, Slack,
// Telegram, Twitter, Facebook, LinkedIn, Discord, etc.) show the folder
// name instead of the generic site title.
//
// Only reached for bot user-agents — nginx routes humans to the SPA.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(title: string, description: string, url: string): string {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />

    <meta property="og:site_name" content="Connecta Creators" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${u}" />
    <meta property="og:image" content="https://connectacreators.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="https://connectacreators.com/og-image.png" />

    <meta http-equiv="refresh" content="0; url=${u}" />
  </head>
  <body>
    <p><a href="${u}">${t}</a></p>
  </body>
</html>`;
}

serve(async (req) => {
  const url = new URL(req.url);

  // Token comes from the query string (nginx rewrites /f/:token → ?token=:token).
  const token = url.searchParams.get("token") ?? "";
  const shareUrl = `https://connectacreators.com/f/${token}`;

  // Default fallback — same as index.html.
  let title = "Shared scripts · Connecta";
  let description = "Someone shared a folder of scripts with you on Connecta.";

  if (TOKEN_RE.test(token)) {
    try {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: share } = await admin
        .from("script_folder_shares")
        .select("folder_id")
        .eq("token", token)
        .is("revoked_at", null)
        .maybeSingle();

      if (share?.folder_id) {
        const { data: folder } = await admin
          .from("script_folders")
          .select("name")
          .eq("id", share.folder_id)
          .maybeSingle();

        if (folder?.name) {
          title = `${folder.name} · Connecta`;
          description = `Shared folder "${folder.name}" — read-only scripts on Connecta.`;
        }
      }
    } catch {
      // Fall through to default title/description.
    }
  }

  return new Response(renderHtml(title, description, shareUrl), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
