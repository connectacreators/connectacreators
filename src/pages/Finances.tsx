import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, PlusCircle, DollarSign, LayoutList, Table2, PieChart } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  useFinanceTransactions,
  type FinanceTransaction,
  type NewFinanceTransaction,
  type FinanceCategory,
} from "@/hooks/useFinanceTransactions";
import { useFinanceMonthSettings } from "@/hooks/useFinanceMonthSettings";
import { useFinanceAI, type ParsedFinanceEntry } from "@/hooks/useFinanceAI";

import { AIEntryBar } from "@/components/finances/AIEntryBar";
import { AIClarificationBubble } from "@/components/finances/AIClarificationBubble";
import { ManualEntryForm } from "@/components/finances/ManualEntryForm";
import { TransactionList } from "@/components/finances/TransactionList";
import { FlatTransactionGrid } from "@/components/finances/FlatTransactionGrid";
import { CategoryBreakdownCard } from "@/components/finances/CategoryBreakdownCard";
import { FinanceCharts } from "@/components/finances/FinanceCharts";
import { MonthlySummary } from "@/components/finances/MonthlySummary";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: -1 | 1): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Finances() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [month, setMonth] = useState<string>(currentMonth());
  const [pendingEntry, setPendingEntry] = useState<ParsedFinanceEntry | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [view, setView] = useState<"cards" | "table" | "charts">("cards");
  const [incomeCatFilter, setIncomeCatFilter] = useState<FinanceCategory | null>(null);
  const [expenseCatFilter, setExpenseCatFilter] = useState<FinanceCategory | null>(null);

  const { income, expenses, loading, createTransaction, updateTransaction, convertToRecurring, deleteTransaction } =
    useFinanceTransactions(month);

  const filteredIncome = useMemo(
    () => incomeCatFilter ? income.filter((t) => t.category === incomeCatFilter) : income,
    [income, incomeCatFilter],
  );
  const filteredExpenses = useMemo(
    () => expenseCatFilter ? expenses.filter((t) => t.category === expenseCatFilter) : expenses,
    [expenses, expenseCatFilter],
  );

  const toggleIncomeCat = (cat: FinanceCategory) =>
    setIncomeCatFilter((prev) => (prev === cat ? null : cat));
  const toggleExpenseCat = (cat: FinanceCategory) =>
    setExpenseCatFilter((prev) => (prev === cat ? null : cat));
  const { effectiveSettings, saveSettings } = useFinanceMonthSettings(month);
  const { parseEntry, loading: aiLoading } = useFinanceAI();

  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  async function handleAISubmit(raw: string) {
    const result = await parseEntry(raw);
    if (result.kind === "parsed") {
      const entry = result.entry;
      if (entry.needsClarification || !entry.amount || entry.amount <= 0) {
        setPendingEntry(entry);
        return;
      }
      await persistFromEntry(entry, raw);
      return;
    }
    if (result.kind === "unparseable") {
      toast.info("Couldn't parse that — filling a manual form instead.");
      setShowManual(true);
      return;
    }
    toast.error(`AI error: ${result.message}`);
    setShowManual(true);
  }

  async function persistFromEntry(entry: ParsedFinanceEntry, raw?: string) {
    const deductible =
      entry.category === "Food & Meals"
        ? entry.deductible_amount ?? entry.amount * 0.5
        : null;
    const tx: NewFinanceTransaction = {
      type: entry.type,
      amount: entry.amount,
      deductible_amount: deductible,
      vendor: entry.vendor ?? null,
      client: entry.client ?? null,
      category: entry.category,
      description: entry.description ?? null,
      payment_method: entry.payment_method ?? null,
      date: entry.date || new Date().toISOString().slice(0, 10),
      is_ar: Boolean(entry.is_ar),
      raw_input: raw ?? null,
      attachment_url: null,
    };
    const created = await createTransaction(tx);
    if (created) {
      toast.success(`Logged ${entry.type === "income" ? "income" : "expense"}`);
      setPendingEntry(null);
    }
  }

  function handleCsvExport() {
    const rows: Array<Record<string, string | number | null>> = [];
    const allTx: FinanceTransaction[] = [...income, ...expenses].sort(
      (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0),
    );
    for (const t of allTx) {
      rows.push({
        Date: t.date,
        Type: t.type,
        Category: t.category,
        Vendor: t.vendor ?? "",
        Client: t.client ?? "",
        Description: t.description ?? "",
        Amount: t.amount.toFixed(2),
        Deductible: t.deductible_amount != null ? t.deductible_amount.toFixed(2) : "",
        AR: t.is_ar ? "yes" : "",
      });
    }
    if (rows.length === 0) {
      toast.info("No transactions to export this month.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finances-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Finances</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0 rounded-xl border border-border/60 bg-card/60 p-1">
              <Button
                variant={view === "cards" ? "cta" : "ghost"}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setView("cards")}
                title="Card view"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={view === "table" ? "cta" : "ghost"}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setView("table")}
                title="Table view (grouped by category)"
              >
                <Table2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={view === "charts" ? "cta" : "ghost"}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setView("charts")}
                title="Charts view"
              >
                <PieChart className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-3 text-sm font-medium text-foreground min-w-32 text-center">{monthLabel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Main column */}
          <div className="space-y-4">
            <AIEntryBar loading={aiLoading} onSubmit={handleAISubmit} />

            {pendingEntry && (
              <AIClarificationBubble
                entry={pendingEntry}
                onConfirm={(final) => persistFromEntry(final, final.description)}
                onCancel={() => setPendingEntry(null)}
              />
            )}

            {showManual && (
              <ManualEntryForm
                onCancel={() => setShowManual(false)}
                onSave={async (tx, recurrence) => {
                  const created = await createTransaction(tx, recurrence);
                  if (created) {
                    toast.success(recurrence ? "Recurring subscription added" : "Entry saved");
                    setShowManual(false);
                  }
                }}
              />
            )}

            {!showManual && !pendingEntry && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowManual(true)}>
                  <PlusCircle className="w-4 h-4 mr-1.5" /> Add manually
                </Button>
              </div>
            )}

            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : view === "table" ? (
              <>
                <FlatTransactionGrid
                  kind="income"
                  rows={filteredIncome}
                  onUpdate={updateTransaction}
                  onDelete={deleteTransaction}
                  onCreate={(tx) => createTransaction(tx, null)}
                  defaultDate={`${month}-01`}
                />
                <FlatTransactionGrid
                  kind="expense"
                  rows={filteredExpenses}
                  onUpdate={updateTransaction}
                  onDelete={deleteTransaction}
                  onCreate={(tx) => createTransaction(tx, null)}
                  defaultDate={`${month}-01`}
                />
              </>
            ) : view === "charts" ? (
              <FinanceCharts income={income} expenses={expenses} month={month} />
            ) : (
              <>
                <TransactionList
                  title="Income"
                  kind="income"
                  transactions={income}
                  onUpdate={updateTransaction}
                  onConvertToRecurring={convertToRecurring}
                  onDelete={deleteTransaction}
                />
                <TransactionList
                  title="Expenses"
                  kind="expense"
                  transactions={expenses}
                  onUpdate={updateTransaction}
                  onConvertToRecurring={convertToRecurring}
                  onDelete={deleteTransaction}
                />
              </>
            )}
          </div>

          {/* Summary column */}
          <aside className="space-y-3">
            <MonthlySummary
              income={income}
              expenses={expenses}
              settings={effectiveSettings}
              onSaveSettings={(patch) => { void saveSettings(patch); }}
              onExportCsv={handleCsvExport}
            />
            {view === "table" && (
              <>
                <CategoryBreakdownCard
                  kind="income"
                  rows={income}
                  activeCategory={incomeCatFilter}
                  onCategoryToggle={toggleIncomeCat}
                />
                <CategoryBreakdownCard
                  kind="expense"
                  rows={expenses}
                  activeCategory={expenseCatFilter}
                  onCategoryToggle={toggleExpenseCat}
                />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
