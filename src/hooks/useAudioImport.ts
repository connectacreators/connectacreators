// src/hooks/useAudioImport.ts
// Submits a URL to the import-audio-from-url edge function, polls the
// resulting audio_import_jobs row until done, and exposes the result so
// callers can write the storage_path into the EDL.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; jobId: string; progress: number }
  | { phase: "done"; storagePath: string; durationMs: number }
  | { phase: "error"; message: string };

export function useAudioImport(videoEditId: string | undefined) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: "idle" });
  }, [stopPolling]);

  const submit = useCallback(
    async (url: string) => {
      if (!videoEditId) return;
      setState({ phase: "submitting" });
      try {
        const { data, error } = await supabase.functions.invoke("import-audio-from-url", {
          body: { video_edit_id: videoEditId, url },
        });
        if (error) throw error;
        const job = data as { id: string };
        setState({ phase: "polling", jobId: job.id, progress: 0 });
        stopPolling();
        pollHandle.current = setInterval(async () => {
          try {
            const { data: row, error: fErr } = await supabase
              .from("audio_import_jobs")
              .select("status, progress, error_message, output_storage_path, duration_ms")
              .eq("id", job.id)
              .single();
            if (fErr) throw fErr;
            const r = row as {
              status: "queued" | "running" | "done" | "error";
              progress: number;
              error_message: string | null;
              output_storage_path: string | null;
              duration_ms: number | null;
            };
            if (r.status === "done" && r.output_storage_path) {
              stopPolling();
              setState({
                phase: "done",
                storagePath: r.output_storage_path,
                durationMs: r.duration_ms ?? 0,
              });
            } else if (r.status === "error") {
              stopPolling();
              setState({ phase: "error", message: r.error_message ?? "import failed" });
            } else {
              setState({ phase: "polling", jobId: job.id, progress: r.progress });
            }
          } catch (e) {
            stopPolling();
            setState({ phase: "error", message: (e as Error).message });
          }
        }, 2000);
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message });
      }
    },
    [videoEditId, stopPolling],
  );

  return { state, submit, reset };
}
