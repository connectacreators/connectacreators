import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Loader2, CheckCircle2, AlertCircle, Zap, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useOutOfCredits } from "@/contexts/OutOfCreditsContext";

interface BatchResult {
  customId: string;
  topic: string;
  script: any | null;
  error: string | null;
}

interface Props {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onSaved: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? SUPABASE_ANON;
}

async function callFunction(name: string, payload: any) {
  const token = await getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    // Attach raw data so callers can inspect insufficient_credits
    const err = new Error(data.error || `Error ${res.status}`) as any;
    err.responseData = data;
    throw err;
  }
  return data;
}

export default function BatchGenerateModal({ clientId, clientName, onClose, onSaved }: Props) {
  const [topicsText, setTopicsText] = useState("");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [format, setFormat] = useState("talking_head");
  const [phase, setPhase] = useState<"input" | "generating" | "saving" | "done">("input");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [topicMap, setTopicMap] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState({ processing: 0, succeeded: 0, errored: 0, total: 0 });
  const [results, setResults] = useState<BatchResult[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showOutOfCreditsModal } = useOutOfCredits();

  const topics = topicsText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);

  const { credits } = useCredits();
  const totalCost = topics.length * 50;
  const hasEnoughCredits = (credits?.credits_balance ?? 0) >= totalCost;

  // Poll for batch completion
  useEffect(() => {
    if (!batchId || phase !== "generating") return;

    const poll = async () => {
      try {
        const data = await callFunction("batch-poll-scripts", { batchId, topicMap });
        if (data.status === "processing") {
          const counts = data.requestCounts || {};
          setProgress({
            processing: counts.processing ?? 0,
            succeeded: counts.succeeded ?? 0,
            errored: counts.errored ?? 0,
            total: progress.total,
          });
        } else if (data.status === "done") {
          clearInterval(pollRef.current!);
          setResults(data.results || []);
          setPhase("saving");
          saveResults(data.results || []);
        }
      } catch (e: any) {
        console.error("Batch poll error:", e);
      }
    };

    pollRef.current = setInterval(poll, 15_000);
    poll(); // immediate first check
    return () => clearInterval(pollRef.current!);
  }, [batchId, phase]);

  const handleSubmit = async () => {
    if (topics.length === 0) {
      toast.error("Enter at least one topic.");
      return;
    }
    try {
      setPhase("generating");
      const data = await callFunction("batch-generate-scripts", {
        topics,
        language,
        format,
        clientId,
      });
      setBatchId(data.batchId);
      setTopicMap(data.topicMap || {});
      setProgress({ ...progress, total: topics.length, processing: topics.length });
    } catch (e: any) {
      if (e.responseData?.insufficient_credits) {
        showOutOfCreditsModal();
        setPhase("input");
        return;
      }
      toast.error(e.message || "Failed to submit batch.");
      setPhase("input");
    }
  };

  const saveResults = async (batchResults: BatchResult[]) => {
    let saved = 0;
    for (const result of batchResults) {
      if (!result.script) continue;
      try {
        // Save script to DB
        const { data: scriptRow, error: scriptErr } = await supabase
          .from("scripts")
          .insert({
            client_id: clientId,
            idea_ganadora: result.script.idea_ganadora || result.topic.slice(0, 50),
            target: result.script.target || "",
            formato: result.script.formato || "TALKING HEAD",
            virality_score: result.script.virality_score || null,
            topic: result.topic,
          })
          .select()
          .single();

        if (scriptErr || !scriptRow) continue;

        // Save script lines
        const lines = (result.script.lines || []).map((l: any, i: number) => ({
          script_id: scriptRow.id,
          line_type: l.line_type,
          section: l.section,
          text: l.text,
          position: i,
        }));

        if (lines.length > 0) {
          await supabase.from("script_lines").insert(lines);
        }

        saved++;
        setSavedCount(saved);
      } catch (e) {
        console.error("Error saving script:", e);
      }
    }

    setPhase("done");
    toast.success(`${saved} of ${batchResults.filter((r) => r.script).length} scripts saved!`);
    onSaved();
  };

  const progressPct = progress.total > 0
    ? Math.round(((progress.succeeded + progress.errored) / progress.total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground text-sm">Batch Generate Scripts</p>
              <p className="text-xs text-muted-foreground">{clientName} · 50% cheaper via Batches API</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {phase === "input" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Topics (one per line, max 10)
                </label>
                <Textarea
                  value={topicsText}
                  onChange={(e) => setTopicsText(e.target.value)}
                  placeholder={"How to lose 10 lbs in 30 days\nThe truth about intermittent fasting\nWhy most diets fail"}
                  className="min-h-[160px] text-sm font-mono resize-none"
                />
                {topics.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{topics.length} topic{topics.length !== 1 ? "s" : ""} detected</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Language</label>
                  <div className="flex rounded-xl border border-border overflow-hidden">
                    {(["en", "es"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLanguage(l)}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${language === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        {l === "en" ? "English" : "Spanish"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-none focus:border-primary/50"
                  >
                    <option value="talking_head">Talking Head</option>
                    <option value="broll_caption">B-Roll Caption</option>
                    <option value="entrevista">Entrevista</option>
                    <option value="variado">Variado</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {(phase === "generating" || phase === "saving") && (
            <div className="py-4 space-y-5">
              <div className="flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-2">
                  <span>{phase === "saving" ? "Saving scripts..." : "Generating scripts..."}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {phase === "saving"
                  ? `Saved ${savedCount} of ${results.filter((r) => r.script).length} scripts...`
                  : `Processing ${progress.total} scripts via Anthropic Batches API (50% cost)...`}
              </p>
              <p className="text-xs text-center text-muted-foreground/60">
                Most batches complete within 1–5 minutes. You can close this window and check back.
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className="py-4 space-y-4">
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <p className="font-semibold text-foreground">Batch complete!</p>
                <p className="text-sm text-muted-foreground text-center">
                  {savedCount} script{savedCount !== 1 ? "s" : ""} saved to {clientName}'s library.
                </p>
                <p className="text-xs text-muted-foreground/60 text-center">
                  ~50% cheaper than generating individually
                </p>
              </div>

              {results.some((r) => r.error) && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 space-y-1">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Failed topics:
                  </p>
                  {results.filter((r) => r.error).map((r) => (
                    <p key={r.customId} className="text-xs text-muted-foreground pl-5">• {r.topic}: {r.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 flex gap-2">
          {phase === "done" ? (
            <Button onClick={onClose} variant="cta" className="flex-1">Done</Button>
          ) : phase === "input" ? (
            <>
              <Button onClick={onClose} variant="ghost" className="flex-1">Cancel</Button>
              <div className="flex-1 flex flex-col gap-1">
                {topics.length > 0 && (
                  <div className="text-xs text-muted-foreground mb-1">
                    {topics.length} script{topics.length !== 1 ? "s" : ""} × 50 credits = <span className="font-medium">{totalCost} credits</span>
                    {credits && (
                      <span className={hasEnoughCredits ? " text-cyan-400" : " text-red-400"}>
                        {" "}(balance: {credits.credits_balance})
                      </span>
                    )}
                  </div>
                )}
                <Button
                  onClick={handleSubmit}
                  disabled={topics.length === 0 || !hasEnoughCredits}
                  variant="cta"
                  className="w-full gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Generate {topics.length > 0 ? topics.length : ""} Script{topics.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={onClose} variant="ghost" className="flex-1">Close (runs in background)</Button>
          )}
        </div>
      </div>
    </div>
  );
}
