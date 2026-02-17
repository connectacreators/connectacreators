import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const MAP_COLS = 90;
const MAP_ROWS = 45;

const LAND: [number, number, number, number][] = [
  [5, 8, 2, 12], [4, 9, 12, 31], [9, 12, 14, 29], [12, 16, 15, 29],
  [15, 19, 16, 24], [19, 21, 22, 26], [17, 18, 23, 25],
  [2, 5, 33, 39], [5, 7, 35, 38],
  [20, 22, 25, 32], [22, 29, 25, 36], [29, 33, 26, 31], [33, 35, 27, 29],
  [6, 7, 39, 42], [8, 10, 42, 45], [5, 9, 46, 52], [10, 13, 42, 49], [9, 11, 49, 55],
  [5, 10, 52, 60], [4, 10, 60, 89],
  [14, 19, 41, 55], [19, 21, 41, 49], [19, 26, 48, 58], [26, 31, 49, 55], [25, 29, 56, 57],
  [13, 17, 54, 60], [10, 14, 58, 64],
  [14, 21, 62, 67], [21, 22, 62, 62],
  [10, 17, 64, 78], [9, 12, 67, 75], [12, 14, 77, 77], [11, 15, 78, 81], [16, 17, 75, 76],
  [17, 21, 69, 73], [18, 21, 74, 77],
  [21, 24, 69, 80], [22, 24, 80, 84],
  [25, 32, 73, 83], [31, 34, 87, 89],
  [39, 44, 20, 80],
];

const landSet = new Set<number>();
for (const [r1, r2, c1, c2] of LAND) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      landSet.add(r * MAP_COLS + (c % MAP_COLS));
    }
  }
}
const LAND_POINTS: [number, number][] = [];
landSet.forEach((key) => {
  LAND_POINTS.push([Math.floor(key / MAP_COLS), key % MAP_COLS]);
});

export default function DottedGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let offset = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const isLight = themeRef.current === "light";

      ctx.clearRect(0, 0, w, h);

      // Zoom out: map is larger than the container so continents look smaller
      const mapH = h * 1.8;
      const mapW = mapH * 2;
      const offsetY = (h - mapH) / 2; // center vertically
      const cellW = mapW / MAP_COLS;
      const cellH = mapH / MAP_ROWS;
      const dotR = Math.min(cellW, cellH) * 0.12; // smaller dots
      const repeats = Math.ceil(w / mapW) + 2;

      ctx.fillStyle = isLight
        ? "rgba(80, 130, 200, 0.2)"
        : "rgba(100, 180, 255, 0.3)";

      for (const [row, col] of LAND_POINTS) {
        const y = offsetY + row * cellH + cellH / 2;
        if (y < -dotR || y > h + dotR) continue;
        const baseX = col * cellW + cellW / 2;

        for (let rep = -1; rep < repeats; rep++) {
          const x = baseX + rep * mapW + offset;
          if (x < -dotR || x > w + dotR) continue;
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      offset += 0.3;
      if (offset >= mapW) offset -= mapW;
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); observer.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  );
}
