import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";

const MAP_COLS = 180;
const MAP_ROWS = 90;

// Land rectangles at 2° resolution: [rowStart, rowEnd, colStart, colEnd]
const LAND: [number, number, number, number][] = [
  // === NORTH AMERICA ===
  // Alaska
  [10, 12, 4, 10], [10, 14, 10, 22], [12, 16, 6, 20], [8, 10, 10, 16],
  // Aleutian Islands
  [14, 16, 2, 8],
  // Northern Canada / Arctic Archipelago
  [4, 6, 34, 42], [4, 6, 44, 50], [4, 8, 52, 58],
  [6, 8, 30, 36], [6, 8, 38, 48],
  // Canada mainland
  [8, 12, 24, 36], [8, 12, 36, 50], [8, 10, 50, 60],
  [10, 14, 24, 34], [10, 14, 36, 50], [10, 14, 52, 60],
  [12, 16, 26, 40], [14, 18, 26, 36], [14, 18, 38, 56],
  // Great Lakes gaps carved out below
  [16, 18, 28, 56],
  // US East
  [18, 22, 38, 58], [22, 24, 40, 58],
  [18, 22, 28, 38],
  // US West
  [22, 26, 30, 40],
  // US Central/South
  [24, 28, 32, 56], [26, 30, 34, 54],
  [28, 30, 36, 54],
  // Florida
  [30, 32, 50, 56], [32, 34, 52, 54],
  // Mexico
  [28, 30, 32, 38], [30, 34, 32, 46], [34, 36, 34, 44],
  [36, 38, 36, 46], [32, 34, 30, 34],
  // Baja California
  [30, 36, 28, 32],
  // Central America
  [36, 38, 44, 50], [38, 40, 46, 52], [40, 42, 48, 52],
  // Caribbean Islands
  [32, 34, 48, 52], [34, 36, 50, 56], [34, 36, 56, 58],
  [36, 38, 52, 54],
  // Greenland
  [4, 6, 66, 74], [6, 10, 66, 78], [10, 14, 68, 76], [8, 10, 64, 68],

  // === SOUTH AMERICA ===
  [38, 40, 52, 58], [40, 42, 48, 62],
  [42, 44, 46, 66], [44, 46, 46, 70],
  [46, 48, 48, 72], [48, 50, 48, 72],
  [50, 52, 50, 70], [52, 54, 50, 68],
  [54, 56, 52, 68], [56, 58, 52, 66],
  [58, 60, 52, 64], [60, 62, 52, 60],
  [62, 64, 52, 58], [64, 66, 54, 56],
  [66, 68, 54, 56], [68, 70, 54, 56],
  // Tierra del Fuego
  [70, 72, 52, 56],

  // === EUROPE ===
  // Iceland
  [12, 14, 78, 84],
  // Ireland
  [18, 20, 84, 86],
  // UK
  [16, 18, 86, 90], [18, 20, 86, 90], [14, 16, 88, 90],
  // Scandinavia - Norway/Sweden
  [10, 12, 92, 96], [12, 14, 92, 98], [14, 16, 92, 100],
  [10, 12, 96, 100],
  // Finland
  [10, 14, 100, 106], [14, 16, 100, 104],
  // Denmark
  [16, 18, 92, 96],
  // France/Benelux/Germany
  [18, 20, 84, 90], [20, 22, 84, 96], [22, 24, 84, 96],
  // Iberian Peninsula
  [24, 26, 84, 92], [26, 28, 84, 92], [28, 30, 86, 90],
  // Italy
  [24, 26, 94, 98], [26, 28, 94, 98], [28, 30, 96, 100],
  [30, 32, 96, 98],
  // Balkans/Greece
  [22, 24, 96, 106], [24, 26, 98, 104], [26, 28, 100, 106],
  [28, 30, 100, 104],
  // Poland/Ukraine/Belarus
  [18, 20, 96, 108], [20, 22, 96, 110],
  // Baltic states
  [16, 18, 98, 106],
  // Turkey
  [24, 26, 106, 114], [26, 28, 108, 114],
  // Cyprus/Crete
  [26, 28, 106, 108],

  // === RUSSIA ===
  [10, 14, 106, 120], [8, 12, 118, 130],
  [12, 16, 108, 124], [14, 18, 112, 130],
  [16, 20, 106, 128], [18, 22, 124, 140],
  [10, 16, 128, 148], [8, 14, 146, 168],
  [10, 14, 166, 178], [8, 12, 168, 176],
  // Kamchatka
  [10, 16, 174, 178], [8, 10, 176, 178],

  // === AFRICA ===
  // North Africa
  [28, 30, 82, 86], [28, 32, 86, 96],
  [30, 34, 82, 98], [32, 36, 84, 108],
  [34, 38, 82, 112],
  // West Africa
  [36, 38, 82, 86], [38, 40, 82, 94], [40, 42, 82, 96],
  [36, 40, 86, 100],
  // Central Africa
  [38, 42, 96, 112], [42, 46, 94, 116],
  [46, 48, 96, 114],
  // East Africa / Horn of Africa
  [30, 32, 108, 116], [32, 34, 108, 118],
  [34, 36, 110, 120], [36, 38, 112, 118],
  [38, 42, 112, 118],
  // East coast
  [42, 46, 108, 116], [46, 50, 106, 116],
  // Southern Africa
  [50, 52, 100, 114], [52, 54, 100, 114],
  [54, 56, 100, 112], [56, 58, 102, 112],
  [58, 60, 104, 112], [60, 62, 106, 110],
  // Madagascar
  [50, 52, 116, 118], [52, 56, 114, 118], [56, 58, 114, 116],

  // === MIDDLE EAST ===
  [26, 28, 112, 118], [28, 30, 108, 114],
  [28, 32, 114, 122], [30, 34, 112, 124],
  [32, 34, 118, 126],
  // Iran/Afghanistan
  [24, 26, 118, 128], [26, 28, 118, 130], [24, 28, 128, 134],
  [28, 30, 120, 130],

  // === CENTRAL ASIA ===
  [20, 22, 120, 132], [22, 24, 118, 132],
  [18, 20, 128, 138], [20, 24, 130, 140],

  // === SOUTH ASIA ===
  // India
  [28, 30, 124, 136], [30, 34, 126, 138],
  [34, 36, 128, 136], [36, 38, 128, 136],
  [38, 40, 130, 134], [40, 42, 130, 132],
  // Sri Lanka
  [42, 44, 130, 132],
  // Myanmar/Thailand/Vietnam
  [34, 36, 136, 142], [36, 38, 136, 146],
  [38, 40, 138, 148], [40, 42, 140, 148],
  [34, 38, 142, 148],

  // === EAST ASIA ===
  // China
  [20, 22, 132, 142], [22, 24, 130, 148],
  [24, 26, 130, 150], [26, 28, 132, 154],
  [28, 30, 132, 156], [30, 32, 134, 154],
  [32, 34, 136, 154], [34, 36, 138, 154],
  // Mongolia
  [18, 20, 136, 150], [20, 22, 140, 152],
  // Manchuria
  [18, 20, 150, 158], [20, 24, 152, 160],
  // Korea
  [24, 26, 154, 158], [26, 28, 154, 158],
  // Japan
  [20, 22, 160, 164], [22, 24, 158, 164],
  [24, 26, 158, 164], [26, 28, 160, 164],
  [28, 30, 160, 162],
  // Taiwan
  [32, 34, 152, 154], [34, 36, 152, 154],

  // === SOUTHEAST ASIA ===
  // Philippines
  [36, 38, 150, 156], [38, 40, 150, 156], [40, 42, 152, 156],
  // Malaysia/Indonesia
  [42, 44, 138, 148], [44, 46, 138, 148],
  [42, 44, 148, 154],
  // Borneo
  [42, 44, 154, 162], [44, 46, 152, 160], [46, 48, 154, 158],
  // Sumatra
  [44, 48, 138, 146],
  // Java
  [46, 48, 142, 156],
  // Sulawesi
  [44, 48, 158, 164],
  // Papua New Guinea
  [44, 46, 162, 170], [46, 48, 164, 170],

  // === OCEANIA ===
  // Australia - more detailed
  [48, 50, 148, 156], [50, 52, 146, 160],
  [52, 54, 146, 164], [54, 56, 148, 168],
  [56, 58, 150, 168], [58, 60, 152, 168],
  [60, 62, 154, 166], [62, 64, 156, 164],
  [54, 56, 164, 170],
  // Tasmania
  [64, 66, 164, 168],
  // New Zealand
  [60, 62, 174, 178], [62, 64, 174, 178],
  [64, 66, 174, 178], [66, 68, 176, 178],
  [68, 70, 176, 178],

  // === ANTARCTICA ===
  [78, 82, 20, 170], [82, 86, 30, 160], [86, 88, 40, 140],
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
            : `rgba(210,180,80,${alpha})`;
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
