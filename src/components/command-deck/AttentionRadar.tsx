// src/components/command-deck/AttentionRadar.tsx
import { useEffect, useRef } from "react";
import { useDeckMetrics } from "@/hooks/useDeckMetrics";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";
import type { RadarBlip } from "@/lib/commandDeck/deckMetrics";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function severityColor(sev: RadarBlip["severity"], aqua: string, honey: string, crit: string): string {
  if (sev === "crit") return crit;
  if (sev === "warn") return honey;
  return aqua;
}

export default function AttentionRadar() {
  const { radarBlips } = useDeckMetrics();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blipsRef = useRef<RadarBlip[]>(radarBlips);
  blipsRef.current = radarBlips;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");
    const honey = resolveCssHsl("--honey", "32 62% 61%");
    const crit = "hsl(4 68% 63%)"; // semantic critical red, intentionally not a brand accent (see dataviz guidance: semantic color is separate from the accent hue)

    let raf = 0;
    let sweep = 0;

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
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 4;
      ctx!.clearRect(0, 0, w, h);

      ctx!.strokeStyle = "rgba(143,208,213,0.14)";
      ctx!.lineWidth = 1;
      for (let g = 1; g <= 3; g++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, (R * g) / 3, 0, Math.PI * 2);
        ctx!.stroke();
      }

      const sweepGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R);
      sweepGrad.addColorStop(0, "rgba(143,208,213,0.26)");
      sweepGrad.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(sweep);
      ctx!.fillStyle = sweepGrad;
      ctx!.beginPath();
      ctx!.moveTo(0, 0);
      ctx!.arc(0, 0, R, -0.4, 0);
      ctx!.closePath();
      ctx!.fill();
      ctx!.restore();

      for (const b of blipsRef.current) {
        const bx = cx + Math.cos(b.angle) * R * b.radius;
        const by = cy + Math.sin(b.angle) * R * b.radius;
        const diff = Math.abs((((sweep % (Math.PI * 2)) - (b.angle < 0 ? b.angle + Math.PI * 2 : b.angle)) + Math.PI * 2) % (Math.PI * 2));
        const glow = diff < 0.5 ? smoothstep(1 - diff / 0.5) : 0;
        ctx!.fillStyle = severityColor(b.severity, aqua, honey, crit);
        ctx!.globalAlpha = 0.4 + glow * 0.6;
        ctx!.beginPath();
        ctx!.arc(bx, by, 2.4 + glow * 2.4, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      sweep += 0.009;
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
        Attention Radar
      </div>
      <div className="relative w-[120px] h-[120px]">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="w-full h-full block"
          style={{ filter: "drop-shadow(0 0 5px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 16px hsl(var(--aqua) / 0.14))" }}
        />
      </div>
    </div>
  );
}
