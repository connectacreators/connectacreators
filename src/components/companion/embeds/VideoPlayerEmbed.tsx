// src/components/companion/embeds/VideoPlayerEmbed.tsx
import { useRef, useState } from "react";
import type { VideoPlayerEmbedData } from "@/lib/companion/turn-script";

interface Props { data: VideoPlayerEmbedData; }

export default function VideoPlayerEmbed({ data }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden cursor-pointer"
      style={{
        aspectRatio: "9 / 16",
        maxWidth: 240,
        border: "1.5px solid hsl(var(--bone) / 0.18)",
        background: "#0a0d12",
        boxShadow: "4px 4px 0 rgba(0,0,0,0.4)",
      }}
      onClick={toggle}
    >
      {data.video_file_url ? (
        <video ref={ref} src={data.video_file_url} className="w-full h-full object-cover" muted loop playsInline />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #2a3548 0%, #0e1420 100%)" }}
        />
      )}
      {data.caption_overlay && !playing && (
        <div
          className="absolute top-3 left-2 right-2 text-center font-bold text-[11px] leading-tight"
          style={{ color: "#fff", textShadow: "1px 1px 0 #000" }}
        >
          {data.caption_overlay}
        </div>
      )}
      {!playing && (
        <div
          className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            transform: "translate(-50%, -50%)",
            background: "hsl(var(--honey))",
            border: "2px solid #1a1410",
            color: "#1a1410",
            fontSize: 16,
            boxShadow: "3px 3px 0 rgba(0,0,0,0.4)",
          }}
        >
          ▶
        </div>
      )}
      <div
        className="absolute bottom-3.5 left-2 right-2 flex justify-between font-jetbrains text-[9px]"
        style={{ color: "#fff" }}
      >
        <span>@{data.username}</span>
        <span
          className="px-1.5 py-0.5 rounded font-bold"
          style={{ background: "rgba(0,0,0,0.7)", color: "hsl(var(--honey))" }}
        >
          {data.outlier.toFixed(1)}x
        </span>
      </div>
    </div>
  );
}
