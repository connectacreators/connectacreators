import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// This page receives ?code=...&state=... from Facebook OAuth redirect.
//
// Two flows, distinguished by `purpose` encoded in state:
//   - purpose: "leads"      (default) — opened in a POPUP; postMessages result, closes
//   - purpose: "scheduler"  — full-page redirect; renders page picker inline, navigates back

type Status = "loading" | "success" | "error" | "pick_page";

interface PageOption { page_id: string; page_name: string; has_instagram: boolean }

export default function FacebookCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Connecting your Facebook account...");
  const [pages, setPages] = useState<PageOption[]>([]);
  const [purpose, setPurpose] = useState<"leads" | "scheduler">("leads");
  const [returnPath, setReturnPath] = useState<string>("/dashboard");
  const [clientId, setClientId] = useState<string>("");
  // Echoed back to the edge fn on the second call so it doesn't re-exchange
  // the single-use OAuth code.
  const [userToken, setUserToken] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const reason = url.searchParams.get("error_description") || "Permission denied";
      handleError(reason, "leads");
      return;
    }

    if (!code || !stateParam) {
      handleError("Invalid callback — missing code or state.", "leads");
      return;
    }

    // Decode state
    let stateObj: { client_id: string; return_path: string; purpose?: "leads" | "scheduler" };
    try {
      stateObj = JSON.parse(atob(stateParam));
    } catch {
      handleError("Invalid state parameter.", "leads");
      return;
    }

    const p = stateObj.purpose ?? "leads";
    setPurpose(p);
    setReturnPath(stateObj.return_path);
    setClientId(stateObj.client_id);

    if (p === "scheduler") {
      void runSchedulerCallback(code, stateObj.client_id, stateParam);
    } else {
      void runLeadsCallback(code, stateObj.client_id, stateParam);
    }
  }, []);

  // ── Legacy leads flow (popup + postMessage) ─────────────────────────
  async function runLeadsCallback(code: string, client_id: string, stateParam: string) {
    const { data, error: invokeError } = await supabase.functions.invoke("facebook-oauth", {
      body: { action: "callback", code, client_id, state: stateParam },
    });
    if (invokeError || !data?.success) {
      const errMsg = invokeError?.message || data?.error || "Connection failed";
      handleError(errMsg, "leads");
      return;
    }
    setStatus("success");
    setMessage(`Connected ${data.pages?.length || 0} Facebook page(s) successfully!`);
    window.opener?.postMessage(
      { type: "FACEBOOK_AUTH_SUCCESS", pages: data.pages, client_id },
      window.location.origin,
    );
    setTimeout(() => window.close(), 2000);
  }

  // Raw fetch so we can read the response body on non-2xx — supabase-js's
  // functions.invoke wraps errors in a generic "non-2xx status code" message
  // that hides the actual reason.
  async function callEdgeFn(body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/facebook-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify(body),
    });
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* non-json body */ }
    if (!res.ok) {
      const detail = parsed?.error || (await res.text().catch(() => "")) || `HTTP ${res.status}`;
      return { data: null, error: `(${res.status}) ${detail}` };
    }
    return { data: parsed, error: parsed?.error ?? null };
  }

  // ── New scheduler flow (full-page redirect, page picker inline) ─────
  async function runSchedulerCallback(code: string, client_id: string, stateParam: string) {
    const { data, error } = await callEdgeFn({
      action: "connect_for_scheduling", code, client_id, state: stateParam,
    });
    if (error) { handleError(error, "scheduler"); return; }
    if (data?.needs_page_pick) {
      setPages(data.pages || []);
      setUserToken(data.user_token ?? null);
      setStatus("pick_page");
      return;
    }
    finishScheduler(data);
  }

  async function pickPage(page_id: string) {
    setStatus("loading");
    setMessage("Connecting page...");
    const url = new URL(window.location.href);
    const stateParam = url.searchParams.get("state")!;
    // Reuse the user_token from the first call — the OAuth code is single-use.
    const { data, error } = await callEdgeFn({
      action: "connect_for_scheduling", client_id: clientId, state: stateParam, page_id, user_token: userToken,
    });
    if (error) { handleError(error, "scheduler"); return; }
    finishScheduler(data);
  }

  function finishScheduler(data: any) {
    setStatus("success");
    const fbName = data?.facebook?.page_name ?? "(page)";
    const igHandle = data?.instagram?.username ? `@${data.instagram.username}` : null;
    setMessage(igHandle ? `Connected ${fbName} + ${igHandle}.` : `Connected ${fbName}. ${data?.ig_warning ?? ""}`);
    setTimeout(() => navigate(returnPath), 1500);
  }

  function handleError(reason: string, p: "leads" | "scheduler") {
    setStatus("error");
    setMessage(reason);
    if (p === "leads") {
      window.opener?.postMessage(
        { type: "FACEBOOK_AUTH_ERROR", error: reason },
        window.location.origin,
      );
      setTimeout(() => window.close(), 2500);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 p-8 max-w-md">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </>
        )}
        {status === "pick_page" && (
          <div className="space-y-3 text-left">
            <h2 className="text-lg font-semibold text-center">Pick a Facebook Page</h2>
            <p className="text-sm text-muted-foreground text-center">
              This Page's content will be posted to. Pages with a linked Instagram Business account connect both.
            </p>
            <div className="space-y-2">
              {pages.map((p) => (
                <Button
                  key={p.page_id}
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => pickPage(p.page_id)}
                >
                  <span>{p.page_name}</span>
                  {p.has_instagram && <span className="text-xs text-primary">+ Instagram</span>}
                </Button>
              ))}
            </div>
          </div>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-sm text-green-400 font-medium">{message}</p>
            <p className="text-xs text-muted-foreground">
              {purpose === "scheduler" ? "Redirecting..." : "Closing window..."}
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-sm text-red-400 font-medium">Connection failed</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            {purpose === "scheduler" ? (
              <Button onClick={() => navigate(returnPath)} className="mt-2">Back</Button>
            ) : (
              <p className="text-xs text-muted-foreground">Closing window...</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
