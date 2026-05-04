---
status: awaiting_human_verify
trigger: "viral-reels-autoswitch"
created: 2026-04-05T00:00:00Z
updated: 2026-04-05T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — sortedVideos re-sort every 30s shifts video positions, making activeIdx point to a different video without any user interaction
test: Traced full dependency chain from setInterval → flushSeen → setInteractions → sortedVideos recompute → array reorder → same activeIdx = different video
expecting: Fix verified by TypeScript — no compilation errors
next_action: Human verification in browser (wait 30s and confirm no auto-switch)

## Symptoms

expected: Videos only advance when user manually scrolls via wheel, touch, arrow keys, or up/down buttons. Paused videos stay paused indefinitely. Exactly like TikTok/Instagram Reels behavior.
actual: After a video plays through or after a few seconds of inactivity (paused or not), the page auto-switches to show a completely different video. No user scroll action is involved. This happens repeatedly - the page keeps cycling through videos on its own.
errors: No console errors - this is a logic/state bug in the React component.
reproduction: 1) Navigate to connectacreators.com/viral-today 2) Click "Reels" view 3) Watch any video play 4) Either let it finish or pause it 5) Wait a few seconds 6) The page will switch to a different video automatically
timeline: Bug persisted through v9, v10, v11. NOT present in v8 (simple translateY + single video, no feed algorithm).

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-05T00:00:00Z
  checked: flushSeen + interactions dependency chain
  found: |
    flushSeen (line 460-475) calls setInteractions() which updates the `interactions` Map state.
    setInterval(flushSeen, 30_000) runs every 30 seconds.
    sortedVideos useMemo depends on [videos, interactions, nicheKeywords, userChannelIds].
    Every 30s flush → interactions state changes → sortedVideos recomputes.
    The sort function uses inter.seen_count which changes per flush → videos re-order.
  implication: sortedVideos array changes every 30s, causing activeIdx to point to different video

- timestamp: 2026-04-05T00:00:00Z
  checked: activeIdx reset logic
  found: |
    activeIdx is reset to 0 in loadVideos() (line 415).
    No effect tracks "sortedVideos changed" to preserve activeIdx on the current video.
    When sortedVideos re-sorts, the video at position activeIdx changes silently.
    The translateY effect (line 265-267) fires on activeIdx change only — so the position stays the same,
    but the VIDEO CONTENT at that position is now different because the array re-sorted.
    This manifests as the display "jumping" to a different video without activeIdx ever changing.
  implication: The user sees a different video even though activeIdx didn't change — the sort shuffled everything

- timestamp: 2026-04-05T00:00:00Z
  checked: "seen after 3s" effect (line 485-490)
  found: |
    useEffect depends on [activeIdx, sortedVideos].
    Every time sortedVideos recomputes (every 30s), this effect re-fires.
    It calls setTimeout 3s → seenThisSession.current.add(v.id).
    If sortedVideos changes quickly, the timer fires on a stale video ref.
    This itself doesn't change activeIdx but re-adds a video to seen set.
  implication: Minor secondary issue, not the primary cause

- timestamp: 2026-04-05T00:00:00Z
  checked: prefetch effect (line 493-505)
  found: |
    useEffect depends on [activeIdx, sortedVideos, urlMap].
    Fires every 30s due to sortedVideos recomputation. Only fires fetch — no activeIdx change.
  implication: Unnecessary re-fires but not causing video switch

- timestamp: 2026-04-05T00:00:00Z
  checked: measure/translateY effect (line 230-246)
  found: |
    useEffect depends on [activeIdx]. Does NOT depend on sortedVideos.
    Safe — only updates translateY when activeIdx changes.
  implication: Not the cause

- timestamp: 2026-04-05T00:00:00Z
  checked: video `loop` attribute (line 722)
  found: |
    All video elements have `loop` attribute set. Videos loop forever on their own.
    Combined with no onEnded handler, videos will NOT auto-advance on completion.
    This rules out "video ended" as the cause of auto-switching.
  implication: onEnded auto-advance is NOT the mechanism — confirms sortedVideos re-sort is the cause

- timestamp: 2026-04-05T00:00:00Z
  checked: sortedVideos re-render effect on displayed video
  found: |
    sortedVideos.map() is called in JSX (line 679). All N videos are rendered as DOM nodes.
    When sortedVideos recomputes (re-sorted), React reconciles the list by key={v.id}.
    The VIDEO at the current scroll position (activeIdx) changes because the array order changed.
    Example: User is watching video "abc" at index 5. After flush, "abc" moves to index 7
    (its seen_count went up, score dropped). Index 5 now shows a different video "xyz".
    The translateY is still at -5*cardH, so now "xyz" is visible instead of "abc".
  implication: ROOT CAUSE CONFIRMED — sortedVideos re-sort every 30s changes which video is at activeIdx

## Resolution

root_cause: |
  Every 30 seconds, flushSeen() calls setInteractions() which triggers the sortedVideos useMemo to
  recompute. The sort scores change because seen_count increments, causing videos to reorder.
  The activeIdx state does not change, but the video at position activeIdx is now a DIFFERENT video
  because the array re-sorted around it. This manifests as the "auto-switch" — the user sees a
  completely different video without any scroll action.

fix: |
  Added `currentVideoIdRef` (useRef) to track the currently displayed video's ID.
  Added two new useEffects in ViralReelFeed.tsx after the sortedVideos useMemo:
  1. "Anchor" effect: watches sortedVideos changes, finds the pinned video ID in the
     new array, and silently updates activeIdx (+ translateY directly) to stay on
     the same video even after a re-sort. If the video was filtered out (seen 4x),
     clamps to bounds instead.
  2. "Update pin" effect: watches [activeIdx, sortedVideos] to update currentVideoIdRef
     whenever the user intentionally navigates to a new video.

verification: TypeScript check passed (npx tsc --noEmit — no errors). Awaiting human browser test.

files_changed:
  - src/pages/ViralReelFeed.tsx: Added currentVideoIdRef + 2 useEffects after sortedVideos useMemo (lines ~131, 231-266)
