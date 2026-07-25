import { useEffect, useRef } from "react";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";

export default function VoiceWaveform({ listening }: { listening: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listeningRef = useRef(listening);
  listeningRef.current = listening;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");
    let raf = 0;
    let phase = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      const bars = Math.floor(w / 5);
      const amp = listeningRef.current ? 1 : 0.28; // idle: gentle ambient hum; listening: full swing
      for (let i = 0; i < bars; i++) {
        const v = Math.abs(Math.sin(i * 0.4 + phase) + Math.sin(i * 0.13 + phase * 1.7)) * 0.5 * amp;
        const bh = 2 + v * (h - 3);
        ctx!.fillStyle = aqua.replace("hsl(", "hsla(").replace(")", `, ${(0.22 + v * 0.5).toFixed(2)})`);
        ctx!.fillRect(i * 5, (h - bh) / 2, 2.2, bh);
      }
      phase += listeningRef.current ? 0.09 : 0.03;
      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 font-mono text-[9.5px] uppercase"
        style={{ letterSpacing: "0.22em", color: "hsl(var(--aqua) / 0.5)" }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{ background: "hsl(var(--aqua))", boxShadow: "0 0 6px hsl(var(--aqua) / 0.14)" }}
        />
        Voice
        <span className="ml-auto normal-case font-normal" style={{ letterSpacing: "0.08em", fontSize: 8, color: "hsl(var(--bone) / 0.3)" }}>
          {listening ? "Listening" : "Idle"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="w-full h-[46px] block"
        style={{ filter: "drop-shadow(0 0 4px hsl(var(--aqua) / 0.28)) drop-shadow(0 0 12px hsl(var(--aqua) / 0.12))" }}
      />
    </div>
  );
}
