# Vault Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Vault page to use a Pinterest-style masonry grid with real auto-extracted thumbnails, and fix thumbnail extraction in the transcribe-video edge function to return thumbnail_url for YouTube and Instagram at zero extra API cost.

**Architecture:** Two independent changes: (1) `transcribe-video` edge function refactored to also return `thumbnail_url` by extracting Instagram `displayUrl` from the existing Apify response and constructing YouTube thumbnail URLs from the video ID; (2) `Vault.tsx` updated to consume `thumbnail_url` from the transcribe response, switch from grid to CSS columns masonry layout, and redesign the card component with natural-height thumbnails and source/platform badges.

**Tech Stack:** Deno (Supabase Edge Functions), React + TypeScript, Tailwind CSS, Radix UI Dialog

---

## Chunk 1: transcribe-video Edge Function

### Task 1: Refactor `extractInstagramVideoUrl` to also return `displayUrl`

**Files:**
- Modify: `supabase/functions/transcribe-video/index.ts:74-115`

- [ ] **Step 1: Change return type of `extractInstagramVideoUrl`**

Replace the function signature and return statement so it returns `{ videoUrl: string | null, displayUrl: string | null }` instead of `string | null`.

In `supabase/functions/transcribe-video/index.ts`, replace lines 74–115:

```typescript
// ─── Instagram: get video download URL + thumbnail via Apify ───
async function extractInstagramVideoUrl(reelUrl: string): Promise<{ videoUrl: string | null; displayUrl: string | null }> {
  const igMatch = /instagram\.com\/(reel|reels|p)\/([A-Za-z0-9_-]+)/.test(reelUrl);
  if (!igMatch) return { videoUrl: null, displayUrl: null };

  console.log("Extracting Instagram reel via Apify scraper:", reelUrl);

  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${APIFY_IG_REEL_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60`;
    const res = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: [reelUrl],
        resultsLimit: 1,
      }),
    });

    if (!res.ok) {
      console.error("Apify IG error:", res.status, await res.text().catch(() => ""));
      return { videoUrl: null, displayUrl: null };
    }

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      console.log("Apify IG returned no items");
      return { videoUrl: null, displayUrl: null };
    }

    const item = items[0];
    const videoUrl = item.videoUrl || item.video_url || item.videoPlaybackUrl || null;
    const displayUrl = item.displayUrl || item.display_url || item.thumbnailUrl || item.thumbnail_url || item.images?.[0] || null;

    if (videoUrl) {
      console.log("Instagram video URL extracted via Apify:", videoUrl.slice(0, 80) + "...");
    } else {
      console.log("No videoUrl in Apify IG response, keys:", Object.keys(item).join(", "));
    }
    if (displayUrl) {
      console.log("Instagram displayUrl extracted:", displayUrl.slice(0, 80) + "...");
    }

    return { videoUrl, displayUrl };
  } catch (e) {
    console.error("Apify IG reel scraper error:", e);
    return { videoUrl: null, displayUrl: null };
  }
}
```

- [ ] **Step 2: Update the call site of `extractInstagramVideoUrl` to destructure the new return shape**

In `supabase/functions/transcribe-video/index.ts`, the Instagram block currently reads (around line 252–259):

```typescript
    let audioSourceUrl: string | null = null;
    if (!transcription && isInstagram) {
      console.log("Instagram URL detected — using Apify reel scraper to get video URL...");
      audioSourceUrl = await extractInstagramVideoUrl(url);
      if (!audioSourceUrl) {
        throw new Error("Could not extract Instagram video — Apify returned no results. Please try again or use a different URL.");
      }
    }
```

Replace with:

```typescript
    let audioSourceUrl: string | null = null;
    let igDisplayUrl: string | null = null;
    if (!transcription && isInstagram) {
      console.log("Instagram URL detected — using Apify reel scraper to get video URL...");
      const igResult = await extractInstagramVideoUrl(url);
      audioSourceUrl = igResult.videoUrl;
      igDisplayUrl = igResult.displayUrl;
      if (!audioSourceUrl) {
        throw new Error("Could not extract Instagram video — Apify returned no results. Please try again or use a different URL.");
      }
    }
