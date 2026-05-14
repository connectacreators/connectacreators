// Publishes one scheduled_post_target to Instagram Reels OR Facebook Reels.
// Reads target_id from body, fetches target+parent+connection, calls Graph API.
// Writes outcome back to scheduled_post_targets.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getConnection, markNeedsReauth, recordUse, serviceClient } from "../_shared/socialConnections.ts";

const FB_API = "https://graph.facebook.com/v19.0";
const DRY_RUN = Deno.env.get("DRY_RUN_SCHEDULER") === "true";
const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [5, 15, 60, 240, 240];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  const { target_id } = await req.json();
  if (!target_id) return jsonError("Missing target_id", 400);

  const sb = serviceClient();

  // 1. Fetch target + parent post
  const { data: target, error: tErr } = await sb
    .from("scheduled_post_targets")
    .select("id, scheduled_post_id, social_connection_id, platform, status, platform_post_id, attempt_count, scheduled_posts(video_url, caption)")
    .eq("id", target_id)
    .single();
  if (tErr || !target) return jsonError("Target not found: " + tErr?.message, 404);

  // 2. Idempotency — never republish a target that already succeeded
  if (target.platform_post_id) {
    return json({ already_published: true, platform_post_id: target.platform_post_id });
  }

  const parent = (target as any).scheduled_posts;
  if (!parent?.video_url) return await fail(sb, target_id, "Missing video_url on parent", target.attempt_count, true);

  // 2a. Resolve video URL — stored value can be a Storage path or a full URL.
  // Meta needs a fetchable HTTPS URL with enough TTL to download the video.
  // We sign for 6 hours; well past any reasonable publish window.
  let resolvedVideoUrl: string;
  if (/^https?:\/\//.test(parent.video_url)) {
    resolvedVideoUrl = parent.video_url;
  } else {
    const { data: signed, error: signErr } = await sb.storage
      .from("footage")
      .createSignedUrl(parent.video_url, 6 * 60 * 60);
    if (signErr || !signed?.signedUrl) {
      return await fail(sb, target_id, `Failed to sign video URL: ${signErr?.message ?? "unknown"}`, target.attempt_count, true);
    }
    resolvedVideoUrl = signed.signedUrl;
  }

  // 3. Load connection (decrypts token)
  let connection;
  try { connection = await getConnection(sb, target.social_connection_id); }
  catch (e) { return await fail(sb, target_id, "Connection not found: " + e, target.attempt_count, true); }

  if (connection.status !== "active") {
    return await fail(sb, target_id, `Connection status=${connection.status}`, target.attempt_count, true);
  }

  // 4. DRY-RUN short circuit (full pipeline exercise without real API calls)
  if (DRY_RUN) {
    console.log("[DRY_RUN] would publish", target.platform, "to", connection.account_label, "video:", parent.video_url);
    await sb.from("scheduled_post_targets").update({
      status: "published",
      platform_post_id: `dryrun-${target.id}`,
      platform_post_url: `https://dry-run.example/${target.platform}/${target.id}`,
      last_error: null,
      published_at: new Date().toISOString(),
    }).eq("id", target_id);
    return json({ dry_run: true });
  }

  // 5. Branch on platform
  try {
    let post_id: string;
    let post_url: string;

    if (target.platform === "instagram") {
      ({ post_id, post_url } = await publishInstagramReel({
        igUserId: connection.platform_account_id,
        accessToken: connection.access_token,
        videoUrl: resolvedVideoUrl,
        caption: parent.caption ?? "",
      }));
    } else if (target.platform === "facebook") {
      ({ post_id, post_url } = await publishFacebookReel({
        pageId: connection.platform_account_id,
        accessToken: connection.access_token,
        videoUrl: resolvedVideoUrl,
        caption: parent.caption ?? "",
      }));
    } else {
      return await fail(sb, target_id, `publish-to-meta does not handle platform ${target.platform}`, target.attempt_count, true);
    }

    await sb.from("scheduled_post_targets").update({
      status: "published",
      platform_post_id: post_id,
      platform_post_url: post_url,
      last_error: null,
      published_at: new Date().toISOString(),
    }).eq("id", target_id);
    await recordUse(sb, connection.id);
    return json({ platform_post_id: post_id, platform_post_url: post_url });

  } catch (err) {
    const msg = String((err as Error)?.message ?? err);

    // Token / scope errors → flip the connection and stop retrying.
    if (/OAuthException|access[_ ]?token|permissions|scope|expired/i.test(msg)) {
      await markNeedsReauth(sb, connection.id, msg);
      return await fail(sb, target_id, msg, target.attempt_count, true);
    }
    // Hard format errors — don't retry, surface the platform message.
    if (/Invalid media|unsupported format|file too large|Media format unsupported/i.test(msg)) {
      return await fail(sb, target_id, msg, target.attempt_count, true);
    }
    // Otherwise retry with backoff.
    return await fail(sb, target_id, msg, target.attempt_count, false);
  }
});

