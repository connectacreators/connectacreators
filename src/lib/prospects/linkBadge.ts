/**
 * A prospect's bio link is the strongest single qualification signal: a
 * booking link means they already sell, which is the "proven offer" the
 * /1million offer requires. Classify it for at-a-glance scanning.
 */
export type LinkBadge = "calendly" | "booking" | "site" | "none";

export const LINK_BADGE_LABEL: Record<LinkBadge, string> = {
  calendly: "Calendly",
  booking: "Booking",
  site: "Site",
  none: "None",
};

const BOOKING_HOSTS = [
  "acuityscheduling.com", "squareup.com/appointments", "setmore.com",
  "simplybook.me", "vagaro.com", "mindbodyonline.com", "janeapp.com",
  "schedulicity.com", "booksy.com", "zocdoc.com", "cal.com",
];

const BOOKING_PATH = /\/(book|booking|book-now|schedule|scheduling|appointment|appointments|consult|consultation)\b/i;

export function classifyLink(url: string | null | undefined): LinkBadge {
  const raw = (url ?? "").trim();
  if (!raw) return "none";
  const lower = raw.toLowerCase();
  if (lower.includes("calendly.com")) return "calendly";
  if (BOOKING_HOSTS.some((h) => lower.includes(h))) return "booking";
  if (BOOKING_PATH.test(lower)) return "booking";
  return "site";
}
