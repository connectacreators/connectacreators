import type { PresenceUser } from "@/hooks/useRealtimePresence";

export function initialsFromName(name: string | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "");
  return letters.toUpperCase() || "?";
}

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}

export function dedupePresenceByUser(others: PresenceUser[]): PresenceUser[] {
  const seen = new Set<string>();
  const out: PresenceUser[] = [];
  for (const p of others) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    out.push(p);
  }
  return out;
}
