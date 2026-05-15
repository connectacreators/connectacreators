import { useEffect, useRef, useState } from "react";

interface ViralVideoPlayerProps {
  src: string | null;
  fallbackProxyUrl?: string | null;
  aspectRatio?: "9:16" | "16:9" | "auto";
  onExpired?: () => void;
  className?: string;
}

export function ViralVideoPlayer({
  src,
  fallbackProxyUrl,
  aspectRatio = "auto",
  onExpired,
  className,
}: ViralVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [detectedRatio, setDetectedRatio] = useState<"9:16" | "16:9">("9:16");

  const effectiveSrc = src ?? fallbackProxyUrl ?? "";

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onMeta = () => {
      setDuration(el.duration || 0);
      if (aspectRatio === "auto" && el.videoWidth && el.videoHeight) {
        setDetectedRatio(el.videoWidth > el.videoHeight ? "16:9" : "9:16");
      }
    };
    const onTime = () => setCurrent(el.currentTime);
    const onErr = () => onExpired?.();
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("error", onErr);
    };
  }, [aspectRatio, onExpired, effectiveSrc]);

  const finalRatio = aspectRatio === "auto" ? detectedRatio : aspectRatio;
  const aspectStyle = finalRatio === "9:16" ? "9 / 16" : "16 / 9";

  if (!effectiveSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-black/40 text-bone/60 rounded-lg ${className ?? ""}`}
        style={{ aspectRatio: aspectStyle }}
      >
        Video unavailable
      </div>
    );
  }

  return (
    <div
      className={`relative bg-black rounded-lg overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: aspectStyle }}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        muted={muted}
        playsInline
        className="w-full h-full"
        onClick={() => {
          const el = videoRef.current;
          if (!el) return;
          if (el.paused) {
            el.play();
            setPlaying(true);
          } else {
            el.pause();
            setPlaying(false);
          }
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2 text-bone text-xs">
        <button
          onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (el.paused) {
              el.play();
              setPlaying(true);
            } else {
              el.pause();
              setPlaying(false);
            }
          }}
          aria-label={playing ? "Pause" : "Play"}
          className="w-6 h-6 flex items-center justify-center"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="w-6 h-6 flex items-center justify-center"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={(e) => {
            const el = videoRef.current;
            if (el) el.currentTime = Number(e.target.value);
          }}
          className="flex-1 accent-bone"
        />
        <span className="tabular-nums whitespace-nowrap">
          {formatTime(current)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
