import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";

interface VSLPlayerProps {
  src: string;
  poster: string;
  accent?: string;
}

/**
 * Custom VSL video player. The <img> poster renders immediately (no buffering
 * delay), so the thumbnail is visible the moment the page paints. The actual
 * <video> sits behind it and only takes over once playback starts.
 */
export default function VSLPlayer({ src, poster, accent = "#F5C265" }: VSLPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setProgress(v.currentTime);
      setDuration(v.duration || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!started) setStarted(true);
    if (v.paused) {
      v.muted = false;
      setMuted(false);
      v.play().catch(() => {
        v.muted = true;
        setMuted(true);
        v.play();
      });
    } else {
      v.pause();
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const w = wrapRef.current;
    if (!w) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else w.requestFullscreen?.();
  };

  const pct = duration ? (progress / duration) * 100 : 0;
  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        background: "#000",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 18px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)",
        cursor: "pointer",
      }}
      onClick={handlePlay}
    >
      {/* Instant poster — img loads on paint, no codec wait. */}
      {!started && (
        <img
          src={poster}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            zIndex: 1,
          }}
        />
      )}

      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={poster}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          zIndex: 2,
          opacity: started ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      >
        <source src={src} type="video/mp4" />
      </video>

      {/* Center play button — only when paused */}
      {!playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3,
            background: started ? "rgba(0,0,0,0.25)" : "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))",
            transition: "background 0.2s ease",
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 8px rgba(255,255,255,0.12), 0 24px 48px rgba(0,0,0,0.4)`,
              transition: "transform 0.18s ease",
              transform: hover ? "scale(1.06)" : "scale(1)",
            }}
          >
            <Play size={36} fill="#0E2F33" color="#0E2F33" strokeWidth={0} style={{ marginLeft: 4 }} />
          </div>
        </div>
      )}

      {/* Controls bar — visible when started */}
      {started && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "16px 18px 14px",
            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.7))",
            zIndex: 4,
            opacity: hover || !playing ? 1 : 0,
            transition: "opacity 0.2s ease",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            onClick={handleSeek}
            style={{
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.25)",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: `${pct}%`,
                background: accent,
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#fff" }}>
            <button onClick={handlePlay} style={btn}>
              {playing ? <Pause size={18} fill="#fff" strokeWidth={0} /> : <Play size={18} fill="#fff" strokeWidth={0} />}
            </button>
            <button onClick={toggleMute} style={btn}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>
              {fmt(progress)} / {fmt(duration)}
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button onClick={toggleFullscreen} style={btn}>
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};
