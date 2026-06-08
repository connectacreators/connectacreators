// src/components/dashboard/ClientAvatar.tsx
//
// Round client avatar. Renders the Instagram profile picture (a base64 data URI
// prefetched via useClientProfilePics) when available, and falls back to the
// supplied initials monogram when there's no picture or the image fails to
// decode. Keeping the fallback as a prop lets each surface preserve its own
// monogram styling (size, palette, font) while sharing the photo/error logic.

import { useState } from "react";

interface ClientAvatarProps {
  picUrl?: string | null;
  alt: string;
  size: number;
  /** Extra styles merged onto the <img> (e.g. inset shadow, border). */
  style?: React.CSSProperties;
  /** Initials monogram shown when there's no usable picture. */
  fallback: React.ReactNode;
}

export function ClientAvatar({ picUrl, alt, size, style, fallback }: ClientAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (!picUrl || failed) return <>{fallback}</>;

  return (
    <img
      src={picUrl}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
        ...style,
      }}
    />
  );
}
