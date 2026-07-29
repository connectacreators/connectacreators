import type { UserBranding } from './types';
import { PALETTES, FONT_PAIRINGS } from './presets';

/**
 * Push the user's branding onto <html> as inline CSS custom properties.
 *
 * Inline beats the :root stylesheet rule on specificity, which is what lets
 * a preset override the shipped defaults without a stylesheet per palette.
 * Everything else in the app re-skins for free because the role tokens in
 * index.css are var() indirections onto these primitives.
 */
export function applyBranding(brand: UserBranding): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const palette = PALETTES[brand.palette];
  const fonts = FONT_PAIRINGS[brand.fontPairing];

  // Accent overrides layer on top of the preset. Only the two brand accents
  // are overridable — see AccentOverrides for why structure tokens aren't.
  const overrides = brand.accentOverrides ?? {};
  const aqua = overrides.aqua || palette.aqua;
  const honey = overrides.honey || palette.honey;

  root.style.setProperty('--ink',          palette.ink);
  root.style.setProperty('--graphite',     palette.graphite);
  root.style.setProperty('--bone',         palette.bone);
  root.style.setProperty('--aqua',         aqua);
  root.style.setProperty('--honey',        honey);
  root.style.setProperty('--honey-deep',   palette.honeyDeep);
  root.style.setProperty('--cream',        palette.cream);
  root.style.setProperty('--ink-on-cream', palette.inkOnCream);

  // Intentionally the same triplet as --bone: index.css declares these
  // identically too ("opacity applied at the call site"), so the tonal steps
  // come from the alpha each consumer passes, not from distinct base values.
  root.style.setProperty('--bone-muted',  palette.bone);
  root.style.setProperty('--bone-faint',  palette.bone);
  root.style.setProperty('--line',        palette.bone);

  root.style.setProperty('--font-display', fonts.display);
  root.style.setProperty('--font-body',    fonts.body);
  root.style.setProperty('--font-ui',      fonts.ui);

  root.setAttribute('data-brand-palette', brand.palette);
  root.setAttribute('data-brand-font',    brand.fontPairing);
}
