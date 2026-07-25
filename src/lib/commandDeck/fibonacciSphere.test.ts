import { describe, it, expect } from "vitest";
import { fibonacciSphere, rotateX, rotateY } from "./fibonacciSphere";

describe("fibonacciSphere", () => {
  it("returns exactly n points", () => {
    expect(fibonacciSphere(50)).toHaveLength(50);
  });

  it("every point lies on the unit sphere", () => {
    for (const p of fibonacciSphere(200)) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeGreaterThan(0.999);
      expect(r).toBeLessThan(1.001);
    }
  });

  it("handles n=1 without dividing by zero", () => {
    expect(() => fibonacciSphere(1)).not.toThrow();
    expect(fibonacciSphere(1)).toHaveLength(1);
  });
});

describe("rotateY", () => {
  it("preserves distance from the y-axis", () => {
    const p = { x: 1, y: 0.4, z: 0 };
    const r = rotateY(p, Math.PI / 3);
    expect(Math.sqrt(r.x * r.x + r.z * r.z)).toBeCloseTo(Math.sqrt(p.x * p.x + p.z * p.z), 5);
    expect(r.y).toBeCloseTo(p.y, 10);
  });

  it("a full 2π rotation returns to the start", () => {
    const p = { x: 0.6, y: 0.2, z: 0.8 };
    const r = rotateY(p, Math.PI * 2);
    expect(r.x).toBeCloseTo(p.x, 5);
    expect(r.z).toBeCloseTo(p.z, 5);
  });
});

describe("rotateX", () => {
  it("preserves distance from the x-axis", () => {
    const p = { x: 0.3, y: 1, z: 0 };
    const r = rotateX(p, Math.PI / 4);
    expect(Math.sqrt(r.y * r.y + r.z * r.z)).toBeCloseTo(Math.sqrt(p.y * p.y + p.z * p.z), 5);
    expect(r.x).toBeCloseTo(p.x, 10);
  });
});
