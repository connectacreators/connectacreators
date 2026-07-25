import { useEffect, useRef } from "react";
import { fibonacciSphere, rotateX, rotateY, type Point3D } from "@/lib/commandDeck/fibonacciSphere";
import { resolveCssHsl } from "@/lib/commandDeck/cssColor";

const TILT = (12 * Math.PI) / 180;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export default function CommandOrb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aqua = resolveCssHsl("--aqua", "184 41% 70%");

    const basePoints: Point3D[] = fibonacciSphere(560).map((p) => rotateX(p, TILT));
    let raf = 0;
    let t = 0;

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
      const R = w * 0.3;
      ctx!.clearRect(0, 0, w, h);

      // Outer dashed compass ring
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(-t * 0.16);
      ctx!.strokeStyle = aqua.replace("hsl(", "hsla(").replace(")", ", 0.2)");
      ctx!.lineWidth = 1;
      ctx!.setLineDash([2, 8]);
      ctx!.beginPath();
      ctx!.arc(0, 0, R * 1.42, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.setLineDash([]);
      ctx!.restore();

      // Volumetric lit-sphere body beneath the point cloud
      const lit = ctx!.createRadialGradient(cx - R * 0.28, cy - R * 0.3, 0, cx, cy, R * 0.98);
      lit.addColorStop(0, "rgba(175,224,227,0.07)");
      lit.addColorStop(0.6, "rgba(143,208,213,0.02)");
      lit.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.fillStyle = lit;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.fill();

      // Dense point cloud, back-to-front, smooth depth falloff
      const projected = basePoints
        .map((p) => {
          const rp = rotateY(p, t);
          const persp = 1 + rp.z * 0.22;
          return { x: cx + rp.x * R * persp, y: cy + rp.y * R * persp, z: rp.z };
        })
        .sort((a, b) => a.z - b.z);
      for (const p of projected) {
        const d = smoothstep((p.z + 1) / 2);
        const alpha = 0.1 + d * 0.62;
        const size = 0.55 + d * 1.4;
        ctx!.fillStyle = aqua.replace("hsl(", "hsla(").replace(")", `, ${alpha.toFixed(2)})`);
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Tight, crisp core glow
      const pr = 5 + Math.sin(t * 2.4) * 1;
      const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pr + 4);
      core.addColorStop(0, "#EAFAFB");
      core.addColorStop(0.5, aqua);
      core.addColorStop(1, "rgba(143,208,213,0)");
      ctx!.fillStyle = core;
      ctx!.beginPath();
      ctx!.arc(cx, cy, pr + 4, 0, Math.PI * 2);
      ctx!.fill();

      t += 0.0032;
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
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        width: "min(60vh, 600px)",
        height: "min(60vh, 600px)",
        maxWidth: "96%",
        display: "block",
        filter:
          "drop-shadow(0 0 3px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 10px hsl(var(--aqua) / 0.12))",
      }}
    />
  );
}
