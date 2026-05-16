// src/components/companion/embeds/FrameworkDeckEmbed.tsx
import type { FrameworkDeckEmbedData } from "@/lib/companion/turn-script";

interface Props { data: FrameworkDeckEmbedData; }

export default function FrameworkDeckEmbed({ data }: Props) {
  const front = data.cards[0];
  const backCount = Math.min(2, data.cards.length - 1);

  if (!front) return null;

  return (
    <div className="relative pr-4 pb-5" style={{ maxWidth: 320 }}>
      {Array.from({ length: backCount }).map((_, i) => (
        <div
          key={i}
          className="broadcast-card-sm absolute"
          style={{
            top: 4 + i * 4,
            left: 4 + i * 4,
            right: 12 - i * 4,
            height: "100%",
            transform: `rotate(${-2 - i * 1.5}deg)`,
            background: i === 0 ? "#f0e3b8" : "#e8d8a8",
            zIndex: 1 - i,
          }}
        />
      ))}
      <div
        className="broadcast-card-sm relative px-3 py-2.5"
        style={{ background: "#fff8e8", transform: "rotate(1deg)", zIndex: 2 }}
      >
        <div
          className="font-bold text-[8.5px] uppercase tracking-widest mb-1"
          style={{ color: "#b04848", fontFamily: "Inter, sans-serif" }}
        >
          {front.tag}
        </div>
        <div
          className="font-medium text-[13.5px] leading-snug"
          style={{ color: "#1a1410", fontFamily: "'EB Garamond', Georgia, serif" }}
          dangerouslySetInnerHTML={{
            __html: front.headline.replace(
              /<scribble>(.*?)<\/scribble>/g,
              '<span class="scribble-wavy">$1</span>',
            ),
          }}
        />
      </div>
    </div>
  );
}