```

- [ ] **Step 3: Add YouTube thumbnail construction block (after the `isYouTube` transcript block)**

After the existing YouTube transcript block (around line 249, after `}` closing the `if (isYouTube)` block), add:

```typescript
    // ─── YouTube: construct thumbnail URL from video ID ───
    let youtubeThumbnailUrl: string | null = null;
    if (isYouTube) {
      const ytIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytIdMatch) {
        const videoId = ytIdMatch[1];
        const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
          const headRes = await fetch(maxresUrl, { method: "HEAD" });
          const contentLength = headRes.headers.get("content-length");
          if (headRes.ok && contentLength !== "1403") {
            youtubeThumbnailUrl = maxresUrl;
            console.log("YouTube maxresdefault thumbnail available:", videoId);
          } else {
            youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            console.log("YouTube using hqdefault fallback:", videoId);
          }
        } catch {
          youtubeThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          console.log("YouTube HEAD failed, using hqdefault fallback:", videoId);
        }
      }
    }
```

- [ ] **Step 4: Add Instagram base64 thumbnail conversion block (after the Instagram block)**

After the Instagram block (after `igDisplayUrl` is set), add a conversion block. Place this just before the `// ─── Extract audio` comment block:

```typescript
    // ─── Instagram: convert displayUrl to base64 data URI (CORS workaround) ───
    let igThumbnailUrl: string | null = null;
    if (igDisplayUrl) {
      try {
        const imgRes = await fetch(igDisplayUrl);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          igThumbnailUrl = `data:${contentType};base64,${base64}`;
          console.log("Instagram thumbnail converted to base64 data URI, length:", igThumbnailUrl.length);
        }
      } catch (e) {
        console.log("Instagram thumbnail base64 conversion failed:", e);
      }
    }
```

- [ ] **Step 5: Update the final response to include `thumbnail_url`**

At line 348, the current response is:

```typescript
    return new Response(JSON.stringify({ transcription, videoUrl: audioSourceUrl || null }), {
```

Replace with:

```typescript
    const thumbnailUrl = youtubeThumbnailUrl || igThumbnailUrl || null;
    return new Response(JSON.stringify({ transcription, videoUrl: audioSourceUrl || null, thumbnail_url: thumbnailUrl }), {
```

- [ ] **Step 6: Deploy the edge function**

```bash
cd /Users/admin/Desktop/connectacreators
npx supabase functions deploy transcribe-video
```

Expected output: `Deployed Function transcribe-video` with no errors.

---

## Chunk 2: Vault.tsx — handleCreate + masonry layout + card redesign

### Task 2: Update `handleCreate` to use `transcribedThumb` from transcribe response

**Files:**
- Modify: `src/pages/Vault.tsx:100-189`

- [ ] **Step 1: Destructure `thumbnail_url` from transcribe response**

At line 124, change:

```typescript
      const { transcription } = await transcribeRes.json();
```

to:

```typescript
      const { transcription, thumbnail_url: transcribedThumb } = await transcribeRes.json();
```

- [ ] **Step 2: Use `transcribedThumb` in thumbnail priority logic**

At lines 143–163, the current thumbnail logic is:

```typescript
      // Step 3: Auto-fetch thumbnail via edge function
      let thumbnailUrl = newThumbnailUrl.trim() || null;
      if (!thumbnailUrl) {
        try {
          setFetchingThumb(true);
          toast.info(tr({ en: "Fetching thumbnail...", es: "Obteniendo miniatura..." }, language));
          const thumbRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-thumbnail`,
            { method: "POST", headers, body: JSON.stringify({ url: newUrl.trim() }) }
          );
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            if (thumbData.thumbnail_url) {
              thumbnailUrl = thumbData.thumbnail_url;
              toast.success(tr({ en: "Thumbnail fetched!", es: "¡Miniatura obtenida!" }, language));
            }
          }
        } catch { /* ignore */ } finally {
          setFetchingThumb(false);
        }
      }
