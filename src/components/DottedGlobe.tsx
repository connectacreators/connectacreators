import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const MAP_COLS = 180;
const MAP_ROWS = 90;

// Land rectangles at 2° resolution: [rowStart, rowEnd, colStart, colEnd]
const LAND: [number, number, number, number][] = [
  // Alaska
  [10, 16, 4, 24],
  // Canada
  [8, 18, 24, 62],
  // Northern US
  [18, 24, 28, 58],
  // US
  [24, 32, 30, 58],
  // Florida
  [30, 34, 50, 56],
  // Mexico
  [30, 38, 32, 48],
  // Central America
  [38, 42, 44, 52],
  // Caribbean
  [34, 36, 46, 50],
  // Greenland
  [4, 10, 66, 78],
  [10, 14, 70, 76],
  // South America - Colombia/Venezuela
  [40, 44, 50, 64],
  // Brazil
  [44, 50, 50, 72],
  [50, 56, 52, 70],
  [56, 58, 54, 68],
  // Peru/Bolivia
  [44, 54, 46, 52],
  // Argentina/Chile
  [54, 60, 48, 56],
  [58, 66, 50, 62],
  [66, 70, 52, 58],
  // Iceland
  [12, 14, 78, 84],
  // UK/Ireland
  [16, 20, 84, 90],
  // Scandinavia
  [10, 18, 92, 104],
  // Western Europe
  [20, 26, 84, 98],
  // Iberian Peninsula
  [26, 28, 84, 92],
  // Italy
  [24, 30, 94, 98],
  // Eastern Europe
  [18, 22, 98, 110],
  // Balkans/Turkey
  [22, 28, 98, 108],
  // Western Russia
  [10, 20, 104, 120],
  // Central Russia
  [8, 20, 120, 150],
  // Eastern Siberia
  [6, 18, 150, 178],
  // Kamchatka
  [8, 14, 174, 178],
  // North Africa - Maghreb
  [28, 32, 82, 96],
  // Sahara
  [28, 38, 82, 110],
  // West Africa
  [38, 42, 82, 98],
  // Central Africa
  [38, 44, 96, 112],
  // East Africa / Horn
  [36, 44, 108, 116],
  [32, 38, 108, 116],
  // Congo basin
  [44, 48, 96, 112],
  // Southern Africa east
  [48, 56, 98, 114],
  // South Africa
  [56, 62, 98, 110],
  // Madagascar
  [50, 58, 112, 114],
  // Arabian Peninsula
  [26, 34, 108, 120],
  // Middle East / Iran
  [24, 30, 112, 126],
  // Central Asia
  [20, 28, 116, 128],
  // India
  [28, 36, 124, 134],
  [36, 42, 126, 132],
  // Sri Lanka
  [42, 44, 130, 132],
  // China
  [20, 28, 128, 148],
  [28, 34, 130, 156],
  // Mongolia
  [18, 24, 134, 150],
  // Korea
  [24, 28, 154, 156],
  // Japan
  [22, 26, 156, 162],
  [26, 30, 158, 162],
  // Taiwan
  [32, 34, 150, 152],
  // SE Asia mainland
  [34, 40, 138, 146],
  [36, 42, 144, 148],
  // Philippines
  [36, 42, 148, 154],
  // Malaysia/Sumatra
  [42, 46, 138, 148],
  // Borneo
  [42, 48, 148, 158],
  // Java
  [46, 48, 142, 154],
  // Sulawesi/Moluccas
  [44, 48, 156, 164],
  // Papua New Guinea
  [44, 48, 160, 168],
  // Australia
  [50, 58, 146, 160],
  [52, 64, 148, 166],
  [58, 62, 160, 166],
  // Tasmania
  [60, 62, 164, 166],
  // New Zealand
  [62, 68, 174, 178],
  // Antarctica
  [78, 88, 40, 160],
];

// Pre-compute land points
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

      // Zoom out significantly so full continents are visible
      const mapH = h * 1.4;
      const mapW = mapH * 2;
      const offsetY = (h - mapH) / 2;
      const cellW = mapW / MAP_COLS;
      const cellH = mapH / MAP_ROWS;
      const dotR = Math.max(1.2, Math.min(cellW, cellH) * 0.18);
      const repeats = Math.ceil(w / mapW) + 2;

      ctx.fillStyle = isLight
        ? "rgba(80, 130, 200, 0.22)"
        : "rgba(100, 180, 255, 0.32)";

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
