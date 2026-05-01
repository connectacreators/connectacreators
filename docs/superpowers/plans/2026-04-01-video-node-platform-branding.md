# Video Node Platform Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the YouTube yt-dlp fallback crash and give each platform (YouTube, Instagram, TikTok, Facebook) its own branded color scheme and logo in VideoNode.

**Architecture:** Two files. (1) `transcribe-video` edge function: add `&& !isYouTube` guard to the yt-dlp block so YouTube never falls through to audio extraction. (2) `VideoNode.tsx`: add a `detectPlatform` helper + `PLATFORM_THEME` config + inline SVG icon components, then replace the two hardcoded teal headers and accent colors with platform-derived values.

**Tech Stack:** Deno (Supabase edge function), React/TypeScript (VideoNode), inline SVG icons

---

### Task 1: Fix YouTube yt-dlp fallback bug in `transcribe-video`

**Files:**
- Modify: `supabase/functions/transcribe-video/index.ts:311`

- [ ] **Step 1: Guard the yt-dlp block against YouTube URLs**

Find line 311 in `supabase/functions/transcribe-video/index.ts`:
```typescript
    if (!transcription) {
```

Replace with:
```typescript
    if (!transcription && !isYouTube) {
```

- [ ] **Step 2: Add YouTube no-captions fallback before the null-check**

Find this block (around line 366 — after the yt-dlp/Whisper section closes):
```typescript
    if (transcription === null || transcription === undefined) {
      throw new Error("Could not transcribe video — audio extraction or transcription failed");
    }
```

Add a YouTube-specific fallback immediately **before** that block:
```typescript
    // YouTube with no captions: don't throw, return a graceful message
    if (isYouTube && !transcription) {
      transcription = "(No captions available for this video)";
    }

    if (transcription === null || transcription === undefined) {
      throw new Error("Could not transcribe video — audio extraction or transcription failed");
    }
```

- [ ] **Step 3: Deploy**

```bash
cd /Users/admin/Desktop/connectacreators
npx supabase functions deploy transcribe-video --project-ref hxojqrilwhhrvloiwmfo
```

Expected: `Deployed Functions on project hxojqrilwhhrvloiwmfo: transcribe-video`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/transcribe-video/index.ts
git commit -m "fix(transcribe-video): skip yt-dlp for YouTube, graceful no-captions fallback"
```

---

### Task 2: Add platform detection + theme config + SVG icons to VideoNode

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx` (module level, before the `VideoNode` component)

Add all of the following code as a block immediately after the `proxyInstagramUrl` helper (after line 18). Read the file first to confirm the exact insertion point.

- [ ] **Step 1: Insert the platform detection helper, theme map, and icon components**

After the closing `};` of `proxyInstagramUrl` (line 18), insert:

