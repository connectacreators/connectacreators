import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";

interface ViralVideoPlayerProps {
  src: string | null;
  fallbackProxyUrl?: string | null;
  aspectRatio?: "9:16" | "16:9" | "auto";
  onExpired?: () => void;
  className?: string;
  /** Scale controls down for tiny inline players (e.g. chat embed cards
   *  at ~96px wide). Drops fullscreen/speed/time, shrinks everything. */
  compact?: boolean;
  /** false when embedded inside an already-rounded container (e.g. canvas video node) */
  rounded?: boolean;
}

const SPEEDS = [1, 1.25, 1.5, 2];

/**
 * Minimal video player — simple geometric shapes, no decoration.
 * Thin white scrub bar (draggable, buffered range), frosted-circle play state,
 * auto-hiding scrim controls, speed cycle, keyboard support (space/arrows/m/f).
 */
export function ViralVideoPlayer({
  src,
  fallbackProxyUrl,
  aspectRatio = "auto",
  onExpired,
  className,
  compact = false,
  rounded = true,
}: ViralVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiredFired = useRef(false);
  const draggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [scrubHover, setScrubHover] = useState(false);
  const [detectedRatio, setDetectedRatio] = useState<"9:16" | "16:9">("9:16");

  const effectiveSrc = src ?? fallbackProxyUrl ?? "";

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (playing && !draggingRef.current) setShowControls(false);
    }, 1800);
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

  const cycleSpeed = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const next = SPEEDS[(SPEEDS.indexOf(v.playbackRate as number) + 1) % SPEEDS.length] ?? 1;
    v.playbackRate = next;
    setSpeed(next);
    resetHideTimer();
  }, [resetHideTimer]);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    resetHideTimer();
  }, [resetHideTimer]);

  // Draggable scrub with pointer capture — not just click-to-seek
  const seekToClientX = useCallback((clientX: number) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar || !isFinite(v.duration)) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = ratio * v.duration;
    setCurrent(v.currentTime);
  }, []);

  const onScrubPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  }, [seekToClientX]);

  const onScrubPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekToClientX(e.clientX);
  }, [seekToClientX]);

  const onScrubPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Keyboard controls when the player has focus
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(-5); }
    else if (e.key === "ArrowRight") { e.preventDefault(); seekBy(5); }
    else if (e.key === "m") toggleMute();
    else if (e.key === "f") toggleFullscreen();
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen]);

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
    const onProgress = () => {
      try {
        const b = el.buffered;
        if (b.length) setBuffered(b.end(b.length - 1));
      } catch { /* ignore */ }
    };
    const onWaiting = () => setBuffering(true);
    const onPlayable = () => setBuffering(false);
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
    el.addEventListener("progress", onProgress);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("stalled", onWaiting);
    el.addEventListener("playing", onPlayable);
    el.addEventListener("canplay", onPlayable);
    el.addEventListener("error", onErr);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("stalled", onWaiting);
      el.removeEventListener("playing", onPlayable);
      el.removeEventListener("canplay", onPlayable);
      el.removeEventListener("error", onErr);
      el.removeEventListener("ended", onEnded);
    };
  }, [aspectRatio, onExpired, effectiveSrc]);

  const finalRatio = aspectRatio === "auto" ? detectedRatio : aspectRatio;
  const aspectStyle = finalRatio === "9:16" ? "9 / 16" : "16 / 9";
  const radius = fullscreen || compact || !rounded ? 0 : 16;

  if (!effectiveSrc) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          aspectRatio: aspectStyle,
          background: "hsl(var(--ink) / 0.06)",
          borderRadius: radius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "hsl(var(--ink-on-cream) / 0.45)",
          fontSize: 13,
        }}
      >
        Video unavailable
      </div>
    );
  }

  const iconBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "rgba(255,255,255,0.75)",
    padding: compact ? 2 : 6,
    display: "grid",
    placeItems: "center",
    transition: "color 120ms ease",
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (playing && !draggingRef.current) setShowControls(false);
      }}
      onClick={togglePlay}
      onKeyDown={onKeyDown}
      tabIndex={0}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: fullscreen ? undefined : aspectStyle,
        borderRadius: radius,
        overflow: "hidden",
        background: "#000",
        cursor: "pointer",
        outline: "none",
      }}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        muted={muted}
        playsInline
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
      />

      {/* Center state: simple frosted circle + plain triangle (or spinner while buffering) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          background: playing ? "transparent" : "rgba(0,0,0,0.20)",
          transition: "background 150ms ease",
        }}
      >
        <div
          style={{
            width: compact ? 34 : 56,
            height: compact ? 34 : 56,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            opacity: !playing || buffering ? 1 : 0,
            transform: !playing || buffering ? "scale(1)" : "scale(0.85)",
            transition: "opacity 150ms ease, transform 150ms ease",
          }}
        >
          {buffering && playing ? (
            <Loader2 size={compact ? 16 : 24} className="animate-spin" />
          ) : (
            <Play size={compact ? 14 : 22} fill="#fff" style={{ marginLeft: 2 }} />
          )}
        </div>
      </div>

      {/* Controls scrim */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: compact ? "14px 8px 6px" : "28px 12px 8px",
          background: "linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
          transition: "opacity 180ms ease",
        }}
      >
        {/* Scrub bar — 3px visual track inside a 14px hit area, draggable */}
        <div
          ref={progressRef}
          onPointerDown={onScrubPointerDown}
          onPointerMove={onScrubPointerMove}
          onPointerUp={onScrubPointerUp}
          onPointerCancel={onScrubPointerUp}
          onMouseEnter={() => setScrubHover(true)}
          onMouseLeave={() => setScrubHover(false)}
          onClick={(e) => e.stopPropagation()}
          style={{
            height: 14,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: compact ? 0 : 2,
            touchAction: "none",
          }}
        >
          <div style={{ position: "relative", width: "100%", height: 3, borderRadius: 2, background: "rgba(255,255,255,0.25)" }}>
            {/* Buffered range */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${duration ? Math.min(100, (buffered / duration) * 100) : 0}%`,
                background: "rgba(255,255,255,0.4)",
                borderRadius: 2,
              }}
            />
            {/* Played */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${duration ? (current / duration) * 100 : 0}%`,
                background: "#fff",
                borderRadius: 2,
              }}
            >
              {/* Knob — appears on hover/drag */}
              {!compact && (
                <div
                  style={{
                    position: "absolute",
                    right: -5,
                    top: "50%",
                    transform: `translateY(-50%) scale(${scrubHover || draggingRef.current ? 1 : 0})`,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "transform 120ms ease",
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            aria-label={playing ? "Pause" : "Play"}
            style={{ ...iconBtn, color: "#fff" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          >
            {playing ? <Pause size={compact ? 12 : 16} fill="#fff" /> : <Play size={compact ? 12 : 16} fill="#fff" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleMute(); }}
            aria-label={muted ? "Unmute" : "Mute"}
            style={iconBtn}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          >
            {muted ? <VolumeX size={compact ? 11 : 15} /> : <Volume2 size={compact ? 11 : 15} />}
          </button>
          {!compact && (
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.9)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.02em",
                marginLeft: 2,
              }}
            >
              {fmt(current)} / {fmt(duration)}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {!compact && (
            <button
              onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
              aria-label="Playback speed"
              style={{ ...iconBtn, fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            >
              {speed}x
            </button>
          )}
          {!compact && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              style={iconBtn}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            >
              {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          )}
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
