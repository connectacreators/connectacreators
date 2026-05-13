import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { upsertConnection } from "../_shared/socialConnections.ts";

const FB_APP_ID = Deno.env.get("FACEBOOK_APP_ID")!;
const FB_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET")!;
const REDIRECT_URI = "https://connectacreators.com/facebook-callback";
const FB_API = "https://graph.facebook.com/v19.0";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ─── GET /facebook-oauth?action=get_url ───────────────────────────
  if (req.method === "GET" && url.searchParams.get("action") === "get_url") {
    const clientId = url.searchParams.get("client_id") || "";
    const returnPath = url.searchParams.get("return_path") || "/dashboard";
    const purpose = (url.searchParams.get("purpose") || "leads") as "leads" | "scheduler";

    // State encodes client_id, return_path, and purpose for CSRF + context
    const state = btoa(
      JSON.stringify({
        client_id: clientId,
        return_path: returnPath,
        purpose,
        nonce: crypto.randomUUID(),
      })
    );

    const SCOPE_LEADS = [
      "pages_show_list",
      "leads_retrieval",
      "pages_manage_metadata",
      "pages_read_engagement",
      "pages_manage_ads",
    ];

    const SCOPE_SCHEDULER = [
      ...SCOPE_LEADS,
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
    ];

    const scope = (purpose === "scheduler" ? SCOPE_SCHEDULER : SCOPE_LEADS).join(",");

    const oauthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    oauthUrl.searchParams.set("client_id", FB_APP_ID);
    oauthUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    oauthUrl.searchParams.set("scope", scope);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ url: oauthUrl.toString(), state }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ─── POST actions ─────────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ─── ACTION: callback ─────────────────────────────────────────────
  if (action === "callback") {
    const { code, client_id, state } = body;
    if (!code || !client_id) {
      return jsonError("Missing code or client_id", 400);
    }

    try {
      // 1. Exchange code for short-lived user access token
      const tokenRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            redirect_uri: REDIRECT_URI,
            code,
          })
      );
      if (!tokenRes.ok) return jsonError("Token exchange failed", 400);
      const tokenData = await tokenRes.json();
      const shortLivedToken = tokenData.access_token;

      // 2. Exchange for long-lived user token (60 days)
      const longLivedRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedToken,
          })
      );
      if (!longLivedRes.ok)
        return jsonError("Long-lived token exchange failed", 400);
      const longLivedData = await longLivedRes.json();
      const longLivedToken = longLivedData.access_token;

      // 3. Fetch pages managed by user (includes page-level tokens)
      const pagesRes = await fetch(
        `${FB_API}/me/accounts?fields=id,name,access_token&access_token=${longLivedToken}`
      );
      if (!pagesRes.ok) return jsonError("Failed to fetch pages", 400);
      const pagesData = await pagesRes.json();
      const pages = pagesData.data || [];

      // 4. Upsert each page into facebook_pages table
      const insertedPages = [];
      for (const page of pages) {
        const { error } = await supabase.from("facebook_pages").upsert(
          {
            client_id,
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.access_token,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,page_id" }
        );

        if (!error) {
          insertedPages.push({ page_id: page.id, page_name: page.name });
        }
      }

      return json({ success: true, pages: insertedPages });
    } catch (err) {
      console.error("Callback error:", err);
      return jsonError(String(err), 500);
    }
  }

  // ─── ACTION: connect_for_scheduling ─────────────────────────────
  // Same code-exchange flow as `callback` but writes to social_connections
  // and also creates an instagram row if the Page has a linked IG Business
  // account. Used when the user OAuth's from the scheduler's "Connect" UI.
  if (action === "connect_for_scheduling") {
    const { code, client_id, state, page_id: requestedPageId } = body;
    if (!code || !client_id) return jsonError("Missing code or client_id", 400);

    try {
      // 1. Exchange code for short-lived user token
      const tokenRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({ client_id: FB_APP_ID, client_secret: FB_APP_SECRET, redirect_uri: REDIRECT_URI, code })
      );
      if (!tokenRes.ok) return jsonError("Token exchange failed", 400);
      const { access_token: shortLivedToken } = await tokenRes.json();

      // 2. Exchange for long-lived user token
      const longRes = await fetch(
        `${FB_API}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            fb_exchange_token: shortLivedToken,
          })
      );
      if (!longRes.ok) return jsonError("Long-lived token exchange failed", 400);
      const { access_token: longLivedUserToken } = await longRes.json();

      // 3. List pages (include instagram_business_account so we can also wire IG)
      const pagesRes = await fetch(
        `${FB_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedUserToken}`
      );
      if (!pagesRes.ok) return jsonError("Failed to fetch pages", 400);
      const pagesData = await pagesRes.json();
      const pages: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }> =
        pagesData.data || [];

      if (pages.length === 0) {
        return jsonError("No Facebook Pages found for this user.", 400);
      }

      // 4. If front-end picked a specific page, use it; otherwise return the
      //    list so the front-end can ask the user to pick.
      if (!requestedPageId) {
        return json({
          needs_page_pick: true,
          pages: pages.map((p) => ({
            page_id: p.id,
            page_name: p.name,
            has_instagram: Boolean(p.instagram_business_account?.id),
          })),
        });
      }

      const chosen = pages.find((p) => p.id === requestedPageId);
      if (!chosen) return jsonError("Chosen page not found in user's accounts", 400);

      // 5. Fetch IG Business account username if linked
      let igAccountId: string | null = chosen.instagram_business_account?.id ?? null;
      let igUsername: string | null = null;
      if (igAccountId) {
        const igRes = await fetch(
          `${FB_API}/${igAccountId}?fields=username&access_token=${chosen.access_token}`
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          igUsername = igData.username || null;
        }
      }

      // 6. Resolve who connected (try Authorization header → JWT sub)
      let connectedBy: string | null = null;
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const jwt = authHeader.slice(7);
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          connectedBy = payload.sub ?? null;
        } catch { /* ignore */ }
      }

      // 7. Upsert Facebook connection
      await upsertConnection(supabase, {
        client_id,
        platform: "facebook",
        account_label: chosen.name,
        platform_account_id: chosen.id,
        access_token: chosen.access_token,
        token_expires_at: null, // Page tokens don't expire
        scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
        connected_by: connectedBy,
      });

      let igConnection = null;
      if (igAccountId) {
        igConnection = await upsertConnection(supabase, {
          client_id,
          platform: "instagram",
          account_label: igUsername ? `@${igUsername}` : `IG (${igAccountId})`,
          platform_account_id: igAccountId,
          access_token: chosen.access_token, // Page token works for IG Graph
          token_expires_at: null,
          scopes: ["instagram_basic", "instagram_content_publish"],
          connected_by: connectedBy,
        });
      }

      return json({
        success: true,
        facebook: { page_id: chosen.id, page_name: chosen.name },
        instagram: igAccountId ? { ig_user_id: igAccountId, username: igUsername } : null,
        ig_warning: igAccountId ? null : "This Page isn't linked to an Instagram Business account.",
      });
    } catch (err) {
      console.error("connect_for_scheduling error:", err);
      return jsonError(String(err), 500);
    }
  }

  // ─── ACTION: get_pages ────────────────────────────────────────────
  if (action === "get_pages") {
    const { client_id } = body;
    const { data, error } = await supabase
      .from("facebook_pages")
      .select("page_id, page_name, is_subscribed, created_at")
      .eq("client_id", client_id)
      .order("created_at", { ascending: false });

    if (error) return jsonError(error.message, 500);
    return json({ pages: data || [] });
  }

  // ─── ACTION: get_forms ────────────────────────────────────────────
  if (action === "get_forms") {
    const { client_id, page_id } = body;

    // Get page access token from DB
    const { data: pageRow } = await supabase
      .from("facebook_pages")
      .select("page_access_token")
      .eq("client_id", client_id)
      .eq("page_id", page_id)
      .single();

    if (!pageRow) return jsonError("Page not found or not connected", 404);

    try {
      // Fetch forms from Graph API
      const formsRes = await fetch(
        `${FB_API}/${page_id}/leadgen_forms?fields=id,name,status,created_time&access_token=${pageRow.page_access_token}`
      );
      if (!formsRes.ok) return jsonError("Failed to fetch lead forms", 400);
      const formsData = await formsRes.json();
      const forms = formsData.data || [];

      // Upsert forms into cache table
      for (const form of forms) {
        await supabase.from("facebook_lead_forms").upsert(
          {
            client_id,
            page_id,
            form_id: form.id,
            form_name: form.name,
            status: form.status?.toLowerCase() || "active",
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "client_id,form_id" }
        );
      }

      return json({
        forms: forms.map((f: any) => ({
          form_id: f.id,
          form_name: f.name,
          status: f.status?.toLowerCase() || "active",
        })),
      });
    } catch (err) {
      console.error("Get forms error:", err);
      return jsonError(String(err), 500);
    }
  }

  // ─── ACTION: subscribe_webhook ────────────────────────────────────
  if (action === "subscribe_webhook") {
    const { client_id, page_id } = body;

    const { data: pageRow } = await supabase
      .from("facebook_pages")
      .select("page_access_token")
      .eq("client_id", client_id)
      .eq("page_id", page_id)
      .single();

    if (!pageRow) return jsonError("Page not found", 404);

    try {
      // Subscribe this page to leadgen webhooks
      const subRes = await fetch(`${FB_API}/${page_id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          subscribed_fields: "leadgen",
          access_token: pageRow.page_access_token,
        }),
      });

      if (!subRes.ok) {
        const err = await subRes.json();
        return jsonError(
          `Webhook subscribe failed: ${err.error?.message || "unknown"}`,
          400
        );
      }

      // Mark as subscribed in DB
      await supabase
        .from("facebook_pages")
        .update({
          is_subscribed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", client_id)
        .eq("page_id", page_id);

      return json({ success: true });
    } catch (err) {
      console.error("Subscribe webhook error:", err);
      return jsonError(String(err), 500);
    }
  }

  // ─── ACTION: disconnect ───────────────────────────────────────────
  if (action === "disconnect") {
    const { client_id, page_id } = body;
    await supabase
      .from("facebook_pages")
      .delete()
      .eq("client_id", client_id)
      .eq("page_id", page_id);

    // Also clean up cached forms
    await supabase
      .from("facebook_lead_forms")
      .delete()
      .eq("client_id", client_id)
      .eq("page_id", page_id);

    return json({ success: true });
  }

  return jsonError("Unknown action", 400);
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
