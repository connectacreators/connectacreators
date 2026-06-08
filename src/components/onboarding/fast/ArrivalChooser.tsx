import { Mic, Keyboard, ArrowRight, Sparkles } from "lucide-react";

interface ArrivalChooserProps {
  clientName?: string;
  onChoose: (mode: "fast" | "standard") => void;
}

/**
 * First screen a client sees on the onboarding link: pick how to fill it out.
 * Voice is highlighted as the fast path; typing is the alternative.
 */
export default function ArrivalChooser({ clientName, onChoose }: ArrivalChooserProps) {
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <Sparkles className="mx-auto mb-4 h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">
          {clientName ? `Welcome, ${clientName}!` : "Let's set up your brand"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How would you like to fill this out? It takes about 3 minutes.
        </p>
      </div>

      {/* Voice — highlighted */}
      <button
        type="button"
        onClick={() => onChoose("fast")}
        className="group relative mb-3 flex items-center gap-4 rounded-2xl border border-primary/40 bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <Mic className="h-6 w-6 text-primary" />
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-2 text-base font-semibold text-foreground">
            Answer by voice
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              Fastest
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Just talk — one question at a time. We type it for you.
          </span>
        </span>
        <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-0.5" />
      </button>

      {/* Type */}
      <button
        type="button"
        onClick={() => onChoose("standard")}
        className="flex items-center gap-4 rounded-2xl border border-border/60 p-5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground/5">
          <Keyboard className="h-6 w-6 text-muted-foreground" />
        </span>
        <span className="flex-1">
          <span className="block text-base font-semibold text-foreground">Type it out</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Fill in the classic form yourself.
          </span>
        </span>
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  );
}
