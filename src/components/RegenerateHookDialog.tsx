// src/components/RegenerateHookDialog.tsx
//
// "Regenerate hook" for the script editor. Uses the SAME generator as the
// Super Planning canvas Hook Generator node (ai-build-script step
// "generate-hooks", backed by the proven viral-hook formula bank): sends the
// title+hook as the topic, the FULL script body as grounding context, the
// detected script language (so hooks never come back bilingual), and
// everything already shown/used as previousHooks so every round returns
// fresh, non-repeating variations. Pick one to replace the script's hook line.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Anchor } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const CATEGORY_LABELS: Record<string, string> = {
  educational: "Educational",
  random: "Random",
  authority: "Authority",
  comparison: "Comparison",
  storytelling: "Storytelling",
  mythBusting: "Myth Busting",
  dayInTheLife: "Day in the Life",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Script context the variations should align with (title + current hook). */
  topic: string;
  /** The hook text currently in the script — never re-suggested. */
  currentHook: string | null;
  /** Full script text (capped) — hooks are grounded in the whole script, not just the title. */
  scriptBody?: string;
  /** Detected script language — the generator writes hooks ONLY in this language. */
  language?: "en" | "es";
  onPick: (text: string) => void;
}

export function RegenerateHookDialog({ open, onClose, topic, currentHook, scriptBody, language, onPick }: Props) {
  const { showOutOfCreditsModal } = useOutOfCredits();
  const [hooks, setHooks] = useState<Array<{ category: string; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  // Everything shown or already in the script this session — the generator's
  // anti-repetition list.
  const seenRef = useRef<string[]>([]);

  const generate = useCallback(async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-build-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          step: "generate-hooks",
          topic: topic.trim(),
          scriptBody: scriptBody?.trim() || undefined,
          language,
          previousHooks: seenRef.current.slice(-20),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.insufficient_credits) {
          showOutOfCreditsModal();
          return;
        }
        toast.error(json.error || "Failed to generate hooks");
        return;
      }
      const next = (json.hooks ?? []).slice(0, 5) as Array<{ category: string; text: string }>;
      if (next.length === 0) {
        toast.error("No hooks came back — try again.");
        return;
      }
      seenRef.current = [...seenRef.current, ...next.map((h) => h.text)];
      setHooks(next);
    } catch {
      toast.error("Error generating hooks");
    } finally {
      setLoading(false);
    }
  }, [topic, scriptBody, language, showOutOfCreditsModal]);

  // Fresh session per open: seed the anti-repeat list with the current hook
  // and generate the first round automatically.
  useEffect(() => {
    if (!open) return;
    seenRef.current = currentHook ? [currentHook] : [];
    setHooks([]);
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Anchor className="w-4 h-4 text-primary" /> Regenerate hook
          </DialogTitle>
          <DialogDescription>
            Five fresh variations from the viral hook formula bank, matched to this script. Click
            one to replace your hook.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Writing hook variations…
          </div>
        ) : (
          <div className="space-y-2">
            {hooks.map((hook, i) => (
              <button
                key={`${hook.text}-${i}`}
                onClick={() => {
                  onPick(hook.text);
                  onClose();
                }}
                className="w-full text-left rounded-lg border border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/40 px-3 py-2.5 transition-colors"
              >
                <span className="text-[10px] uppercase tracking-wide text-primary/80 font-semibold">
                  {CATEGORY_LABELS[hook.category] ?? hook.category}
                </span>
                <p className="text-sm text-foreground leading-relaxed mt-0.5">{hook.text}</p>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">25 credits per round · no repeats</span>
          <Button variant="outline" size="sm" onClick={generate} disabled={loading} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            More options
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
