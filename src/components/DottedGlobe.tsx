import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const MAP_COLS = 180;
const MAP_ROWS = 90;

// Land rectangles at 2° resolution: [rowStart, rowEnd, colStart, colEnd]
const LAND: [number, number, number, number][] = [
  // Alaska
  [10, 16, 4, 24], [8, 10, 8, 18],
  // Canada
  [8, 14, 24, 62], [14, 18, 24, 58], [6, 8, 30, 50],
  // Hudson Bay gap (water)
  // Northern US
  [18, 24, 28, 58],
  // US
  [24, 32, 30, 58],
  // Florida
  [30, 34, 52, 56],
  // Mexico
  [30, 38, 32, 48], [32, 36, 30, 34],
  // Central America
  [38, 42, 44, 52],
  // Caribbean
  [34, 36, 46, 52], [34, 36, 54, 56],
  // Greenland
  [4, 10, 66, 78], [10, 14, 70, 76],
  // South America
  [40, 44, 46, 64], [44, 48, 46, 72], [48, 52, 48, 72],
  [52, 56, 50, 70], [56, 60, 52, 68], [60, 64, 50, 62],
  [64, 68, 52, 58], [68, 70, 54, 56],
  // Iceland
  [12, 14, 78, 84],
  // UK/Ireland
  [16, 20, 84, 92],
  // Scandinavia
  [10, 14, 92, 100], [14, 18, 92, 104], [10, 12, 100, 108],
  // Western Europe
  [20, 24, 84, 98], [24, 28, 84, 96],
  // Iberian Peninsula
  [26, 30, 84, 92],
  // Italy
  [24, 30, 94, 100],
  // Eastern Europe
  [18, 22, 98, 112], [22, 26, 98, 108],
  // Balkans/Greece
  [24, 28, 98, 106],
  // Turkey
  [24, 28, 106, 114],
  // Western Russia
  [10, 20, 104, 124],
  // Central Russia / Urals
  [8, 20, 120, 150],
  // Eastern Siberia
  [6, 16, 148, 170], [8, 14, 170, 178],
  // Kamchatka
  [8, 16, 174, 178],
  // North Africa
  [28, 34, 82, 96], [28, 38, 82, 112],
  // West Africa
  [36, 42, 82, 100],
  // Central Africa
  [38, 48, 96, 116],
  // East Africa / Horn
  [30, 36, 108, 118], [36, 42, 110, 118],
  // East coast Africa
  [42, 52, 108, 116],
  // Southern Africa
  [52, 56, 98, 114], [56, 62, 100, 112],
  // Madagascar
  [50, 58, 114, 118],
  // Arabian Peninsula
  [26, 34, 112, 124], [28, 32, 108, 114],
  // Iran
  [24, 30, 118, 130],
  // Central Asia
  [20, 28, 118, 132], [18, 22, 128, 138],
  // India
  [28, 34, 124, 138], [34, 38, 126, 136], [38, 42, 128, 134],
  // Sri Lanka
  [42, 44, 130, 132],
  // China
  [20, 26, 132, 152], [26, 30, 130, 156], [30, 36, 134, 156],
  // Mongolia
  [18, 24, 136, 152],
  // Manchuria
  [20, 24, 152, 160],
  // Korea
  [24, 28, 154, 158],
  // Japan
  [22, 26, 158, 164], [26, 30, 160, 164], [20, 22, 160, 162],
  // Taiwan
  [32, 36, 152, 154],
  // SE Asia mainland
  [34, 38, 138, 148], [38, 42, 140, 150], [36, 40, 146, 150],
  // Philippines
  [36, 42, 150, 156],
  // Malaysia/Sumatra
  [42, 48, 138, 150],
  // Borneo
  [42, 48, 150, 160],
  // Java
  [46, 48, 142, 156],
  // Sulawesi
  [44, 48, 158, 164],
  // Papua New Guinea
  [44, 48, 162, 170],
  // Australia - detailed shape
  [50, 54, 146, 162], [52, 56, 148, 168], [56, 60, 150, 168],
  [60, 64, 152, 166], [54, 58, 162, 170],
  // Tasmania
  [62, 64, 164, 168],
  // New Zealand
  [62, 66, 174, 178], [66, 70, 176, 178],
  // Antarctica
  [78, 86, 30, 160], [82, 88, 40, 140],
];

// Build land lookup
const landSet = new Set<number>();
for (const [r1, r2, c1, c2] of LAND) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      landSet.add(r * MAP_COLS + (c % MAP_COLS));
    }
  }
}

function isLand(row: number, col: number): boolean {
  return landSet.has(row * MAP_COLS + (col % MAP_COLS));
}

const MAX_DIST = 10;
const landDistMap = new Float32Array(MAP_ROWS * MAP_COLS);
landDistMap.fill(MAX_DIST);

