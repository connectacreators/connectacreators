import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ScriptLine } from "@/hooks/useScripts";

interface TeleprompterProps {
  lines: ScriptLine[];
  onClose: () => void;
}

export default function Teleprompter({ lines, onClose }: TeleprompterProps) {
  const actorLines = lines.filter((l) => l.line_type === "actor");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40); // px per second
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fullscreen on mount
  useEffect(() => {
    const el = containerRef.current;
    if (el && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }

    const onFsChange = () => {
      if (!document.fullscreenElement) {
        onClose();
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [onClose]);

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

  // Show controls on mouse move, hide after 3s
  const handleMouseMove = useCallback(() => {
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

  const handleClose = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  };

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "ArrowUp") setSpeed((s) => Math.min(s + 10, 200));
      if (e.key === "ArrowDown") setSpeed((s) => Math.max(s - 10, 10));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", cursor: showControls ? "default" : "none" }}
    >
      {/* Controls bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)" }}
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setPlaying((p) => !p)} className="text-white hover:bg-white/10 gap-2">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {playing ? "Pausar" : "Iniciar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-white hover:bg-white/10 gap-2">
            <RotateCcw className="w-4 h-4" /> Reiniciar
          </Button>
        </div>

        <div className="flex items-center gap-4 min-w-[280px]">
          <span className="text-white/70 text-sm whitespace-nowrap">Velocidad</span>
          <Slider
            value={[speed]}
            onValueChange={([v]) => setSpeed(v)}
            min={10}
            max={200}
            step={5}
            className="flex-1"
          />
          <span className="text-white text-sm font-bold w-10 text-right">{speed}</span>
        </div>

        <Button variant="ghost" size="sm" onClick={handleClose} className="text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Scrolling content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 md:px-20 lg:px-40">
        {/* Top padding so text starts mid-screen */}
        <div className="h-[50vh]" />

        {actorLines.map((line, i) => (
          <p
            key={i}
            className="text-white text-3xl md:text-5xl lg:text-6xl leading-relaxed mb-12 text-center font-bold"
          >
            {line.text}
          </p>
        ))}

        {/* Bottom padding */}
        <div className="h-[80vh]" />
      </div>
    </div>
  );
}