// ─── IG Reels publish (3-step container flow) ──────────────────────
async function publishInstagramReel(args: {
  igUserId: string; accessToken: string; videoUrl: string; caption: string;
}) {
  // 1. Create container
  const createUrl = new URL(`${FB_API}/${args.igUserId}/media`);
  createUrl.searchParams.set("media_type", "REELS");
  createUrl.searchParams.set("video_url", args.videoUrl);
  createUrl.searchParams.set("caption", args.caption);
  createUrl.searchParams.set("access_token", args.accessToken);
  const cRes = await fetch(createUrl, { method: "POST" });
  if (!cRes.ok) throw new Error(`IG create container: ${cRes.status} ${await cRes.text()}`);
  const { id: containerId } = await cRes.json();

  // 2. Poll status (every 10s, up to 5 min)
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    const sRes = await fetch(`${FB_API}/${containerId}?fields=status_code&access_token=${args.accessToken}`);
    if (!sRes.ok) throw new Error(`IG poll status: ${sRes.status} ${await sRes.text()}`);
    const s = await sRes.json();
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR")    throw new Error(`IG processing failed: ${JSON.stringify(s)}`);
    if (s.status_code === "EXPIRED")  throw new Error("IG container expired before publish");
  }

  // 3. Publish
  const pubUrl = new URL(`${FB_API}/${args.igUserId}/media_publish`);
  pubUrl.searchParams.set("creation_id", containerId);
  pubUrl.searchParams.set("access_token", args.accessToken);
  const pRes = await fetch(pubUrl, { method: "POST" });
  if (!pRes.ok) throw new Error(`IG publish: ${pRes.status} ${await pRes.text()}`);
  const { id: mediaId } = await pRes.json();

  // 4. Permalink
  let permalink = `https://www.instagram.com/reel/${mediaId}/`;
  const permRes = await fetch(`${FB_API}/${mediaId}?fields=permalink&access_token=${args.accessToken}`);
  if (permRes.ok) {
    const { permalink: p } = await permRes.json();
    if (p) permalink = p;
  }
  return { post_id: mediaId, post_url: permalink };
}

// ─── FB Reels publish (start → upload → finish) ─────────────────────
async function publishFacebookReel(args: {
  pageId: string; accessToken: string; videoUrl: string; caption: string;
}) {
  // 1. Start
  const startUrl = new URL(`${FB_API}/${args.pageId}/video_reels`);
  startUrl.searchParams.set("upload_phase", "start");
  startUrl.searchParams.set("access_token", args.accessToken);
  const startRes = await fetch(startUrl, { method: "POST" });
  if (!startRes.ok) throw new Error(`FB Reels start: ${startRes.status} ${await startRes.text()}`);
  const { video_id, upload_url } = await startRes.json();

  // 2. Upload via URL (Meta pulls the file)
  const uploadRes = await fetch(upload_url, {
    method: "POST",
    headers: { "file_url": args.videoUrl, "Authorization": `OAuth ${args.accessToken}` },
  });
  if (!uploadRes.ok) throw new Error(`FB Reels upload: ${uploadRes.status} ${await uploadRes.text()}`);

  // 3. Finish
  const finishUrl = new URL(`${FB_API}/${args.pageId}/video_reels`);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_id", video_id);
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", args.caption);
  finishUrl.searchParams.set("access_token", args.accessToken);
  const finishRes = await fetch(finishUrl, { method: "POST" });
  if (!finishRes.ok) throw new Error(`FB Reels finish: ${finishRes.status} ${await finishRes.text()}`);

  return { post_id: video_id, post_url: `https://www.facebook.com/reel/${video_id}` };
}

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fail(sb: any, id: string, reason: string, attempt: number, terminal: boolean) {
  const isTerminal = terminal || attempt >= MAX_ATTEMPTS;
  const minutes = BACKOFF_MIN[Math.min(attempt - 1, BACKOFF_MIN.length - 1)];
  await sb.from("scheduled_post_targets").update({
    status: isTerminal ? "failed" : "pending",
    last_error: reason,
    next_attempt_at: isTerminal ? null : new Date(Date.now() + minutes * 60_000).toISOString(),
  }).eq("id", id);
  return new Response(JSON.stringify({ error: reason, terminal: isTerminal }), {
    status: isTerminal ? 400 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
