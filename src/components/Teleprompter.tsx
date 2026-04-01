import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Video, FlipHorizontal, FlipVertical, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ScriptLine } from "@/hooks/useScripts";
import VideoRecorder from "@/components/VideoRecorder";

interface TeleprompterProps {
  lines: ScriptLine[];
  onClose: () => void;
  showRecorder?: boolean;
  onToggleRecorder?: () => void;
  scriptTitle?: string;
}

export default function Teleprompter({ lines, onClose, showRecorder = false, onToggleRecorder, scriptTitle }: TeleprompterProps) {
  const actorLines = lines.filter((l) => l.line_type === "actor");
  const displayLines = actorLines.length > 0 ? actorLines : lines;
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40);
  const [mirrored, setMirrored] = useState(false);
  const [mirroredV, setMirroredV] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fontSize, setFontSize] = useState(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local recorder state if parent doesn't control it
  const [localRecorder, setLocalRecorder] = useState(false);
  const isRecorderVisible = onToggleRecorder ? showRecorder : localRecorder;
  const toggleRecorder = onToggleRecorder || (() => setLocalRecorder((p) => !p));

  // Lock body scroll when teleprompter is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Auto-scroll loop
  useEffect(() => {
    if (!playing || !scrollRef.current) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    let last: number | null = null;
    const tick = (ts: number) => {
      if (!scrollRef.current) return;
      if (last !== null) {
        const delta = (ts - last) / 1000;
        scrollRef.current.scrollTop += speed * delta;
      }
      last = ts;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, speed]);

  // Show controls on interaction, hide after 3s
  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  const handleReset = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setPlaying(false);
  };

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "ArrowUp") setSpeed((s) => Math.min(s + 10, 200));
      if (e.key === "ArrowDown") setSpeed((s) => Math.max(s - 10, 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tap to toggle play/pause (mobile), double-tap area excludes controls
  const handleContentTap = useCallback(() => {
    revealControls();
    setPlaying((p) => !p);
  }, [revealControls]);

  return (
    <div
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      style={{
        fontFamily: "Arial, Helvetica, sans-serif",
        cursor: showControls ? "default" : "none",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Controls bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 transition-opacity duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)",
          paddingTop: "max(env(safe-area-inset-top), 12px)",
        }}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => setPlaying((p) => !p)} className="text-white hover:bg-white/10 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
            {playing ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5" />}
            <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-white hover:bg-white/10 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setMirrored((m) => !m); }}
            className={`text-white hover:bg-white/10 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 ${mirrored ? "bg-blue-500/30" : ""}`}
          >
            <FlipHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{mirrored ? "Normal" : "Mirror"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setMirroredV((m) => !m); }}
            className={`text-white hover:bg-white/10 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 ${mirroredV ? "bg-blue-500/30" : ""}`}
          >
            <FlipVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{mirroredV ? "Normal V" : "Mirror V"}</span>
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); toggleRecorder(); }}
            className={`text-white hover:bg-white/10 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 ${isRecorderVisible ? "bg-red-500/30" : ""}`}
          >
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">{isRecorderVisible ? "Hide Cam" : "Record"}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-1">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setFontSize((f) => Math.max(f - 0.1, 0.6)); }}
              className="text-white hover:bg-white/10 px-2 sm:px-3"
              title="Decrease font size"
            >
              <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
            <span className="text-white text-xs sm:text-sm font-bold w-16 text-center">{(fontSize * 100).toFixed(0)}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setFontSize((f) => Math.min(f + 0.1, 5)); }}
              className="text-white hover:bg-white/10 px-2 sm:px-3"
              title="Increase font size"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-1 hidden sm:flex">
            <span className="text-white/70 text-xs sm:text-sm whitespace-nowrap">Speed</span>
            <Slider
              value={[speed]}
              onValueChange={([v]) => setSpeed(v)}
              min={10}
              max={200}
              step={5}
              className="flex-1"
            />
            <span className="text-white text-xs sm:text-sm font-bold w-8 sm:w-10 text-right">{speed}</span>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10 px-2 sm:px-3">
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>
      </div>

      {/* Red center line */}
      <div
        className="absolute left-0 right-0 z-20 pointer-events-none"
        style={{
          top: "50%",
          height: "100px",
          backgroundColor: "rgba(255, 0, 0, 0.25)",
          transform: "translateY(-50%)",
        }}
      />

      {/* Scrolling content — tap to play/pause on mobile */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-20 lg:px-40 relative"
        onClick={handleContentTap}
        style={{ WebkitOverflowScrolling: "touch", transform: [mirrored ? "scaleX(-1)" : "", mirroredV ? "scaleY(-1)" : ""].join(" ").trim() || undefined }}
      >
        {/* Top padding so text starts mid-screen */}
        <div className="h-[45vh] sm:h-[50vh]" />

        {displayLines.map((line, i) => (
          <p
            key={i}
            className="text-white leading-relaxed mb-8 sm:mb-12 text-center font-bold"
            style={{ fontSize: `calc(${fontSize} * clamp(1.25rem, 3vw, 3.75rem))` }}
          >
            {line.text}
          </p>
        ))}

        {/* Bottom padding */}
        <div className="h-[80vh]" />
      </div>

      {/* Video recorder PIP inside teleprompter */}
      {isRecorderVisible && (
        <VideoRecorder pip scriptTitle={scriptTitle} onClose={() => { if (onToggleRecorder) onToggleRecorder(); else setLocalRecorder(false); }} />
      )}
    </div>
  );
}
