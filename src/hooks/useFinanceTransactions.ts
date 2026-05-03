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

  const deleteTransaction = useCallback(async (id: string) => {
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
  }, []);

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
    deleteTransaction,
  };
}
