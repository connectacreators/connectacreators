// "Does this apply to just this month, or every month from here on?" — the
// question a recurring subscription has to ask before an edit or a delete.
//
// Without it the app silently picked one: edits changed only the current
// month's generated row (so raising a retainer looked applied but every
// future month kept the old amount), and deletes removed one row while the
// subscription kept generating. Both are defensible defaults; neither is
// guessable from the outside, which is what made them read as bugs.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RecurrenceScope } from "@/hooks/useFinanceTransactions";

export function RecurrenceScopeDialog({
  open,
  mode,
  monthLabel,
  onChoose,
  onCancel,
}: {
  open: boolean;
  mode: "edit" | "delete";
  /** Human month this transaction sits in, e.g. "August 2026". */
  monthLabel: string;
  onChoose: (scope: RecurrenceScope) => void;
  onCancel: () => void;
}) {
  const isDelete = mode === "delete";
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDelete ? "Delete this recurring entry?" : "Apply this change to which months?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDelete
              ? `This is part of a recurring subscription. Removing just ${monthLabel} keeps the subscription running for later months.`
              : `This is part of a recurring subscription. Changing only ${monthLabel} leaves future months on the existing settings.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <AlertDialogAction className="w-full" onClick={() => onChoose("this_month")}>
            {isDelete ? `Only ${monthLabel}` : `Only ${monthLabel}`}
          </AlertDialogAction>
          <AlertDialogAction
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onChoose("future")}
          >
            {isDelete ? "Stop the subscription (this + future months)" : "This and all future months"}
          </AlertDialogAction>
          <AlertDialogCancel className="w-full mt-0">Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
