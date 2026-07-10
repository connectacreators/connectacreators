// src/lib/videoEditor/waveform.ts
// Lightweight client-side waveform sampler. Given a signed audio/video URL,
// fetch the bytes, decode through Web Audio, and emit N peak values for
// display as a 1-row strip on the music + b-roll timeline tracks.
//
// We keep this fully client-side instead of pre-rendering PNGs in the
// worker because:
//   1. The audio is already in Supabase Storage and the browser already
//      has a signed URL to play it
//   2. Decoding 10MB of MP3 in Web Audio takes ~200ms — fine for one row
//   3. No new infra (storage column, edge function, worker job)
//
// Results are cached in-memory by storage_path so opening / closing the
// editor doesn't re-decode.

const CACHE = new Map<string, number[]>();
const INFLIGHT = new Map<string, Promise<number[]>>();

export async function samplePeaks(
  cacheKey: string,
  signedUrl: string,
  buckets = 600,
): Promise<number[]> {
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;
  const inflight = INFLIGHT.get(cacheKey);
  if (inflight) return inflight;

  const work = (async () => {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`waveform fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    // OfflineAudioContext is unused — AudioContext.decodeAudioData works
    // for offline use and is more broadly available. Construct + immediately
    // close so we don't leak audio output state.
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let audio: AudioBuffer;
    try {
      audio = await ctx.decodeAudioData(buf);
    } finally {
      void ctx.close();
    }
    // Mono mix-down → take absolute peak per bucket.
    const ch0 = audio.getChannelData(0);
    const stride = Math.max(1, Math.floor(ch0.length / buckets));
    const peaks: number[] = new Array(buckets);
    for (let b = 0; b < buckets; b++) {
      const start = b * stride;
      const end = Math.min(ch0.length, start + stride);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(ch0[i]);
        if (v > peak) peak = v;
      }
      peaks[b] = peak;
    }
    CACHE.set(cacheKey, peaks);
    return peaks;
  })();

  INFLIGHT.set(cacheKey, work);
  try {
    return await work;
  } finally {
    INFLIGHT.delete(cacheKey);
  }
}

// Render a peaks array into an inline SVG path string suitable for use as
// a CSS background-image: data URL. Filled top/bottom mirror style.
export function peaksToSvgDataUrl(peaks: number[], color = "rgba(255,255,255,0.55)"): string {
  const W = peaks.length;
  const H = 32;
  const mid = H / 2;
  const pts: string[] = [];
  for (let i = 0; i < W; i++) {
    const h = Math.max(1, peaks[i] * mid);
    pts.push(`M${i},${mid - h}L${i},${mid + h}`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${pts.join("")}" stroke="${color}" stroke-width="1" /></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
