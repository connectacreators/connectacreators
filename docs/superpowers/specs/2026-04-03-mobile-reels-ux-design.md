# Mobile Reels UX — Full-Screen + More Sheet + Instagram Video Fix

**Date:** 2026-04-03
**Scope:** Three improvements to the mobile Viral Reels experience

---

## 1. Instagram Video Playback Fix

### Problem
`viral_videos.video_url` for Instagram stores `instagram.com/reel/CODE/` URLs. `getStreamUrl()` routes these to `/stream-reel` (yt-dlp), which Instagram blocks. Videos show thumbnail only and never play.

### Solution
In `ViralReelFeed.tsx`, update `getStreamUrl()` to route Instagram URLs through Cobalt (self-hosted at port 9001, proxied via `/api/cobalt`) before falling back to `/stream-reel`.

**URL resolution priority for Instagram:**
1. Cache file: `https://connectacreators.com/video-cache/ig_{id}.mp4` (existing, unchanged)
2. Cobalt: `https://connectacreators.com/api/cobalt?url={encoded_reel_url}` *(verify proxy path on VPS during implementation — Cobalt runs on port 9001)*
3. stream-reel: `https://connectacreators.com/api/stream-reel?url={encoded_reel_url}` (existing fallback)

**Error handler update:**
When a video `onError` fires for an Instagram URL:
- If currently on cache URL → try Cobalt URL
- If currently on Cobalt URL → try stream-reel URL
- If currently on stream-reel URL → set `showIgFallback = true` (show "Watch on Instagram" link)

**"Watch on Instagram" fallback UI:**
- Small button overlaid on the thumbnail (bottom-left, above username)
- Text: "Watch on Instagram →" with Instagram pink color
- Links directly to `video_url` (the reel URL)
- Only shown when all video sources have failed

---

## 2. Mobile Full-Screen Reels (Hide Header)

### Problem
`DashboardTopBar` always renders a ~48px header bar on mobile regardless of route, shrinking the reel viewport.

### Solution

**`DashboardLayout.tsx`:**
- Detect if `location.pathname === "/viral-today/reels"`
- Pass `hideOnMobile={isReelsPage}` prop to `DashboardTopBar`

**`DashboardTopBar.tsx`:**
- Accept `hideOnMobile?: boolean` prop
- Wrap the mobile bar `<div>` with `{!hideOnMobile && ...}` — conditionally suppressed

**`ViralReelFeed.tsx`:**
- Add a top gradient overlay (already has the `pointer-events-none` overlay layer at `z-20`)
- Extend that overlay to cover the full top: `linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 30%)`
- Add a floating logo **top-center** (not top-left — mute button already occupies `top-3 left-4`):
  - Connecta logo image (`connecta-logo-light.png`) at ~20px height, `opacity-80`
  - Positioned: `absolute top-3 left-1/2 -translate-x-1/2 z-[21]` (above the gradient)
  - Hidden on desktop (`lg:hidden`)

---

## 3. "More" Bottom Sheet (Compact List, Style A)

### Problem
The "More" tab in `MobileBottomNav` navigates directly to `/settings`, giving no access to Clients, Vault, Calendar, Team Members, Subscribers, or Trainings on mobile.

### Solution

**`MobileBottomNav.tsx` — full rework of the More tab:**

Remove the `Settings` entry from `TABS`. Replace with a stateful More button that opens a slide-up bottom sheet.

**Bottom sheet contents (compact list, one row per item):**

```
Navigate
  👥  Clients            → /clients
  🗄️  Vault              → /vault
  📅  Content Calendar   → /content-calendar
  👥  Team Members       → /team-members
  🎓  Trainings          → /trainings
  💳  Subscribers        → /subscribers

  ─────────────────────

  ⚙️  Settings           → /settings
  🌐  Language toggle    (EN/ES inline toggle)
  🚪  Sign Out           (red, calls signOut())
```

**Implementation details:**
- `moreOpen` boolean state in `MobileBottomNav`
- When open: fixed backdrop (`bg-black/60 z-[60]`) + slide-up sheet (`rounded-t-2xl bg-card border-t border-border z-[70]`)
- Sheet slides in with `animate-in slide-in-from-bottom duration-300`
- Backdrop click closes the sheet
- Each nav item: calls `navigate(path)` + `setMoreOpen(false)`
- Language toggle: inline within the sheet (reuse `LanguageToggle` component)
- Sign Out: calls `signOut()` from `useAuth`
- Sheet has a drag handle indicator at top (same style as the existing mobile Inspire Script sheet)
- `useAuth` and `useLanguage` hooks imported into MobileBottomNav

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/ViralReelFeed.tsx` | `getStreamUrl()` Cobalt routing, error handler cascade, Instagram fallback UI, floating logo + top gradient overlay |
| `src/layouts/DashboardLayout.tsx` | Detect reels route, pass `hideOnMobile` to `DashboardTopBar` |
| `src/components/DashboardTopBar.tsx` | Accept + apply `hideOnMobile` prop |
| `src/components/MobileBottomNav.tsx` | Replace Settings tab with More bottom sheet |

---

## Out of Scope
- Desktop layout changes
- TikTok / YouTube video playback (already working)
- Cobalt server-side setup (already deployed on VPS port 9001)
