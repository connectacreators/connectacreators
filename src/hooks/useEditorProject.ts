// src/hooks/useEditorProject.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { EDL } from "@/lib/videoEditor/edl";
import { emptyEDL } from "@/lib/videoEditor/edl";
import {
  loadEditorProject,
  upsertEditorProject,
} from "@/lib/videoEditor/editorProjectsApi";

type State =
  | { phase: "loading" }
  | { phase: "ready"; projectId: string; edl: EDL; saving: boolean; savedAt: string }
  | { phase: "error"; message: string };

type Options = {
  videoEditId: string;
  // For first-open: how to derive the EDL when no project row exists yet.
  initialSource: { storage_path: string; duration_ms: number };
};

export function useEditorProject(opts: Options) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Don't create a project until we have a real source. VideoEditor passes
        // empty placeholders while the source meta is still loading.
        if (!opts.initialSource.storage_path || opts.initialSource.duration_ms <= 0) {
          return;
        }
        const existing = await loadEditorProject(opts.videoEditId);
        if (cancelled) return;
        if (existing) {
          setState({
            phase: "ready",
            projectId: existing.id,
            edl: existing.edl,
            saving: false,
            savedAt: existing.updated_at,
          });
        } else {
          const seedEdl = emptyEDL(
            opts.initialSource.storage_path,
            opts.initialSource.duration_ms,
          );
          const created = await upsertEditorProject({
            videoEditId: opts.videoEditId,
            edl: seedEdl,
          });
          if (cancelled) return;
          setState({
            phase: "ready",
            projectId: created.id,
            edl: created.edl,
            saving: false,
            savedAt: created.updated_at,
          });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setState({ phase: "error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.videoEditId, opts.initialSource.storage_path, opts.initialSource.duration_ms]);

  const setEdl = useCallback(
    (next: EDL) => {
      setState((prev) =>
        prev.phase === "ready" ? { ...prev, edl: next, saving: true } : prev,
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const saved = await upsertEditorProject({
            videoEditId: opts.videoEditId,
            edl: next,
          });
          setState((prev) =>
            prev.phase === "ready"
              ? { ...prev, saving: false, savedAt: saved.updated_at }
              : prev,
          );
        } catch (e: unknown) {
          setState({ phase: "error", message: (e as Error).message });
        }
      }, 600);
    },
    [opts.videoEditId],
  );

  return { state, setEdl };
}
