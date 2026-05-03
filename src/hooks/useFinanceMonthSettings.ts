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

type Defaults = { salary_payout: number; tax_rate: number; employee_salary: number };

export function useFinanceMonthSettings(month: string) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<FinanceMonthSettings | null>(null);
  // Defaults inherited from the most recent prior month so users don't re-enter
  // their salary every month. Only used when no row exists for the current month.
  const [inheritedDefaults, setInheritedDefaults] = useState<Defaults>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data }, { data: prior }] = await Promise.all([
      supabase
        .from("finance_month_settings")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", month)
        .maybeSingle(),
      supabase
        .from("finance_month_settings")
        .select("salary_payout, tax_rate, employee_salary")
        .eq("user_id", user.id)
        .lt("month", month)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setSettings((data as FinanceMonthSettings | null) ?? null);
    setInheritedDefaults(prior ? (prior as Defaults) : DEFAULTS);
    setLoading(false);
  }, [user, month]);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const saveSettings = useCallback(
    async (patch: Partial<Pick<FinanceMonthSettings, "salary_payout" | "tax_rate" | "employee_salary">>) => {
      if (!user) return null;
      const base = settings ?? { ...inheritedDefaults, month, user_id: user.id };
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
    effectiveSettings: settings ?? { ...inheritedDefaults, id: "", month, user_id: user?.id ?? "" },
    loading,
    saveSettings,
    refresh: fetchSettings,
  };
}
