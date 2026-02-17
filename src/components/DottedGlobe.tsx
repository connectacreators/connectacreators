import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const NUM_DOTS = 2500;
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

export default function DottedGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let rotation = 0;

    // Pre-compute sphere points (Fibonacci)
    const points: [number, number, number][] = [];
    for (let i = 0; i < NUM_DOTS; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / NUM_DOTS);
      const theta = 2 * Math.PI * i / GOLDEN_RATIO;
      points.push([
        Math.cos(theta) * Math.sin(phi),
        Math.cos(phi),
        Math.sin(theta) * Math.sin(phi),
      ]);
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w * 0.5;
      const cy = h * 0.45;
      const radius = Math.min(w, h) * 0.35;
      const perspective = 600;
      const isLight = themeRef.current === "light";

      ctx.clearRect(0, 0, w, h);

      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);

      for (let i = 0; i < NUM_DOTS; i++) {
        const [px, py, pz] = points[i];
        // Rotate around Y axis
        const x = px * cosR - pz * sinR;
        const z = px * sinR + pz * cosR;
        const y = py;

        if (z < -0.1) continue; // back hemisphere

        const scale = perspective / (perspective + z * radius);
        const x2d = cx + x * radius * scale;
        const y2d = cy + y * radius * scale;

        const depth = (z + 1) / 2; // 0..1
        const dotSize = (0.8 + depth * 1.5) * scale;
        const opacity = (0.15 + depth * 0.6) * (isLight ? 0.35 : 1);

        ctx.beginPath();
        ctx.arc(x2d, y2d, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = isLight
          ? `rgba(80, 130, 200, ${opacity})`
          : `rgba(100, 180, 255, ${opacity})`;
        ctx.fill();
      }

      rotation += 0.0012;
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  );
}
