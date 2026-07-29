export type PaletteId = 'editorial' | 'slate' | 'forest' | 'plum' | 'crimson' | 'mono';
export type FontPairingId = 'editorial' | 'modern' | 'classic' | 'bold';

export interface Palette {
  ink: string;
  graphite: string;
  bone: string;
  aqua: string;
  honey: string;
  honeyDeep: string;
  /** Light surface used for editorial-style cards / cream backgrounds. */
  cream: string;
  /** Dark text color readable on the cream surface. */
  inkOnCream: string;
}

export interface FontPairing {
  display: string;
  body: string;
  ui: string;
}

/**
 * Per-token colour overrides layered on top of the chosen palette.
 *
 * Only the two accents are open. Structure and foreground tokens (ink,
 * bone, cream, inkOnCream) stay preset-owned deliberately: they're what
 * guarantee text stays readable against its surface, and handing those to a
 * colour picker mostly produces unreadable UIs, not on-brand ones.
 *
 * Bare HSL triplets ("184 41% 70%") — the same shape every palette token
 * uses — so `hsl(var(--aqua) / 0.3)` keeps working downstream.
 */
export interface AccentOverrides {
  aqua?: string;
  honey?: string;
}

export interface UserBranding {
  palette: PaletteId;
  fontPairing: FontPairingId;
  logoUrl: string | null;
  logoAlt: string | null;
  accentOverrides: AccentOverrides;
}

export const EDITORIAL_DEFAULT: UserBranding = {
  palette: 'editorial',
  // Default type is Modern Sans for every account (clients, editors, team
  // members, Connecta Plus). The Editorial palette is still the default look;
  // only the font pairing defaults to the cleaner all-Inter set. Users who
  // have explicitly saved a font keep their choice (DB row overrides this).
  fontPairing: 'modern',
  logoUrl: null,
  logoAlt: null,
  accentOverrides: {},
};

export const LOCAL_STORAGE_KEY = 'connecta_branding';
