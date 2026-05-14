import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Calendar,
  Film,
  Flame,
  Send,
  Menu,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from "lucide-react";
import "../landing.css";
import logoHandBone from "@/assets/connecta-logo-hand-bone.png";
import miroodlesLaptopEye from "@/assets/miroodles-laptop-eye.png";
import doodleSelfie from "@/assets/doodle-selfie.png";
import doodleMessy from "@/assets/doodle-messy.png";
import yuppiesBubble from "@/assets/yuppies-bubble.png";
import yuppiesMagnifyingGlass from "@/assets/yuppies-magnifying-glass.png";
import CurvedLoop from "@/components/landing/CurvedLoop";
import ScrollFloat from "@/components/landing/ScrollFloat";
import PromptStream from "@/components/landing/PromptStream";

/* =============================================================================
   The locked editorial system — Ink + Aqua + Honey + EB Garamond + Figtree
   Scoped to the .landing-editorial wrapper class. No global tokens touched.
   ============================================================================= */

/* ─────────────────────────────────────────────────────────────
   Letter-by-letter rise — motion only, no opacity.
   Each character translates up + rotates with a stagger.
   Spaces become non-breaking inside a phrase so words stay together.
   ───────────────────────────────────────────────────────────── */
function LetterRise({
  text,
  delay = 0,
  step = 0.035,
}: {
  text: string;
  delay?: number;
  step?: number;
}) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="letter-rise prox-letter"
          style={{ animationDelay: `${delay + i * step}s` }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   ProxText — splits text into word spans tagged for proximity weight.
   The global mouse tracker in LandingPageNew sets --prox-wght on each
   word based on cursor distance, fattening only what's directly under
   the cursor. Width is locked on mount so no layout shift.
   ───────────────────────────────────────────────────────────── */
function ProxText({ children }: { children: string }) {
  const parts = children.split(" ");
  const out: React.ReactNode[] = [];
  parts.forEach((word, i) => {
    out.push(
      <span key={`w-${i}`} className="prox-word">
        {word}
      </span>
    );
    if (i < parts.length - 1) out.push(" ");
  });
  return <>{out}</>;
}

function WordRise({
  text,
  delay = 0,
  step = 0.08,
}: {
  text: string;
  delay?: number;
  step?: number;
}) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          <span
            className="word-rise"
            style={{ animationDelay: `${delay + i * step}s` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   InteractiveSticker — drifts toward the cursor when within range.
   Uses transform translate, scale, plus a base rotation. Pure motion,
   no opacity changes. Cursor must be within `radius` to activate.
   ───────────────────────────────────────────────────────────── */
function InteractiveSticker({
  src,
  alt = "",
  baseRotation = 0,
  maxOffset = 18,
  radius = 260,
  className,
  style,
}: {
  src: string;
  alt?: string;
  baseRotation?: number;
  maxOffset?: number;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0, scale: 1, tilt: 0 });
  const currentRef = useRef({ x: 0, y: 0, scale: 1, tilt: 0 });

  useEffect(() => {
    const animate = () => {
      const c = currentRef.current;
      const t = targetRef.current;
      // Lerp toward target for a lazy "follow" feel
      c.x += (t.x - c.x) * 0.12;
      c.y += (t.y - c.y) * 0.12;
      c.scale += (t.scale - c.scale) * 0.12;
      c.tilt += (t.tilt - c.tilt) * 0.12;
      if (ref.current) {
        ref.current.style.transform =
          `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px) ` +
          `rotate(${(baseRotation + c.tilt).toFixed(2)}deg) ` +
          `scale(${c.scale.toFixed(3)})`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    const onMove = (e: MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0) {
        const strength = (radius - dist) / radius; // 0..1
        const unit = { x: dx / dist, y: dy / dist };
        targetRef.current.x = unit.x * maxOffset * strength;
        targetRef.current.y = unit.y * maxOffset * strength;
        targetRef.current.scale = 1 + strength * 0.05;
        targetRef.current.tilt = unit.x * 4 * strength; // small lean toward cursor
      } else {
        targetRef.current.x = 0;
        targetRef.current.y = 0;
        targetRef.current.scale = 1;
        targetRef.current.tilt = 0;
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    const onLeave = () => {
      targetRef.current = { x: 0, y: 0, scale: 1, tilt: 0 };
    };
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [baseRotation, maxOffset, radius]);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      aria-hidden={!alt}
      className={className}
      style={{
        ...style,
        willChange: "transform",
        transform: `rotate(${baseRotation}deg)`, // initial transform before RAF runs
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   Branded demo video player — uses the actual product video from
   the original landing. Restyled with Ink+Aqua+Honey + hand-drawn
   doodle play button. Hard offset shadow for the "sticker" frame.
   ───────────────────────────────────────────────────────────── */
const DEMO_VIDEO_URL =
  "https://hxojqrilwhhrvloiwmfo.supabase.co/storage/v1/object/public/landing-assets/demo-video.mp4";

function DemoVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2800);
  }, [playing]);

  const toggle = useCallback(() => {
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

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress(v.currentTime / v.duration);
  }, []);

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

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (playing) setShowControls(false);
      }}
      onClick={toggle}
      style={{
        position: "relative",
        width: "100%",
        borderRadius: fullscreen ? 0 : 22,
        overflow: "hidden",
        border: "1.5px solid var(--ink)",
        boxShadow: fullscreen ? "none" : "6px 6px 0 var(--ink)",
        background: "#000",
        cursor: "pointer",
      }}
    >
      <video
        ref={videoRef}
        src={DEMO_VIDEO_URL}
        muted
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => {
          setPlaying(false);
          setShowControls(true);
        }}
        style={{
          width: "100%",
          display: "block",
          maxHeight: fullscreen ? "100vh" : "none",
        }}
      />

      {/* Big hand-drawn play overlay (shown when paused) */}
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
          <div
            style={{
              width: 96,
              height: 96,
              position: "relative",
            }}
          >
            <svg
              viewBox="0 0 100 100"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              aria-hidden
            >
              {/* Hand-drawn imperfect circle */}
              <path
                d="M 50 8 Q 84 10, 92 50 Q 90 86, 50 92 Q 12 88, 8 50 Q 12 12, 50 8 Z"
                fill="var(--honey)"
                stroke="var(--ink)"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Wobbly play triangle */}
              <path
                d="M 40 32 Q 38 30, 42 32 L 70 48 Q 72 50, 70 52 L 42 68 Q 38 70, 40 68 Z"
                fill="var(--ink)"
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
              width: `${progress * 100}%`,
              background: "var(--aqua)",
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
                background: "var(--aqua)",
                border: "1.5px solid var(--ink)",
              }}
            />
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            style={{
              background: "var(--bone)",
              border: "1.5px solid var(--ink)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              color: "var(--ink)",
              padding: 0,
              display: "grid",
              placeItems: "center",
              boxShadow: "2px 2px 0 var(--ink)",
            }}
          >
            {playing ? (
              <Pause size={13} fill="var(--ink)" />
            ) : (
              <Play size={13} fill="var(--ink)" style={{ marginLeft: 1 }} />
            )}
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--bone)",
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
            {fmt(currentTime)} / {fmt(duration)}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--bone)",
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

