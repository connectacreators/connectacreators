import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RecorderStatus = "idle" | "recording" | "transcribing";

interface UseVoiceRecorderOptions {
  /** Called with the transcribed text once a recording finishes processing. */
  onResult: (text: string) => void;
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
 * Used by both the inline VoiceButton and the full-screen VoiceAnswerCard so
 * there is one place to maintain the MediaRecorder + transcribe-onboarding call.
 *
 * Tap-to-start / tap-to-stop: call `toggle()` (or `start()`/`stop()`).
 */
export function useVoiceRecorder({ onResult }: UseVoiceRecorderOptions) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
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

  const toggle = useCallback(() => {
    if (status === "idle") start();
    else if (status === "recording") stop();
  }, [status, start, stop]);

  return { status, start, stop, toggle };
}