```typescript
// ─── Platform detection ───────────────────────────────────────────────────
type Platform = "youtube" | "instagram" | "tiktok" | "facebook" | "default";

function detectPlatform(url: string): Platform {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/tiktok\.com/.test(url)) return "tiktok";
  if (/facebook\.com|fb\.watch/.test(url)) return "facebook";
  return "default";
}

const PLATFORM_THEME: Record<Platform, {
  label: string;
  headerBg: string;
  headerBorder: string;
  cardBorder: string;
  chevronColor: string;
  transcriptBorder: string;
  btnPrimaryBg: string;
  btnPrimaryBorder: string;
  btnPrimaryText: string;
  extraBoxShadow?: string;
  labelStyle?: React.CSSProperties;
}> = {
  youtube: {
    label: "YouTube",
    headerBg: "rgba(239,68,68,0.12)",
    headerBorder: "rgba(239,68,68,0.22)",
    cardBorder: "rgba(239,68,68,0.5)",
    chevronColor: "rgba(239,68,68,0.6)",
    transcriptBorder: "rgba(239,68,68,0.12)",
    btnPrimaryBg: "rgba(239,68,68,0.12)",
    btnPrimaryBorder: "rgba(239,68,68,0.3)",
    btnPrimaryText: "rgba(239,68,68,0.9)",
  },
  instagram: {
    label: "Instagram",
    headerBg: "linear-gradient(135deg, rgba(131,58,180,0.20) 0%, rgba(253,29,29,0.14) 60%, rgba(252,176,69,0.10) 100%)",
    headerBorder: "rgba(193,53,132,0.22)",
    cardBorder: "rgba(193,53,132,0.5)",
    chevronColor: "rgba(193,53,132,0.65)",
    transcriptBorder: "rgba(193,53,132,0.12)",
    btnPrimaryBg: "rgba(193,53,132,0.12)",
    btnPrimaryBorder: "rgba(193,53,132,0.3)",
    btnPrimaryText: "rgba(225,48,108,0.9)",
    labelStyle: {
      background: "linear-gradient(90deg,#c13584,#e1306c)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
  },
  tiktok: {
    label: "TikTok",
    headerBg: "rgba(10,10,10,0.95)",
    headerBorder: "rgba(37,244,238,0.15)",
    cardBorder: "rgba(37,244,238,0.35)",
    chevronColor: "rgba(37,244,238,0.65)",
    transcriptBorder: "rgba(37,244,238,0.12)",
    btnPrimaryBg: "rgba(37,244,238,0.08)",
    btnPrimaryBorder: "rgba(37,244,238,0.28)",
    btnPrimaryText: "rgba(37,244,238,0.88)",
    extraBoxShadow: "2px 0 0 rgba(254,44,85,0.25), -2px 0 0 rgba(37,244,238,0.20)",
    labelStyle: {
      background: "linear-gradient(90deg,#25f4ee,#fe2c55)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
  },
  facebook: {
    label: "Facebook",
    headerBg: "rgba(24,119,242,0.12)",
    headerBorder: "rgba(24,119,242,0.20)",
    cardBorder: "rgba(24,119,242,0.5)",
    chevronColor: "rgba(24,119,242,0.65)",
    transcriptBorder: "rgba(24,119,242,0.12)",
    btnPrimaryBg: "rgba(24,119,242,0.12)",
    btnPrimaryBorder: "rgba(24,119,242,0.32)",
    btnPrimaryText: "rgba(24,119,242,0.95)",
  },
  default: {
    label: "Video Reference",
    headerBg: "rgba(8,145,178,0.10)",
    headerBorder: "rgba(8,145,178,0.20)",
    cardBorder: "rgba(8,145,178,0.25)",
    chevronColor: "rgba(34,211,238,0.5)",
    transcriptBorder: "rgba(8,145,178,0.12)",
    btnPrimaryBg: "rgba(8,145,178,0.12)",
    btnPrimaryBorder: "rgba(8,145,178,0.30)",
    btnPrimaryText: "rgba(34,211,238,0.85)",
  },
};

// ─── Platform SVG icons ───────────────────────────────────────────────────
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
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433"/>
          <stop offset="25%" stopColor="#e6683c"/>
          <stop offset="50%" stopColor="#dc2743"/>
          <stop offset="75%" stopColor="#cc2366"/>
          <stop offset="100%" stopColor="#bc1888"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill="url(#ig-grad)"/>
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="#fe2c55" opacity="0.6" transform="translate(0.5,0.5)"/>
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="#25f4ee" opacity="0.6" transform="translate(-0.5,-0.5)"/>
      <path d="M9.5 0C9.7 1.8 10.7 2.8 12.5 3V5.3C11.3 5.2 10.3 4.8 9.5 4.2V9C9.5 11.5 7.5 13.5 5 13.5C2.5 13.5 0.5 11.5 0.5 9C0.5 6.5 2.5 4.5 5 4.5C5.2 4.5 5.4 4.5 5.6 4.6V6.9C5.4 6.8 5.2 6.8 5 6.8C3.7 6.8 2.7 7.8 2.7 9C2.7 10.2 3.7 11.2 5 11.2C6.3 11.2 7.3 10.2 7.3 9V0H9.5Z" fill="white"/>
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

- [ ] **Step 2: Commit the helpers**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "feat(VideoNode): add platform detection, theme config, and SVG icon components"
```

---

### Task 3: Wire platform theme into the VideoNode render

**Files:**
- Modify: `src/components/canvas/VideoNode.tsx` (inside the `VideoNode` component)

Read the file before editing to confirm current line numbers.

- [ ] **Step 1: Derive `platform` and `theme` after the `isYt` line**

Find (around line 639):
```typescript
  const isYt = /youtube\.com|youtu\.be/.test(d.url || urlInput);
  const isVertical = urlInput.includes("instagram.com") || urlInput.includes("tiktok.com");
```

Replace with:
```typescript
  const isYt = /youtube\.com|youtu\.be/.test(d.url || urlInput);
  const platform = detectPlatform(d.url || urlInput);
  const theme = PLATFORM_THEME[platform];
  const isVertical = urlInput.includes("instagram.com") || urlInput.includes("tiktok.com");
```

- [ ] **Step 2: Apply theme to the outer card border**

Find the outer container div (around line 644):
```typescript
      className="glass-card rounded-2xl shadow-xl relative"
      style={{ width: "100%", minWidth: "180px" }}
```

Replace with:
```typescript
      className="glass-card rounded-2xl shadow-xl relative"
      style={{
        width: "100%",
        minWidth: "180px",
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: theme.extraBoxShadow
          ? `0 8px 24px rgba(0,0,0,0.4), ${theme.extraBoxShadow}`
          : undefined,
      }}
```

