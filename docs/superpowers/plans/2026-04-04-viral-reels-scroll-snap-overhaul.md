# Viral Reels Scroll-Snap Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ViralReelFeed from JS-controlled translateY positioning to native CSS scroll-snap, reduce DOM from 1000+ cards to ~7 virtualized nodes, render 3 video elements (prev/active/next) for instant transitions, add visible error/retry UI, and replace the 400ms setTimeout retry loop with event-driven canplay.

**Architecture:** A single scroll container with `scroll-snap-type: y mandatory` handles all navigation natively (wheel, touch, keyboard). A virtualization layer renders only ~7 cards around the active index, using `IntersectionObserver` to detect which card is snapped. Three `<video>` elements are maintained: previous, active, and next — so the next video is already buffering when the user swipes. Failed videos show a visible retry button instead of being silently skipped.

**Tech Stack:** React 18, TypeScript, CSS scroll-snap, IntersectionObserver API

---

## File Map

| File | Change |
|---|---|
| `src/pages/ViralReelFeed.tsx` | Major rewrite: scroll-snap container, virtualized card window, 3 video elements, error UI, event-driven play |

---

## Task 1 — Replace JS translateY with CSS scroll-snap container

This task swaps the current `translateY` transform-based positioning with native CSS `scroll-snap-type: y mandatory`. This gives us GPU-accelerated scrolling, native momentum on mobile, and eliminates the wheel accumulator / touch handler code.

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

### Current architecture (what we're replacing):
- `colRef` div uses `transform: translateY(-${idx * cardH}px)` to position
- `wrapperRef` has `overflow: hidden; touch-action: none`
- Custom `onWheel` handler with 150px threshold + 1200ms cooldown
- Custom `onTouchStart`/`onTouchEnd` with 80px threshold
- `scrollToIdx()` callback sets transform directly
- `ResizeObserver` measures container height into `--card-h` CSS variable
- `.reel-col` has `transition: transform 0.4s cubic-bezier(...)` for animation

### Target architecture:
- `wrapperRef` becomes the scroll-snap container: `overflow-y: scroll; scroll-snap-type: y mandatory; overscroll-behavior-y: contain`
- Each `.reel-card` gets `scroll-snap-align: start; scroll-snap-stop: always`
- No `colRef` needed — cards are direct children of the scroll container
- `IntersectionObserver` (threshold 0.5) detects which card is centered → updates `activeIdx`
- `scrollTo({ top: idx * cardH, behavior: 'smooth' })` for programmatic nav (arrows, platform switch)
- Remove wheel handler, touch handlers, `scrollingRef`, `wheelAccum`, `touchStartY`

- [ ] **Step 1: Update the CSS styles block**

Replace the existing `<style>` block (lines 568-605) with scroll-snap styles:

```tsx
<style>{`
  .reel-snap-container {
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    height: 100%;
  }
  .reel-snap-container::-webkit-scrollbar { display: none; }
  .reel-card {
    scroll-snap-align: start;
    scroll-snap-stop: always;
    height: 100vh;
    height: 100dvh;
    min-height: 100vh;
    min-height: 100dvh;
    position: relative;
    width: 100%;
  }
  /* Desktop: constrain card height to parent, not viewport */
  @media (min-width: 1024px) {
    .reel-snap-container { height: 100%; }
    .reel-card {
      height: var(--card-h, 100%);
      min-height: var(--card-h, 100%);
    }
  }
  .reel-card video {
    opacity: 0;
    transition: opacity 0.4s;
    object-fit: cover;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }
  .reel-card video[data-ready="true"],
  .reel-card iframe[data-ready="true"] { opacity: 1; }
  .reel-card iframe {
    opacity: 1;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }
  @keyframes reelSpin { to { transform: rotate(360deg) } }
  .reel-spin { animation: reelSpin 0.8s linear infinite; }
`}</style>
```

- [ ] **Step 2: Remove old scroll machinery — refs and effects**

Delete or replace the following:

