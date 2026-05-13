import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true when BOTH gates pass:
 *  - VITE_FEATURE_SCHEDULER is "true" at build time
 *  - The signed-in user has scheduler_beta_enabled = true in user_settings
 *
 * In dev (VITE_FEATURE_SCHEDULER=true) the env gate is open and only the
 * per-user opt-in matters. In prod, set the env to "false" to fully hide
 * the feature for everyone regardless of opt-in.
 */
export function useSchedulerEnabled(): { enabled: boolean; loading: boolean } {
  const envGate = import.meta.env.VITE_FEATURE_SCHEDULER === "true";
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(envGate);

  useEffect(() => {
    if (!envGate) {
      setEnabled(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setEnabled(false); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("user_settings")
        .select("scheduler_beta_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setEnabled(Boolean(data?.scheduler_beta_enabled));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [envGate]);

  return { enabled, loading };
}

export const FEATURE_SCHEDULER_ENV = import.meta.env.VITE_FEATURE_SCHEDULER === "true";
