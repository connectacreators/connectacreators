// Pure 3D point-cloud math for the Command Deck orb — kept dependency-free
// and framework-free so it can be unit tested without a canvas or DOM.
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Evenly distributes n points across a unit sphere surface. */
export function fibonacciSphere(n: number): Point3D[] {
  const points: Point3D[] = [];
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / denom) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return points;
}

export function rotateX(p: Point3D, angle: number): Point3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

export function rotateY(p: Point3D, angle: number): Point3D {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

/** n+1 points evenly spaced around a unit circle in the XZ plane, tilted by `tilt`. */
export function ringPoints(n: number, tilt: number): Point3D[] {
  const points: Point3D[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push(rotateX({ x: Math.cos(a), y: 0, z: Math.sin(a) }, tilt));
  }
  return points;
}
