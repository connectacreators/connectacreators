/** Whether to write a new version snapshot, given the last snapshot time (ms epoch). */
export function shouldSnapshot(lastMs: number | undefined, nowMs: number, thresholdMs = 120_000): boolean {
  if (lastMs === undefined) return true;
  return nowMs - lastMs >= thresholdMs;
}
