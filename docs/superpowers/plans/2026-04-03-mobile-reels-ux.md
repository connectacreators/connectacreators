# Mobile Reels UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Instagram video playback in the viral reels feed, make the mobile reels view truly full-screen, and replace the "More" nav tab with a comprehensive bottom sheet.

**Architecture:** Four targeted file changes — `ViralReelFeed.tsx` gets Cobalt fallback + "Watch on Instagram" + floating logo, `DashboardLayout.tsx` + `DashboardTopBar.tsx` get route-aware header suppression, and `MobileBottomNav.tsx` gets a slide-up sheet with all nav links + sign out.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, React Router, Vite

---

## File Map

| File | Change |
|------|--------|
| `src/pages/ViralReelFeed.tsx` | Cobalt error cascade, Watch-on-IG fallback UI, floating logo, top gradient |
| `src/layouts/DashboardLayout.tsx` | Pass `hideOnMobile` to `DashboardTopBar` when on reels route |
| `src/components/DashboardTopBar.tsx` | Accept + apply `hideOnMobile` prop |
| `src/components/MobileBottomNav.tsx` | Replace Settings tab with More bottom sheet |

---

## Task 1: Instagram Video — Cobalt Error Cascade

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

The existing `onError` handler tries stream-reel once, then silently fails for Instagram. We need a 3-stage cascade: cache → cobalt-proxy → stream-reel → show fallback link.

### Constants and refs to add

- [ ] **Step 1: Add `igErrorStage` ref and `igFailed` state near the top of `ViralReelFeed` component (after the existing `pausedRef` line ~line 118)**

```tsx
const igErrorStage = useRef<Map<string, "cobalt" | "stream" | "failed">>(new Map());
const [igFailed, setIgFailed] = useState<Set<string>>(new Set());
```

### Update `getStreamUrl` to try Cobalt for Instagram

- [ ] **Step 2: Update `getStreamUrl` (lines ~179–185) to route Instagram page URLs through cobalt-proxy**

Replace the existing `getStreamUrl` function:

```tsx
const getStreamUrl = useCallback((video: ViralVideo): string => {
  const url = video.video_url;
  if (/cdninstagram\.com|fbcdn\.net/.test(url)) {
    return `${VPS_API}/proxy-video?url=${encodeURIComponent(url)}`;
  }
  return `${VPS_API}/stream-reel?url=${encodeURIComponent(url)}`;
}, []);
```

The existing `getStreamUrl` is unchanged — Cobalt is called directly inside the `onError` handler as a POST fetch (see Step 3). No new helper function needed.

**Note:** `cobalt-proxy` is a POST endpoint that returns JSON `{ url }`, not a stream. We call it async in the error handler and then set `vid.src` to the resolved URL. See Step 3.

### Update `onError` handler

- [ ] **Step 3: Replace the `onError` handler on the `<video>` element (~lines 630–645) with the 3-stage cascade**

