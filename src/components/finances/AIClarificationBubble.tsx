import { MessageCircle, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParsedFinanceEntry } from "@/hooks/useFinanceAI";

type Props = {
  entry: ParsedFinanceEntry;
  onConfirm: (final: ParsedFinanceEntry) => void;
  onCancel: () => void;
};

export function AIClarificationBubble({ entry, onConfirm, onCancel }: Props) {
  const question = entry.clarificationQuestion ?? "Does this look right?";
  const options = entry.clarificationOptions ?? ["Yes, looks good", "Cancel"];

  function handleOption(opt: string) {
    const lower = opt.toLowerCase();
    if (lower.includes("cancel") || lower.includes("no")) {
      onCancel();
      return;
    }
    // Confirm with food-business toggle if applicable.
    if (entry.category === "Food & Meals") {
      const isBusiness = /team|business|client|meeting/.test(lower);
      onConfirm({
        ...entry,
        deductible_amount: isBusiness ? (entry.amount ?? 0) * 0.5 : 0,
        needsClarification: false,
      });
      return;
    }
    onConfirm({ ...entry, needsClarification: false });
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-card to-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <MessageCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{question}</p>
          <PreviewRow entry={entry} />
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        {options.map((opt) => (
          <Button
            key={opt}
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => handleOption(opt)}
          >
            <Check className="w-3 h-3 mr-1" />
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PreviewRow({ entry }: { entry: ParsedFinanceEntry }) {
  const label = entry.type === "income" ? "Income" : "Expense";
  const who = entry.vendor || entry.client || entry.description || entry.category;
  return (
    <p className="text-xs text-muted-foreground mt-1">
      <span className="uppercase tracking-wider font-semibold text-foreground/80">{label}</span>
      {" · "}
      <span>{formatUsd(entry.amount)}</span>
      {who ? <> · <span>{who}</span></> : null}
      {" · "}
      <span>{entry.category}</span>
    </p>
  );
}

function formatUsd(n: number | undefined) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
