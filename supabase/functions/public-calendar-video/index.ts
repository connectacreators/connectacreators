import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public, no-login signed-video resolver for the shared content-calendar link.
// The calendar's `file_submission` is a bare Storage path inside the private
// `footage` / `footage-proxies` buckets (anon cannot read them). This endpoint
// validates that the post belongs to the supplied client_id (same ownership
// model as public-review-post) and then signs a short-lived URL with the
// service role so the public viewer can play the video without an account.
//
// For each path it signs the FRESHEST copy across footage / footage-proxies
// (a stale proxy must never win over a newer re-uploaded submission), trying
// file_submission first and falling back to the raw storage_path.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGN_TTL = 60 * 60; // 1 hour

function isHttpUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const postId: string | undefined = body.post_id ?? body.id;
    const clientId: string | undefined = body.client_id;
    if (!postId || !clientId) {
      return new Response(JSON.stringify({ error: "post_id and client_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Ownership gate — the post must exist AND belong to this client.
    const { data: row, error: fetchErr } = await service
      .from("video_edits")
      .select("id, client_id, file_submission, storage_path")
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row || row.client_id !== clientId) {
      return new Response(JSON.stringify({ error: "Post not found for this calendar" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileSubmission: string | null = row.file_submission;
    const storagePath: string | null = row.storage_path;

    // If the submission is already a full URL (e.g. a Google Drive link), the
    // client renders it directly — nothing to sign.
    if (fileSubmission && isHttpUrl(fileSubmission)) {
      return new Response(JSON.stringify({ url: fileSubmission, kind: "external" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the FRESHEST copy of a given storage path. The render-worker
    // writes a small web proxy to footage-proxies mirroring the footage path,
    // but that proxy can lag behind a re-uploaded submission (a stale proxy is
    // exactly why the calendar used to show an old version). So we look up the
    // object's timestamp in both buckets and prefer whichever is newer; only on
    // a tie do we favour the lighter proxy.
    const tsOf = async (bucket: string, fullPath: string): Promise<number | null> => {
      const slash = fullPath.lastIndexOf("/");
      const dir = slash >= 0 ? fullPath.slice(0, slash) : "";
      const base = slash >= 0 ? fullPath.slice(slash + 1) : fullPath;
      const { data } = await service.storage.from(bucket).list(dir, { search: base, limit: 100 });
      const f = data?.find((x: { name: string }) => x.name === base) as
        | { name: string; updated_at?: string; created_at?: string }
        | undefined;
      if (!f) return null;
      return new Date(f.updated_at || f.created_at || 0).getTime();
    };

    const signFreshest = async (fullPath: string) => {
      const [tFootage, tProxy] = await Promise.all([
        tsOf("footage", fullPath),
        tsOf("footage-proxies", fullPath),
      ]);
      if (tFootage === null && tProxy === null) return null;
      // Newer wins; tie (or proxy-only) favours the lighter proxy.
      const preferProxy = tProxy !== null && (tFootage === null || tProxy >= tFootage);
      const order = preferProxy ? ["footage-proxies", "footage"] : ["footage", "footage-proxies"];
      for (const bucket of order) {
        const { data, error } = await service.storage.from(bucket).createSignedUrl(fullPath, SIGN_TTL);
        if (!error && data?.signedUrl) return { url: data.signedUrl, bucket };
      }
      return null;
    };

    for (const path of [fileSubmission, storagePath].filter(Boolean) as string[]) {
      const signed = await signFreshest(path);
      if (signed) {
        return new Response(JSON.stringify({ url: signed.url, kind: "video", bucket: signed.bucket }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "No playable video found", url: null }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("public-calendar-video error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
