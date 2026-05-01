import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FinanceCategory } from "@/hooks/useFinanceTransactions";

export interface ParsedFinanceEntry {
  type: "income" | "expense";
  amount: number;
  vendor?: string;
  client?: string;
  category: FinanceCategory;
  description?: string;
  date: string;
  payment_method?: string;
  is_ar?: boolean;
  deductible_amount?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
}

export type AIEntryResult =
  | { kind: "parsed"; entry: ParsedFinanceEntry }
  | { kind: "unparseable" }
  | { kind: "error"; message: string };

export function useFinanceAI() {
  const [loading, setLoading] = useState(false);

  const parseEntry = useCallback(async (raw: string): Promise<AIEntryResult> => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("finance-parse-entry", {
        body: { raw, today },
      });
      if (error) {
        return { kind: "error", message: error.message };
      }
      if (!data) {
        return { kind: "unparseable" };
      }
      if (data.error === "unparseable") {
        return { kind: "unparseable" };
      }
      if (data.error) {
        return { kind: "error", message: String(data.error) };
      }
      if (!data.parsed) {
        return { kind: "unparseable" };
      }
      return { kind: "parsed", entry: data.parsed as ParsedFinanceEntry };
    } catch (e: any) {
      return { kind: "error", message: e?.message ?? "unknown" };
    } finally {
      setLoading(false);
    }
  }, []);

  return { parseEntry, loading };
}
