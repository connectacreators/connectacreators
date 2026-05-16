import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiredFired = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [detectedRatio, setDetectedRatio] = useState<"9:16" | "16:9">("9:16");

  const effectiveSrc = src ?? fallbackProxyUrl ?? "";

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2800);
  }, [playing]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
      setShowControls(true);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const v = videoRef.current;
      const bar = progressRef.current;
      if (!v || !bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      v.currentTime = ratio * v.duration;
      resetHideTimer();
    },
    [resetHideTimer]
  );

  // Track fullscreen state from document
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // Video event listeners
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    expiredFired.current = false; // reset on src change
    const onMeta = () => {
      setDuration(el.duration || 0);
      if (aspectRatio === "auto" && el.videoWidth && el.videoHeight) {
        setDetectedRatio(el.videoWidth > el.videoHeight ? "16:9" : "9:16");
      }
    };
    const onTime = () => setCurrent(el.currentTime);
    const onErr = () => {
      if (!effectiveSrc || expiredFired.current) return;
      expiredFired.current = true;
      onExpired?.();
    };
    const onEnded = () => {
      setPlaying(false);
      setShowControls(true);
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("error", onErr);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("error", onErr);
      el.removeEventListener("ended", onEnded);
    };
  }, [aspectRatio, onExpired, effectiveSrc]);

  const finalRatio = aspectRatio === "auto" ? detectedRatio : aspectRatio;
  const aspectStyle = finalRatio === "9:16" ? "9 / 16" : "16 / 9";

  if (!effectiveSrc) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          aspectRatio: aspectStyle,
          background: "hsl(var(--bone))",
          border: "1px solid hsl(var(--ink))",
          borderRadius: 22,
          boxShadow: "6px 6px 0 hsl(var(--ink))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(10,14,18,0.5)",
          fontFamily: "'EB Garamond', serif",
          fontStyle: "italic",
          fontSize: 15,
        }}
      >
        Video unavailable
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (playing) setShowControls(false);
      }}
      onClick={togglePlay}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: fullscreen ? undefined : aspectStyle,
        borderRadius: fullscreen ? 0 : 22,
        overflow: "hidden",
        border: "1px solid hsl(var(--ink))",
        boxShadow: fullscreen ? "none" : "6px 6px 0 hsl(var(--ink))",
        background: "#000",
        cursor: "pointer",
      }}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        muted={muted}
        playsInline
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
      />

      {/* Hand-drawn imperfect-circle play overlay (shown when paused) */}
      {!playing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,14,18,0.30)",
            pointerEvents: "none",
          }}
        >
          <div style={{ width: 96, height: 96, position: "relative" }}>
            <svg
              viewBox="0 0 100 100"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              aria-hidden
            >
              {/* Hand-drawn imperfect circle */}
              <path
                d="M 50 8 Q 84 10, 92 50 Q 90 86, 50 92 Q 12 88, 8 50 Q 12 12, 50 8 Z"
                fill="hsl(var(--honey))"
                stroke="hsl(var(--ink))"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Wobbly play triangle */}
              <path
                d="M 40 32 Q 38 30, 42 32 L 70 48 Q 72 50, 70 52 L 42 68 Q 38 70, 40 68 Z"
                fill="hsl(var(--ink))"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "32px 18px 16px",
          background:
            "linear-gradient(0deg, rgba(10,14,18,0.92) 0%, rgba(10,14,18,0.55) 60%, transparent 100%)",
          transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
          transform: showControls ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          style={{
            height: 4,
            background: "rgba(234,230,220,0.18)",
            borderRadius: 4,
            marginBottom: 12,
            cursor: "pointer",
            position: "relative",
            border: "1px solid rgba(10,14,18,0.6)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${duration ? (current / duration) * 100 : 0}%`,
              background: "hsl(var(--honey))",
              borderRadius: 4,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "hsl(var(--honey))",
                border: "1px solid hsl(var(--ink))",
              }}
            />
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label={playing ? "Pause" : "Play"}
            style={{
              background: "hsl(var(--honey))",
              border: "1px solid hsl(var(--ink))",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "hsl(var(--ink))",
              padding: 0,
              display: "grid",
              placeItems: "center",
              boxShadow: "2px 2px 0 hsl(var(--ink))",
            }}
          >
            {playing ? (
              <Pause size={13} fill="hsl(var(--ink))" />
            ) : (
              <Play size={13} fill="hsl(var(--ink))" style={{ marginLeft: 1 }} />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--bone))",
              padding: 6,
              display: "grid",
              placeItems: "center",
            }}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <span
            style={{
              fontFamily: "'Figtree', monospace",
              fontSize: 12,
              color: "rgba(234,230,220,0.62)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
            }}
          >
            {fmt(current)} / {fmt(duration)}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "hsl(var(--bone))",
              padding: 6,
              display: "grid",
              placeItems: "center",
            }}
          >
            {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