// BFS from all land cells
const queue: number[] = [];
for (let r = 0; r < MAP_ROWS; r++) {
  for (let c = 0; c < MAP_COLS; c++) {
    const idx = r * MAP_COLS + c;
    if (landSet.has(idx)) {
      landDistMap[idx] = 0;
      queue.push(idx);
    }
  }
}
let qi = 0;
while (qi < queue.length) {
  const idx = queue[qi++];
  const r = Math.floor(idx / MAP_COLS);
  const c = idx % MAP_COLS;
  const d = landDistMap[idx];
  if (d >= MAX_DIST - 1) continue;
  const neighbors = [
    [r - 1, c], [r + 1, c], [r, (c - 1 + MAP_COLS) % MAP_COLS], [r, (c + 1) % MAP_COLS],
  ];
  for (const [nr, nc] of neighbors) {
    if (nr < 0 || nr >= MAP_ROWS) continue;
    const ni = nr * MAP_COLS + nc;
    if (landDistMap[ni] > d + 1) {
      landDistMap[ni] = d + 1;
      queue.push(ni);
    }
  }
}

// Also compute "land depth" - distance from land edge inward
const landDepthMap = new Float32Array(MAP_ROWS * MAP_COLS);
const edgeQueue: number[] = [];
for (let r = 0; r < MAP_ROWS; r++) {
  for (let c = 0; c < MAP_COLS; c++) {
    const idx = r * MAP_COLS + c;
    if (!landSet.has(idx)) continue;
    // Check if it's an edge cell (adjacent to non-land)
    const neighbors = [
      [r - 1, c], [r + 1, c], [r, (c - 1 + MAP_COLS) % MAP_COLS], [r, (c + 1) % MAP_COLS],
    ];
    let isEdge = false;
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= MAP_ROWS || !landSet.has(nr * MAP_COLS + nc)) {
        isEdge = true; break;
      }
    }
    if (isEdge) {
      landDepthMap[idx] = 1;
      edgeQueue.push(idx);
    }
  }
}
let ei = 0;
while (ei < edgeQueue.length) {
  const idx = edgeQueue[ei++];
  const r = Math.floor(idx / MAP_COLS);
  const c = idx % MAP_COLS;
  const d = landDepthMap[idx];
  const neighbors = [
    [r - 1, c], [r + 1, c], [r, (c - 1 + MAP_COLS) % MAP_COLS], [r, (c + 1) % MAP_COLS],
  ];
  for (const [nr, nc] of neighbors) {
    if (nr < 0 || nr >= MAP_ROWS) continue;
    const ni = nr * MAP_COLS + nc;
    if (landSet.has(ni) && landDepthMap[ni] === 0) {
      landDepthMap[ni] = d + 1;
      edgeQueue.push(ni);
    }
  }
}

function getLandInfluence(row: number, col: number): number {
  if (row < 0 || row >= MAP_ROWS) return 0;
  const idx = row * MAP_COLS + (col % MAP_COLS);
  if (landSet.has(idx)) {
    const depth = landDepthMap[idx];
    // Smooth curve: edges start at 0.35, deep inland approaches 1.0
    return Math.min(1, 0.35 + 0.65 * (1 - Math.exp(-depth * 0.3)));
  }
  // Near land: smooth exponential falloff
  const dist = landDistMap[idx];
  if (dist >= MAX_DIST) return 0;
  const t = 1 - dist / MAX_DIST;
  return 0.28 * t * t; // quadratic falloff for smooth gradient
}

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

      // Dense grid — tighter spacing for more detail
      const spacing = 10;
      const dotMin = 0.7;   // tiny ocean dots
      const dotMax = 3.2;   // prominent land dots

      // Map scale — zoom out more to show full continents clearly
      const mapW = h * 2.6;
      const mapH = h * 1.3;
      const mapOffsetY = (h - mapH) / 2;

      const rows = Math.ceil(h / spacing) + 1;
      const cols = Math.ceil(w / spacing) + 2;

      for (let gy = 0; gy < rows; gy++) {
        const y = gy * spacing;

        for (let gx = -1; gx < cols; gx++) {
          const screenX = gx * spacing;

          const mapX = ((screenX - offset) % mapW + mapW) % mapW;
          const mapY = y - mapOffsetY;

          const mapCol = Math.floor((mapX / mapW) * MAP_COLS);
          const mapRow = Math.floor((mapY / mapH) * MAP_ROWS);

          const influence = getLandInfluence(mapRow, mapCol);
          const radius = dotMin + (dotMax - dotMin) * influence;

          // Lower overall opacity; land still visible but subtle
          const alpha = isLight
            ? 0.04 + influence * 0.16
            : 0.06 + influence * 0.24;

          ctx.beginPath();
          ctx.arc(screenX, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isLight
            ? `rgba(100,140,200,${alpha})`
            : `rgba(140,190,255,${alpha})`;
          ctx.fill();
        }
      }

      offset += 1.0;
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
