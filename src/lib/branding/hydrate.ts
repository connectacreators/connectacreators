import { applyBranding } from './apply';
import { readCachedBranding } from './storage';
import { EDITORIAL_DEFAULT } from './types';

export function hydrateBrandingFromCache(): void {
  const cached = readCachedBranding();
  applyBranding(cached ?? EDITORIAL_DEFAULT);
}