```tsx
onError={() => {
  const vid = activeVideoRef.current;
  if (!vid || vid.dataset.errHandled === "true") return;

  if (v.platform === "youtube") {
    setUseEmbed(true);
    return;
  }

  const stage = igErrorStage.current.get(v.id);

  if (v.platform === "instagram") {
    if (!stage) {
      // Stage 1: cache failed → try cobalt-proxy (POST → get direct MP4 URL)
      igErrorStage.current.set(v.id, "cobalt");
      vid.dataset.errHandled = "true";
      fetch(`${VPS_API}/cobalt-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": VPS_API_KEY,
        },
        body: JSON.stringify({ url: v.video_url }),
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          const resolved = data?.url;
          if (resolved && vid) {
            resolvedUrls.current.set(v.id, resolved);
            vid.dataset.errHandled = "false";
            vid.src = resolved;
            vid.load();
            vid.play().catch(() => {});
          } else {
            // cobalt returned nothing → fall to stream-reel
            igErrorStage.current.set(v.id, "stream");
            const fallback = getStreamUrl(v);
            resolvedUrls.current.set(v.id, fallback);
            if (vid) {
              vid.dataset.errHandled = "false";
              vid.src = fallback;
              vid.load();
              vid.play().catch(() => {});
            }
          }
        })
        .catch(() => {
          // cobalt fetch threw → fall to stream-reel
          igErrorStage.current.set(v.id, "stream");
          const fallback = getStreamUrl(v);
          resolvedUrls.current.set(v.id, fallback);
          if (vid) {
            vid.dataset.errHandled = "false";
            vid.src = fallback;
            vid.load();
            vid.play().catch(() => {});
          }
        });
    } else if (stage === "cobalt") {
      // Stage 2: cobalt-resolved URL failed → try stream-reel
      igErrorStage.current.set(v.id, "stream");
      const fallback = getStreamUrl(v);
      resolvedUrls.current.set(v.id, fallback);
      vid.dataset.errHandled = "false";
      vid.src = fallback;
      vid.load();
      vid.play().catch(() => {});
    } else if (stage === "stream") {
      // Stage 3: stream-reel also failed → show Watch on Instagram link
      igErrorStage.current.set(v.id, "failed");
      setIgFailed((prev) => new Set(prev).add(v.id));
    }
    return;
  }

  // Non-instagram: existing fallback
  const fallback = getStreamUrl(v);
  if (!vid.src.includes("/stream-reel") && !vid.src.includes("/proxy-video")) {
    resolvedUrls.current.set(v.id, fallback);
    vid.src = fallback;
    vid.load();
    vid.play().catch(() => {});
  }
}}
```

Also add `data-err-handled="false"` to the `<video>` element's initial attributes so the guard works:
```tsx
<video
  ref={activeVideoRef}
  src={getResolvedUrl(v)}
  autoPlay
  playsInline
  muted
  loop
  preload="auto"
  data-err-handled="false"
  ...