1. Remove `colRef` ref declaration (line 135): `const colRef = useRef<HTMLDivElement>(null);`
2. Remove `scrollingRef` (line 143): `const scrollingRef = useRef(false);`
3. Remove `touchStartY` (line 144): `const touchStartY = useRef(0);`
4. Remove `wheelAccum` (line 145): `const wheelAccum = useRef(0);`
5. Remove `scrollToIdx` callback (lines 266-272)
6. Remove the `useEffect` that calls `scrollToIdx(activeIdx)` (lines 275-277)
7. Remove the entire wheel handler `useEffect` (lines 280-307)
8. Remove the entire touch handler `useEffect` (lines 310-339)
9. Remove the `ResizeObserver` effect that sets `--card-h` (lines 238-255) — but we still need `--card-h` for desktop. Replace with a simpler version:

```tsx
// Measure container height for desktop card sizing
useEffect(() => {
  const wrapper = wrapperRef.current;
  if (!wrapper) return;
  const measure = () => {
    const h = wrapper.clientHeight;
    if (h > 0) wrapper.style.setProperty("--card-h", `${h}px`);
  };
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(wrapper);
  return () => ro.disconnect();
}, []);
```

10. Remove the effect that resets transform on video load (line 534-536):
```tsx
// DELETE THIS:
useEffect(() => {
  if (sortedVideos.length && colRef.current) colRef.current.style.transform = "translateY(0px)";
}, [videos]);
```

- [ ] **Step 3: Add IntersectionObserver to detect active card**

Add a new ref for card DOM elements and an IntersectionObserver effect:

```tsx
const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
const observerRef = useRef<IntersectionObserver | null>(null);

// IntersectionObserver to detect which card is snapped into view
useEffect(() => {
  const wrapper = wrapperRef.current;
  if (!wrapper || !sortedVideos.length) return;

  observerRef.current = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const idx = Number(entry.target.getAttribute("data-idx"));
          if (!isNaN(idx)) setActiveIdx(idx);
        }
      }
    },
    { root: wrapper, threshold: 0.5 }
  );

  cardRefs.current.forEach((el) => observerRef.current!.observe(el));

  return () => observerRef.current?.disconnect();
}, [sortedVideos]);
```

- [ ] **Step 4: Update the scroll container JSX**

Replace the wrapper + column divs (lines 700-707, 867-868) with a single scroll-snap container:

Old:
```tsx
<div ref={wrapperRef} className="reel-col-wrapper w-full lg:w-[380px] bg-black absolute inset-0 mx-auto">
  <div ref={colRef} className="reel-col w-full">
    {sortedVideos.map((v, idx) => { ... })}
  </div>
</div>
```

New:
```tsx
<div
  ref={wrapperRef}
  className="reel-snap-container w-full lg:w-[380px] bg-black absolute inset-0 mx-auto"
>
  {sortedVideos.map((v, idx) => {
    // ... card content (unchanged for now)
    return (
      <div
        key={v.id}
        data-idx={idx}
        ref={(el) => {
          if (el) cardRefs.current.set(idx, el);
          else cardRefs.current.delete(idx);
        }}
        className="reel-card relative w-full overflow-hidden cursor-pointer"
        onClick={() => { if (idx === activeIdx) togglePlayPause(); }}
      >
        {/* ... existing card content unchanged ... */}
      </div>
    );
  })}
</div>
```

- [ ] **Step 5: Update navScroll for programmatic scrolling**

Replace the `navScroll` function (line 540-545) to use `scrollTo` instead of `setActiveIdx`:

```tsx
const navScroll = (dir: number) => {
  const next = activeIdx + dir;
  if (next < 0 || next >= sortedVideos.length) return;
  const card = cardRefs.current.get(next);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};
```

- [ ] **Step 6: Scroll to top on platform change**

After `loadVideos` resets `activeIdx` to 0, the container needs to scroll to top. Add to the effect that watches `videos`:

```tsx
useEffect(() => {
  if (sortedVideos.length && wrapperRef.current) {
    wrapperRef.current.scrollTo({ top: 0, behavior: "instant" });
  }
}, [videos]);
```

- [ ] **Step 7: Test scroll-snap behavior**

