// src/hooks/useTranscript.ts
// Loads the transcript + silence segments for a video_edit, and manages
// the lifecycle of the transcribe-job that produces them.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TranscriptWord = { text: string; start_ms: number; end_ms: number };
export type SilenceSegment = { id: string; start_ms: number; end_ms: number };

type JobStatus = "queued" | "running" | "done" | "error";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "missing" }                          // no transcript, no active job
  | { phase: "running"; jobStatus: JobStatus; progress: number; errorMessage?: string | null }
  | { phase: "ready"; words: TranscriptWord[]; silences: SilenceSegment[] }
  | { phase: "error"; message: string };

export function useTranscript(videoEditId: string | undefined) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const pollTimer = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!videoEditId) return;
    setState({ phase: "loading" });
    const [transcript, silences, openJob] = await Promise.all([
      supabase
        .from("transcripts")
        .select("words")
        .eq("video_edit_id", videoEditId)
        .maybeSingle(),
      supabase
        .from("silence_segments")
        .select("id, start_ms, end_ms")
        .eq("video_edit_id", videoEditId)
        .order("start_ms", { ascending: true }),
      supabase
        .from("transcribe_jobs")
        .select("status, progress, error_message")
        .eq("video_edit_id", videoEditId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (transcript.data) {
      setState({
        phase: "ready",
        words: (transcript.data as { words: TranscriptWord[] }).words ?? [],
        silences: (silences.data as SilenceSegment[] | null) ?? [],
      });
      return;
    }
    if (openJob.data) {
      const j = openJob.data as { status: JobStatus; progress: number; error_message: string | null };
      setState({
        phase: "running",
        jobStatus: j.status,
        progress: j.progress ?? 0,
        errorMessage: j.error_message,
      });
      return;
    }
    setState({ phase: "missing" });
  }, [videoEditId]);

  useEffect(() => {
    fetchAll();
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, [fetchAll]);

  // Poll while a job is in flight.
  useEffect(() => {
    if (state.phase !== "running") return;
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(() => {
      fetchAll();
    }, 3000);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, [state.phase, fetchAll]);

  const start = useCallback(async () => {
    if (!videoEditId) return;
    setState({ phase: "running", jobStatus: "queued", progress: 0 });
    const { data, error } = await supabase.functions.invoke("transcribe-job", {
      body: { video_edit_id: videoEditId },
    });
    if (error) {
      setState({ phase: "error", message: error.message });
      return;
    }
    // Function may report "exists" if the transcript landed between checks —
    // fall back to a fresh load.
    if ((data as { status?: string } | null)?.status === "exists") {
      fetchAll();
    }
  }, [videoEditId, fetchAll]);

  return { state, refetch: fetchAll, start };
}
