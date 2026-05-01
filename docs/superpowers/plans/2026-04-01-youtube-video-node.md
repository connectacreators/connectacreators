# YouTube Video Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a YouTube URL into the existing VideoNode and get transcript + thumbnail with no playback or visual analysis.

**Architecture:** Two file changes. (1) `transcribe-video` edge function already handles YouTube via Apify — add `title` and Apify's `thumbnailUrl` to the response. (2) `VideoNode.tsx` detects YouTube URLs, skips video download + analysis buttons, shows title below thumbnail.

**Tech Stack:** Deno (Supabase edge function), React/TypeScript (VideoNode), Apify `streamers~youtube-scraper`

---

### Task 1: Update `extractYouTubeTranscript` to return title + thumbnail

**Files:**
- Modify: `supabase/functions/transcribe-video/index.ts:79-131`

The Apify `streamers~youtube-scraper` actor already returns `item.title` and `item.thumbnailUrl` alongside subtitles. We just aren't capturing them. Change the function to return all three.

- [ ] **Step 1: Update the function signature and return type**

In `supabase/functions/transcribe-video/index.ts`, find the `extractYouTubeTranscript` function (line 80). Replace the entire function with:

```typescript
// ─── YouTube: extract transcript from captions ───
async function extractYouTubeTranscript(videoUrl: string): Promise<{ transcript: string | null; title: string | null; thumbnailUrl: string | null }> {
  const ytMatch = videoUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (!ytMatch) return { transcript: null, title: null, thumbnailUrl: null };

  console.log("Extracting YouTube transcript via Apify for:", ytMatch[1]);

  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_YT_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=50`;
    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: videoUrl }],
        maxResults: 1,
        downloadSubtitles: true,
        subtitlesLanguage: "en",
        subtitlesFormat: "plaintext",
      }),
    });

    if (!res.ok) {
      console.error("Apify YouTube error:", res.status, await res.text().catch(() => ""));
      return { transcript: null, title: null, thumbnailUrl: null };
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.log("Apify returned no items");
      return { transcript: null, title: null, thumbnailUrl: null };
    }

    const item = items[0];
    const title: string | null = item.title ?? null;
    const thumbnailUrl: string | null = item.thumbnailUrl ?? null;
    const subtitles = item.subtitles;

    if (Array.isArray(subtitles) && subtitles.length > 0) {
      const enSub = subtitles.find((s: any) => s.language === "en") || subtitles[0];
      if (enSub?.plaintext) {
        const transcript = enSub.plaintext.replace(/\n/g, " ").trim();
        console.log(`YouTube transcript extracted (${enSub.language}): ${transcript.length} chars`);
        return { transcript, title, thumbnailUrl };
      }
    }

    console.log("No subtitles in Apify response");
    return { transcript: null, title, thumbnailUrl };
  } catch (e) {
    console.error("Apify YouTube transcript error:", e);
    return { transcript: null, title: null, thumbnailUrl: null };
  }
}
```

- [ ] **Step 2: Update the call site in the main handler**

Find the section in the main handler that calls `extractYouTubeTranscript` (around line 256–264). It currently reads:

```typescript
    // ─── YouTube: try caption extraction first (fast, free) ───
    if (isYouTube) {
      console.log("YouTube URL detected — trying Apify transcript extraction...");
      transcription = await extractYouTubeTranscript(url);
      if (transcription) {
        console.log("YouTube transcript extracted successfully, length:", transcription.length);
      } else {
        console.log("No YouTube transcript available, falling back to audio extraction...");
      }
    }
```

Replace with:

```typescript
    // ─── YouTube: try caption extraction first (fast, free) ───
    let ytTitle: string | null = null;
    let ytApifyThumbnail: string | null = null;
    if (isYouTube) {
      console.log("YouTube URL detected — trying Apify transcript extraction...");
      const ytResult = await extractYouTubeTranscript(url);
      transcription = ytResult.transcript;
      ytTitle = ytResult.title;
      ytApifyThumbnail = ytResult.thumbnailUrl;
      if (transcription) {
        console.log("YouTube transcript extracted successfully, length:", transcription.length);
      } else {
        console.log("No YouTube transcript available, falling back to audio extraction...");
      }
    }
