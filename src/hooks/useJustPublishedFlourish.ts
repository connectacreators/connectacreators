import { useEffect, useRef, useState } from "react";
import type { LifecycleStatus } from "@/lib/lifecycleStatus";

// How long a row stays flagged as "just published" — must comfortably
// outlast the checkmark-draw (0.35s) + delayed glow-drift (1.35s delay +
// 1.6s duration ≈ 2.95s) played by LifecyclePublishedFlourish.
const FLOURISH_MS = 3000;

interface FlourishRow {
  id: string;
  lifecycleStatus: LifecycleStatus;
}

/**
 * Tracks lifecycle_status per row id (keyed by id, not by array position) and
 * returns the set of ids that just transitioned TO "Published" — i.e. the
 * previous seen value existed, wasn't already "Published", and the new value
 * is. Never fires on initial mount (nothing seen yet for that id) and never
 * fires again for the same transition on a later re-render.
 *
 * Ids stay in the returned set for FLOURISH_MS so callers can mount a
 * one-shot flourish (see LifecyclePublishedFlourish) for that long, then
 * self-clear.
 *
 * Respects prefers-reduced-motion: still tracks state (so history stays
 * correct if the preference changes mid-session) but never adds ids to the
 * flourishing set, so no flourish is ever mounted.
 */
export function useJustPublishedFlourish(rows: FlourishRow[]): Set<string> {
  const prevRef = useRef<Map<string, LifecycleStatus>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [flourishing, setFlourishing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevRef.current;
    const justPublished: string[] = [];
    for (const row of rows) {
      const prevStatus = prev.get(row.id);
      if (prevStatus && prevStatus !== "Published" && row.lifecycleStatus === "Published") {
        justPublished.push(row.id);
      }
      prev.set(row.id, row.lifecycleStatus);
    }
    if (justPublished.length === 0) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    setFlourishing((current) => {
      const next = new Set(current);
      justPublished.forEach((id) => next.add(id));
      return next;
    });
    justPublished.forEach((id) => {
      const existingTimer = timersRef.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        setFlourishing((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        timersRef.current.delete(id);
      }, FLOURISH_MS);
      timersRef.current.set(id, timer);
    });
  }, [rows]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return flourishing;
}
