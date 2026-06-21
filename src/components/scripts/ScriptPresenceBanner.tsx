import type { PresenceUser } from "@/hooks/useRealtimePresence";
import { initialsFromName, colorForUser, dedupePresenceByUser } from "@/lib/presenceAvatar";

interface Props {
  others: PresenceUser[];
}

/** Shows real-person avatars for everyone else currently in this script. */
export default function ScriptPresenceBanner({ others }: Props) {
  const people = dedupePresenceByUser(others);
  if (people.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "hsl(var(--bone) / 0.55)" }}
      >
        Editing now
      </span>
      <div className="flex items-center -space-x-2">
        {people.slice(0, 6).map((p) => (
          <div key={p.userId} className="relative group">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white ring-2"
              style={{ background: colorForUser(p.userId), boxShadow: "0 0 0 2px hsl(var(--ink))" }}
            >
              {initialsFromName(p.name)}
            </div>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-[10px] font-medium bg-black/90 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
              {p.name?.trim() || "Someone"}
            </div>
          </div>
        ))}
        {people.length > 6 && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white/80"
            style={{ background: "hsl(var(--graphite))", boxShadow: "0 0 0 2px hsl(var(--ink))" }}
          >
            +{people.length - 6}
          </div>
        )}
      </div>
    </div>
  );
}
