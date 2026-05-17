// src/hooks/useRenderJob.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { AspectRatio, EDL } from "@/lib/videoEditor/edl";
import {
  fetchRenderJob,
  submitRenderJob,
  type RenderJob,
} from "@/lib/videoEditor/renderJobsApi";

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; job: RenderJob }
  | { phase: "done"; job: RenderJob }
  | { phase: "error"; message: string };

const POLL_MS = 2000;

export function useRenderJob() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const submit = useCallback(
    async (params: { editorProjectId: string; edl: EDL; aspectRatio: AspectRatio }) => {
      setState({ phase: "submitting" });
      try {
        const job = await submitRenderJob(params);
        setState({ phase: "polling", job });
        stopPolling();
        pollHandle.current = setInterval(async () => {
          try {
            const next = await fetchRenderJob(job.id);
            if (next.status === "done") {
              stopPolling();
              setState({ phase: "done", job: next });
            } else if (next.status === "error") {
              stopPolling();
              setState({ phase: "error", message: next.error_message ?? "render failed" });
            } else {
              setState({ phase: "polling", job: next });
            }
          } catch (e: unknown) {
            stopPolling();
            setState({ phase: "error", message: (e as Error).message });
          }
        }, POLL_MS);
      } catch (e: unknown) {
        setState({ phase: "error", message: (e as Error).message });
      }
    },
    [stopPolling],
  );

  return { state, submit };
}
