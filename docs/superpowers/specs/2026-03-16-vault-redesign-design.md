# Vault Redesign — Design Spec

## Goal

Redesign the Vault page from its current uniform grid into a Pinterest-style masonry layout with real thumbnails, and fix thumbnail extraction to pull from existing edge-function responses — at zero extra API cost.

---

## What Changes

### 1. Layout — Pinterest Masonry Grid

Replace the current `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4` with a CSS `columns` masonry layout. Change the container from `max-w-4xl` to `max-w-6xl mx-auto` (gives ~280px per column at desktop).

- `columns-1 sm:columns-2 lg:columns-3 gap-3`
- `break-inside: avoid` on each card (the `<Dialog>` modal already portals to `document.body` via Radix UI, so it does not affect column breaking)
- Cards use `mb-3` for vertical spacing
- Cards have variable height based on thumbnail aspect ratio + script line count — natural masonry stagger

### 2. Card Design — `VaultTemplateCard`

Each card uses the existing `.glass-card` utility class (handles dark/light theme automatically) with `rounded-[14px] overflow-hidden`.

**Thumbnail zone (top):**
- Remove the current `aspect-[9/16] max-h-[200px]` wrapper div. Replace with a plain `<img>` when `thumbnail_url` exists — no fixed height, no aspect ratio constraint. The image renders at its natural aspect ratio, which creates the masonry stagger effect organically.
- `thumbnail_url` may be a `data:image/jpeg;base64,...` string (Instagram CORS workaround) — this renders correctly in `<img>` tags with `w-full object-cover`.
- When `thumbnail_url` is null: gradient placeholder div with Archive icon (same as current fallback — keep it).
- The existing Instagram `<iframe>` embed is intentionally removed. Replaced by the `<img>` tag above. If `thumbnail_url` is null for Instagram, the gradient placeholder renders.
- Source badge top-left: `bg-black/50 backdrop-blur-md rounded-md px-1.5 py-0.5 text-[9px] text-slate-400` — shows "TikTok", "Instagram", or "YouTube". Detect platform from `source_url` using the existing `sourceInfo` useMemo — extend it to also detect `{ type: 'tiktok' }` when `source_url?.includes('tiktok.com')`.
- Line count badge bottom-right: same dark pill style, "N lines".
- Gradient overlay at bottom of thumbnail: `linear-gradient(transparent, rgba(6,9,12,0.85))` — intentional fixed dark vignette over photos, acceptable in both light and dark themes because it overlays a photograph not the page background.
- Delete button (trash icon) appears on card hover, positioned top-right.

**Content zone (below thumbnail), `p-3`:**
- Template name: `font-semibold text-sm leading-snug line-clamp-2`
- Date: `text-[10px] text-muted-foreground mt-1 mb-2.5`
- Script preview — first 2 lines with colored blocks:
  - Hook: `bg-[rgba(8,145,178,0.06)] border border-[rgba(8,145,178,0.12)] rounded-lg px-2 py-1.5`, label `text-[#0891B2]` 9px uppercase
  - Body: `bg-[rgba(148,163,184,0.04)] border border-[rgba(148,163,184,0.08)] rounded-lg px-2 py-1.5`, label `text-[#64748b]`
  - CTA: `bg-[rgba(132,204,22,0.04)] border border-[rgba(132,204,22,0.10)] rounded-lg px-2 py-1.5`, label `text-[#84CC16]`
  - Line text: `text-[11px] text-muted-foreground italic leading-snug`
- If total lines > 2: `+N more lines` centered muted text
- Click card → opens existing script modal (unchanged)

### 3. Thumbnail Extraction — Per Platform

