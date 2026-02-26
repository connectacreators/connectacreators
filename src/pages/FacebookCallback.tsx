import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

// This page is opened in a POPUP by StepConfigModal.
// It receives ?code=...&state=... from Facebook OAuth redirect.
// After processing, it postMessages the result to the opener and closes.

export default function FacebookCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Facebook account...");

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      const reason = url.searchParams.get("error_description") || "Permission denied";
      setStatus("error");
      setMessage(reason);
      window.opener?.postMessage(
        { type: "FACEBOOK_AUTH_ERROR", error: reason },
        window.location.origin
      );
      setTimeout(() => window.close(), 2500);
      return;
    }

    if (!code || !stateParam) {
      setStatus("error");
      setMessage("Invalid callback — missing code or state.");
      window.opener?.postMessage(
        { type: "FACEBOOK_AUTH_ERROR", error: "Missing callback params" },
        window.location.origin
      );
      setTimeout(() => window.close(), 2500);
      return;
    }

    // Decode state to get client_id
    let clientId = "";
    let returnPath = "/dashboard";
    try {
      const stateObj = JSON.parse(atob(stateParam));
      clientId = stateObj.client_id;
      returnPath = stateObj.return_path;
    } catch {
      setStatus("error");
      setMessage("Invalid state parameter.");
      window.opener?.postMessage(
        { type: "FACEBOOK_AUTH_ERROR", error: "Bad state" },
        window.location.origin
      );
      setTimeout(() => window.close(), 2500);
      return;
    }

    // Call facebook-oauth edge function to exchange code and save pages
    supabase.functions
      .invoke("facebook-oauth", {
        body: {
          action: "callback",
          code,
          client_id: clientId,
          state: stateParam,
        },
      })
      .then(({ data, error: invokeError }) => {
        if (invokeError || !data?.success) {
          const errMsg =
            invokeError?.message || data?.error || "Connection failed";
          setStatus("error");
          setMessage(errMsg);
          window.opener?.postMessage(
            { type: "FACEBOOK_AUTH_ERROR", error: errMsg },
            window.location.origin
          );
          setTimeout(() => window.close(), 3000);
          return;
        }

        // Success
        setStatus("success");
        setMessage(
          `Connected ${data.pages?.length || 0} Facebook page(s) successfully!`
        );
        // Send pages data back to parent
        window.opener?.postMessage(
          {
            type: "FACEBOOK_AUTH_SUCCESS",
            pages: data.pages,
            client_id: clientId,
          },
          window.location.origin
        );
        setTimeout(() => window.close(), 2000);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 p-8">
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto" />
            <p className="text-sm text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-sm text-green-400 font-medium">{message}</p>
            <p className="text-xs text-muted-foreground">Closing window...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-sm text-red-400 font-medium">Connection failed</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">Closing window...</p>
          </>
        )}
      </div>
    </div>
  );
}
