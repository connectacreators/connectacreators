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

export interface UserBranding {
  palette: PaletteId;
  fontPairing: FontPairingId;
  logoUrl: string | null;
  logoAlt: string | null;
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
};

export const LOCAL_STORAGE_KEY = 'connecta_branding';
