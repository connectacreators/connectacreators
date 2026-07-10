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

// Undo/redo coalesce window. Rapid setEdl calls within this many ms of the
// previous push (e.g. a single mouse drag firing 30 frames per second) get
// folded into the most recent stack entry so Cmd-Z rewinds whole gestures
// instead of one frame at a time.
const HISTORY_COALESCE_MS = 800;
const HISTORY_MAX = 50;

export function useEditorProject(opts: Options) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo / redo state. Past[] holds EDLs that pre-dated each commit (most
  // recent at the end). Future[] is what gets refilled by redo after undo.
  // Both kept outside React state because they don't drive layout — the
  // editor only needs the boolean "is there anything to (un)do" flag.
  const pastRef = useRef<EDL[]>([]);
  const futureRef = useRef<EDL[]>([]);
  const lastPushAtRef = useRef<number>(0);
  const [historyTick, setHistoryTick] = useState(0); // forces canUndo/canRedo recomputation

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

  // Internal write — used by setEdl, undo, redo. Always autosaves; only
  // setEdl pushes the previous EDL to the past stack first.
  const writeEdl = useCallback(
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

  const setEdl = useCallback(
    (next: EDL) => {
      // Snapshot the OLD EDL into the past stack before writing the new one.
      // Coalesce rapid-fire writes (drag scrubbing) so a single gesture
      // becomes one undo step.
      setState((prev) => {
        if (prev.phase !== "ready") return prev;
        const now = Date.now();
        if (now - lastPushAtRef.current > HISTORY_COALESCE_MS) {
          pastRef.current.push(prev.edl);
          if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
          futureRef.current = []; // any new edit invalidates the redo path
          setHistoryTick((t) => t + 1);
        }
        lastPushAtRef.current = now;
        return prev;
      });
      writeEdl(next);
    },
    [writeEdl],
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const previous = pastRef.current.pop();
      if (!previous) return prev;
      futureRef.current.push(prev.edl);
      setHistoryTick((t) => t + 1);
      // Reset the coalesce timer so the very next user edit becomes its
      // own undo step (not folded into the undone state).
      lastPushAtRef.current = 0;
      writeEdl(previous);
      return prev;
    });
  }, [writeEdl]);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const next = futureRef.current.pop();
      if (!next) return prev;
      pastRef.current.push(prev.edl);
      setHistoryTick((t) => t + 1);
      lastPushAtRef.current = 0;
      writeEdl(next);
      return prev;
    });
  }, [writeEdl]);

  return {
    state,
    setEdl,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    // historyTick is unused by the caller but referenced here so React
    // re-derives canUndo/canRedo when the stacks change.
    _historyTick: historyTick,
  };
}
