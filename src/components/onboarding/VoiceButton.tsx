import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "./hooks/useVoiceRecorder";

interface VoiceButtonProps {
  /** Receives the transcribed text. Callers typically append it to the field. */
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Inline mic button for onboarding long-response fields. Records via the shared
 * useVoiceRecorder pipeline (transcribe-onboarding / Whisper) and hands the text
 * back via onTranscript.
 */
export default function VoiceButton({ onTranscript, className, disabled }: VoiceButtonProps) {
  const { status, toggle } = useVoiceRecorder({ onResult: onTranscript });

  const label =
    status === "recording" ? "Stop recording" : status === "transcribing" ? "Transcribing…" : "Dictate answer";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || status === "transcribing"}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50",
        status === "recording"
          ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        className,
      )}
    >
      {status === "transcribing" ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === "recording" ? (
        <Square className="w-4 h-4 fill-current" />
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
