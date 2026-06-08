import { useRef, useState, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Status = "idle" | "recording" | "transcribing";

interface VoiceButtonProps {
  /** Receives the transcribed text. Callers typically append it to the field. */
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip the "data:...;base64," prefix
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Mic button for onboarding long-response fields. Records via MediaRecorder,
 * sends the clip to the transcribe-onboarding edge function (Whisper), and
 * hands the text back via onTranscript. Keeps recordings short — these are
 * form answers, well under Whisper's 25MB limit.
 */
export default function VoiceButton({ onTranscript, className, disabled }: VoiceButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const transcribe = useCallback(
    async (blob: Blob) => {
      setStatus("transcribing");
      try {
        const audioBase64 = await blobToBase64(blob);
        const { data, error } = await supabase.functions.invoke("transcribe-onboarding", {
          body: { audioBase64, mimeType: blob.type || "audio/webm" },
        });
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "Transcription failed");
        }
        const text = (data?.text || "").trim();
        if (text) onTranscript(text);
        else toast.message("Didn't catch any speech — try again.");
      } catch (e) {
        console.error("Voice transcription error:", e);
        toast.error("Couldn't transcribe that — please try again.");
      } finally {
        setStatus("idle");
      }
    },
    [onTranscript],
  );

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) transcribe(blob);
        else setStatus("idle");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
    } catch (e) {
      console.error("Mic access error:", e);
      toast.error("Microphone access was blocked. Enable it in your browser to use voice.");
      setStatus("idle");
    }
  }, [transcribe]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const handleClick = () => {
    if (status === "idle") start();
    else if (status === "recording") stop();
  };

  const label =
    status === "recording" ? "Stop recording" : status === "transcribing" ? "Transcribing…" : "Dictate answer";

  return (
    <button
      type="button"
      onClick={handleClick}
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
