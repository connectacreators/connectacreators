import { useEffect, useRef, useState } from "react";
import { fibonacciSphere, ringPoints, rotateX, rotateY, type Point3D } from "@/lib/commandDeck/fibonacciSphere";
import { resolveCssHsl, withAlpha } from "@/lib/commandDeck/cssColor";

const TILT = (12 * Math.PI) / 180;
const WING_ANGLES = [0, Math.PI];
const MAX_ORB_PX = 600;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export default function CommandOrb({
  className,
  onTap,
  minSize = 120,
  maxSize = MAX_ORB_PX,
}: {
  className?: string;
  onTap?: () => void;
  /** Floor for the wrapper's min-height (prevents collapse-to-0 in the main
   *  hero view). Lower this for compact uses, e.g. a small floating orb. */
  minSize?: number;
  /** Ceiling for the measured size — MAX_ORB_PX (600) in the hero view,
   *  much smaller for a compact floating instance. */
  maxSize?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Measured from the actual flex space left over after every sibling
  // (standby row, greeting/chat strip, composer, chips) takes its natural
  // height — never a guessed `calc(100vh - Npx)` constant. That guess broke
  // every time a sibling's height changed and was the root cause of the
  // page needing to scroll on the Command Deck.
  const [size, setSize] = useState(0);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const r = wrapper.getBoundingClientRect();
      setSize(Math.max(0, Math.floor(Math.min(r.width, r.height, maxSize))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [maxSize]);

  // Resize the canvas backing store whenever the measured size changes
  // (container-driven resizes, not just window resizes).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === 0) return;
    // Capped at 2, not the raw devicePixelRatio (often 3 on modern
    // iPhones) — a known WebKit failure mode renders a canvas solid WHITE
    // when its backing store gets too large under memory pressure (a
    // 600px orb at 3x DPR is an 1800x1800 buffer, ~13MB, vs ~5.7MB at 2x).
    // 2x is still full retina sharpness for this kind of soft glow visual.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [size]);

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

    function draw() {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const R = w * 0.3;
      ctx!.clearRect(0, 0, w, h);
      // Below ~100px (the floating mini orb), the compass ring/tick marks/
      // wing ornaments read as fuzzy noise rather than fine detail — they
      // were designed for the ~400-600px hero size. Skip them entirely
      // instead of just shrinking; the glow + point cloud + rotation alone
      // still reads unmistakably as "the same orb," just cleaner at 72px.
      const compact = w < 100;

      if (!compact) {
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
      }

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

    draw();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-h-0 w-full flex items-center justify-center"
      style={{ minHeight: minSize, cursor: onTap ? "pointer" : undefined }}
      onClick={onTap}
      role={onTap ? "button" : undefined}
      aria-label={onTap ? "Tap to speak" : undefined}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={[className, "cd-orb-power-on"].filter(Boolean).join(" ")}
        style={{
          // Sized in JS from the wrapper's actual measured space (see the
          // ResizeObserver effect above) — never a guessed viewport-minus-N
          // constant, which broke every time a sibling's height changed.
          width: size,
          height: size,
          display: "block",
          filter:
            "drop-shadow(0 0 3px hsl(var(--aqua) / 0.3)) drop-shadow(0 0 10px hsl(var(--aqua) / 0.12))",
        }}
      />
    </div>
  );
}
