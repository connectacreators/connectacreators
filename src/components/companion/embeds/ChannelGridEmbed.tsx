// src/components/companion/embeds/ChannelGridEmbed.tsx
import type { ChannelGridEmbedData } from "@/lib/companion/turn-script";

interface Props { data: ChannelGridEmbedData; }

const STATUS_COLOR = {
  active: { dot: "#7fb48a", text: "#7fb48a" },
  paused: { dot: "hsl(var(--bone) / 0.35)", text: "hsl(var(--bone) / 0.45)" },
  hot:    { dot: "hsl(var(--honey))", text: "hsl(var(--honey))" },
} as const;

export default function ChannelGridEmbed({ data }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {data.channels.map((c) => {
        const s = STATUS_COLOR[c.status];
        return (
          <div
            key={c.id}
            className="flex items-center gap-2 p-2 rounded-md"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid hsl(var(--bone) / 0.10)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: s.dot, boxShadow: c.status === "hot" ? `0 0 6px ${s.dot}` : "none" }}
            />
            <span className="text-[11px] font-medium truncate" style={{ color: "hsl(var(--cream))" }}>@{c.username}</span>
            <span className="ml-auto text-[9px] uppercase tracking-widest flex-shrink-0" style={{ color: s.text, fontFamily: "Inter, sans-serif" }}>
              {c.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
