import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a number from its last-rendered value to `target` over
 * `durationMs`, using an ease-out curve driven by requestAnimationFrame.
 *
 * Also reports `zeroCrossings` — a counter that increments exactly once
 * per sign change the interpolated value passes through (negative <-> >=0),
 * so callers can trigger a one-shot effect on crossing rather than re-firing
 * on every render.
 *
 * Respects `prefers-reduced-motion`: when set, the value jumps straight to
 * `target` with no interpolation and no zero-crossing events.
 */
export function useAnimatedNumber(target: number, durationMs = 800) {
  const [displayValue, setDisplayValue] = useState(target);
  const [zeroCrossings, setZeroCrossings] = useState(0);

  const currentRef = useRef(target); // last value actually painted
  const targetRef = useRef(target); // most recently requested target
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === targetRef.current) return;
    targetRef.current = target;

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (prefersReducedMotion()) {
      currentRef.current = target;
      setDisplayValue(target);
      return;
    }

    const from = currentRef.current;
    const to = target;
    const fromSign = from >= 0;
    let firedCrossing = false;
    startRef.current = null;

    function tick(ts: number) {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const current = from + (to - from) * eased;

      currentRef.current = current;
      setDisplayValue(current);

      if (!firedCrossing && current >= 0 !== fromSign) {
        firedCrossing = true;
        setZeroCrossings((c) => c + 1);
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = to;
        rafRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return { value: displayValue, zeroCrossings };
}