**YouTube** (update `transcribe-video` edge function):
- The video ID is already extracted from the URL in `transcribe-video`. Construct: `https://img.youtube.com/vi/{videoId}/maxresdefault.jpg`
- Do a HEAD request to check `content-length`. If the response is not OK or `content-length` equals `"1403"` (YouTube's known placeholder size), fall back to `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`.
- Return the final URL as `thumbnail_url` in the edge function response JSON.

**Instagram** (update `transcribe-video` edge function):
- The `extractInstagramVideoUrl` function currently returns `string | null`. Refactor it to return `{ videoUrl: string | null, displayUrl: string | null }`.
- In the Apify response parsing, also extract: `item.displayUrl || item.display_url || item.thumbnailUrl || item.thumbnail_url || item.images?.[0] || null` — store as `displayUrl`.
- After calling the refactored function, if `displayUrl` is non-null, convert it to a base64 data URI (copy the existing `fetch` → `arrayBuffer` → `Buffer.from(...).toString('base64')` conversion from `fetch-thumbnail/index.ts` lines ~91–107).
- Return the base64 data URI as `thumbnail_url` in the edge function response JSON.

**TikTok** (no change to `transcribe-video`):
- `transcribe-video` uses yt-dlp for TikTok, not Apify — no thumbnail available in that path.
- The existing `fetch-thumbnail` → TikTok oEmbed call in `handleCreate` already works and is kept as-is.

**Return shape from `transcribe-video`:**
```json
{ "transcription": "...", "thumbnail_url": "https://..." }
```
(`thumbnail_url` is `null` for TikTok — the existing oEmbed fallback handles it.)

**In `handleCreate` (Vault.tsx):**
- Change: `const { transcription } = await transcribeRes.json()`
  to: `const { transcription, thumbnail_url: transcribedThumb } = await transcribeRes.json()`
- Then for the thumbnail value saved to DB, use this priority:
  1. `newThumbnailUrl` (user manually typed a URL in the form input) — if set, use it
  2. `transcribedThumb` (auto-extracted from transcribe response) — if set, skip the `fetch-thumbnail` call
  3. Existing `fetch-thumbnail` call — runs as fallback if neither above is available (TikTok path)

**The manual "Fetch" button in the create form UI is unchanged** — it still calls `fetch-thumbnail` directly and is the user's manual override.

### 4. Page Header (simplified)

- Eyebrow: `text-[10px] uppercase tracking-[0.3em] text-[#0891B2]` — "Template Library"
- Title: `text-2xl font-extrabold tracking-tight` — "Vault"
- Count: `text-xs text-muted-foreground mt-0.5` — "N templates"
- "+ New Template" button top-right: `bg-gradient-to-br from-[#0891B2] to-[#84CC16]` rounded-xl
- Master mode filter chips below header (admin only — unchanged)

### 5. No Functional Changes

All of the following remain unchanged:
- Create form (URL input, name, manual thumbnail fetch button + input, loading states, dot animation)
- Delete flow (confirmation dialog, local state update)
- Script modal (full template view grouped by section)
- Master vault mode and client filter chips
- All i18n translation keys
- Auth / routing / clientId / master mode logic

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Vault.tsx` | Masonry layout, card redesign, wider container, source badge TikTok detection, save `transcribedThumb` from transcribe response |
| `supabase/functions/transcribe-video/index.ts` | Refactor `extractInstagramVideoUrl` to return `{videoUrl, displayUrl}`, add base64 conversion; add YouTube thumbnail construction with hqdefault fallback; return `thumbnail_url` in response |

---

## Design Tokens

- Glass card: `.glass-card` utility class (dark/light handled automatically)
- Cyan: `#0891B2` / `#22d3ee`
- Lime: `#84CC16` / `#a3e635`
- Muted: `#475569` / `#64748b`
- Card radius: `14px`
- Thumbnail gradient: `linear-gradient(transparent, rgba(6,9,12,0.85))` — intentional fixed dark vignette

---

## Verification

1. Add YouTube URL → thumbnail appears on card automatically (no manual fetch)
2. Add YouTube URL for video without HD → hqdefault fallback renders (not 1403-byte placeholder)
3. Add Instagram URL → thumbnail appears automatically, no CORS error in browser
4. Add TikTok URL → thumbnail appears via existing oEmbed path
5. Cards display in masonry with variable heights (landscape/portrait thumbnails stagger)
6. Cards with many script lines are taller than cards with few lines
7. Source badge shows correct platform on each card (TikTok/Instagram/YouTube)
8. Hook/Body/CTA color coding correct on cards
9. Delete works, modal opens with full script
10. Master vault filter chips work for admin
11. Light mode: glass cards render correctly
12. Null thumbnail: gradient placeholder renders (all platforms)
13. Manual "Fetch" button in create form still works
