import { useState } from 'react';
import { useBranding } from '@/hooks/useBranding';

interface Props {
  fallbackText?: string;
  className?: string;
}

export default function BrandLogo({ fallbackText = 'Connecta', className }: Props) {
  const { branding } = useBranding();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = branding.logoUrl && !imgFailed;

  if (showImage) {
    return (
      <img
        src={branding.logoUrl!}
        alt={branding.logoAlt || fallbackText}
        onError={() => setImgFailed(true)}
        className={className ?? 'h-7 w-auto object-contain'}
      />
    );
  }
  return (
    <span
      className={className ?? 'font-wordmark text-xl text-foreground'}
      style={{ letterSpacing: '-0.022em', fontWeight: 700 }}
    >
      {fallbackText}
    </span>
  );
}