```

### Add "Watch on Instagram" fallback UI

- [ ] **Step 4: Add the fallback link inside the card overlay, above the bottom gradient (after the paused indicator block ~line 656)**

```tsx
{/* Watch on Instagram fallback — shown when all video sources fail */}
{isActive && igFailed.has(v.id) && v.platform === "instagram" && (
  <div className="absolute bottom-[100px] left-4 z-[6] pointer-events-auto">
    <a
      href={v.video_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white"
      style={{ background: "linear-gradient(135deg, #e1306c, #fd1d1d, #fcb045)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Instagram className="w-3.5 h-3.5" />
      Watch on Instagram
    </a>
  </div>
)}
```

- [ ] **Step 5: Clear `igFailed` and `igErrorStage` entries when switching videos (add to the `useEffect` at ~line 263 that resets `paused` and `useEmbed` when `activeIdx` changes)**

```tsx
useEffect(() => {
  setPaused(false);
  setUseEmbed(false);
  // Reset IG error state for the newly active video
  const v = sortedVideos[activeIdx];
  if (v) {
    igErrorStage.current.delete(v.id);
    setIgFailed((prev) => {
      if (!prev.has(v.id)) return prev;
      const next = new Set(prev);
      next.delete(v.id);
      return next;
    });
  }
}, [activeIdx]);
```

- [ ] **Step 6: Verify manually — navigate to the reels feed on mobile/devtools, switch to Instagram tab, check that videos attempt to play (network tab should show a POST to `/api/cobalt-proxy`), and that failed ones show the Watch on Instagram button**

- [ ] **Step 7: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "fix(reels): Instagram video cascade — cobalt-proxy → stream-reel → Watch on IG"
```

---

## Task 2: Floating Logo + Top Gradient (Mobile Full-Screen Prep)

**Files:**
- Modify: `src/pages/ViralReelFeed.tsx`

The floating controls overlay (`.pointer-events-none` div at z-20) already spans the full video. We extend the top gradient and add a centered logo.

- [ ] **Step 1: In `ViralReelFeed.tsx`, find the floating controls overlay div (~line 541)**

```tsx
{/* Floating controls overlay — same bounds as reel-col */}
<div className="w-full lg:w-[380px] absolute inset-0 mx-auto pointer-events-none z-20">
```

- [ ] **Step 2: Add the top gradient + floating logo INSIDE that overlay div, before the mute button**

```tsx
{/* Top gradient — mobile only, replaces the header */}
<div
  className="absolute top-0 left-0 right-0 h-20 pointer-events-none lg:hidden"
  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
/>

{/* Floating Connecta logo — mobile only, centered at top */}
<div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none lg:hidden z-[1]">
  <img
    src="/assets/connecta-logo-light.png"
    alt="Connecta"
    className="h-5 object-contain opacity-75"
  />
</div>
```

**Note on logo path:** The logo is imported in `DashboardTopBar.tsx` as:
```tsx
import connectaLoginLogo from "@/assets/connecta-logo-text-light.png";
```
Use the same import in `ViralReelFeed.tsx` — add this import at the top of the file:
```tsx
import connectaLogoLight from "@/assets/connecta-logo-text-light.png";
```
Then use `src={connectaLogoLight}` instead of the public path.

- [ ] **Step 3: Verify in browser devtools (mobile viewport) — the logo appears centered at top with a fade-out gradient behind it, and doesn't overlap the mute button (left) or platform pills (right)**

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViralReelFeed.tsx
git commit -m "feat(reels): add floating logo + top gradient for mobile full-screen"
```

---

## Task 3: Hide Mobile Header on Reels Route

**Files:**
- Modify: `src/layouts/DashboardLayout.tsx`
- Modify: `src/components/DashboardTopBar.tsx`

- [ ] **Step 1: Open `src/components/DashboardTopBar.tsx`. Update the `Props` interface and component signature**

Replace:
```tsx
interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function DashboardTopBar({ sidebarOpen, setSidebarOpen }: Props) {
```

With:
```tsx
interface Props {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  hideOnMobile?: boolean;
}

export default function DashboardTopBar({ sidebarOpen, setSidebarOpen, hideOnMobile }: Props) {
```

- [ ] **Step 2: In `DashboardTopBar.tsx`, wrap the mobile bar with a conditional**

Find (~line 26):
```tsx
      {/* Mobile top bar */}
      <div className="glass-topbar rounded-xl px-4 py-3 flex items-center gap-3 lg:hidden">
```

Replace with:
```tsx
      {/* Mobile top bar */}
      {!hideOnMobile && (
        <div className="glass-topbar rounded-xl px-4 py-3 flex items-center gap-3 lg:hidden">
```

And close it — find the closing `</div>` of the mobile bar (after the sign-out button, ~line 42) and add the closing `)}`:
```tsx
        </div>
      )}
```

- [ ] **Step 3: Open `src/layouts/DashboardLayout.tsx`. Detect the reels route and pass `hideOnMobile`**

Find:
```tsx
  const showChrome = !!user;
```

Add below it:
```tsx
  const isReelsPage = location.pathname === "/viral-today/reels";
```

Find:
```tsx
        {showChrome && <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />}
```

Replace with:
```tsx
        {showChrome && <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} hideOnMobile={isReelsPage} />}
```

- [ ] **Step 4: Verify in browser — navigate to `/viral-today/reels` on mobile viewport, confirm the header bar is gone and the video fills from the very top; navigate to `/dashboard` and confirm the header is still present**

- [ ] **Step 5: Commit**

```bash
git add src/layouts/DashboardLayout.tsx src/components/DashboardTopBar.tsx
git commit -m "feat(reels): hide mobile header on reels route for full-screen experience"
```

---

## Task 4: "More" Bottom Sheet in MobileBottomNav

**Files:**
- Modify: `src/components/MobileBottomNav.tsx`

Replace the hardcoded Settings `TABS` entry with a stateful More button that opens a slide-up sheet containing all navigation options.

- [ ] **Step 1: Replace the entire contents of `src/components/MobileBottomNav.tsx` with the following**

```tsx
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, Flame, Layers, Clapperboard, MoreHorizontal,
  Users, Archive, CalendarDays, UserCheck, GraduationCap,
  CreditCard, Settings, Globe, LogOut, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

const BOTTOM_TABS = [
  { icon: Home, label: "Home", path: "/dashboard" },
  { icon: Flame, label: "Viral", path: "/viral-today/reels" },
  { icon: Layers, label: "Canvas", path: "/scripts?view=canvas", hero: true as const },
  { icon: Clapperboard, label: "Queue", path: "/editing-queue" },
];

const MORE_NAV_ITEMS = [
  { icon: Users, label: "Clients", path: "/clients" },
  { icon: Archive, label: "Vault", path: "/vault" },
  { icon: CalendarDays, label: "Content Calendar", path: "/content-calendar" },
  { icon: UserCheck, label: "Team Members", path: "/team-members" },
  { icon: GraduationCap, label: "Trainings", path: "/trainings" },
  { icon: CreditCard, label: "Subscribers", path: "/subscribers" },
];

export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleNav = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-card/95 backdrop-blur-md border-t border-border">
        <div className="flex items-end justify-around h-16 px-2 pb-2">
          {BOTTOM_TABS.map((tab) => {
            const isActive = pathname.startsWith(tab.path.split("?")[0]);

            if (tab.hero) {
              return (
                <button
                  key={tab.label}
                  onClick={() => navigate(tab.path)}
                  className="flex flex-col items-center gap-1 -mt-4"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-[3px] border-background"
                    style={{ background: "linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)" }}
                  >
                    <tab.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <button
                key={tab.label}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[48px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[48px]",
              moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60] bg-black/60 lg:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden rounded-t-2xl bg-card border-t border-border animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-3 mb-2" />

            {/* Close button */}
            <button
              onClick={() => setMoreOpen(false)}
              className="absolute top-3 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Nav items */}
            <div className="px-2 pb-2">
              {MORE_NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNav(item.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                >
                  <item.icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </button>
              ))}

              {/* Divider */}
              <div className="h-px bg-border mx-2 my-1" />

              {/* Settings */}
              <button
                onClick={() => handleNav("/settings")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Settings className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">Settings</span>
              </button>

              {/* Language toggle */}
              <button
                onClick={toggleLanguage}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
              >
                <Globe className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-foreground">
                  Language: {language === "en" ? "English" : "Español"}
                </span>
                <span className="ml-auto text-xs font-bold text-primary">
                  {language === "en" ? "ES" : "EN"}
                </span>
              </button>

              {/* Sign Out */}
              <button
                onClick={() => { setMoreOpen(false); signOut(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 transition-colors text-left"
              >
                <LogOut className="w-5 h-5 text-red-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-red-400">Sign Out</span>
              </button>
            </div>

            {/* Bottom safe area spacer */}
            <div className="h-6" />
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify in browser (mobile viewport) — tap "More", confirm the sheet slides up with all nav items; tap each item navigates correctly; tap Language toggles EN/ES; tap Sign Out signs out; tap backdrop dismisses the sheet**

- [ ] **Step 3: Commit**

```bash
git add src/components/MobileBottomNav.tsx
git commit -m "feat(nav): replace More tab with Instagram-style bottom sheet with all nav + sign out"
```

---

## Task 5: Build & Deploy

- [ ] **Step 1: Run build locally to check for TypeScript errors**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build 2>&1
```

Expected: build succeeds with no errors. If errors appear, fix them before deploying.

- [ ] **Step 2: Deploy to VPS**

```bash
cd /Users/admin/Desktop/connectacreators && npm run build && rsync -avz --delete dist/ root@72.62.200.145:/var/www/connectacreators/ 2>&1
```

Or use the standard SCP/expect script pattern if rsync is unavailable.

- [ ] **Step 3: Reload nginx on VPS**

```bash
ssh root@72.62.200.145 "nginx -s reload"
```

- [ ] **Step 4: Smoke test on mobile at `https://connectacreators.com/viral-today/reels`**

- No header bar visible on mobile reels page
- Connecta logo floats centered at top of video
- Instagram videos attempt to play (check network tab for POST to `/api/cobalt-proxy`)
- Failed Instagram videos show "Watch on Instagram" button
- Bottom nav "More" opens the sheet with all nav items
- Sign Out works from the sheet
- Language toggle in sheet works

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: deploy mobile reels UX improvements"
```
