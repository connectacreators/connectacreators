# Requirements: Viral Reels Experience Fix (v1.1)

**Defined:** 2026-04-05
**Core Value:** Agencies discover what's gone viral in their niche — the reels feed must feel smooth and reliable, like TikTok/Instagram.

## v1 Requirements

### Reels Playback

- [ ] **REEL-01**: First video displays visually (no black box) on initial page load — audio and video both present from the start
- [ ] **REEL-02**: Active video loops normally but does NOT restart unexpectedly without user interaction after a few seconds of inactivity
- [ ] **REEL-03**: All videos within scroll range autoplay when they become active — no random autoplay failures
- [ ] **REEL-04**: Videos that fail to load degrade gracefully (placeholder shown, no crash or restart loop)

### Layout & Navigation

- [ ] **NAV-01**: Up/down arrow buttons remain fixed to screen edges at all times — never drift or shift position as user scrolls
- [ ] **NAV-02**: Reel card height and positioning remain consistent past the 5th video — no layout shift or positional drift

### Seen / Session Tracking

- [ ] **SEEN-01**: Seen videos are NEVER removed from the reels feed during the current session — the full feed stays intact for the entire session (TikTok/Instagram model)
- [ ] **SEEN-02**: Seen data (which videos the user watched) is only flushed to DB when the session ends (page close/navigate away) — NOT before
- [ ] **SEEN-03**: On the NEXT session load, previously-seen videos may be deprioritized in ordering (pushed lower) but are still shown — not hidden
- [ ] **SEEN-04**: Viral Today grid view shows ALL videos by default — no seen-based filtering applied to the grid at all

### Thumbnails

- [ ] **THUMB-01**: Instagram thumbnails ALWAYS show something on the Viral Today grid — real thumbnail if available, otherwise a branded gradient/placeholder. Blank thumbnail slots are never acceptable.
- [ ] **THUMB-02**: TikTok thumbnails ALWAYS show something on the Viral Today grid — real thumbnail if available, otherwise a branded gradient/placeholder. Blank thumbnail slots are never acceptable.
- [ ] **THUMB-03**: YouTube thumbnails ALWAYS show something on the Viral Today grid — real thumbnail if available, otherwise a branded gradient/placeholder. Blank thumbnail slots are never acceptable.

## Future Requirements

### Advanced Feed Control

- **FEED-01**: Per-user preference to completely hide seen videos in reels (opt-in toggle for power users)
- **FEED-02**: Feed algorithm weighting adjustments based on engagement history

## Out of Scope

| Feature | Reason |
|---------|--------|
| Redesigning the reels UI | Only fixing bugs, not visual redesign |
| Adding new video sources | Not related to current playback issues |
| Mobile-specific reels rewrite | Separate scope, tracked separately |
| Removing seen tracking entirely | Still needed for next-session ordering |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REEL-01 | Phase 1 | Pending |
| REEL-02 | Phase 1 | Pending |
| REEL-03 | Phase 1 | Pending |
| REEL-04 | Phase 1 | Pending |
| NAV-01 | Phase 1 | Pending |
| NAV-02 | Phase 1 | Pending |
| SEEN-01 | Phase 2 | Pending |
| SEEN-02 | Phase 2 | Pending |
| SEEN-03 | Phase 2 | Pending |
| SEEN-04 | Phase 2 | Pending |
| THUMB-01 | Phase 2 | Pending |
| THUMB-02 | Phase 2 | Pending |
| THUMB-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