/* ─────────────────────────────────────────────────────────────
   Super Canvas mockup — kept as a secondary mock for The Brain
   section's right column. The hero now uses the real demo video.
   ───────────────────────────────────────────────────────────── */
function SuperCanvasMock() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 460,
        background: "#15181E",
        border: "1.5px solid #0A0E12",
        borderRadius: 22,
        boxShadow: "6px 6px 0 #0A0E12",
      }}
    >
      {/* Title strip — editorial, not code-editor */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid rgba(234, 230, 220, 0.07)",
          background: "rgba(10, 14, 18, 0.40)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontSize: 19,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--bone)",
            }}
          >
            Super Canvas
          </span>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--bone-3)",
            }}
          >
            — Luna's spring strategy
          </span>
        </div>
        <span className="pill pill-honey">
          <span className="pill-dot" /> Companion · drafting
        </span>
      </div>

      {/* Canvas */}
      <div className="relative" style={{ height: "calc(100% - 49px)", padding: 24 }}>
        {/* Connection lines */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 800 400"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 24, pointerEvents: "none" }}
        >
          {/* Central brand node lines */}
          <path d="M 400 200 Q 250 130, 130 90" className="sc-canvas-line" />
          <path d="M 400 200 Q 270 200, 130 200" className="sc-canvas-line" />
          <path d="M 400 200 Q 250 270, 130 320" className="sc-canvas-line" />
          <path d="M 400 200 Q 550 130, 680 90" className="sc-canvas-line honey" />
          <path d="M 400 200 Q 540 200, 680 200" className="sc-canvas-line" />
          <path d="M 400 200 Q 550 270, 680 320" className="sc-canvas-line" />
        </svg>

        {/* Central Brand node — editorial / magazine-clipping feel */}
        <div
          className="sc-node active"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            minWidth: 200,
            padding: "16px 18px",
          }}
        >
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 12,
              color: "var(--honey)",
              letterSpacing: "0.01em",
            }}
          >
            — the brand
          </span>
          <span
            className="serif"
            style={{ fontSize: 22, lineHeight: 1.0, marginTop: 2, fontWeight: 500 }}
          >
            Luna Reyes
          </span>
          <span
            style={{
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 12.5,
              color: "var(--bone-2)",
              marginTop: 4,
            }}
          >
            2.4M followers · fashion + lifestyle
          </span>
          <span className="sc-node-pill honey" style={{ marginTop: 8 }}>● strategy live</span>
        </div>

        {/* Satellite nodes — softer, more editorial labels */}
        <div className="sc-node" style={{ top: "10%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her audience
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            Listens at <em className="serif-italic">8pm Tuesday.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>22–34 · LA + NYC</span>
        </div>

        <div className="sc-node" style={{ top: "45%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her voice
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            Dry, <em className="serif-italic">slightly funny.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>trained · last 50 posts</span>
        </div>

        <div className="sc-node" style={{ top: "80%", left: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--aqua)" }}>
            — her best hook
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4, fontStyle: "italic" }}>
            "Three things I wish I knew…"
          </span>
          <span className="sc-node-pill" style={{ marginTop: 6 }}>9.2 / 10</span>
        </div>

        <div className="sc-node" style={{ top: "10%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — hot this week
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4, fontStyle: "italic" }}>
            "Soft launch the chaos"
          </span>
          <span className="sc-node-pill honey" style={{ marginTop: 6 }}>▲ 340% w/w</span>
        </div>

        <div className="sc-node" style={{ top: "45%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — the calendar
          </span>
          <span className="serif" style={{ fontSize: 15, marginTop: 4 }}>
            5 posts <em className="serif-italic">drafted.</em>
          </span>
          <span style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 4 }}>Mon 9am · Wed 7pm · …</span>
        </div>

        <div className="sc-node" style={{ top: "80%", right: "3%", padding: "14px 16px" }}>
          <span style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic", fontSize: 11.5, color: "var(--honey)" }}>
            — next ask
          </span>
          <span className="serif" style={{ fontSize: 14, marginTop: 4 }}>
            Skincare partner <em className="serif-italic">draft.</em>
          </span>
          <span className="sc-node-pill" style={{ marginTop: 6 }}>auto-saved</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Viral Today mockup — trending feed.
   ───────────────────────────────────────────────────────────── */
function ViralTodayMock() {
  const rows = [
    {
      letter: "S",
      meta: "@softlife · TikTok · 2h",
      title: "Soft launch your year, not your relationship",
      score: "12× outlier",
      pill: "Hook stolen",
      tone: "aqua" as const,
    },
    {
      letter: "M",
      meta: "@morningclub · Reels · 4h",
      title: "Why I stopped journaling at 5am",
      score: "8× outlier",
      pill: "Remix ready",
      tone: "honey" as const,
    },
    {
      letter: "C",
      meta: "@creatorlab · Shorts · 7h",
      title: "The hook formula that never fails",
      score: "9× outlier",
      pill: "Saved",
      tone: "aqua" as const,
    },
    {
      letter: "D",
      meta: "@drjuno · TikTok · today",
      title: "Three foods cardiologists never eat",
      score: "14× outlier",
      pill: "Hot",
      tone: "honey" as const,
    },
  ];
  return (
    <div
      style={{
        padding: 22,
        background: "#FBF8EE",
        border: "1.5px solid var(--ink)",
        boxShadow: "5px 5px 0 var(--ink)",
        borderRadius: 20,
        color: "var(--ink)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-2">
          <Flame size={14} style={{ color: "var(--honey)" }} />
          <span
            style={{
              fontFamily: "'Figtree', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--honey)",
            }}
          >
            Viral Today · Wed, May 14
          </span>
        </div>
        <span className="pill pill-muted">12,847 scanned</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r, i) => (
          <div key={i} className="vt-card">
            <div className={`vt-thumb ${r.tone === "honey" ? "honey" : ""}`}>{r.letter}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="vt-meta">{r.meta}</div>
              <div className="vt-title">{r.title}</div>
              <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                <span className={`vt-score ${r.tone === "aqua" ? "aqua" : ""}`}>
                  {r.score}
                </span>
                <span
                  className={`pill ${r.tone === "aqua" ? "pill-aqua" : "pill-honey"}`}
                  style={{ fontSize: 10 }}
                >
                  {r.pill}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pipeline trio — editing queue / calendar / companion.
   ───────────────────────────────────────────────────────────── */
function PipelineCard({
  eyebrow,
  title,
  body,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof Calendar;
  children?: React.ReactNode;
}) {
  return (
    <div className="card card-lift" style={{ padding: "32px 28px 28px", display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "rgba(143, 208, 213, 0.10)",
          display: "grid",
          placeItems: "center",
          color: "var(--aqua)",
        }}
      >
        <Icon size={20} strokeWidth={1.6} />
      </div>
      <div>
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <h3 className="serif" style={{ fontSize: 24, lineHeight: 1.1, margin: 0, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: "var(--bone-2)", margin: 0, lineHeight: 1.6 }}>{body}</p>
      {children && (
        <div
          style={{
            marginTop: 4,
            borderTop: "1px solid var(--line)",
            paddingTop: 16,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   The page
   ============================================================================= */

export default function LandingPageNew() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const scrollRoot = useRef<HTMLDivElement | null>(null);

  // ESC closes the video modal
  useEffect(() => {
    if (!videoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVideoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoOpen]);

  // Global proximity-weight tracker. Locks word/letter widths after fonts
  // load (no text expansion), then on every mousemove updates --prox-wght
  // for spans within `radius` of the cursor.
  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;

    const lockWidths = () => {
      const targets = root.querySelectorAll<HTMLElement>(".prox-word, .prox-letter");
      targets.forEach((el) => {
        if (el.dataset.proxLocked) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return;
        el.style.minWidth = `${r.width}px`;
        el.dataset.proxLocked = "true";
      });
    };
    if ((document as Document & { fonts?: FontFaceSet }).fonts) {
      (document as Document & { fonts: FontFaceSet }).fonts.ready.then(lockWidths);
      // Also run after a tick in case ready already fired
      setTimeout(lockWidths, 50);
      setTimeout(lockWidths, 500);
    } else {
      setTimeout(lockWidths, 100);
    }

    const RADIUS = 65;
    const DELTA = 80; // wght: 400 → 480, very subtle
    let raf: number | null = null;
    let posX = -9999;
    let posY = -9999;

    const onMove = (e: MouseEvent) => {
      posX = e.clientX;
      posY = e.clientY;
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const targets = root.querySelectorAll<HTMLElement>(".prox-word, .prox-letter");
        targets.forEach((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const dist = Math.hypot(posX - cx, posY - cy);
          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            const w = Math.round(400 + DELTA * t);
            el.style.setProperty("--prox-wght", String(w));
          } else if (el.style.getPropertyValue("--prox-wght")) {
            el.style.removeProperty("--prox-wght");
          }
        });
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  // sticky nav state
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // scroll-fade-in
  useEffect(() => {
    if (!scrollRoot.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    const targets = scrollRoot.current.querySelectorAll(".scroll-rise");
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing-editorial" ref={scrollRoot}>
      {/* ===== Announcement banner ===== */}
      <div
        style={{
          background: "var(--bone)",
          color: "var(--ink)",
          padding: "10px 24px",
          textAlign: "center",
          fontSize: 13,
          fontFamily: "'Figtree', sans-serif",
          fontWeight: 500,
          margin: "12px 18px 0",
          borderRadius: 999,
        }}
      >
        <span style={{ marginRight: 6 }}>
          <Flame size={11} style={{ display: "inline-block", color: "var(--ink)", marginRight: 6, marginBottom: -1 }} />
          <strong style={{ fontWeight: 700 }}>Viral Today is live.</strong>
        </span>
        Spot trends before your feed catches on.{" "}
        <Link to="/scripts" style={{ color: "var(--ink)", fontWeight: 700, marginLeft: 4, textDecoration: "underline" }}>
          Try it →
        </Link>
      </div>

      {/* ===== Nav ===== */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: scrolled ? "blur(18px)" : "none",
          background: scrolled ? "rgba(10,14,18,0.78)" : "transparent",
          borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
          transition: "all 220ms ease",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "18px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            to="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            aria-label="Connecta"
          >
            <img
              src={logoHandBone}
              alt=""
              style={{ height: 36, width: "auto", display: "block" }}
            />
            <span
              className="serif"
              style={{
                fontSize: 22,
                color: "var(--bone)",
                letterSpacing: "0.04em",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              CONNECTA
            </span>
          </Link>

          <div
            className="hidden-mobile"
            style={{
              display: "flex",
              gap: 30,
              fontSize: 14,
              color: "var(--bone-2)",
              fontFamily: "'Figtree', sans-serif",
            }}
          >
            <a href="#brain" className="scribble-link">The Brain</a>
            <a href="#viral" className="scribble-link">Viral Today</a>
            <a href="#pipeline" className="scribble-link">Pipeline</a>
          </div>

          <div className="hidden-mobile" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              to="/scripts"
              style={{
                fontSize: 14,
                color: "var(--bone-2)",
                fontFamily: "'Figtree', sans-serif",
              }}
            >
              Sign in
            </Link>
            <Link to="/scripts" className="btn btn-aqua">
              Get started
            </Link>
          </div>

          <button
            className="hidden-desktop"
            onClick={() => setMobileOpen((x) => !x)}
            aria-label="Menu"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--bone)",
              cursor: "pointer",
              padding: 8,
              display: "none",
            }}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileOpen && (
          <div
            style={{
              borderTop: "1px solid var(--line)",
              padding: "16px 32px 22px",
              background: "rgba(10,14,18,0.95)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontSize: 15,
            }}
          >
            <a href="#brain" onClick={() => setMobileOpen(false)}>The Brain</a>
            <a href="#viral" onClick={() => setMobileOpen(false)}>Viral Today</a>
            <a href="#pipeline" onClick={() => setMobileOpen(false)}>Pipeline</a>
            <Link to="/scripts" className="btn btn-aqua" style={{ marginTop: 8, alignSelf: "flex-start" }}>
              Get started
            </Link>
          </div>
        )}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .landing-editorial .hidden-mobile { display: none !important; }
          .landing-editorial .hidden-desktop { display: inline-flex !important; }
        }
      `}</style>

      {/* ===== HERO ===== */}
      <section className="bg-ink" style={{ position: "relative", paddingTop: 80, paddingBottom: 60, overflow: "hidden" }}>
        {/* Yuppies decorative stickers replace the text marginalia */}
        <InteractiveSticker
          src={yuppiesBubble}
          baseRotation={-8}
          maxOffset={10}
          radius={220}
          style={{
            position: "absolute",
            top: 100,
            left: "3%",
            width: 260,
            height: "auto",
            opacity: 0.62,
            zIndex: 0,
            pointerEvents: "none",
            display: "block",
          }}
        />
        <InteractiveSticker
          src={yuppiesMagnifyingGlass}
          baseRotation={6}
          maxOffset={10}
          radius={220}
          style={{
            position: "absolute",
            top: 180,
            right: "2%",
            width: 280,
            height: "auto",
            opacity: 0.62,
            zIndex: 0,
            pointerEvents: "none",
            display: "block",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 1080,
            margin: "0 auto",
            padding: "0 32px",
            textAlign: "center",
          }}
        >
          <div data-reveal="1" style={{ marginBottom: 26 }}>
            <span className="eyebrow">The AI strategist for creators</span>
          </div>

          <h1
            className="serif"
            style={{
              fontSize: "clamp(40px, 7vw, 88px)",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              margin: 0,
              marginBottom: 26,
              whiteSpace: "nowrap",
              overflow: "hidden",
              paddingBottom: "0.08em",
            }}
          >
            <LetterRise text="Go " delay={0.25} step={0.04} />
            <span
              className="serif-italic scribble-hover"
              style={{
                display: "inline-block",
                color: "var(--honey)",
                fontWeight: 400,
              }}
            >
              <LetterRise text="Viral," delay={0.40} step={0.04} />
              {/* sparkles — appear on hover with spring scale */}
              <svg className="spark s1" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 1 L14.2 9.8 L23 12 L14.2 14.2 L12 23 L9.8 14.2 L1 12 L9.8 9.8 Z"
                  fill="var(--honey)"
                  stroke="var(--ink)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <svg className="spark s2" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 3 L13.5 10.5 L21 12 L13.5 13.5 L12 21 L10.5 13.5 L3 12 L10.5 10.5 Z"
                  fill="var(--aqua)"
                  stroke="var(--ink)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <svg className="spark s3" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="5" fill="var(--bone)" stroke="var(--ink)" strokeWidth="2" />
              </svg>
            </span>
            <LetterRise text=" Get " delay={0.62} step={0.04} />
            <span
              className="serif-italic"
              style={{
                display: "inline-block",
                color: "var(--aqua)",
                fontWeight: 400,
              }}
            >
              <LetterRise text="Clients." delay={0.78} step={0.04} />
            </span>
          </h1>

          <div
            data-reveal="3"
            style={{
              fontSize: "clamp(15px, 1.6vw, 19px)",
              color: "var(--bone-2)",
              maxWidth: 580,
              margin: "0 auto 40px",
              lineHeight: 1.55,
              position: "relative",
            }}
          >
            <ProxText>Connecta plans your next 30 days of content before you open the app. Hooks that land, posts that book — strategy, scripts, and schedule done for you.</ProxText>
          </div>

          <div
            data-reveal="4"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link to="/scripts" className="btn btn-aqua btn-large">
              Get started <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="btn btn-ghost btn-large"
            >
              ▶ Watch the 90-sec demo
            </button>
          </div>

          <div
            data-reveal="5"
            style={{
              marginTop: 18,
              fontSize: 12.5,
              color: "var(--bone-3)",
              letterSpacing: "0.02em",
            }}
          >
            Free to try · No credit card · Cancel anytime
          </div>
        </div>

        {/* PromptStream — prompt → AI pill → output banner, full viewport width */}
        <div
          data-reveal="6"
          style={{
            position: "relative",
            zIndex: 1,
            width: "100vw",
            marginLeft: "calc(50% - 50vw)",
            marginRight: "calc(50% - 50vw)",
            marginTop: 64,
          }}
        >
          <PromptStream />
        </div>
      </section>

      {/* ===== Real track record — bone panel ===== */}
      <section className="panel-bone" style={{ padding: "80px 0 90px", marginTop: 24, position: "relative", overflow: "visible" }}>
        {/* Sticker — peeks from the top-right of the bone panel into the ink page above */}
        <InteractiveSticker
          src={miroodlesLaptopEye}
          baseRotation={-6}
          style={{
            position: "absolute",
            top: -100,
            right: "5%",
            width: 170,
            height: "auto",
            zIndex: 5,
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(10,14,18,0.45)",
              fontWeight: 600,
              marginBottom: 36,
            }}
          >
            What Connecta has built <span className="scribble-under ink" style={{ display: "inline-block" }}>for creators</span>
          </div>

          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 24,
              alignItems: "stretch",
            }}
          >
            {[
              {
                num: "100M+",
                kicker: "views generated",
                body: "Across reels, shorts, and TikToks for the creators using our scripts and strategy.",
                accent: "honey" as const,
              },
              {
                num: "100K+",
                kicker: "followers grown",
                body: "Real audiences, built on the back of strategy — not hacks, not bots, not luck.",
                accent: "aqua" as const,
              },
            ].map((s, i) => (
              <div
                key={i}
                data-card
                style={{
                  textAlign: "center",
                  padding: "36px 28px",
                  background: "#FBF8EE",
                  border: "1.5px solid var(--ink)",
                  borderRadius: 24,
                  boxShadow: "4px 4px 0 var(--ink)",
                }}
              >
                <div
                  className="serif scroll-rise"
                  style={{
                    fontSize: "clamp(56px, 8vw, 96px)",
                    lineHeight: 1.0,
                    letterSpacing: "-0.03em",
                    fontWeight: 500,
                    color: s.accent === "honey" ? "#A85B1F" : "#2A6F77",
                    fontStyle: "italic",
                  }}
                >
                  <span
                    className={`scribble-under ${s.accent === "honey" ? "honey" : "aqua"}`}
                    style={{ display: "inline-block" }}
                  >
                    {s.num}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "'Figtree', sans-serif",
                    fontSize: 12,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(10,14,18,0.65)",
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  {s.kicker}
                </div>
                <p
                  style={{
                    margin: "12px auto 0",
                    fontSize: 14,
                    color: "rgba(10,14,18,0.55)",
                    maxWidth: 380,
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </p>
              </div>
            ))}
          </div>

          <div
            className="scroll-rise"
            style={{
              textAlign: "center",
              marginTop: 32,
              fontFamily: "'EB Garamond', serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "rgba(10,14,18,0.50)",
              letterSpacing: "0.005em",
            }}
          >
            — and we're just getting started.
          </div>
        </div>
      </section>

      {/* ===== Section 1 — THE BRAIN (Super Canvas) ===== */}
      <section id="brain" className="bg-ink" style={{ padding: "140px 0", position: "relative", overflow: "visible" }}>
        {/* Selfie sticker — creator-in-action, hovers near the section title */}
        <InteractiveSticker
          src={doodleSelfie}
          baseRotation={5}
          style={{
            position: "absolute",
            top: 40,
            right: "3%",
            width: 230,
            height: "auto",
            zIndex: 4,
            pointerEvents: "none",
          }}
        />
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.2fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow">The Jarvis</span>
              <h2 className="section-h2" style={{ margin: "16px 0 22px" }}>
                <em className="soft">The brain.</em>
                <br />
                It plans before{" "}
                <span
                  className="scribble-under aqua"
                  style={{ display: "inline-block", fontStyle: "italic", color: "var(--aqua)", fontWeight: 500 }}
                >
                  you post.
                </span>
              </h2>
              <div className="section-lede" style={{ marginBottom: 28, position: "relative" }}>
                <ProxText>Super Canvas studies your brand voice, your audience, what's spiking on the feed, and what your last 50 posts taught it. Then it lays out the next 30 days — visually, editably, in one place.</ProxText>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 36px", display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  ["Brand voice trained on your last 50 posts", "Captions in your tone"],
                  ["30-day strategy generated in a single click", "Strategy mode"],
                  ["Live trend overlays from Viral Today", "Trend layer"],
                  ["Drag, rewrite, regenerate — every node is editable", "Always interactive"],
                ].map(([line, tag], i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--aqua)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 15, color: "var(--bone)" }}>{line}</span>
                    <span className="pill pill-aqua" style={{ fontSize: 10 }}>
                      {tag}
                    </span>
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Link to="/scripts" className="btn btn-aqua">
                  Open Super Canvas <ArrowRight size={15} />
                </Link>
                <a href="#viral" className="btn btn-ghost">See trends</a>
              </div>
            </div>

            {/* Canvas mini-perspective (different from hero) */}
            <div style={{ minWidth: 0 }}>
              <div
                className="card"
                style={{
                  padding: 24,
                  background: "var(--graphite)",
                  border: "1.5px solid var(--ink)",
                  boxShadow: "5px 5px 0 var(--ink)",
                  position: "relative",
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                  <span className="eyebrow">Today's plan · auto-drafted</span>
                  <span className="pill pill-aqua"><span className="pill-dot" />live</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { time: "MON 9:00 AM", title: "Spring lookbook · Reel", platform: "IG", status: "Scheduled", pill: "aqua" as const },
                    { time: "MON 7:00 PM", title: "Behind the shoot — day 1", platform: "TikTok", status: "Drafting", pill: "honey" as const },
                    { time: "TUE 12:00 PM", title: "Skincare partner ask", platform: "Shorts", status: "In review", pill: "honey" as const },
                    { time: "WED 8:00 PM", title: "\"3 things I wish I knew…\"", platform: "Reel", status: "Hook ready", pill: "aqua" as const },
                    { time: "THU 6:00 PM", title: "Recurring · weekly recap", platform: "IG", status: "Auto", pill: "aqua" as const },
                  ].map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "76px 1fr auto",
                        gap: 14,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(234,230,220,0.02)",
                        border: "1px solid var(--line)",
                        fontSize: 12.5,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Figtree', monospace",
                          fontSize: 10.5,
                          color: "var(--bone-3)",
                          letterSpacing: "0.06em",
                          fontWeight: 600,
                        }}
                      >
                        {row.time}
                      </span>
                      <div>
                        <div className="serif" style={{ fontSize: 14, color: "var(--bone)" }}>
                          {row.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--bone-3)", marginTop: 1 }}>
                          {row.platform}
                        </div>
                      </div>
                      <span className={`pill pill-${row.pill}`} style={{ fontSize: 10 }}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 2 — VIRAL TODAY (Bone panel) ===== */}
      <section id="viral" className="panel-bone" style={{ padding: "120px 0", position: "relative", marginTop: 24 }}>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, left: "8%", transform: "rotate(-5deg)", color: "rgba(10,14,18,0.32)" }}
        >
          before the algorithm catches on
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 80,
              alignItems: "center",
            }}
          >
            <div>
              <ViralTodayMock />
            </div>

            <div>
              <span className="eyebrow eyebrow-honey">Viral Today</span>
              <h2 className="section-h2" style={{ margin: "16px 0 22px", color: "var(--ink)" }}>
                What's working <em style={{ color: "rgba(10,14,18,0.55)", fontStyle: "italic", fontWeight: 400 }}>right now,</em>
                <br />
                <span
                  className="scribble-under honey"
                  style={{ display: "inline-block", color: "#A85B1F", fontStyle: "italic", fontWeight: 500 }}
                >
                  sorted for you.
                </span>
              </h2>
              <div className="section-lede" style={{ marginBottom: 28, color: "rgba(10,14,18,0.65)", position: "relative" }}>
                <ProxText>Connecta scans the feeds your audience is on, flags outlier videos that beat their channel's average by 8× or more, and shows you the hooks before everyone else copies them.</ProxText>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 32 }}>
                {[
                  { num: "01", title: "Spot the trend", body: "Sorted by outlier score, not view count." },
                  { num: "02", title: "Borrow the hook", body: "One-click remix into your voice." },
                  { num: "03", title: "Ship it", body: "Push to Super Canvas. Done by Tuesday." },
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "20px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "#FBF8EE",
                      border: "1.5px solid var(--ink)",
                      borderRadius: 14,
                      boxShadow: "3px 3px 0 var(--ink)",
                    }}
                  >
                    <span style={{ fontFamily: "'Figtree', sans-serif", fontSize: 11, color: "#A85B1F", letterSpacing: "0.1em", fontWeight: 700 }}>
                      {s.num}
                    </span>
                    <div className="serif" style={{ fontSize: 17, color: "var(--ink)", letterSpacing: "-0.005em" }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: "rgba(10,14,18,0.55)", lineHeight: 1.5 }}>
                      {s.body}
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/scripts" className="btn btn-honey">
                Open Viral Today <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 3 — PIPELINE (Editing / Calendar / Companion) ===== */}
      <section id="pipeline" className="bg-ink" style={{ padding: "120px 0", marginTop: 24, position: "relative" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px", textAlign: "center" }}>
          <div className="scroll-rise">
            <span className="eyebrow">The pipeline</span>
            <h2 className="section-h2" style={{ margin: "16px auto 22px", maxWidth: 760 }}>
              The production layer
              <br />
              <em className="soft">underneath the strategy.</em>
            </h2>
            <div className="section-lede" style={{ margin: "0 auto 56px", textAlign: "center", position: "relative" }}>
              <ProxText>Plans only matter if they ship. The pipeline tracks every video from idea to edit to approval — so nothing dies in a Slack thread.</ProxText>
            </div>
          </div>

          <div
            className="scroll-rise"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
              textAlign: "left",
            }}
          >
            <PipelineCard
              eyebrow="Editing Queue"
              icon={Film}
              title="Every cut, every revision, in one place."
              body="Editors and clients see the same screen. No more Slack archaeology to find the latest version."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { title: "Spring lookbook reel", state: "Cut 3 · review", pill: "honey" as const },
                  { title: "Skincare routine v3", state: "Approved", pill: "aqua" as const },
                  { title: "Behind the shoot", state: "Drafting", pill: "muted" as const },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span className="serif" style={{ color: "var(--bone-2)", fontSize: 13 }}>{r.title}</span>
                    <span className={`pill pill-${r.pill}`}>{r.state}</span>
                  </div>
                ))}
              </div>
            </PipelineCard>

            <PipelineCard
              eyebrow="Content Calendar"
              icon={Calendar}
              title="A calendar that thinks ahead."
              body="Drag posts across platforms. Companion AI suggests the best slot based on your audience and past performance."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {Array.from({ length: 21 }).map((_, i) => {
                  const has = [3, 4, 7, 10, 11, 14, 17].includes(i);
                  const hot = [4, 11].includes(i);
                  return (
                    <div
                      key={i}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 6,
                        background: has
                          ? hot
                            ? "var(--honey-soft)"
                            : "var(--aqua-soft)"
                          : "rgba(234,230,220,0.04)",
                        border: "1px solid var(--line)",
                      }}
                    />
                  );
                })}
              </div>
            </PipelineCard>

            <PipelineCard
              eyebrow="Companion AI"
              icon={Sparkles}
              title="Drafts in your voice, before you ask."
              body="Hooks, captions, scripts, follow-ups — all generated in your tone, ready to tweak. You stay in the director's chair."
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12.5, color: "var(--bone-2)", fontStyle: "italic" }} className="serif-italic">
                  "Caption that feels like Luna — 9 words, low-key, no exclamation marks."
                </div>
                <div style={{ height: 1, background: "var(--line)" }} />
                <div style={{ fontSize: 13, color: "var(--bone)", lineHeight: 1.5 }}>
                  morning chaos, golden hour, same routine. spring is just <em className="honey">showing off.</em>
                </div>
              </div>
            </PipelineCard>
          </div>
        </div>
      </section>

      {/* ===== Section 4 — PUBLISHING teaser ===== */}
      <section className="panel-bone" style={{ padding: "100px 0", marginTop: 24, position: "relative" }}>
        <div className="scroll-rise" style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            <div>
              <span className="pill pill-honey" style={{ marginBottom: 18 }}>
                <span className="pill-dot" /> Coming late 2026
              </span>
              <h2 className="section-h2" style={{ margin: "12px 0 18px", fontSize: "clamp(36px, 4.6vw, 52px)" }}>
                Soon, <em className="honey">the last mile.</em>
              </h2>
              <div className="section-lede" style={{ marginBottom: 24, position: "relative" }}>
                <ProxText>Strategy → production → publish. We're closing the loop. Hit one button and your week ships to Instagram, TikTok, YouTube Shorts, and Reels — at the slots Companion suggested.</ProxText>
              </div>
              <a
                href="#"
                className="btn btn-ghost"
                style={{ fontSize: 13 }}
              >
                Get notified at launch
              </a>
            </div>

            <div
              className="card"
              style={{
                padding: 24,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  backdropFilter: "blur(6px)",
                  background: "rgba(10,14,18,0.45)",
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "absolute", top: 20, right: 24, zIndex: 3 }}>
                <span className="pill pill-honey" style={{ fontSize: 10 }}>
                  <Send size={10} /> Preview
                </span>
              </div>

              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingBottom: 12,
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span className="eyebrow">Publish queue · Wed</span>
                  <span className="pill pill-aqua">5 of 5 ready</span>
                </div>
                {["IG · Spring lookbook reel", "TikTok · Soft launch chaos", "Shorts · Skincare routine v3", "Reels · Behind the shoot", "IG Story · Friday recap"].map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="serif" style={{ color: "var(--bone-2)" }}>{row}</span>
                    <span className="pill pill-aqua" style={{ fontSize: 10 }}>
                      <span className="pill-dot" /> queued
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Section 5 — TESTIMONIAL ===== */}
      <section className="bg-ink" style={{ padding: "120px 0", marginTop: 24, textAlign: "center", position: "relative", overflow: "visible" }}>
        {/* Messy sticker — the "before Connecta" chaos. Pairs with the quote. */}
        <InteractiveSticker
          src={doodleMessy}
          baseRotation={-8}
          style={{
            position: "absolute",
            top: 60,
            left: "6%",
            width: 150,
            height: "auto",
            zIndex: 4,
            pointerEvents: "none",
          }}
        />
        <div className="scroll-rise" style={{ maxWidth: 920, margin: "0 auto", padding: "0 32px" }}>
          <div
            className="serif"
            style={{
              fontSize: "clamp(28px, 4.2vw, 48px)",
              lineHeight: 1.2,
              letterSpacing: "-0.015em",
              fontWeight: 500,
              marginBottom: 36,
              color: "var(--bone)",
            }}
          >
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
            I went from <em className="soft">16 spreadsheets and a panic attack every Sunday</em> to one clean Monday morning.
            My editor finally knows what's next, and my strategy isn't a vibe anymore — it's a screen.
            <span style={{ color: "var(--aqua)", fontStyle: "italic" }}>"</span>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 14, position: "relative" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--honey)",
                color: "var(--ink)",
                display: "grid",
                placeItems: "center",
                fontFamily: "'EB Garamond', serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 22,
              }}
            >
              A
            </div>
            <div style={{ textAlign: "left" }}>
              <div className="serif" style={{ fontSize: 17, color: "var(--bone)" }}>
                <ProxText>Aria Wells</ProxText>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--bone-3)", marginTop: 2 }}>
                <ProxText>Creator · 2.4M followers · runs her own brand</ProxText>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Pricing section removed — no pricing on the landing page ===== */}

      {/* ===== FINAL CTA — bone panel with rounded corners ===== */}
      <section
        className="panel-bone"
        style={{
          padding: "140px 0",
          marginTop: 24,
          textAlign: "center",
          position: "relative",
        }}
      >
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ bottom: 60, left: "12%", transform: "rotate(-4deg)", color: "rgba(10,14,18,0.30)" }}
        >
          a calmer creator economy starts here
        </div>
        <div
          className="curl curl-hide-mobile scroll-rise"
          style={{ top: 80, right: "8%", transform: "rotate(6deg)", color: "rgba(10,14,18,0.30)" }}
        >
          — your strategy team in a screen
        </div>

        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 32px", position: "relative" }}>
          {/* ScrollFloat — characters rise as you scroll to this section */}
          <ScrollFloat
            animationDuration={1}
            ease="back.inOut(2)"
            scrollStart="center bottom+=30%"
            scrollEnd="bottom bottom-=30%"
            stagger={0.02}
            containerClassName="serif"
            textClassName="serif"
          >
            Stop guessing.
          </ScrollFloat>

          <h2
            className="serif"
            style={{
              fontSize: "clamp(40px, 6vw, 80px)",
              lineHeight: 1.0,
              letterSpacing: "-0.025em",
              fontWeight: 500,
              margin: "8px 0 28px",
              color: "var(--ink)",
            }}
          >
            <span
              className="scribble-under honey"
              style={{ display: "inline-block", color: "#A85B1F", fontStyle: "italic", fontWeight: 500 }}
            >
              Start directing.
            </span>
          </h2>

          <div
            style={{
              fontSize: 18,
              color: "rgba(10,14,18,0.65)",
              maxWidth: 560,
              margin: "0 auto 36px",
              lineHeight: 1.55,
              position: "relative",
            }}
          >
            <ProxText>No credit card. Bring your existing chaos — Connecta will fold it neatly into a 30-day plan within five minutes.</ProxText>
          </div>
          <Link to="/scripts" className="btn btn-honey btn-large">
            Get started <ArrowRight size={16} />
          </Link>
          <div style={{ marginTop: 18, fontSize: 12.5, color: "rgba(10,14,18,0.45)" }}>
            Free to try · cancel anytime
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-ink" style={{ padding: "60px 0 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              gap: 40,
              marginBottom: 48,
            }}
          >
            <div>
              <Link
                to="/"
                style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 14 }}
                aria-label="Connecta"
              >
                <img
                  src={logoHandBone}
                  alt=""
                  style={{ height: 42, width: "auto", display: "block" }}
                />
                <span
                  className="serif"
                  style={{
                    fontSize: 26,
                    color: "var(--bone)",
                    letterSpacing: "0.04em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  CONNECTA
                </span>
              </Link>
              <div style={{ fontSize: 13.5, color: "var(--bone-3)", maxWidth: 280, margin: 0, lineHeight: 1.6, position: "relative" }}>
                <ProxText>The AI strategist for creators and the brands they work with.</ProxText>
              </div>
            </div>
            {[
              { title: "Product", items: ["Super Canvas", "Viral Today", "Editing Queue", "Calendar", "Companion AI", "Publishing (soon)"] },
              { title: "Resources", items: ["Guides", "Templates", "Changelog", "API"] },
              { title: "Company", items: ["About", "Careers", "Press", "Contact"] },
            ].map((col, i) => (
              <div key={i}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--bone-3)",
                    marginBottom: 14,
                  }}
                >
                  {col.title}
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {col.items.map((item, j) => (
                    <li key={j} style={{ padding: "4px 0", fontSize: 14, color: "var(--bone-2)" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: 22,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 12.5,
              color: "var(--bone-3)",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>© 2026 Connecta. All rights reserved.</div>
            <div style={{ display: "flex", gap: 18 }}>
              <a href="#" className="scribble-link">Privacy</a>
              <a href="#" className="scribble-link">Terms</a>
              <a href="#" className="scribble-link">Status</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ===== Video modal — triggered by "Watch the 90-sec demo" ===== */}
      {videoOpen && (
        <div
          onClick={() => setVideoOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(10,14,18,0.85)",
            backdropFilter: "blur(12px)",
            display: "grid",
            placeItems: "center",
            padding: "32px",
            animation: "le-fade-in 220ms ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 1000,
              borderRadius: 22,
              border: "1.5px solid var(--ink)",
              boxShadow: "8px 8px 0 var(--ink), 0 60px 120px -30px rgba(0,0,0,0.7)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              aria-label="Close demo"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 2,
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "var(--bone)",
                border: "1.5px solid var(--ink)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                color: "var(--ink)",
                boxShadow: "2px 2px 0 var(--ink)",
              }}
            >
              <X size={16} />
            </button>
            <DemoVideoPlayer />
          </div>
        </div>
      )}

      <style>{`
        @keyframes le-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