- [ ] **Step 3: Apply theme to the idle-state header**

Find (around line 659):
```typescript
          <div className="flex items-center justify-between px-3 py-2.5 bg-[rgba(8,145,178,0.10)] border-b border-[rgba(8,145,178,0.20)]">
            <div className="flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary/80">Video Reference</span>
            </div>
```

Replace with:
```typescript
          <div className="flex items-center justify-between px-3 py-2.5" style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.headerBorder}` }}>
            <div className="flex items-center gap-2">
              <PlatformIcon platform={platform} />
              <span className="text-xs font-semibold" style={theme.labelStyle ?? { color: theme.btnPrimaryText }}>{theme.label}</span>
            </div>
```

- [ ] **Step 4: Apply theme to the active-state (post-transcription) header**

Find (around line 699):
```typescript
          <div className="flex items-center justify-between px-3 py-1.5 bg-[rgba(8,145,178,0.08)] border-b border-[rgba(8,145,178,0.15)]" style={{ cursor: "grab" }}>
            <div className="flex items-center gap-2">
              <Film className="w-3 h-3 text-primary/60" />
              <span className="text-[10px] font-semibold text-primary/60">Video Reference</span>
            </div>
```

Replace with:
```typescript
          <div className="flex items-center justify-between px-3 py-1.5" style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.headerBorder}`, cursor: "grab" }}>
            <div className="flex items-center gap-2">
              <PlatformIcon platform={platform} />
              <span className="text-[10px] font-semibold" style={theme.labelStyle ?? { color: theme.btnPrimaryText }}>{theme.label}</span>
            </div>
```

- [ ] **Step 5: Apply theme to the transcript accordion row**

Find (around line 822):
```typescript
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 border-b border-border/40 hover:bg-muted/20 transition-colors"
```

Replace with:
```typescript
                  className="nodrag w-full flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={{ borderBottom: `1px solid ${theme.transcriptBorder}` }}
```

- [ ] **Step 6: Apply theme to the transcript chevrons**

Find (around line 827):
```typescript
                  {showTranscript
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
```

Replace with:
```typescript
                  {showTranscript
                    ? <ChevronUp className="w-3.5 h-3.5" style={{ color: theme.chevronColor }} />
                    : <ChevronDown className="w-3.5 h-3.5" style={{ color: theme.chevronColor }} />}
```

- [ ] **Step 7: Apply theme to the "Generate Visual Breakdown" button**

Find (around line 840):
```typescript
            {hasTranscript && !hasStructure && !isYt && (
              <div className="px-3 py-2">
                {stage !== "analyzing" ? (
                  <button
                    onClick={analyzeStructure}
                    className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors text-xs font-semibold"
                  >
```

Replace with:
```typescript
            {hasTranscript && !hasStructure && !isYt && (
              <div className="px-3 py-2">
                {stage !== "analyzing" ? (
                  <button
                    onClick={analyzeStructure}
                    className="nodrag w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-colors text-xs font-semibold"
                    style={{ background: theme.btnPrimaryBg, border: `1px solid ${theme.btnPrimaryBorder}`, color: theme.btnPrimaryText }}
                  >
```

- [ ] **Step 8: Commit**

```bash
git add src/components/canvas/VideoNode.tsx
git commit -m "feat(VideoNode): platform-branded headers, borders, and accents for YouTube/Instagram/TikTok/Facebook"
```

---

### Task 4: Build and deploy to VPS

- [ ] **Step 1: Push to git**

```bash
cd /Users/admin/Desktop/connectacreators
git push origin main
```

- [ ] **Step 2: SSH to VPS, pull, build, reload**

```bash
/usr/bin/expect -c '
spawn ssh -o StrictHostKeyChecking=no root@72.62.200.145
expect "password:"
send "Loqueveoloveo290802#\r"
expect "# "
send "cd /var/www/connectacreators && git pull origin main 2>&1 | tail -3\r"
expect "# "
send "npm run build 2>&1 | tail -10\r"
expect -timeout 180 "# "
send "nginx -s reload && echo NGINX_OK\r"
expect "# "
send "exit\r"
expect eof
'
```

Expected: build completes without errors, `NGINX_OK` printed.

- [ ] **Step 3: Smoke test**

Open `https://connectacreators.com` → Super Planning Canvas:

1. Add a Video Reference node → paste `https://www.youtube.com/watch?v=qiogHNvz4kw` → verify red header with YouTube logo, title bar, transcript accordion. No "Generate Visual Breakdown" button.
2. Add another node → paste an Instagram reel URL → verify purple/pink gradient header with Instagram logo. Breakdown button visible.
3. Verify a fresh node with no URL shows a neutral "Video Reference" header (default theme).
