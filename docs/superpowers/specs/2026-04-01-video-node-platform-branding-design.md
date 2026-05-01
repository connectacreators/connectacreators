# Video Node Platform Branding — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Problems

1. **Bug:** YouTube URLs with no Apify captions fall through to yt-dlp audio extraction, which fails with a cookies/authentication error. yt-dlp cannot download YouTube videos without browser cookies.
2. **Visual:** All video nodes look the same (teal) regardless of platform. Users can't tell at a glance whether a node is YouTube, Instagram, TikTok, or Facebook.

## Scope

- Fix the yt-dlp fallback bug for YouTube in `transcribe-video`
- Add platform detection + platform-specific color/icon/label to `VideoNode.tsx`
- Platforms: YouTube, Instagram, TikTok, Facebook, and a neutral default for everything else

## Changes

---

### 1. Bug fix — `supabase/functions/transcribe-video/index.ts`

**Line ~311:** The yt-dlp audio extraction block currently runs whenever `transcription` is null, including for YouTube. Change the guard:

```ts
// Before
if (!transcription) {

// After
if (!transcription && !isYouTube) {
```

**After that block** (around line 366), the null-check throws if `transcription` is still null. For YouTube, add a fallback before this check:

```ts
// YouTube with no captions: set empty string so it doesn't throw
if (isYouTube && !transcription) {
  transcription = "(No captions available for this video)";
}
```

No other changes to this file.

---

### 2. Platform branding — `src/components/canvas/VideoNode.tsx`

#### Platform detection helper

Add a module-level helper function:

```ts
type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "default";

function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  return "default";
}
```

#### Platform theme map

Add a module-level config object mapping each platform to its colors, label, and icon:

```ts
const PLATFORM_THEME = {
  youtube: {
    label: "YouTube",
    headerBg: "rgba(239,68,68,0.12)",
    headerBorder: "rgba(239,68,68,0.22)",
    cardBorder: "rgba(239,68,68,0.5)",
    cardGlow: "rgba(239,68,68,0.08)",
    accentColor: "rgba(239,68,68,0.9)",
    chevronColor: "rgba(239,68,68,0.6)",
    transcriptBorder: "rgba(239,68,68,0.1)",
  },
  instagram: {
    label: "Instagram",
    headerBg: "linear-gradient(135deg, rgba(131,58,180,0.2) 0%, rgba(253,29,29,0.14) 60%, rgba(252,176,69,0.1) 100%)",
    headerBorder: "rgba(193,53,132,0.22)",
    cardBorder: "rgba(193,53,132,0.5)",
    cardGlow: "rgba(131,58,180,0.08)",
    accentColor: "rgba(193,53,132,0.9)",   // used for primary btn
    chevronColor: "rgba(193,53,132,0.65)",
    transcriptBorder: "rgba(193,53,132,0.1)",
  },
  tiktok: {
    label: "TikTok",
    headerBg: "rgba(10,10,10,0.95)",
    headerBorder: "rgba(37,244,238,0.15)",
    cardBorder: "rgba(37,244,238,0.35)",
    cardGlow: "rgba(37,244,238,0.05)",
    accentColor: "rgba(37,244,238,0.88)",
    chevronColor: "rgba(37,244,238,0.65)",
    transcriptBorder: "rgba(37,244,238,0.1)",
  },
  facebook: {
    label: "Facebook",
    headerBg: "rgba(24,119,242,0.12)",
    headerBorder: "rgba(24,119,242,0.2)",
    cardBorder: "rgba(24,119,242,0.5)",
    cardGlow: "rgba(24,119,242,0.07)",
    accentColor: "rgba(24,119,242,0.95)",
    chevronColor: "rgba(24,119,242,0.65)",
    transcriptBorder: "rgba(24,119,242,0.1)",
  },
  default: {
    label: "Video Reference",
    headerBg: "rgba(8,145,178,0.10)",
    headerBorder: "rgba(8,145,178,0.20)",
    cardBorder: "rgba(8,145,178,0.25)",
    cardGlow: "rgba(8,145,178,0.05)",
    accentColor: "rgba(34,211,238,0.8)",
    chevronColor: "rgba(34,211,238,0.5)",
    transcriptBorder: "rgba(8,145,178,0.1)",
  },
};
```

#### Platform icon components

Add module-level icon components (inline SVG, no external deps):

