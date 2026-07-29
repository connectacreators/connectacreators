import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { applyBranding } from '@/lib/branding/apply';
import { readCachedBranding, writeCachedBranding, clearCachedBranding } from '@/lib/branding/storage';
import {
  EDITORIAL_DEFAULT,
  type UserBranding,
  type PaletteId,
  type FontPairingId,
  type AccentOverrides,
} from '@/lib/branding/types';

interface BrandingContextValue {
  branding: UserBranding;
  isAvailable: boolean;
  isLoading: boolean;
  setPalette: (id: PaletteId) => Promise<void>;
  setFontPairing: (id: FontPairingId) => Promise<void>;
  setLogo: (logoUrl: string | null, logoAlt?: string | null) => Promise<void>;
  setAccentOverride: (token: keyof AccentOverrides, hsl: string | null) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Seed from localStorage so the custom logo + brand on the sidebar appear
  // on the first paint after a refresh — otherwise React would render with
  // EDITORIAL_DEFAULT (logoUrl=null → "Connecta" fallback text) for the
  // ~1s it takes the Supabase fetch to complete. hydrate.ts already does
  // this for CSS vars; this mirrors it for the React state.
  const [branding, setBranding] = useState<UserBranding>(
    () => readCachedBranding() ?? EDITORIAL_DEFAULT,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setBranding(EDITORIAL_DEFAULT);
      applyBranding(EDITORIAL_DEFAULT);
      clearCachedBranding();
      setIsLoading(false);
      return;
    }

    // Branding is available to every logged-in user — no plan/role gate.
    setIsLoading(true);
    // accent_overrides was applied to prod by hand (see the 20260729
    // migration) and isn't in the generated Supabase types yet — same drift
    // class as agency_goals. Cast the table access, not the result.
    (supabase as any)
      .from('user_branding')
      .select('palette, font_pairing, logo_url, logo_alt, accent_overrides')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[branding] fetch failed, using defaults', error);
          setBranding(EDITORIAL_DEFAULT);
          applyBranding(EDITORIAL_DEFAULT);
          setIsLoading(false);
          return;
        }
        const next: UserBranding = data
          ? {
              palette:     data.palette as PaletteId,
              fontPairing: data.font_pairing as FontPairingId,
              logoUrl:     data.logo_url ?? null,
              logoAlt:     data.logo_alt ?? null,
              // jsonb comes back already parsed; guard anyway since a hand-
              // edited row could hold a non-object.
              accentOverrides:
                data.accent_overrides && typeof data.accent_overrides === 'object'
                  ? (data.accent_overrides as AccentOverrides)
                  : {},
            }
          : EDITORIAL_DEFAULT;
        setBranding(next);
        applyBranding(next);
        writeCachedBranding(next);
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== 'connecta_branding') return;
      if (!e.newValue) {
        setBranding(EDITORIAL_DEFAULT);
        applyBranding(EDITORIAL_DEFAULT);
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue) as UserBranding;
        setBranding(parsed);
        applyBranding(parsed);
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback(async (next: UserBranding) => {
    if (!user) return;
    setBranding(next);
    applyBranding(next);
    writeCachedBranding(next);
    const { error } = await (supabase as any)
      .from('user_branding')
      .upsert({
        user_id:      user.id,
        palette:      next.palette,
        font_pairing: next.fontPairing,
        logo_url:     next.logoUrl,
        logo_alt:     next.logoAlt,
        accent_overrides: next.accentOverrides ?? {},
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('[branding] persist failed', error);
      throw error;
    }
  }, [user]);

  const setPalette = useCallback(
    (id: PaletteId) => persist({ ...branding, palette: id }),
    [branding, persist]
  );
  const setFontPairing = useCallback(
    (id: FontPairingId) => persist({ ...branding, fontPairing: id }),
    [branding, persist]
  );
  const setLogo = useCallback(
    (logoUrl: string | null, logoAlt: string | null = null) =>
      persist({ ...branding, logoUrl, logoAlt }),
    [branding, persist]
  );
  /** Set or clear one accent override. Passing null falls back to the preset. */
  const setAccentOverride = useCallback(
    (token: keyof AccentOverrides, hsl: string | null) => {
      const next = { ...(branding.accentOverrides ?? {}) };
      if (hsl) next[token] = hsl;
      else delete next[token];
      return persist({ ...branding, accentOverrides: next });
    },
    [branding, persist]
  );
  const resetToDefault = useCallback(
    () => persist(EDITORIAL_DEFAULT),
    [persist]
  );

  const value = useMemo(
    () => ({
      branding,
      isAvailable: !!user,
      isLoading,
      setPalette,
      setFontPairing,
      setLogo,
      setAccentOverride,
      resetToDefault,
    }),
    [branding, user, isLoading, setPalette, setFontPairing, setLogo, setAccentOverride, resetToDefault],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBrandingContext(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBrandingContext must be used inside <BrandingProvider>');
  return ctx;
}
