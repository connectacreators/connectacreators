import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, Pencil, CheckCircle2 } from "lucide-react";

export interface ReviewItem {
  label: string;
  value: string;
  onEdit: () => void;
}

interface ReviewStepProps {
  items: ReviewItem[];
  onBack: () => void;
  onSubmit: () => void;
  saving: boolean;
}

/** Final summary: every answer, each tappable to jump back and fix, then submit. */
export default function ReviewStep({ items, onBack, onSubmit, saving }: ReviewStepProps) {
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-md flex-col px-5 pt-6">
      <div className="mb-5 shrink-0">
        <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Review your answers
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Tap any answer to fix it, then submit.</p>
      </div>

      <div className="flex-1 space-y-2.5 pb-4">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={item.onEdit}
            className="flex w-full items-start gap-3 rounded-xl border border-border/50 p-3.5 text-left transition-colors hover:bg-foreground/[0.03]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {item.label}
              </span>
              <span className="mt-0.5 block whitespace-pre-wrap break-words text-sm text-foreground">
                {item.value.trim() || <span className="italic text-muted-foreground/60">Not answered yet</span>}
              </span>
            </span>
            <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
          </button>
        ))}

        <p className="flex items-center justify-center gap-1.5 px-2 pt-3 text-center text-xs leading-relaxed text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" />
          <span>
            Your information stays private — we never sell or share it. See our{" "}
            <Link to="/privacy-policy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/terms-and-conditions" target="_blank" className="underline underline-offset-2 hover:text-foreground">
              Terms
            </Link>
            .
          </span>
        </p>
      </div>

      {/* Bottom nav */}
      <div
        className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-border/50 bg-background/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-7 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
