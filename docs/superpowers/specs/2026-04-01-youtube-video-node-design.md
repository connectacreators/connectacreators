# YouTube Video Node — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Problem

Users want to paste a YouTube URL into the Super Planning Canvas and get the video's transcript and thumbnail displayed on a node — for research and content planning. No playback or visual analysis needed.

## What Already Exists

- `transcribe-video` Supabase edge function already detects YouTube URLs, extracts captions via Apify (`streamers~youtube-scraper`), and constructs thumbnail URLs from `https://img.youtube.com/vi/{id}/maxresdefault.jpg`
- `VideoNode.tsx` already has a URL input field that calls `transcribe-video`
- The Apify YouTube actor returns a `title` field that is currently unused

**Conclusion:** No new edge function or VPS work needed. Changes are confined to two files.

## Scope

- Paste a YouTube URL into the existing VideoNode URL field
- Node auto-detects it is YouTube and switches to "YouTube mode"
- Fetches transcript (via existing Apify captions path) + thumbnail + title
- No video playback
- No structure analysis ("Analyze Structure" button hidden)
- No visual analysis button

## Changes

### 1. `supabase/functions/transcribe-video/index.ts`

**Change `extractYouTubeTranscript()`** — update return type and body to also capture title:

```ts
// Before
async function extractYouTubeTranscript(videoUrl: string): Promise<string | null>

// After
async function extractYouTubeTranscript(videoUrl: string): Promise<{ transcript: string | null; title: string | null }>
```

Inside the function:
- Capture `item.title` (string) alongside the subtitle extraction
- Return `{ transcript, title }` instead of just `transcript`
- On error/empty, return `{ transcript: null, title: null }`

**In the main handler:**
- Update the call site: `const { transcript, title } = await extractYouTubeTranscript(url);`
- Use `transcript` where `transcription` was previously assigned from this call
- Add `videoTitle` to the final JSON response:

```ts
return new Response(JSON.stringify({
  transcription,
  videoUrl: finalVideoUrl,
  thumbnail_url: thumbnailUrl,
  video_title: videoTitle ?? null,   // new field, YouTube only
}), ...);
```

No other changes to this function.

---

### 2. `src/components/canvas/VideoNode.tsx`

**Add YouTube detection** in the `transcribe()` function alongside the existing Instagram check:

```ts
const isIg = /instagram\.com/.test(urlInput);
const isYt = /youtube\.com|youtu\.be/.test(urlInput);
```

**Skip video download for YouTube:**

```ts
// Before
if (!isIg) downloadVideoFile(urlInput.trim());

// After
if (!isIg && !isYt) downloadVideoFile(urlInput.trim());
```

**Capture title from response:**

```ts
// Add to state
const [videoTitle, setVideoTitle] = useState<string | null>(d.videoTitle ?? null);

// After transcribe-video resolves
if (json.video_title) {
  setVideoTitle(json.video_title);
  updates.videoTitle = json.video_title;
}
```

**Add `videoTitle` to `VideoData` interface:**

```ts
interface VideoData {
  ...
  videoTitle?: string | null;
}
```

**UI — YouTube mode display:**
When `isYt` and stage is `transcribed`:
- Show thumbnail image (already works — thumbnail_url is returned by existing code)
- Show title below thumbnail: `<p className="text-sm font-medium text-foreground/90 truncate">{videoTitle}</p>`
- Hide "Analyze Structure" button: condition on `!isYt` (or check if URL is YouTube from stored `url` field after load)
- Hide "Visual Analysis" button: same condition
- Transcript accordion still shown as normal

**Persist `isYt` across reloads:**
Derive it from the stored URL: `const isYt = /youtube\.com|youtu\.be/.test(d.url || urlInput);`

---

## Data Flow

```
User pastes YouTube URL
  → VideoNode detects isYt
  → Calls transcribe-video (existing function)
    → Apify youtube-scraper → returns { subtitles, title, ... }
    → extractYouTubeTranscript returns { transcript, title }
    → Thumbnail constructed from video ID
  → Response: { transcription, thumbnail_url, video_title }
  → VideoNode: sets transcript, thumbnail, title
  → Displays: thumbnail → title → transcript accordion
  → Hides: playback, Analyze Structure, Visual Analysis
```

## Error Handling

- If Apify returns no captions (video has no auto-generated subtitles): `transcribe-video` already falls back to yt-dlp audio extraction + Whisper. For YouTube mode we still display whatever comes back.
- If thumbnail 404s (maxresdefault unavailable): existing fallback to `hqdefault.jpg` already handles this.
- Title missing: render nothing (title display is conditional).

## What's Not Changing

- The Instagram video path is untouched
- The `fetch-thumbnail` separate function is not called for YouTube (thumbnail comes from `transcribe-video` response as it does today)
- No credit cost change (YouTube transcript via Apify was already free in this path)
- No new node type, no toolbar change, no DB schema change
