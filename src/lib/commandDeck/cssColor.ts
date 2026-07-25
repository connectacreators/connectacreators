// Canvas fillStyle/strokeStyle cannot consume `var(--token)` directly — this
// resolves a brand token to a concrete hsl() string at call time so canvas
// components stay driven by the same tokens as the rest of the app instead
// of hardcoding hex (which the app's brand-token guard forbids elsewhere).
export function resolveCssHsl(varName: string, fallback: string): string {
  if (typeof document === "undefined") return `hsl(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `hsl(${raw || fallback})`;
}

// Applies an alpha value to a `resolveCssHsl(...)` result using the CSS
// Color 4 slash syntax (`hsl(H S% L% / A)`) — the space-separated triplet
// `resolveCssHsl` returns is NOT valid inside a comma-separated `hsla(...)`,
// and canvas's `addColorStop`/`fillStyle` parser throws a SyntaxError on
// that hybrid rather than silently ignoring it.
export function withAlpha(hslColor: string, alpha: number): string {
  return hslColor.replace(/\)$/, ` / ${alpha})`);
}
