// Single source of truth for how a lead's status and source are coloured.
//
// These maps used to exist three times — STATUS_COLORS in LeadTracker.tsx,
// a verbatim copy in LeadKanbanBoard.tsx, and COLUMN_ACCENT expressing the
// same palette a third way as top-border classes. They had already drifted
// in what they expressed (badge vs border) while duplicating the same
// literals, so a palette change meant editing three places and a missed one
// showed up as a single mismatched pill.
//
// Everything resolves to a CSS variable, never a literal. That's what makes
// the page follow the client's brand: the semantic colours are the ones a
// lead list is actually *made of* (status pills, kanban accents, chart
// series), so leaving them as raw hex meant half the page ignored branding
// no matter what the palette was set to.
//
// The funnel reads as a progression rather than six unrelated colours:
//   new//working  → aqua   (cool, in-flight)
//   engaged       → honey  (warm, heating up)
//   won           → good   (green, closed)
//   lost          → muted  (grey, out of play)

/** Semantic role a status maps onto. Order = funnel progression. */
export type LeadTone = "new" | "working" | "engaged" | "won" | "lost";

interface ToneStyle {
  /** Base colour as a bare `H S% L%` triplet so callers can add an alpha. */
  varRef: string;
  /** Ready-made inline styles for a pill/badge. */
  badge: { background: string; color: string; borderColor: string };
  /** Solid colour, for kanban column accents and chart series. */
  solid: string;
}

const tone = (varRef: string): ToneStyle => ({
  varRef,
  badge: {
    background: `hsl(${varRef} / 0.15)`,
    color: `hsl(${varRef})`,
    borderColor: `hsl(${varRef} / 0.32)`,
  },
  solid: `hsl(${varRef})`,
});

// --good is declared with a fallback everywhere else in the app (it isn't
// part of the brand palette proper), so it keeps one here too.
export const LEAD_TONES: Record<LeadTone, ToneStyle> = {
  new: tone("var(--aqua)"),
  working: tone("var(--aqua)"),
  engaged: tone("var(--honey)"),
  won: tone("var(--good, 141 33% 61%)"),
  lost: tone("var(--bone-muted, 42 6% 55%)"),
};

/**
 * Status label → tone. Covers both naming conventions the data carries: the
 * app's own labels and the legacy Notion ones ("Appointment Booked",
 * "Follow up #1 (Not Booked)"), since both still exist in live rows.
 */
const STATUS_TONE: Record<string, LeadTone> = {
  "New Lead": "new",
  "Follow-up 1": "working",
  "Follow-up 2": "working",
  "Follow-up 3": "working",
  "Booked": "engaged",
  "Appointment Booked": "engaged",
  "Won": "won",
  "Closed": "won",
  "Canceled": "lost",
};

export function statusTone(status?: string): LeadTone {
  if (!status) return "new";
  return STATUS_TONE[status] ?? STATUS_TONE[canonicalizeStatus(status)] ?? "new";
}

export const statusBadgeStyle = (status?: string) => LEAD_TONES[statusTone(status)].badge;
export const statusSolid = (status?: string) => LEAD_TONES[statusTone(status)].solid;

/**
 * Collapse the two naming conventions that mean the same thing into one
 * canonical label. Legacy Notion labels: "Appointment Booked",
 * "Follow up #1 (Not Booked)". App labels: "Booked", "Follow-up 1".
 */
export function canonicalizeStatus(status?: string): string {
  if (!status) return "";
  const s = status.trim();
  if (/^(appointment\s+)?booked$/i.test(s)) return "Booked";
  const followUp = s.match(/follow[\s-]*up\s*#?\s*(\d+)/i);
  if (followUp) return `Follow-up ${followUp[1]}`;
  return s;
}

/**
 * Lead sources get a neutral treatment rather than their own colour ramp.
 * Source is metadata, not funnel state — giving each one a saturated colour
 * competed with the status pills for attention on every row, which is a
 * large part of why the list read as busy.
 */
export const sourceBadgeStyle = {
  background: "hsl(var(--ink-on-cream) / 0.05)",
  color: "hsl(var(--ink-on-cream) / 0.62)",
  borderColor: "hsl(var(--ink-on-cream) / 0.10)",
};

/** Chart series, in funnel order, so a pie reads left-to-right as progression. */
export const LEAD_CHART_SERIES = [
  LEAD_TONES.new.solid,
  LEAD_TONES.engaged.solid,
  LEAD_TONES.won.solid,
  LEAD_TONES.lost.solid,
  "hsl(var(--honey-deep, 22 65% 47%))",
  "hsl(var(--aqua) / 0.55)",
];

/** Up/down deltas on the stat cards. */
export const TREND_COLOR = {
  up: "hsl(var(--good, 141 33% 61%))",
  down: "hsl(var(--honey-deep, 22 65% 47%))",
};
