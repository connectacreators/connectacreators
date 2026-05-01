import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Repeat, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { NewFinanceTransaction, FinanceCategory, RecurrenceInterval } from "@/hooks/useFinanceTransactions";

const INCOME_CATEGORIES: FinanceCategory[] = ["SMMA", "Bi-Weekly Fee", "One-Time Project", "Other Income"];
const EXPENSE_CATEGORIES: FinanceCategory[] = [
  "Subscriptions", "Ad Spend", "Travel", "Food & Meals",
  "Contractors", "Software", "Payroll", "Other",
];

type Props = {
  initial?: Partial<NewFinanceTransaction>;
  onCancel: () => void;
  onSave: (tx: NewFinanceTransaction, recurrence?: { interval: RecurrenceInterval } | null) => void;
  allowRecurring?: boolean; // default true — hidden in edit mode where recurrence lives on the template
};

export function ManualEntryForm({ initial, onCancel, onSave, allowRecurring = true }: Props) {
  const [type, setType] = useState<"income" | "expense">(initial?.type ?? "expense");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [category, setCategory] = useState<FinanceCategory>(
    (initial?.category as FinanceCategory) ?? (type === "income" ? "SMMA" : "Other"),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [isAr, setIsAr] = useState(initial?.is_ar ?? false);
  // Only relevant when allowRecurring (create flow). Editing a recurring row
  // hides these — the template is edited separately.
  const [recurring, setRecurring] = useState<boolean>(false);
  const [interval, setInterval] = useState<RecurrenceInterval>("monthly");

  // Edit-mode recurrence management: if this row is linked to a recurring
  // template, load the template so we can edit/stop it.
  const templateId = initial?.recurring_subscription_id ?? null;
  const [template, setTemplate] = useState<{
    id: string;
    interval: RecurrenceInterval;
    day_of_month: number;
    end_month: string | null;
  } | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [tplInterval, setTplInterval] = useState<RecurrenceInterval>("monthly");
  const [tplDay, setTplDay] = useState<number>(1);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    setTemplateLoading(true);
    (async () => {
      const { data } = await supabase
        .from("finance_recurring_subscriptions")
        .select("id, interval, day_of_month, end_month")
        .eq("id", templateId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setTemplate(data as any);
        setTplInterval(data.interval as RecurrenceInterval);
        setTplDay(data.day_of_month as number);
      }
      setTemplateLoading(false);
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  async function saveTemplatePatch(patch: Partial<{ interval: RecurrenceInterval; day_of_month: number; end_month: string | null }>) {
    if (!templateId) return;
    const { error } = await supabase
      .from("finance_recurring_subscriptions")
      .update(patch)
      .eq("id", templateId);
    if (error) {
      toast.error(`Couldn't update recurrence: ${error.message}`);
      return false;
    }
    return true;
  }

  async function handleStopRecurring() {
    if (!templateId || !template) return;
    if (!confirm("Stop generating future instances of this subscription? Past entries stay.")) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    setStopping(true);
    const ok = await saveTemplatePatch({ end_month: currentMonth });
    setStopping(false);
    if (ok) {
      toast.success("Recurring stopped. No future instances will be generated.");
      setTemplate({ ...template, end_month: currentMonth });
    }
  }

  async function handleResumeRecurring() {
    if (!templateId || !template) return;
    const ok = await saveTemplatePatch({ end_month: null });
    if (ok) {
      toast.success("Recurring resumed");
      setTemplate({ ...template, end_month: null });
    }
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function handleSave() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const deductible = category === "Food & Meals" ? amt * 0.5 : null;

    // If editing a recurring instance and the template controls changed,
    // persist the template edit first so future months pick up the change.
    if (templateId && template && (
      tplInterval !== template.interval || tplDay !== template.day_of_month
    )) {
      const ok = await saveTemplatePatch({ interval: tplInterval, day_of_month: tplDay });
      if (!ok) return;
    }

    const tx: NewFinanceTransaction = {
      type,
      amount: amt,
      vendor: vendor || null,
      client: client || null,
      category,
      description: description || null,
      date,
      is_ar: type === "income" ? isAr : false,
      deductible_amount: deductible,
      payment_method: null,
      raw_input: initial?.raw_input ?? null,
      attachment_url: null,
      recurring_subscription_id: initial?.recurring_subscription_id ?? null,
    };
    const recurrence = allowRecurring && recurring ? { interval } : null;
    onSave(tx, recurrence);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onValueChange={(v) => { setType(v as "income" | "expense"); setCategory(v === "income" ? "SMMA" : "Other"); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Select value={category} onValueChange={(v) => setCategory(v as FinanceCategory)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <Input placeholder="Client" value={client} onChange={(e) => setClient(e.target.value)} />
      </div>
      <Textarea placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 items-center">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {type === "income" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={isAr} onChange={(e) => setIsAr(e.target.checked)} />
            Not yet collected (A/R)
          </label>
        )}
      </div>
      {allowRecurring && (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/40">
          <label className="flex items-center gap-2 text-sm cursor-pointer flex-1">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            <Repeat className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground">Recurring subscription</span>
          </label>
          {recurring && (
            <Select value={interval} onValueChange={(v) => setInterval(v as RecurrenceInterval)}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {templateId && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Recurring subscription</span>
            {template?.end_month && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                Stopped · {template.end_month}
              </span>
            )}
          </div>
          {templateLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : template ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                These settings apply to all future months. Editing amount above only changes this month's instance.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Interval</label>
                  <Select value={tplInterval} onValueChange={(v) => setTplInterval(v as RecurrenceInterval)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Day of month (1–31)</label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    className="h-8 text-xs"
                    value={tplDay}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n)) setTplDay(Math.max(1, Math.min(31, n)));
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                {template.end_month ? (
                  <Button variant="outline" size="sm" onClick={handleResumeRecurring}>
                    <Repeat className="w-3.5 h-3.5 mr-1.5" /> Resume recurring
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleStopRecurring} disabled={stopping}>
                    {stopping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-400" />}
                    Stop recurring
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Template not found.</p>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="cta" size="sm" onClick={handleSave} disabled={!amount}>Save</Button>
      </div>
    </div>
  );
}
