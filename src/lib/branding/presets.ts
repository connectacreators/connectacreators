import type { Palette, PaletteId, FontPairing, FontPairingId } from './types';

export const PALETTES: Record<PaletteId, Palette> = {
  editorial: {
    ink:        '0 0% 8%',
    graphite:   '0 0% 12%',
    bone:       '42 23% 89%',
    aqua:       '184 41% 70%',
    honey:      '30 67% 63%',
    honeyDeep:  '22 65% 47%',
    cream:      '42 23% 89%',   // #EAE6DC — warm ivory
    inkOnCream: '0 0% 8%',      // #141414
  },
  slate: {
    ink:        '215 28% 9%',
    graphite:   '217 33% 17%',
    bone:       '214 32% 91%',
    aqua:       '199 89% 60%',
    honey:      '45 96% 56%',
    honeyDeep:  '0 73% 50%',
    cream:      '214 46% 86%',  // clearly cool blue-grey, still light
    inkOnCream: '215 28% 9%',
  },
  forest: {
    ink:        '145 28% 9%',
    graphite:   '155 19% 13%',
    bone:       '78 24% 90%',
    aqua:       '131 24% 62%',
    honey:      '30 56% 59%',
    honeyDeep:  '19 64% 44%',
    cream:      '100 34% 86%',  // clearly sage green, still light
    inkOnCream: '145 28% 9%',
  },
  plum: {
    ink:        '265 28% 9%',
    graphite:   '265 26% 14%',
    bone:       '285 26% 92%',
    aqua:       '265 41% 74%',
    honey:      '42 76% 64%',
    honeyDeep:  '342 50% 46%',
    cream:      '285 46% 88%',  // clearly soft lavender, still light
    inkOnCream: '265 28% 9%',
  },
  crimson: {
    ink:        '0 19% 8%',
    graphite:   '0 22% 12%',
    bone:       '24 41% 91%',
    aqua:       '0 65% 62%',
    honey:      '33 72% 67%',
    honeyDeep:  '0 53% 42%',
    cream:      '18 56% 88%',   // clearly warm blush, still light
    inkOnCream: '0 19% 8%',
  },
  mono: {
    ink:        '0 0% 0%',
    graphite:  '0 0% 5%',
    bone:       '0 0% 100%',
    aqua:       '0 0% 100%',
    honey:      '0 0% 53%',
    honeyDeep:  '0 0% 27%',
    cream:      '0 0% 96%',     // very light grey
    inkOnCream: '0 0% 0%',
  },
};

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  editorial: {
    display: '"EB Garamond", Georgia, serif',
    body:    '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  modern: {
    display: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    body:    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  classic: {
    display: '"EB Garamond", Georgia, serif',
    body:    '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  bold: {
    display: '"Anton", Impact, sans-serif',
    body:    '"Figtree", -apple-system, BlinkMacSystemFont, sans-serif',
    ui:      '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
};

export const PALETTE_LABELS: Record<PaletteId, string> = {
  editorial: 'Editorial',
  slate:     'Slate Pro',
  forest:    'Forest',
  plum:      'Plum',
  crimson:   'Crimson',
  mono:      'Mono',
};

export const FONT_PAIRING_LABELS: Record<FontPairingId, string> = {
  editorial: 'Editorial',
  modern:    'Modern Sans',
  classic:   'Classic',
  bold:      'Bold Display',
};
