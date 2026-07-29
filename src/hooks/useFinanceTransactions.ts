import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type FinanceCategory =
  | "SMMA" | "Bi-Weekly Fee" | "One-Time Project" | "Other Income"
  | "Subscriptions" | "Ad Spend" | "Travel" | "Food & Meals"
  | "Contractors" | "Software" | "Payroll" | "Other";

export interface FinanceTransaction {
  id: string;
  user_id: string;
  type: "income" | "expense";
  amount: number;
  deductible_amount: number | null;
  vendor: string | null;
  client: string | null;
  category: FinanceCategory;
  description: string | null;
  payment_method: string | null;
  date: string;            // YYYY-MM-DD
  is_ar: boolean;
  raw_input: string | null;
  attachment_url: string | null;
  recurring_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export type NewFinanceTransaction = Omit<
  FinanceTransaction,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type RecurrenceInterval = "monthly" | "annual";

/**
 * Which occurrences of a recurring subscription an edit or delete applies to.
 * "this_month" touches only the generated transaction row; "future" also
 * rewrites the template, so every month generated from here on inherits it.
 */
export type RecurrenceScope = "this_month" | "future";

/** Template fields a recurring edit can propagate forward. */
export interface RecurringTemplatePatch {
  amount?: number;
  vendor?: string | null;
  client?: string | null;
  category?: FinanceCategory;
  description?: string | null;
  interval?: RecurrenceInterval;
  day_of_month?: number;
}

/** The month immediately before the given "YYYY-MM". */
function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function monthBoundaries(month: string): { start: string; end: string } {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { start, end };
}

export function useFinanceTransactions(month: string) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTx = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    // Materialise any missing recurring instances for this month before fetching.
    try {
      await supabase.rpc("finance_generate_recurring", {
        p_user_id: user.id,
        p_month: month,
      });
    } catch { /* non-fatal — fall through and fetch whatever is there */ }

