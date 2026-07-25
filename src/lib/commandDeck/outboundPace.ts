// Pure math for the Outbound Pace gauge — percent-of-daily-target and
// simple pace labeling. Kept dependency-free for unit testing.

export function outboundPct(sentToday: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round(Math.min(100, (sentToday / target) * 100));
}

export type OutboundPaceState = "ahead" | "on-pace" | "behind";

/** Compares today's count against how far through the day it is — sending
 *  half the daily quota by noon is "ahead," not "on pace." */
export function outboundPaceState(sentToday: number, target: number, now: Date = new Date()): OutboundPaceState {
  const dayFraction = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const expectedByNow = Math.max(1, Math.round(target * dayFraction));
  if (sentToday >= target) return "ahead";
  if (sentToday >= expectedByNow) return "on-pace";
  return "behind";
}
