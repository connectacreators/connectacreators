import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RecorderStatus = "idle" | "recording" | "transcribing";

/** Hard cap on a single recording. */
export const MAX_RECORDING_MS = 15 * 60 * 1000;

interface CoachingOptions {
  /** Snapshot the cumulative audio this often while recording. */
  intervalMs: number;
  /** Stop snapshotting after this many cycles (bounds AI cost/bandwidth). */
  maxCycles: number;
  /** Receives the cumulative audio-so-far blob each cycle. */
  onChunk: (blob: Blob) => void;
}

interface UseVoiceRecorderOptions {
  /** Called with the transcribed text once a recording finishes processing. */
  onResult: (text: string) => void;
  /** Auto-stop after this many ms (default 15 min). */
  maxDurationMs?: number;
  /** Optional live-coaching snapshots while recording. */
  coaching?: CoachingOptions;
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

/**
 * Shared mic-record → Whisper-transcribe pipeline for the onboarding form.
 * Tap-to-start / tap-to-stop via `toggle()`. Auto-stops at maxDurationMs.
 * When `coaching` is provided, periodically hands the cumulative audio blob to
 * `coaching.onChunk` (used by FAST mode for live AI follow-up questions).
 */
export function useVoiceRecorder({ onResult, maxDurationMs = MAX_RECORDING_MS, coaching }: UseVoiceRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (coachTimerRef.current) clearInterval(coachTimerRef.current);
    maxTimerRef.current = null;
    coachTimerRef.current = null;
  };

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
        if (text) onResult(text);
        else toast.message("Didn't catch any speech — try again.");
      } catch (e) {
        console.error("Voice transcription error:", e);
        toast.error("Couldn't transcribe that — please try again.");
      } finally {
        setStatus("idle");
      }
    },
    [onResult],
  );

  const stop = useCallback(() => {
    clearTimers();
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

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
        clearTimers();
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) transcribe(blob);
        else setStatus("idle");
      };
      // With coaching we need periodic chunks so the cumulative blob stays current.
      recorder.start(coaching ? 2000 : undefined);
      recorderRef.current = recorder;
      setStatus("recording");

      // Hard auto-stop.
      maxTimerRef.current = setTimeout(() => stop(), maxDurationMs);

      // Live-coaching snapshots.
      if (coaching) {
        let cycle = 0;
        coachTimerRef.current = setInterval(() => {
          cycle += 1;
          if (cycle > coaching.maxCycles) {
            if (coachTimerRef.current) clearInterval(coachTimerRef.current);
            coachTimerRef.current = null;
            return;
          }
          if (chunksRef.current.length === 0) return;
          const snapshot = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          coaching.onChunk(snapshot);
        }, coaching.intervalMs);
      }
    } catch (e) {
      console.error("Mic access error:", e);
      toast.error("Microphone access was blocked. Enable it in your browser to use voice.");
      setStatus("idle");
    }
  }, [transcribe, maxDurationMs, coaching, stop]);

  const toggle = useCallback(() => {
    if (status === "idle") start();
    else if (status === "recording") stop();
  }, [status, start, stop]);

  return { status, start, stop, toggle };
}
