import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface FinanceMonthSettings {
  id: string;
  user_id: string;
  month: string;
  salary_payout: number;
  tax_rate: number;
  employee_salary: number;
}

const DEFAULTS = { salary_payout: 0, tax_rate: 0.25, employee_salary: 0 };

export function useFinanceMonthSettings(month: string) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<FinanceMonthSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("finance_month_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle();
    setSettings((data as FinanceMonthSettings | null) ?? null);
    setLoading(false);
  }, [user, month]);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const saveSettings = useCallback(
    async (patch: Partial<Pick<FinanceMonthSettings, "salary_payout" | "tax_rate" | "employee_salary">>) => {
      if (!user) return null;
      const base = settings ?? { ...DEFAULTS, month, user_id: user.id };
      const merged = { ...base, ...patch, user_id: user.id, month };
      const { data, error } = await supabase
        .from("finance_month_settings")
        .upsert(merged, { onConflict: "user_id,month" })
        .select("*")
        .single();
      if (error) {
        toast.error(`Couldn't save month settings: ${error.message}`);
        return null;
      }
      setSettings(data as FinanceMonthSettings);
      return data as FinanceMonthSettings;
    },
    [settings, user, month],
  );

  return {
    settings,
    effectiveSettings: settings ?? { ...DEFAULTS, id: "", month, user_id: user?.id ?? "" },
    loading,
    saveSettings,
    refresh: fetchSettings,
  };
}
