import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { applyBranding } from '@/lib/branding/apply';
import { writeCachedBranding, clearCachedBranding } from '@/lib/branding/storage';
import {
  EDITORIAL_DEFAULT,
  type UserBranding,
  type PaletteId,
  type FontPairingId,
} from '@/lib/branding/types';

interface BrandingContextValue {
  branding: UserBranding;
  isAvailable: boolean;
  isLoading: boolean;
  setPalette: (id: PaletteId) => Promise<void>;
  setFontPairing: (id: FontPairingId) => Promise<void>;
  setLogo: (logoUrl: string | null, logoAlt?: string | null) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user, isConnectaPlus } = useAuth();
  const [branding, setBranding] = useState<UserBranding>(EDITORIAL_DEFAULT);
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

    if (!isConnectaPlus) {
      setBranding(EDITORIAL_DEFAULT);
      applyBranding(EDITORIAL_DEFAULT);
      clearCachedBranding();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    supabase
      .from('user_branding')
      .select('palette, font_pairing, logo_url, logo_alt')
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
            }
          : EDITORIAL_DEFAULT;
        setBranding(next);
        applyBranding(next);
        writeCachedBranding(next);
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.id, isConnectaPlus]);

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
    if (!user || !isConnectaPlus) return;
    setBranding(next);
    applyBranding(next);
    writeCachedBranding(next);
    const { error } = await supabase
      .from('user_branding')
      .upsert({
        user_id:      user.id,
        palette:      next.palette,
        font_pairing: next.fontPairing,
        logo_url:     next.logoUrl,
        logo_alt:     next.logoAlt,
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('[branding] persist failed', error);
      throw error;
    }
  }, [user, isConnectaPlus]);

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
  const resetToDefault = useCallback(
    () => persist(EDITORIAL_DEFAULT),
    [persist]
  );

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isAvailable: isConnectaPlus,
        isLoading,
        setPalette,
        setFontPairing,
        setLogo,
        resetToDefault,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBrandingContext(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBrandingContext must be used inside <BrandingProvider>');
  return ctx;
}
