import type { UserBranding } from './types';
import { LOCAL_STORAGE_KEY } from './types';

export function readCachedBranding(): UserBranding | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed
      && typeof parsed.palette === 'string'
      && typeof parsed.fontPairing === 'string'
    ) {
      return {
        palette:     parsed.palette,
        fontPairing: parsed.fontPairing,
        logoUrl:     parsed.logoUrl ?? null,
        logoAlt:     parsed.logoAlt ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCachedBranding(brand: UserBranding): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(brand));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function clearCachedBranding(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