Build and deploy, then verify:
- Mobile: swipe up/down snaps cleanly to each card, has native momentum
- Desktop: scroll wheel snaps one card at a time (scroll-snap-stop: always)
- Arrow buttons still work (programmatic scroll)
- Platform tab switch resets to first video
- ActiveIdx updates correctly (check via console log or side panel showing correct video info)

Expected: native scroll feel identical to TikTok/Instagram Reels

- [ ] **Step 8: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "refactor(reels): replace JS translateY with CSS scroll-snap navigation"
```

---

## Task 2 — DOM Virtualization: Render only ~7 cards

Currently ALL sortedVideos (potentially 1000+) are rendered as DOM cards. This task limits rendering to a sliding window of ~7 cards around `activeIdx`, using spacer divs to maintain correct scroll position.

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

### Strategy:
- Render a top spacer div (`height: windowStart * cardH`), ~7 real cards, and a bottom spacer div
- Window: `[activeIdx - 3, activeIdx + 3]` clamped to `[0, sortedVideos.length - 1]`
- The IntersectionObserver from Task 1 only observes cards currently in the DOM
- When `activeIdx` changes, the window shifts and new cards mount/unmount
- Key insight: scroll-snap still works because the spacer div pushes cards to correct positions

- [ ] **Step 1: Add window calculation**

Add a `useMemo` to compute the visible window:

```tsx
const WINDOW_RADIUS = 3; // 3 above + active + 3 below = 7 cards

const { windowStart, windowEnd, windowVideos } = useMemo(() => {
  const start = Math.max(0, activeIdx - WINDOW_RADIUS);
  const end = Math.min(sortedVideos.length - 1, activeIdx + WINDOW_RADIUS);
  return {
    windowStart: start,
    windowEnd: end,
    windowVideos: sortedVideos.slice(start, end + 1),
  };
}, [activeIdx, sortedVideos]);
```

- [ ] **Step 2: Add a ref to track card height**

We need a stable card height for spacer calculation. Add:

```tsx
const [cardHeight, setCardHeight] = useState(0);

// Measure card height from container
useEffect(() => {
  const wrapper = wrapperRef.current;
  if (!wrapper) return;
  const measure = () => {
    const h = wrapper.clientHeight;
    if (h > 0) {
      setCardHeight(h);
      wrapper.style.setProperty("--card-h", `${h}px`);
    }
  };
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(wrapper);
  return () => ro.disconnect();
}, []);
```

(This replaces the simpler ResizeObserver from Task 1 Step 2.)

- [ ] **Step 3: Update the scroll container JSX with spacers + windowed cards**

```tsx
<div
  ref={wrapperRef}
  className="reel-snap-container w-full lg:w-[380px] bg-black absolute inset-0 mx-auto"
>
  {/* Top spacer — pushes windowed cards to correct scroll position */}
  {cardHeight > 0 && windowStart > 0 && (
    <div style={{ height: windowStart * cardHeight, flexShrink: 0 }} />
  )}

  {windowVideos.map((v, i) => {
    const idx = windowStart + i;
    const avatarUrl = avatarMap[v.channel_username];
    const isActive = idx === activeIdx;
    const nearActive = Math.abs(idx - activeIdx) <= 2;

    return (
      <div
        key={v.id}
        data-idx={idx}
        ref={(el) => {
          if (el) cardRefs.current.set(idx, el);
          else cardRefs.current.delete(idx);
        }}
        className="reel-card relative w-full overflow-hidden cursor-pointer"
        onClick={() => { if (isActive) togglePlayPause(); }}
      >
        {/* ... card content (gradient, thumbnail, video, overlays) unchanged ... */}
      </div>
    );
  })}

  {/* Bottom spacer */}
  {cardHeight > 0 && windowEnd < sortedVideos.length - 1 && (
    <div style={{ height: (sortedVideos.length - 1 - windowEnd) * cardHeight, flexShrink: 0 }} />
  )}
