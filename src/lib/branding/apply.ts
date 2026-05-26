import type { UserBranding } from './types';
import { PALETTES, FONT_PAIRINGS } from './presets';

export function applyBranding(brand: UserBranding): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const palette = PALETTES[brand.palette];
  const fonts = FONT_PAIRINGS[brand.fontPairing];

  root.style.setProperty('--ink',          palette.ink);
  root.style.setProperty('--graphite',     palette.graphite);
  root.style.setProperty('--bone',         palette.bone);
  root.style.setProperty('--aqua',         palette.aqua);
  root.style.setProperty('--honey',        palette.honey);
  root.style.setProperty('--honey-deep',   palette.honeyDeep);
  root.style.setProperty('--cream',        palette.cream);
  root.style.setProperty('--ink-on-cream', palette.inkOnCream);

  root.style.setProperty('--bone-muted',  palette.bone);
  root.style.setProperty('--bone-faint',  palette.bone);
  root.style.setProperty('--line',        palette.bone);

  root.style.setProperty('--font-display', fonts.display);
  root.style.setProperty('--font-body',    fonts.body);
  root.style.setProperty('--font-ui',      fonts.ui);

  root.setAttribute('data-brand-palette', brand.palette);
  root.setAttribute('data-brand-font',    brand.fontPairing);
}
