import { useEffect, useRef } from "react";
import { fibonacciSphere, ringPoints, rotateX, rotateY, type Point3D } from "@/lib/commandDeck/fibonacciSphere";
import { resolveCssHsl, withAlpha } from "@/lib/commandDeck/cssColor";

const TILT = (12 * Math.PI) / 180;
const WING_ANGLES = [0, Math.PI];

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
    const bone = resolveCssHsl("--bone", "42 23% 89%");

    const basePoints: Point3D[] = fibonacciSphere(560).map((p) => rotateX(p, TILT));
    const equatorPoints: Point3D[] = ringPoints(90, 0.001).map((p) => rotateX(p, TILT));
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

      // Outer dashed compass ring + tick marks
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(-t * 0.16);
      ctx!.strokeStyle = withAlpha(aqua, 0.2);
      ctx!.lineWidth = 1;
      ctx!.setLineDash([2, 8]);
      ctx!.beginPath();
      ctx!.arc(0, 0, R * 1.42, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.setLineDash([]);
      for (let tck = 0; tck < 32; tck++) {
        const an = (tck / 32) * Math.PI * 2;
        const len = tck % 8 === 0 ? 11 : 5;
        ctx!.strokeStyle = withAlpha(aqua, tck % 8 === 0 ? 0.45 : 0.16);
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(an) * R * 1.5, Math.sin(an) * R * 1.5);
        ctx!.lineTo(Math.cos(an) * (R * 1.5 - len), Math.sin(an) * (R * 1.5 - len));
        ctx!.stroke();
      }
      ctx!.restore();

      // Inner dashed ring hugging the sphere + wing ornaments
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(t * 0.22);
      ctx!.strokeStyle = withAlpha(aqua, 0.3);
      ctx!.lineWidth = 1;
      ctx!.setLineDash([1, 5]);
      ctx!.beginPath();
      ctx!.arc(0, 0, R * 1.16, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.setLineDash([]);
      for (const wa of WING_ANGLES) {
        ctx!.save();
        ctx!.rotate(wa);
        ctx!.strokeStyle = withAlpha(aqua, 0.55);
        ctx!.lineWidth = 1.4;
        ctx!.beginPath();
        ctx!.moveTo(R * 1.16 - 9, -5);
        ctx!.lineTo(R * 1.16 + 9, -5);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(R * 1.16 - 9, 5);
        ctx!.lineTo(R * 1.16 + 9, 5);
        ctx!.stroke();
        ctx!.fillStyle = withAlpha(aqua, 0.75);
        ctx!.beginPath();
        ctx!.arc(R * 1.16, 0, 1.6, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
      ctx!.restore();

      // Volumetric lit-sphere body beneath the point cloud + specular highlight
      const lit = ctx!.createRadialGradient(cx - R * 0.28, cy - R * 0.3, 0, cx, cy, R * 0.98);
      lit.addColorStop(0, withAlpha(aqua, 0.07));
      lit.addColorStop(0.6, withAlpha(aqua, 0.02));
      lit.addColorStop(1, withAlpha(aqua, 0));
      ctx!.fillStyle = lit;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.fill();
      const spec = ctx!.createRadialGradient(cx - R * 0.34, cy - R * 0.36, 0, cx - R * 0.34, cy - R * 0.36, R * 0.2);
      spec.addColorStop(0, withAlpha(bone, 0.1));
      spec.addColorStop(1, withAlpha(bone, 0));
      ctx!.fillStyle = spec;
      ctx!.beginPath();
      ctx!.arc(cx - R * 0.34, cy - R * 0.36, R * 0.2, 0, Math.PI * 2);
      ctx!.fill();

      // Equatorial great-circle line
      const eq = equatorPoints.map((p) => {
        const rp = rotateY(p, t);
        const persp = 1 + rp.z * 0.22;
        return { x: cx + rp.x * R * persp, y: cy + rp.y * R * persp, z: rp.z };
      });
      for (let i = 0; i < eq.length - 1; i++) {
        const a = eq[i];
        const b = eq[i + 1];
        const az = (a.z + b.z) / 2;
        const al = 0.05 + smoothstep((az + 1) / 2) * 0.28;
        ctx!.strokeStyle = withAlpha(aqua, Number(al.toFixed(2)));
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

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
        ctx!.fillStyle = withAlpha(aqua, Number(alpha.toFixed(2)));
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Tight, crisp core glow
      const pr = 5 + Math.sin(t * 2.4) * 1;
      const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, pr + 4);
      core.addColorStop(0, bone);
      core.addColorStop(0.5, aqua);
      core.addColorStop(1, withAlpha(aqua, 0));
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
      className={[className, "cd-orb-power-on"].filter(Boolean).join(" ")}
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
