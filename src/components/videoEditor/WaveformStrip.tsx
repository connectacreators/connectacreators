// src/components/videoEditor/WaveformStrip.tsx
// Absolute-positioned waveform background for music + b-roll timeline rows.
// Decodes the audio via Web Audio on mount, then sets the SVG path as a
// background-image. Decode is cached in samplePeaks() — opening the editor
// twice doesn't re-decode the same file. While decoding, renders nothing.
import { useEffect, useState } from "react";
import { samplePeaks, peaksToSvgDataUrl } from "@/lib/videoEditor/waveform";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  // Storage_path in the `footage` bucket. Doubles as the cache key — same
  // file shared across edits hits the in-memory peaks cache.
  storagePath: string;
  // 0..1 of the strip's width that should actually be covered with peaks.
  // Used by b-roll: a 3-second clip on a 60-second timeline only paints
  // 5% of the row. Defaults to 1.
  occupyPct?: number;
  color?: string;
};

export function WaveformStrip({ storagePath, occupyPct = 1, color }: Props) {
  const [bgImage, setBgImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from("footage")
          .createSignedUrl(storagePath, 3600);
        if (cancelled || !data?.signedUrl || error) return;
        const peaks = await samplePeaks(storagePath, data.signedUrl);
        if (cancelled) return;
        setBgImage(peaksToSvgDataUrl(peaks, color));
      } catch {
        // Decode failure — silently skip. The track still renders without
        // the waveform overlay.
      }
    })();
    return () => { cancelled = true; };
  }, [storagePath, color]);

  if (!bgImage) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: bgImage,
        backgroundSize: `${(occupyPct * 100).toFixed(2)}% 100%`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
      }}
    />
  );
}