```

Replace with:

```typescript
      // Step 3: Determine thumbnail — priority: manual input > transcribe response > fetch-thumbnail fallback
      let thumbnailUrl = newThumbnailUrl.trim() || null;
      if (!thumbnailUrl && transcribedThumb) {
        thumbnailUrl = transcribedThumb;
      }
      if (!thumbnailUrl) {
        try {
          setFetchingThumb(true);
          toast.info(tr({ en: "Fetching thumbnail...", es: "Obteniendo miniatura..." }, language));
          const thumbRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-thumbnail`,
            { method: "POST", headers, body: JSON.stringify({ url: newUrl.trim() }) }
          );
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            if (thumbData.thumbnail_url) {
              thumbnailUrl = thumbData.thumbnail_url;
              toast.success(tr({ en: "Thumbnail fetched!", es: "¡Miniatura obtenida!" }, language));
            }
          }
        } catch { /* ignore */ } finally {
          setFetchingThumb(false);
        }
      }
```

### Task 3: Widen container + switch to masonry layout

**Files:**
- Modify: `src/pages/Vault.tsx:213, 259, 619`

- [ ] **Step 1: Widen the staff layout container (line 213)**

Change:

```typescript
          <div className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
```

to:

```typescript
          <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
```

- [ ] **Step 2: Widen the regular user layout container (line 259)**

Change:

```typescript
      <div className="container mx-auto px-3 sm:px-6 py-6 max-w-4xl">
```

to:

```typescript
      <div className="container mx-auto px-3 sm:px-6 py-6 max-w-6xl">
```

- [ ] **Step 3: Replace the grid with CSS columns masonry**

At line 619, change:

```typescript
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {templates.map((tpl) => (
                <VaultTemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  language={language}
                  handleDelete={handleDelete}
                  clientName={isMasterMode ? tpl.clients?.name : undefined}
                />
              ))}
            </div>
```

to:

```typescript
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="break-inside-avoid mb-3">
                  <VaultTemplateCard
                    tpl={tpl}
                    language={language}
                    handleDelete={handleDelete}
                    clientName={isMasterMode ? tpl.clients?.name : undefined}
                  />
                </div>
              ))}
            </div>
```

### Task 4: Redesign `VaultTemplateCard` — thumbnail zone

**Files:**
- Modify: `src/pages/Vault.tsx:639-848`

- [ ] **Step 1: Add TikTok detection to `sourceInfo` useMemo (lines 654–661)**

Change:

```typescript
  const sourceInfo = useMemo(() => {
    const url = tpl.source_url || "";
    const igMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (igMatch) return { type: "instagram" as const, id: igMatch[1] };
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: "youtube" as const, id: ytMatch[1] };
    return { type: "other" as const, id: null };
  }, [tpl.source_url]);
```

to:

```typescript
  const sourceInfo = useMemo(() => {
    const url = tpl.source_url || "";
    const igMatch = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (igMatch) return { type: "instagram" as const, id: igMatch[1], label: "Instagram" };
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return { type: "youtube" as const, id: ytMatch[1], label: "YouTube" };
    if (url.includes("tiktok.com")) return { type: "tiktok" as const, id: null, label: "TikTok" };
    return { type: "other" as const, id: null, label: null };
  }, [tpl.source_url]);
```

- [ ] **Step 2: Replace the thumbnail zone (lines 686–744)**

The entire `{/* Thumbnail */}` block from `<div className="relative aspect-[9/16]...` to the closing `</div>` before `{/* Content */}` needs to be replaced.

Replace the thumbnail block (lines 686–744):

```tsx
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] max-h-[200px] bg-gradient-to-br from-muted/40 to-muted/20 overflow-hidden flex-shrink-0">
        {sourceInfo.type === "instagram" ? (
          <div className="absolute inset-0 pointer-events-none" style={{ overflow: "hidden" }}>
            <iframe
              src={`https://www.instagram.com/p/${sourceInfo.id}/embed/`}
              style={{
                width: "100%",
                height: "400px",
                border: "none",
                transform: "scale(1.35) translateY(-22%)",
                transformOrigin: "top center",
                pointerEvents: "none",
              }}
              scrolling="no"
              loading="lazy"
            />
          </div>
        ) : sourceInfo.type === "youtube" ? (
          <img
            src={`https://img.youtube.com/vi/${sourceInfo.id}/maxresdefault.jpg`}
            alt={tpl.name}
            className="w-full h-full object-cover object-center scale-110"
            loading="lazy"
          />
        ) : tpl.thumbnail_url ? (
          <img
            src={tpl.thumbnail_url}
            alt={tpl.name}
            className="w-full h-full object-cover object-center scale-110"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-primary/5">
            <Archive className="w-8 h-8 text-primary/30" />
            <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Template</span>
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* Line count badge */}
        {lines.length > 0 && (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <FileText className="w-2.5 h-2.5" />
            {lines.length}
          </div>
        )}

        {/* Delete button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-white hover:text-red-400 bg-black/50 hover:bg-black/70 backdrop-blur-sm h-7 w-7 p-0 rounded-full transition-all"
          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
```

with:

```tsx
      {/* Thumbnail */}
      <div className="relative bg-gradient-to-br from-muted/40 to-muted/20 overflow-hidden flex-shrink-0">
        {tpl.thumbnail_url ? (
          <img
            src={tpl.thumbnail_url}
            alt={tpl.name}
            className="w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[9/16] max-h-[200px] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 to-primary/5">
            <Archive className="w-8 h-8 text-primary/30" />
            <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wider">Template</span>
          </div>
        )}

        {/* Gradient overlay at bottom of thumbnail */}
        <div
          className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
          style={{ background: "linear-gradient(transparent, rgba(6,9,12,0.85))" }}
        />

        {/* Source platform badge — top left */}
        {sourceInfo.label && (
          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md rounded-md px-1.5 py-0.5 text-[9px] text-slate-400">
            {sourceInfo.label}
          </div>
        )}

        {/* Line count badge — bottom right */}
        {lines.length > 0 && (
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <FileText className="w-2.5 h-2.5" />
            {lines.length} lines
          </div>
        )}

        {/* Delete button — top right */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-white hover:text-red-400 bg-black/50 hover:bg-black/70 backdrop-blur-sm h-7 w-7 p-0 rounded-full transition-all"
          onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
```

> Note: the source badge and delete button both use `top-2 right-2` — delete overlaps source badge only when hovering. The source badge uses `left-2` so they don't conflict. If this causes visual issues, move delete to `top-2 right-2` and source badge stays `top-2 left-2` (already correct above).

- [ ] **Step 3: Build and verify**

```bash
cd /Users/admin/Desktop/connectacreators
npm run build
```

Expected: Build completes with no TypeScript errors. Check for any type errors on `sourceInfo.label` (added field) or `igDisplayUrl`/`youtubeThumbnailUrl` (new variables in edge function).

- [ ] **Step 4: Deploy frontend to VPS**

```bash
rsync -avz --delete dist/ root@72.62.200.145:/var/www/connectacreators/
```

Then reload nginx on VPS:

```bash
ssh root@72.62.200.145 "nginx -s reload"
```

---

## Verification Checklist

After deployment:

- [ ] Add YouTube URL → thumbnail appears on card automatically (no manual fetch)
- [ ] Add YouTube URL for video without HD → hqdefault fallback renders (not broken image)
- [ ] Add Instagram URL → thumbnail appears automatically on card (no CORS error in console)
- [ ] Add TikTok URL → thumbnail appears via existing oEmbed path
- [ ] Cards display in masonry layout with variable heights (portrait thumbnails taller than landscape)
- [ ] Source badge shows "TikTok" / "Instagram" / "YouTube" on each card (top-left)
- [ ] Line count badge shows "N lines" (bottom-right)
- [ ] Hook/Body/CTA color coding correct on card preview
- [ ] Delete button appears on hover (top-right), click deletes template
- [ ] Click card → opens full script modal
- [ ] Master vault filter chips work for admin
- [ ] Cards with no thumbnail → gradient placeholder with Archive icon renders
- [ ] Manual "Fetch" button in create form still works