</div>
```

- [ ] **Step 4: Re-observe cards when window shifts**

Update the IntersectionObserver effect to re-run when the window changes:

```tsx
useEffect(() => {
  const wrapper = wrapperRef.current;
  if (!wrapper || !sortedVideos.length) return;

  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const idx = Number(entry.target.getAttribute("data-idx"));
          if (!isNaN(idx)) setActiveIdx(idx);
        }
      }
    },
    { root: wrapper, threshold: 0.5 }
  );

  cardRefs.current.forEach((el) => obs.observe(el));

  return () => obs.disconnect();
}, [sortedVideos, windowStart, windowEnd]);
```

- [ ] **Step 5: Update navScroll for virtualized DOM**

Since programmatic nav might scroll to a card that's about to enter the window, we need to update activeIdx first, then scroll after the DOM updates:

```tsx
const navScroll = useCallback((dir: number) => {
  const next = activeIdx + dir;
  if (next < 0 || next >= sortedVideos.length) return;
  setActiveIdx(next);
  // After state update, scroll to new card
  requestAnimationFrame(() => {
    const card = cardRefs.current.get(next);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}, [activeIdx, sortedVideos.length]);
```

- [ ] **Step 6: Test virtualization**

Open DevTools Elements panel, scroll through the feed, and verify:
- Only ~7 `.reel-card` elements exist in DOM at any time
- Spacer divs maintain correct total scroll height
- Scrolling up/down still snaps correctly
- Side panel shows correct video info
- No visual glitches when cards mount/unmount at window edges

- [ ] **Step 7: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "perf(reels): virtualize DOM to ~7 cards with spacer-based windowing"
```

---

## Task 3 — Render 3 video elements (prev/active/next)

Currently only 1 `<video>` element is rendered (for the active card), plus 2 hidden pre-buffer videos in an `sr-only` div. This task renders actual `<video>` elements on the prev, active, and next cards — so the next video is already loaded and playing (muted) when the user swipes.

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

### Strategy:
- Render `<video>` on cards where `Math.abs(idx - activeIdx) <= 1` (3 cards: prev, active, next)
- Only the active card's video is unmuted and playing
- Prev/next videos: `muted`, `preload="auto"`, paused or playing silently
- Remove the hidden `sr-only` pre-buffer div (lines 1021-1038) — the 3-element approach replaces it
- Keep the existing `activeVideoRef` for the active video, add refs for prev/next

- [ ] **Step 1: Remove the sr-only pre-buffer div**

Delete the entire block (lines 1021-1038):

```tsx
// DELETE THIS ENTIRE BLOCK:
{/* Hidden pre-buffer — triggers browser to start fetching next 2 videos */}
<div className="sr-only" aria-hidden="true">
  {[1, 2].map(offset => {
    // ...
  })}
</div>
```

- [ ] **Step 2: Update video rendering condition in card JSX**

Change the video rendering from `isActive` only to `isActive || Math.abs(idx - activeIdx) <= 1`:

```tsx
{/* Video element — render for active + adjacent cards */}
{Math.abs(idx - activeIdx) <= 1 && !failedVideoIds.has(v.id) && (
  (useEmbed && v.platform === "youtube" && isActive) ? (
    // YouTube embed — only for active card
    <iframe ... />
  ) : (
    <video
      ref={isActive ? activeVideoRef : undefined}
      src={urlMap.get(v.id) ?? `${VPS_API}/stream-reel?url=${encodeURIComponent(v.video_url)}`}
      autoPlay={isActive}
      playsInline
      muted={isActive ? muted : true}
      loop
      preload="auto"
      onPlaying={(e) => { e.currentTarget.dataset.ready = "true"; }}
      onCanPlay={(e) => {
        if (isActive && e.currentTarget.paused && !pausedRef.current) {
          e.currentTarget.muted = mutedRef.current;
          e.currentTarget.play().catch(() => {});
        }
      }}
      onError={() => {
        if (!isActive) return; // Don't track errors for pre-buffering videos
        const vid = activeVideoRef.current;
        if (!vid) return;

        if (v.platform === "youtube") {
          setUseEmbed(true);
          return;
        }

        const streamUrl = getStreamUrl(v);
        if (!vid.src.includes('/stream-reel') && !vid.src.includes('/proxy-video')) {
          vid.src = streamUrl;
          vid.load();
          vid.play().catch(() => {});
        } else {
          setFailedVideoIds(prev => {
            const next = new Set([...prev, v.id]);
            failedVideoIdsRef.current = next;
            return next;
          });
        }
      }}
    />
  )
)}
```

- [ ] **Step 3: Pause non-active videos, play active video on index change**

Add an effect that manages play/pause across the 3 video elements:

```tsx
// Manage play state across windowed video elements
useEffect(() => {
  if (!sortedVideos.length) return;

  // Find all video elements in current cards
  cardRefs.current.forEach((cardEl, idx) => {
    const video = cardEl.querySelector("video");
    if (!video) return;

    if (idx === activeIdx) {
      // Active: play unmuted
      video.muted = mutedRef.current;
      if (video.paused && !pausedRef.current) {
        video.play().catch(() => {});
      }
    } else {
      // Adjacent: pause to save bandwidth (preload handles buffering)
      if (!video.paused) video.pause();
      video.muted = true;
    }
  });
}, [activeIdx, paused, sortedVideos]);
```

- [ ] **Step 4: Test 3-video behavior**

Verify:
- Swiping to next video starts playing instantly (no buffering delay)
- Only active video has audio
- Previous video is paused
- DevTools Network tab shows 3 video requests at a time (not 100s)
- YouTube embed still works as fallback for active YouTube videos

- [ ] **Step 5: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "perf(reels): render 3 video elements (prev/active/next) for instant transitions"
```

---

## Task 4 — Event-driven play: Replace 400ms retry loop with canplay

Currently lines 344-364 have a `setTimeout(tryPlay, 400)` retry loop that polls until the video plays. This wastes CPU and is unreliable. Replace with event-driven approach using `canplay` handler (partially exists at line 759).

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

- [ ] **Step 1: Remove the retry loop effect**

Delete the entire effect (lines 344-364):

```tsx
// DELETE THIS ENTIRE EFFECT:
// ── PLAY EFFECT: retry fallback for autoPlay ──
useEffect(() => {
  if (paused || !sortedVideos.length) return;
  let cancelled = false;
  const tryPlay = () => {
    if (cancelled) return;
    const vid = activeVideoRef.current;
    if (!vid || pausedRef.current) return;
    vid.muted = mutedRef.current;
    if (vid.paused) {
      vid.play().then(() => {
        vid.dataset.ready = "true";
      }).catch(() => {
        if (!cancelled) setTimeout(tryPlay, 400);
      });
    }
  };
  const t = setTimeout(tryPlay, 200);
  return () => { cancelled = true; clearTimeout(t); };
}, [activeIdx, paused, videos]);
```

- [ ] **Step 2: Enhance the onCanPlay handler on the video element**

The `onCanPlay` handler (already in Task 3's video element) handles this. Verify it looks like:

```tsx
onCanPlay={(e) => {
  if (isActive && e.currentTarget.paused && !pausedRef.current) {
    e.currentTarget.muted = mutedRef.current;
    e.currentTarget.play().catch(() => {});
  }
}}
```

Also add `onLoadedData` as a backup trigger (some browsers fire loadeddata but not canplay in certain states):

```tsx
onLoadedData={(e) => {
  if (isActive && e.currentTarget.paused && !pausedRef.current) {
    e.currentTarget.muted = mutedRef.current;
    e.currentTarget.play().catch(() => {});
  }
}}
```

- [ ] **Step 3: Test event-driven play**

Verify:
- Videos start playing without any setTimeout polling
- Console shows no 400ms retry messages
- First video on page load starts playing after canplay fires
- Swiping to a new video starts it via the canplay/loadeddata event

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "fix(reels): replace 400ms retry polling with event-driven canplay/loadeddata"
```

---

## Task 5 — Visible error state with retry button for failed videos

Currently failed videos are silently added to `failedVideoIds` and demoted in sort score. Users see a frozen gradient background with no feedback. This task adds a visible error state with a retry button.

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

- [ ] **Step 1: Add error state UI inside the card**

After the video element conditional, add an error state that shows when the video has failed:

```tsx
{/* Error state — retry button for failed videos */}
{failedVideoIds.has(v.id) && isActive && (
  <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-4">
    <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
      <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <p className="text-white/80 text-sm font-medium">Video unavailable</p>
    <div className="flex gap-3">
      <button
        onClick={(e) => {
          e.stopPropagation();
          // Remove from failed set to trigger re-render with video element
          setFailedVideoIds(prev => {
            const next = new Set(prev);
            next.delete(v.id);
            failedVideoIdsRef.current = next;
            return next;
          });
        }}
        className="px-5 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-all"
      >
        Retry
      </button>
      <a
        href={v.video_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="px-5 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/25 transition-all"
      >
        Open Original
      </a>
    </div>
  </div>
)}
```

- [ ] **Step 2: Also show a subtle error indicator for failed non-active cards**

For failed videos that are visible but not active (adjacent in window), show a small icon overlay:

```tsx
{/* Small error badge for non-active failed cards */}
{failedVideoIds.has(v.id) && !isActive && (
  <div className="absolute top-3 right-3 z-[3]">
    <div className="w-8 h-8 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center">
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
      </svg>
    </div>
  </div>
)}
```

- [ ] **Step 3: Test error states**

To test, temporarily force a video to fail by modifying its URL in DevTools, then verify:
- Error UI appears with "Video unavailable" message
- Retry button clears the error and re-attempts loading
- "Open Original" opens the source URL in a new tab
- Adjacent failed cards show the small error badge

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): add visible error/retry UI for failed videos"
```

---

## Task 6 — Final integration, cleanup, and deploy

Bring everything together, remove dead code, and deploy.

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

- [ ] **Step 1: Remove all dead imports and refs**

Verify and remove if unused after the refactor:
- `colRef` — should be removed (replaced by scroll-snap container)
- `scrollingRef` — should be removed (no more wheel cooldown)
- `touchStartY` — should be removed (no more custom touch handling)
- `wheelAccum` — should be removed (no more wheel accumulator)
- Any unused imports (if `scrollToIdx` was a standalone function, remove it)

- [ ] **Step 2: Update the version log**

Change line 99:
```tsx
useEffect(() => { console.log("[ViralReelFeed] v9 — scroll-snap + virtualization + 3-video"); }, []);
```

- [ ] **Step 3: Full smoke test**

Test the following scenarios:
1. **Mobile swipe**: Swipe up/down, verify snap behavior and instant video transitions
2. **Desktop scroll**: Mouse wheel navigates one card at a time
3. **Desktop arrows**: Left nav arrows still work
4. **Platform tabs**: Switching tabs resets to first video
5. **Failed video**: Error UI shows, retry works
6. **YouTube fallback**: YouTube videos fall back to embed
7. **Performance**: Open DevTools Performance tab, scroll through 20 videos — verify no jank, DOM stays at ~7 cards
8. **Side panel**: Desktop info panel shows correct video data as user scrolls
9. **Inspire Script**: Mobile bottom sheet and desktop button still work
10. **First load**: First video autoplays (muted, then unmutes on first tap)

- [ ] **Step 4: Build and deploy to VPS**

```bash
cd /Users/admin/Desktop/connectacreators
npm run build
# SCP to VPS and extract
```

- [ ] **Step 5: Commit final version**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): complete scroll-snap overhaul — virtualization, 3-video, error UI"
```

---

## Summary of changes

| Before | After |
|---|---|
| JS `translateY` positioning | CSS `scroll-snap-type: y mandatory` |
| Custom wheel handler (150px threshold + 1200ms cooldown) | Native scroll-snap (GPU-accelerated) |
| Custom touch handler (80px threshold) | Native touch scroll with momentum |
| 1000+ DOM cards rendered | ~7 virtualized cards with spacers |
| 1 active video + 2 hidden sr-only pre-buffers | 3 real video elements (prev/active/next) |
| 400ms setTimeout retry polling loop | Event-driven `canplay` + `loadeddata` |
| Failed videos silently demoted | Visible error UI with Retry + Open Original |
