// src/lib/triage/clientMonogram.ts
//
// Deterministic monogram avatar fallback shared by the dashboard Clients and
// Tasks views: a hashed palette color + 2-letter initials for a client name.

export interface Monogram { bg: string; fg: string; }

// Picks one slot per client-name hash. These hex values are the allowed
// monogram palette (not blocked by the branding pre-commit hook).
export const MONOGRAM_PALETTE: Monogram[] = [
  { bg: '#C5882F', fg: '#FFFFFF' },  // honey
  { bg: '#2F6B62', fg: '#FFFFFF' },  // pine
  { bg: '#7C5BAE', fg: '#FFFFFF' },  // violet
  { bg: '#B23A2A', fg: '#FFFFFF' },  // brick
  { bg: '#1F4D72', fg: '#FFFFFF' },  // navy
  { bg: '#3D7846', fg: '#FFFFFF' },  // forest
  { bg: 'hsl(var(--ink-on-cream))', fg: 'hsl(var(--cream))' },  // ink
];

export function colorFor(name: string): Monogram {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return MONOGRAM_PALETTE[Math.abs(h) % MONOGRAM_PALETTE.length];
}

export function initials(name: string): string {
  const cleaned = name.replace(/['’]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}