```

- [ ] **Step 3: Use Apify thumbnail URL and update the return value**

Find the YouTube thumbnail construction block (around line 266–283). It currently builds the URL from the video ID:

```typescript
    // ─── YouTube: construct thumbnail URL ───
    let youtubeThumbnailUrl: string | null = null;
    if (isYouTube) {
      const ytIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
```

Replace the entire YouTube thumbnail block with:

```typescript
    // ─── YouTube: use Apify thumbnail (already fetched above), fall back to CDN URL ───
    let youtubeThumbnailUrl: string | null = null;
    if (isYouTube) {
      if (ytApifyThumbnail) {
        youtubeThumbnailUrl = ytApifyThumbnail;
        console.log("Using Apify thumbnail for YouTube:", youtubeThumbnailUrl);
      } else {
        const ytIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytIdMatch) {
          const videoId = ytIdMatch[1];
          const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          try {
            const thumbCheck = await fetch(maxresUrl, { method: "HEAD" });
            youtubeThumbnailUrl = thumbCheck.ok
              ? maxresUrl
              : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          } catch {
            youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }
        }
      }
    }
```

- [ ] **Step 4: Add `video_title` to the final response**

Find the return statement near the bottom of the main handler (around line 379):

```typescript
    return new Response(JSON.stringify({ transcription, videoUrl: finalVideoUrl, thumbnail_url: thumbnailUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

Replace with:

```typescript
    return new Response(JSON.stringify({
      transcription,
      videoUrl: finalVideoUrl,
      thumbnail_url: thumbnailUrl,
      video_title: ytTitle ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

- [ ] **Step 5: Deploy the updated edge function to Supabase**

Run from the project root on the VPS (or locally if Supabase CLI is set up):

```bash
npx supabase functions deploy transcribe-video --project-ref hxojqrilwhhrvloiwmfo
```

Expected output: `Deployed Function transcribe-video`

- [ ] **Step 6: Verify via curl**

```bash
curl -s -X POST "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/transcribe-video" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0MjY4MiwiZXhwIjoyMDg3MjE4NjgyfQ.ksq6adDCNE0HVtw-swYm60vJWQ2CWzMbDBvAIw_V010" \
  -d '{"url":"https://www.youtube.com/watch?v=qiogHNvz4kw"}' \
  --max-time 120 | jq '{video_title, thumbnail_url, transcript_preview: (.transcription | .[0:200])}'
```

Expected output:
```json
{
  "video_title": "Creatine: Dose, Benefits & Safety | Dr. Rhonda Patrick & Dr. Andrew Huberman",
  "thumbnail_url": "https://i.ytimg.com/vi/qiogHNvz4kw/maxresdefault.jpg",
  "transcript_preview": "I want to ask you about creatine..."
}
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/transcribe-video/index.ts
git commit -m "feat(transcribe-video): return video_title and Apify thumbnailUrl for YouTube videos"
```

---

### Task 2: Update VideoNode to handle YouTube mode

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx`

Add `isYt` detection throughout: skip video download, skip analysis buttons, show title, no play overlay.

- [ ] **Step 1: Add `videoTitle` to the `VideoData` interface**

Find the `VideoData` interface (around line 44). Add `videoTitle` after `thumbnailUrl`:

```typescript
interface VideoData {
  url?: string;
  transcription?: string;
  structure?: VideoStructure;
  videoAnalysis?: VideoAnalysisData;
  caption?: string;
  channel_username?: string;
  thumbnailUrl?: string | null;
  videoTitle?: string | null;        // ← add this line
  videoFileUrl?: string | null;
  cdnVideoUrl?: string | null;
  selectedSections?: string[];
  clientId?: string | null;
  onUpdate?: (updates: Partial<VideoData>) => void;
  onDelete?: () => void;
  authToken?: string | null;
}
```

- [ ] **Step 2: Add `videoTitle` state and `isYt` derivation**

Find the state declarations block at the top of `VideoNode` (around line 274). After the `videoFileUrl` state, add:

```typescript
  const [videoTitle, setVideoTitle] = useState<string | null>(d.videoTitle ?? null);
```

Find the `isVertical` line (around line 626):

```typescript
  const isVertical = urlInput.includes("instagram.com") || urlInput.includes("tiktok.com");
```

Add `isYt` on the line immediately before it:

```typescript
  const isYt = /youtube\.com|youtu\.be/.test(d.url || urlInput);
  const isVertical = urlInput.includes("instagram.com") || urlInput.includes("tiktok.com");
```

- [ ] **Step 3: Skip video download and parallel thumbnail fetch for YouTube**

In the `transcribe()` function, find (around line 307):

```typescript
      // Download video MP4 — fire-and-forget for playback (non-IG only; IG gets CDN URL from transcribe response)
      const isIg = /instagram\.com/.test(urlInput);
      if (!isIg) downloadVideoFile(urlInput.trim());

      // Thumbnail — fire-and-forget with visible status
      const thumbUrl = `${SUPABASE_URL}/functions/v1/fetch-thumbnail`;
```

Replace with:

```typescript
      // Download video MP4 — fire-and-forget for playback (non-IG and non-YT only)
      const isIg = /instagram\.com/.test(urlInput);
      const isYtUrl = /youtube\.com|youtu\.be/.test(urlInput);
      if (!isIg && !isYtUrl) downloadVideoFile(urlInput.trim());

      // Thumbnail — fire-and-forget for non-YouTube (YouTube thumbnail comes back in transcribe-video response)
      const thumbUrl = `${SUPABASE_URL}/functions/v1/fetch-thumbnail`;
      const skipThumbFetch = isYtUrl;
```

Then find the block that fires the `fetch-thumbnail` call:

```typescript
      fetch(thumbUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: urlInput.trim() }),
      }).then(r => {
```

Wrap the entire `fetch(thumbUrl, ...)` call (from `fetch(thumbUrl,` to the closing `.catch(...)`) in a condition:

```typescript
      if (!skipThumbFetch) {
        fetch(thumbUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: urlInput.trim() }),
        }).then(r => {
          console.log("[VideoNode] Thumbnail response status:", r.status);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }).then(j => {
          console.log("[VideoNode] Thumbnail result:", j.thumbnail_url ? `got ${j.thumbnail_url.length} chars` : "null");
          if (j.thumbnail_url) {
            const proxied = proxyInstagramUrl(j.thumbnail_url);
            console.log("[VideoNode] Thumbnail proxied:", proxied.slice(0, 100));
            setThumbnailUrl(proxied);
            setThumbStatus("done");
            d.onUpdate?.({ thumbnailUrl: proxied });
          } else {
            setThumbStatus("error");
            setThumbError(j.error || "No thumbnail returned");
          }
        }).catch(err => {
          console.error("[VideoNode] Thumbnail fetch failed:", err);
          setThumbStatus("error");
          setThumbError(err.message || "Fetch failed");
        });
      }
```

- [ ] **Step 4: Capture `video_title` and `thumbnail_url` from the transcribe response**

In the `transcribe()` function, find the block that processes the transcribe-video response (around line 355):

```typescript
      const updates: Partial<VideoData> = { url: urlInput.trim(), transcription: json.transcription };
```

Replace with:

```typescript
      const updates: Partial<VideoData> = { url: urlInput.trim(), transcription: json.transcription };

      // Capture title for YouTube
      if (json.video_title) {
        setVideoTitle(json.video_title);
        updates.videoTitle = json.video_title;
      }
```

Then find where the thumbnail from the transcribe response is set (around line 362–370):

```typescript
      // Use thumbnail from transcription response if fetch-thumbnail hasn't resolved yet
      if (json.thumbnail_url && !thumbnailUrl) {
        const proxied = proxyInstagramUrl(json.thumbnail_url);
```

This block already handles setting the thumbnail — YouTube thumbnail URLs are public `i.ytimg.com` URLs so `proxyInstagramUrl()` will pass them through unchanged (it only proxies `cdninstagram.com` / `fbcdn.net`). No change needed here.

- [ ] **Step 5: Add `videoTitle` to the `reset()` function**

Find the `reset()` function (around line 554):

```typescript
  const reset = () => {
    setStage("idle");
    setThumbnailUrl(null);
    setVideoFileUrl(null);
    setPlayingVideo(false);
    setShowTranscript(false);
    setShowBreakdown(false);
    setSelectedSections(["hook", "body", "cta"]);
    setStructureProgress("idle");
    setVisualProgress("idle");
    d.onUpdate?.({ url: undefined, transcription: undefined, structure: undefined, videoAnalysis: undefined, thumbnailUrl: undefined, videoFileUrl: undefined, selectedSections: undefined });
  };
```

Replace with:

```typescript
  const reset = () => {
    setStage("idle");
    setThumbnailUrl(null);
    setVideoFileUrl(null);
    setVideoTitle(null);
    setPlayingVideo(false);
    setShowTranscript(false);
    setShowBreakdown(false);
    setSelectedSections(["hook", "body", "cta"]);
    setStructureProgress("idle");
    setVisualProgress("idle");
    d.onUpdate?.({ url: undefined, transcription: undefined, structure: undefined, videoAnalysis: undefined, thumbnailUrl: undefined, videoTitle: undefined, videoFileUrl: undefined, selectedSections: undefined });
  };
```

- [ ] **Step 6: Show video title below thumbnail**

Find the thumbnail image element (around line 714):

```typescript
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full object-cover"
                  style={{ aspectRatio }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
```

After the closing `/>` of the `<img>`, add the title display inside the same `<div className="relative group ...">` wrapper, after the play overlay div:

```typescript
                {/* Video title — YouTube only */}
                {isYt && videoTitle && (
                  <div className="px-3 py-2 bg-black/60 backdrop-blur-sm">
                    <p className="text-[11px] font-medium text-white/90 leading-snug line-clamp-2">{videoTitle}</p>
                  </div>
                )}
```

Place this block right after the closing `</div>` of the play overlay (the `{d.url && (...)}` block), still inside the outer `<div className="relative group ...">`.

- [ ] **Step 7: Disable play-on-click for YouTube thumbnails**

Find the thumbnail wrapper div (around line 706):

```typescript
              <div className="relative group cursor-pointer" onClick={() => {
                if (videoFileUrl) { setPlayingVideo(true); return; }
                if (downloadingVideo) return;
                // On-demand download for nodes without a stored videoFileUrl — auto-play when ready
                if (d.url) downloadVideoFile(d.cdnVideoUrl || d.url, true);
              }}>
```

Replace with:

```typescript
              <div className={`relative group ${isYt ? "cursor-default" : "cursor-pointer"}`} onClick={() => {
                if (isYt) return;  // YouTube has no playback
                if (videoFileUrl) { setPlayingVideo(true); return; }
                if (downloadingVideo) return;
                if (d.url) downloadVideoFile(d.cdnVideoUrl || d.url, true);
              }}>
```

- [ ] **Step 8: Hide play button overlay for YouTube**

Find the play button overlay inside the thumbnail hover area (around line 722):

```typescript
                {/* Play button overlay — always visible when there's a URL */}
                {d.url && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
```

Add `&& !isYt` to the condition:

```typescript
                {/* Play button overlay — hidden for YouTube (no playback) */}
                {d.url && !isYt && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
```

- [ ] **Step 9: Hide "Generate Visual Breakdown" button for YouTube**

Find the breakdown button block (around line 820):

```typescript
            {/* ── "Generate Visual Breakdown" button ── */}
            {hasTranscript && !hasStructure && (
```

Add `&& !isYt`:

```typescript
            {/* ── "Generate Visual Breakdown" button — hidden for YouTube ── */}
            {hasTranscript && !hasStructure && !isYt && (
```

- [ ] **Step 10: Update the idle state hint text**

Find (around line 676):

```typescript
            <p className="text-[10px] text-muted-foreground px-0.5">Instagram, TikTok, YouTube — transcribes audio automatically.</p>
```

Replace with:

```typescript
            <p className="text-[10px] text-muted-foreground px-0.5">Instagram, TikTok, YouTube — paste a URL to get transcript.</p>
```

- [ ] **Step 11: Commit the frontend changes**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "feat(VideoNode): YouTube mode — transcript + thumbnail, no playback or visual analysis"
```

---

### Task 3: Build and deploy to VPS

- [ ] **Step 1: SSH into VPS and pull latest / rebuild**

```bash
ssh root@72.62.200.145
cd /var/www/connectacreators
git pull origin main
npm run build
```

Expected: build completes with no errors, output in `dist/`.

- [ ] **Step 2: Reload nginx**

```bash
nginx -s reload
```

- [ ] **Step 3: Smoke test in browser**

1. Open `https://connectacreators.com` and navigate to Super Planning Canvas
2. Add a Video Reference node
3. Paste `https://www.youtube.com/watch?v=qiogHNvz4kw` and press Go
4. Verify:
   - Loading spinner shows "Transcribing..."
   - Thumbnail appears: Rhonda Patrick / Andrew Huberman image
   - Title appears below thumbnail: "Creatine: Dose, Benefits & Safety | Dr. Rhonda Patrick & Dr. Andrew Huberman"
   - "Transcript" accordion is present and expandable
   - "Generate Visual Breakdown" button is **not** shown
   - Clicking the thumbnail does **nothing** (no play attempt)
   - "reset" link clears everything back to URL input

- [ ] **Step 4: Test reset and re-paste**

Click "reset", paste the same URL again, verify it works a second time cleanly.

- [ ] **Step 5: Verify Instagram still works**

Paste an Instagram reel URL, verify it still transcribes + shows play button as before (regression check).
