import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, Loader2, RotateCcw, ArrowLeft, ArrowRight, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useVoiceRecorder, MAX_RECORDING_MS } from "../hooks/useVoiceRecorder";

interface VoiceAnswerCardProps {
  question: string;
  helper?: string;
  value: string;
  onChange: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
  canBack: boolean;
  optional?: boolean;
  onSkip?: () => void;
  isLast?: boolean;
  /** Enable live AI follow-up questions while recording (admin-gated). */
  coachEnabled?: boolean;
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const MAX_SECONDS = Math.floor(MAX_RECORDING_MS / 1000);

/**
 * One full-screen voice question. Tap the mic to start, tap to stop. When
 * coachEnabled, the cumulative audio is snapshotted every ~25s and live
 * follow-up questions appear to draw out specifics. Auto-stops at 15 min.
 */
export default function VoiceAnswerCard({
  question,
  helper,
  value,
  onChange,
  onNext,
  onBack,
  canBack,
  optional,
  onSkip,
  isLast,
  coachEnabled,
}: VoiceAnswerCardProps) {
  const [elapsed, setElapsed] = useState(0);
  const [liveQuestions, setLiveQuestions] = useState<string[]>([]);
  const coachInFlight = useRef(false);
  const askedRef = useRef<string[]>([]);

  const handleCoachChunk = useCallback(
    async (blob: Blob) => {
      if (coachInFlight.current || blob.size === 0) return;
      coachInFlight.current = true;
      try {
        const audioBase64 = await blobToBase64(blob);
        const { data } = await supabase.functions.invoke("onboarding-live-coach", {
          body: { audioBase64, mimeType: blob.type || "audio/webm", question, alreadyAsked: askedRef.current },
        });
        const qs: string[] = data?.questions || [];
        if (qs.length) {
          setLiveQuestions(qs);
          askedRef.current = [...askedRef.current, ...qs].slice(-12);
        }
      } catch {
        /* soft-fail — coaching never blocks recording */
      } finally {
        coachInFlight.current = false;
      }
    },
    [question],
  );

  const { status, toggle } = useVoiceRecorder({
    onResult: (text) => onChange(value ? `${value.trim()} ${text}` : text),
    coaching: coachEnabled
      ? { intervalMs: 25000, maxCycles: 7, onChunk: handleCoachChunk }
      : undefined,
  });

  // Recording timer; reset coaching state when a recording ends.
  useEffect(() => {
    if (status !== "recording") {
      setElapsed(0);
      if (status === "idle") {
        setLiveQuestions([]);
        askedRef.current = [];
      }
      return;
    }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const recording = status === "recording";
  const transcribing = status === "transcribing";
  const hasAnswer = value.trim().length > 0;
  const remaining = MAX_SECONDS - elapsed;

  return (
    <div className="flex min-h-[100svh] flex-col px-5 pt-6">
      {/* Question */}
      <div className="mb-6 shrink-0">
        <h2 className="text-xl font-bold leading-snug text-foreground">{question}</h2>
        {helper && <p className="mt-1.5 text-sm text-muted-foreground">{helper}</p>}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-4">
        {/* Mic */}
        <button
          type="button"
          onClick={toggle}
          disabled={transcribing}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={cn(
            "relative flex h-[88px] w-[88px] items-center justify-center rounded-full transition-colors disabled:opacity-60",
            recording ? "bg-destructive text-white" : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
        >
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />}
          {transcribing ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : recording ? (
            <Square className="h-7 w-7 fill-current" />
          ) : (
            <Mic className="h-9 w-9" />
          )}
        </button>
        <p className="text-sm text-muted-foreground">
          {recording
            ? `Recording… ${fmt(elapsed)} — tap to stop`
            : transcribing
            ? "Transcribing…"
            : hasAnswer
            ? "Tap to add more"
            : "Tap to speak"}
        </p>
        {recording && remaining <= 60 && (
          <p className="text-xs font-medium text-destructive">{remaining}s left (15 min max)</p>
        )}

        {/* Live AI follow-up prompts */}
        {recording && liveQuestions.length > 0 && (
          <div className="w-full rounded-xl border border-primary/25 bg-primary/[0.06] p-3.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Lightbulb className="h-3.5 w-3.5" />
              Try answering…
            </p>
            <ul className="space-y-1">
              {liveQuestions.map((q, i) => (
                <li key={i} className="text-sm text-foreground">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Transcript (editable) */}
        {hasAnswer && (
          <div className="w-full">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-base leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear &amp; re-record
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav — thumb reach + safe area */}
      <div
        className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-border/50 bg-background/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {optional && !hasAnswer && onSkip && (
          <button type="button" onClick={onSkip} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={recording || transcribing}
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isLast ? "Review" : "Next"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