    const { start, end } = monthBoundaries(month);
    const { data, error } = await supabase
      .from("finance_transactions")
      .select("*")
      .gte("date", start)
      .lt("date", end)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setTransactions([]);
    } else {
      setTransactions((data ?? []) as FinanceTransaction[]);
    }
    setLoading(false);
  }, [user, month]);

  useEffect(() => { void fetchTx(); }, [fetchTx]);

  const createTransaction = useCallback(
    async (
      tx: NewFinanceTransaction,
      recurrence?: { interval: RecurrenceInterval } | null,
    ): Promise<FinanceTransaction | null> => {
      if (!user) return null;

      // Recurring entry → create the template first, then insert the linked instance.
      let recurringId: string | null = null;
      if (recurrence) {
        const anchorMonth = tx.date.slice(0, 7); // YYYY-MM
        const anchorDay = parseInt(tx.date.slice(8, 10), 10) || 1;
        const { data: tpl, error: tplErr } = await supabase
          .from("finance_recurring_subscriptions")
          .insert({
            user_id: user.id,
            type: tx.type,
            vendor: tx.vendor,
            client: tx.client,
            category: tx.category,
            description: tx.description,
            amount: tx.amount,
            payment_method: tx.payment_method,
            deductible_ratio: tx.category === "Food & Meals" ? 0.5 : null,
            interval: recurrence.interval,
            day_of_month: anchorDay,
            start_month: anchorMonth,
            last_generated_month: anchorMonth,
          })
          .select("id")
          .single();
        if (tplErr || !tpl) {
          toast.error(`Couldn't create recurring template: ${tplErr?.message ?? "unknown"}`);
          return null;
        }
        recurringId = tpl.id as string;
      }

      const payload = { ...tx, user_id: user.id, recurring_subscription_id: recurringId };
      const { data, error } = await supabase
        .from("finance_transactions")
        .insert(payload)
        .select("*")
        .single();
      if (error) {
        toast.error(`Couldn't save entry: ${error.message}`);
        return null;
      }
      setTransactions((prev) => [data as FinanceTransaction, ...prev]);
      return data as FinanceTransaction;
    },
    [user],
  );

  const updateTransaction = useCallback(
    async (id: string, patch: Partial<NewFinanceTransaction>) => {
      const { data, error } = await supabase
        .from("finance_transactions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        toast.error(`Couldn't update entry: ${error.message}`);
        return null;
      }
      setTransactions((prev) => prev.map((t) => (t.id === id ? (data as FinanceTransaction) : t)));
      return data as FinanceTransaction;
    },
    [],
  );

  const convertToRecurring = useCallback(
    async (
      txId: string,
      interval: RecurrenceInterval,
    ): Promise<FinanceTransaction | null> => {
      if (!user) return null;
      const tx = transactions.find((t) => t.id === txId);
      if (!tx) {
        toast.error("Transaction not found");
        return null;
      }
      if (tx.recurring_subscription_id) {
        toast.error("Already a recurring subscription");
        return null;
      }
      const anchorMonth = tx.date.slice(0, 7);
      const anchorDay = parseInt(tx.date.slice(8, 10), 10) || 1;
      const { data: tpl, error: tplErr } = await supabase
        .from("finance_recurring_subscriptions")
        .insert({
          user_id: user.id,
          type: tx.type,
          vendor: tx.vendor,
          client: tx.client,
          category: tx.category,
          description: tx.description,
          amount: tx.amount,
          payment_method: tx.payment_method,
          deductible_ratio: tx.category === "Food & Meals" ? 0.5 : null,
          interval,
          day_of_month: anchorDay,
          start_month: anchorMonth,
          last_generated_month: anchorMonth,
        })
        .select("id")
        .single();
      if (tplErr || !tpl) {
        toast.error(`Couldn't create recurring template: ${tplErr?.message ?? "unknown"}`);
        return null;
      }
      const { data, error } = await supabase
        .from("finance_transactions")
        .update({ recurring_subscription_id: tpl.id })
        .eq("id", txId)
        .select("*")
        .single();
      if (error) {
        toast.error(`Couldn't link transaction: ${error.message}`);
        return null;
      }
      setTransactions((prev) => prev.map((t) => (t.id === txId ? (data as FinanceTransaction) : t)));
      return data as FinanceTransaction;
    },
    [user, transactions],
  );

  /**
   * Push an edit onto the recurring template so future generated months
   * inherit it. The already-generated row for the current month is updated
   * by the caller (updateTransaction) — the template only governs months
   * that haven't been materialised yet.
   */
  const updateRecurringTemplate = useCallback(
    async (templateId: string, patch: RecurringTemplatePatch) => {
      const { error } = await supabase
        .from("finance_recurring_subscriptions")
        .update({
          ...patch,
          // Keep the derived deductible ratio consistent with the category,
          // matching what convertToRecurring sets on creation.
          ...(patch.category !== undefined
            ? { deductible_ratio: patch.category === "Food & Meals" ? 0.5 : null }
            : {}),
        })
        .eq("id", templateId);
      if (error) {
        toast.error(`Couldn't update the recurring subscription: ${error.message}`);
        return false;
      }
      return true;
    },
    [],
  );

  /**
   * End a subscription so it stops generating from `fromMonth` onward.
   * end_month is INCLUSIVE in the generator, so it's set to the month before
   * the one we want to stop at. Already-generated rows for later months are
   * cleaned up too — otherwise cancelling in July would leave an August row
   * behind if August had ever been viewed.
   */
  const cancelRecurring = useCallback(
    async (templateId: string, fromMonth: string) => {
      const { error } = await supabase
        .from("finance_recurring_subscriptions")
        .update({ end_month: previousMonth(fromMonth) })
        .eq("id", templateId);
      if (error) {
        toast.error(`Couldn't stop the subscription: ${error.message}`);
        return false;
      }
      const { error: cleanupErr } = await supabase
        .from("finance_transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("recurring_subscription_id", templateId)
        .is("deleted_at", null)
        .gte("date", `${fromMonth}-01`);
      if (cleanupErr) {
        toast.error(`Stopped it, but couldn't clear future months: ${cleanupErr.message}`);
        return false;
      }
      return true;
    },
    [],
  );

  /**
   * Delete a recurring instance for ONE month without ending the
   * subscription. Recorded on the template so the generator doesn't simply
   * re-create it the next time that month is opened.
   */
  const skipRecurringMonth = useCallback(async (templateId: string, month: string) => {
    const { data: tpl } = await (supabase as any)
      .from("finance_recurring_subscriptions")
      .select("skipped_months")
      .eq("id", templateId)
      .maybeSingle();
    const existing = ((tpl as { skipped_months?: string[] } | null)?.skipped_months) ?? [];
    if (existing.includes(month)) return true;
    // skipped_months was applied to prod by hand (see the 20260729 migration)
    // and isn't in the generated Supabase types yet — same drift class as
    // agency_goals. Cast the table access, not the result.
    const { error } = await (supabase as any)
      .from("finance_recurring_subscriptions")
      .update({ skipped_months: [...existing, month] })
      .eq("id", templateId);
    if (error) {
      toast.error(`Couldn't skip this month: ${error.message}`);
      return false;
    }
    return true;
  }, []);

  /**
   * Soft-delete one transaction. For a recurring instance, `scope` decides
   * whether this is a one-month skip or the end of the subscription — the
   * caller is expected to have asked. Defaults to the narrow action.
   */
  const deleteTransaction = useCallback(
    async (id: string, scope: RecurrenceScope = "this_month") => {
      const tx = transactions.find((t) => t.id === id);
      const templateId = tx?.recurring_subscription_id ?? null;
      const txMonth = tx?.date?.slice(0, 7) ?? null;

      if (templateId && txMonth) {
        if (scope === "future") {
          // cancelRecurring already soft-deletes this month and every later
          // generated row, so there's nothing further to delete here.
          const ok = await cancelRecurring(templateId, txMonth);
          if (!ok) return false;
          setTransactions((prev) => prev.filter((t) => t.id !== id));
          return true;
        }
        const ok = await skipRecurringMonth(templateId, txMonth);
        if (!ok) return false;
      }

      const { error } = await supabase
        .from("finance_transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        toast.error(`Couldn't delete entry: ${error.message}`);
        return false;
      }
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      return true;
    },
    [transactions, cancelRecurring, skipRecurringMonth],
  );

  const income = useMemo(() => transactions.filter((t) => t.type === "income"), [transactions]);
  const expenses = useMemo(() => transactions.filter((t) => t.type === "expense"), [transactions]);

  return {
    transactions,
    income,
    expenses,
    loading,
    error,
    refresh: fetchTx,
    createTransaction,
    updateTransaction,
    convertToRecurring,
    updateRecurringTemplate,
    cancelRecurring,
    skipRecurringMonth,
    deleteTransaction,
  };
}
