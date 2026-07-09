import { useState } from "react";
import { Pencil, Trash2, ArrowDownRight, ArrowUpRight, CircleDollarSign, Utensils, Loader2, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManualEntryForm } from "@/components/finances/ManualEntryForm";
import type { FinanceTransaction, NewFinanceTransaction, RecurrenceInterval } from "@/hooks/useFinanceTransactions";

type Props = {
  title: string;
  kind: "income" | "expense";
  transactions: FinanceTransaction[];
  onUpdate: (id: string, patch: Partial<NewFinanceTransaction>) => Promise<FinanceTransaction | null>;
  onConvertToRecurring: (id: string, interval: RecurrenceInterval) => Promise<FinanceTransaction | null>;
  onDelete: (id: string) => Promise<boolean>;
};

export function TransactionList({ title, kind, transactions, onUpdate, onConvertToRecurring, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const total = transactions.reduce((a, t) => a + t.amount, 0);

  if (transactions.length === 0) {
    return (
      <section className="space-y-2">
        <Heading kind={kind}>{title}</Heading>
        <div className="rounded-xl border border-dashed border-border/60 p-4 text-xs text-muted-foreground text-center">
          No {kind === "income" ? "income" : "expense"} entries yet this month.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <Heading kind={kind} total={total}>{title}</Heading>
      <div className="space-y-2">
        {transactions.map((t) => (
          <div key={t.id}>
            {editingId === t.id ? (
              <ManualEntryForm
                initial={t}
                allowRecurring={!t.recurring_subscription_id}
                onCancel={() => setEditingId(null)}
                onSave={async (patch, recurrence) => {
                  const saved = await onUpdate(t.id, patch);
                  if (!saved) return;
                  if (recurrence && !t.recurring_subscription_id) {
                    await onConvertToRecurring(t.id, recurrence.interval);
                  }
                  setEditingId(null);
                }}
              />
            ) : (
              <Row
                t={t}
                kind={kind}
                onEdit={() => setEditingId(t.id)}
                onDelete={async () => {
                  if (!confirm("Delete this entry? (Soft-delete — recoverable from DB if needed.)")) return;
                  setDeletingId(t.id);
                  await onDelete(t.id);
                  setDeletingId(null);
                }}
                deleting={deletingId === t.id}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Heading({ kind, total, children }: { kind: "income" | "expense"; total?: number; children: React.ReactNode }) {
  const Icon = kind === "income" ? ArrowUpRight : ArrowDownRight;
  const color = kind === "income" ? "text-emerald-400" : "text-red-400";
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${color}`} />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">{children}</h2>
      <div className="flex-1 h-px bg-border/60" />
      {total != null && total > 0 && (
        <span className={`text-xs font-semibold tabular-nums ${color}`}>{formatUsd(total)}</span>
      )}
    </div>
  );
}

function Row({
  t, kind, onEdit, onDelete, deleting,
}: {
  t: FinanceTransaction;
  kind: "income" | "expense";
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const primary = t.vendor || t.client || t.description || t.category;
  const isArFlag = t.is_ar && kind === "income";
  const isFoodDeductible = t.category === "Food & Meals" && t.deductible_amount != null;

  return (
    // Whole row opens the edit form — on phones it's the only edit affordance
    // (the pencil is desktop-only to keep rows uncluttered).
    <div
      onClick={onEdit}
      className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 hover:bg-card transition-colors p-3 cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-foreground text-sm truncate">{primary}</p>
          {isArFlag && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              A/R
            </span>
          )}
          {isFoodDeductible && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
              <Utensils className="w-2.5 h-2.5" /> 50%
            </span>
          )}
          {t.recurring_subscription_id && (
            <span title="Recurring subscription" className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
              <Repeat className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {[
            t.category,
            // Skip the description when it just repeats the title or category
            t.description && t.description !== primary && t.description !== t.category ? t.description : null,
            new Date(t.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-semibold tabular-nums ${kind === "income" ? "text-emerald-400" : "text-foreground"}`}>
          {formatUsd(t.amount)}
        </span>
        {/* Trash always reachable (hover never fires on touch); pencil is
            desktop-only — on phones tapping the row edits. */}
        <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ml-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 hidden lg:inline-flex" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={deleting}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
