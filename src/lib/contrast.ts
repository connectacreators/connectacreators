/**
 * Lightweight color-contrast helpers for canvas surfaces.
 *
 * The canvas floor is cream (light, luminance ≈ 0.84). User-pickable palettes
 * (annotation text, edge colors) include white and pale tones that vanish on it.
 * These helpers estimate relative luminance for the color formats those palettes
 * actually use — hex and the app's `hsl(var(--token))` strings — so components can
 * add a compensating halo/outline instead of silently rendering invisible text.
 */

/** WCAG-ish relative luminance for a #rrggbb hex color (0 dark → 1 light) */
export function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Approximate luminance of the branding tokens used in canvas palettes */
const TOKEN_LUMINANCE: Array<[string, number]> = [
  ["--ink-on-cream", 0.07],
  ["--ink", 0.07],
  ["--cream", 0.84],
  ["--bone", 0.84],
  ["--aqua", 0.55],
  ["--honey", 0.47],
];

/** Best-effort luminance for hex, rgb(a) and `hsl(var(--token) ...)` strings */
export function colorLuminance(color: string): number {
  if (!color) return 0.5;
  if (color.startsWith("#")) return hexLuminance(color);
  const rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
    return hexLuminance(`#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`);
  }
  for (const [token, lum] of TOKEN_LUMINANCE) {
    if (color.includes(token)) return lum;
  }
  if (color === "white" || color === "#fff") return 1;
  return 0.5;
}

/** True when text of `fg` would be hard to read against `bg` (small luminance gap) */
export function needsContrastHalo(fg: string, bg: string): boolean {
  return Math.abs(colorLuminance(fg) - colorLuminance(bg)) < 0.3;
}