```tsx
function YouTubeIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
      <rect width="20" height="14" rx="3.5" fill="#FF0000"/>
      <path d="M8 4L13.5 7L8 10V4Z" fill="white"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="ig-g" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433"/>
          <stop offset="25%" stopColor="#e6683c"/>
          <stop offset="50%" stopColor="#dc2743"/>
          <stop offset="75%" stopColor="#cc2366"/>
          <stop offset="100%" stopColor="#bc1888"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-g)"/>
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none">
      <path d="M10.5 0.5C10.7 2.3 11.7 3.3 13.5 3.5V5.8C12.3 5.7 11.3 5.3 10.5 4.7V9.5C10.5 12 8.5 14 6 14C3.5 14 1.5 12 1.5 9.5C1.5 7 3.5 5 6 5C6.2 5 6.4 5 6.6 5.1V7.4C6.4 7.3 6.2 7.3 6 7.3C4.7 7.3 3.7 8.3 3.7 9.5C3.7 10.7 4.7 11.7 6 11.7C7.3 11.7 8.3 10.7 8.3 9.5V0.5H10.5Z" fill="#fe2c55" opacity="0.6" transform="translate(0.5,0.5)"/>
      <path d="M10.5 0.5C10.7 2.3 11.7 3.3 13.5 3.5V5.8C12.3 5.7 11.3 5.3 10.5 4.7V9.5C10.5 12 8.5 14 6 14C3.5 14 1.5 12 1.5 9.5C1.5 7 3.5 5 6 5C6.2 5 6.4 5 6.6 5.1V7.4C6.4 7.3 6.2 7.3 6 7.3C4.7 7.3 3.7 8.3 3.7 9.5C3.7 10.7 4.7 11.7 6 11.7C7.3 11.7 8.3 10.7 8.3 9.5V0.5H10.5Z" fill="#25f4ee" opacity="0.6" transform="translate(-0.5,-0.5)"/>
      <path d="M10.5 0.5C10.7 2.3 11.7 3.3 13.5 3.5V5.8C12.3 5.7 11.3 5.3 10.5 4.7V9.5C10.5 12 8.5 14 6 14C3.5 14 1.5 12 1.5 9.5C1.5 7 3.5 5 6 5C6.2 5 6.4 5 6.6 5.1V7.4C6.4 7.3 6.2 7.3 6 7.3C4.7 7.3 3.7 8.3 3.7 9.5C3.7 10.7 4.7 11.7 6 11.7C7.3 11.7 8.3 10.7 8.3 9.5V0.5H10.5Z" fill="white"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#1877F2"/>
      <path d="M15.5 8H13.5C13.2 8 13 8.2 13 8.5V10H15.5L15.1 12.5H13V19H10.5V12.5H9V10H10.5V8.5C10.5 6.6 11.9 5 13.8 5H15.5V8Z" fill="white"/>
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === "youtube") return <YouTubeIcon />;
  if (platform === "instagram") return <InstagramIcon />;
  if (platform === "tiktok") return <TikTokIcon />;
  if (platform === "facebook") return <FacebookIcon />;
  return <Film className="w-3.5 h-3.5 text-primary" />;
}
```

#### Component usage

In the `VideoNode` component:

1. Derive `platform` from the current URL (same source as `isYt`):
   ```ts
   const platform = detectPlatform(d.url || urlInput);
   const theme = PLATFORM_THEME[platform];
   ```

2. Replace hardcoded header backgrounds, border colors, label text, and the `Film` icon with theme values + `<PlatformIcon platform={platform} />`.

3. Specifically replace:
   - Idle state header: `bg-[rgba(8,145,178,0.10)]` → `theme.headerBg` (inline style), border → `theme.headerBorder`
   - Active state header: same
   - Outer card border: `glass-card` stays but add inline `boxShadow` for the colored ring
   - Label text: `"Video Reference"` → `theme.label`
   - Icon: `<Film ...>` → `<PlatformIcon platform={platform} />`
   - Transcript accordion border-top → `theme.transcriptBorder`
   - Chevrons in transcript/breakdown rows → `theme.chevronColor`
   - "Generate Visual Breakdown" button colors → `theme.accentColor` (only for non-YouTube)

4. TikTok card gets an extra `boxShadow` for the chromatic border effect:
   ```
   boxShadow: "0 0 0 1px rgba(37,244,238,0.35), 2px 0 0 rgba(254,44,85,0.25), -2px 0 0 rgba(37,244,238,0.2)"
   ```

5. Instagram label uses a gradient text style (via inline `style` on the span, not a class).

#### What does NOT change

- All transcription, playback, vault, analysis logic — untouched
- `isYt` / `isYtUrl` checks for YouTube-specific behavior — untouched
- Node sizing, resizer, handle positions — untouched

---

## Data Flow (unchanged)

Platform branding is purely derived from the URL at render time — no new state, no DB fields.

## What's Not Changing

- No new node type
- No toolbar change
- No DB schema change
- No credit cost change
