// Canvas fillStyle/strokeStyle cannot consume `var(--token)` directly — this
// resolves a brand token to a concrete hsl() string at call time so canvas
// components stay driven by the same tokens as the rest of the app instead
// of hardcoding hex (which the app's brand-token guard forbids elsewhere).
export function resolveCssHsl(varName: string, fallback: string): string {
  if (typeof document === "undefined") return `hsl(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `hsl(${raw || fallback})`;
}
