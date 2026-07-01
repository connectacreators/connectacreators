# Footage 720p Proxy Playback — Finish-the-Rollout Design

**Date:** 2026-07-01
**Status:** Approved design (pending spec review) → next step: writing-plans
**Base:** `origin/main` (build on a worktree off main; the local `feat/video-editor-phase-1` branch is stale)

## Goal

Every footage/submission video **plays** the fast 720p proxy (small, quick to start, low egress) and **downloads** the full-resolution original. The proxy pipeline already exists and is deployed; this work closes the remaining gaps so playback is fast on **all** surfaces, defaults to the **latest** submitted version, and self-heals coverage for clips that have no proxy — without breaking any existing playback, download, or versioning behavior.

## Background — current state (verified on `origin/main`, live in prod)

The 720p web-proxy pipeline is **already built and running**:

- **Generation:** Postgres trigger `trg_enqueue_footage_proxy` on `storage.objects` enqueues a `footage_proxies` row for any video landing in the `footage` bucket (including `…/submission/…` files). The VPS render-worker (`render-worker/src/proxy.ts` → `processProxyJob` in `index.ts`) transcodes to 720p H.264 + faststart (CRF 23, 128k audio) and uploads to the private `footage-proxies` bucket at the **same object path**.
- **Helpers (`src/services/videoUploadService.ts`):**
  - `getPlaybackVideoUrl(path)` — returns the proxy signed URL when `footage_proxies.status='done'`, else the original. **Playback only.**
  - `getDownloadVideoUrl(path, filename)` — signs the **original** with `{ download: filename }` (Content-Disposition attachment; streams to disk, no fetch()+blob OOM). **Download only.**
  - `getSignedVideoUrl(path)` — legacy original signer (still used by upload flow + the two gap surfaces below).
- **Public no-login resolver (`supabase/functions/public-calendar-video`, deployed, `verify_jwt=false`, v3):** validates post→client ownership, then signs the **freshest** copy across `footage`/`footage-proxies` (a stale proxy never beats a newer re-upload); `prefer:"original"` forces the original for downloads.

**Surface status today:**

| Surface | File | Playback | Download |
|---|---|---|---|
| FootagePanel | `src/components/FootagePanel.tsx` | ✅ proxy (`previewUrl`) | ✅ original |
| VideoReviewModal (editing queue) | `src/components/VideoReviewModal.tsx` | ✅ `getPlaybackVideoUrl` | ✅ `getDownloadVideoUrl` |
| ContentCalendar (in-app) | `src/pages/ContentCalendar.tsx` | ✅ `getPlaybackVideoUrl` | ✅ `getDownloadVideoUrl` |
| Public calendar | `src/pages/PublicContentCalendar.tsx` | ✅ `public-calendar-video` | ✅ `prefer:"original"` |
| **PublicVideoReview** (no-login) | `src/pages/PublicVideoReview.tsx:89` | ❌ **original** (`getSignedVideoUrl`) | n/a (no button) |
| **Scripts.tsx** (script detail inline players) | `src/pages/Scripts.tsx` (`loadStorageFiles`) | ❌ **original** (`createSignedUrl`) | ✅ original |

**Coverage:** 33 of 132 footage objects have a `done` proxy; **30** are `error` (mostly the 2026-06-16 circuit-breaker incident, `attempts=0`); **~69** were never queued (uploaded before the trigger existed — no backfill ran). A clip with no proxy plays the ~594 MB original — this is why playback spins.

## Scope & decisions (approved)

- **Egress:** signed proxy URLs (uncached tier). Proxies avg ~5 MB, so egress is negligible; no Cloudflare/public-bucket change now.
- **Quality:** keep 720p / CRF 23 (no ffmpeg change).
- **Versioning:** *playback default only* — make surfaces default to the newest version; **do not** change the underlying `file_submission` data model or the revisions UI.
- **Backfill:** re-queue the 30 failed jobs; **do not** mass-backfill the 69 old clips. Instead add **lazy backfill** (enqueue on demand when a proxy-less clip is played) so watched clips self-heal.

## Design

### 1. Scripts.tsx — proxy-aware inline players (authenticated)

`loadStorageFiles` lists `…/` and `…/submission/` and signs each file with `createSignedUrl` (original). Change: after listing, resolve each file's **player** URL via a proxy-aware lookup (reuse the exact `footage_proxies` pattern already in `FootagePanel.loadFiles`), while keeping the **original** signed URL for the download link. Concretely, extend the per-file shape from `{ name, path, signedUrl }` to `{ name, path, signedUrl /* original: download */, previewUrl /* proxy-or-original: player */ }` and point the `<video>`/`ThemedVideoPlayer` `src` at `previewUrl`. Authenticated users can read `footage_proxies` (RLS allows), so this is client-side; no edge function needed.

### 2. PublicVideoReview — proxy via the public edge function (anonymous)

`footage_proxies` RLS is authenticated-only, so an anonymous visitor's client-side proxy lookup returns nothing and silently falls back to the original. Fix: **reuse the deployed `public-calendar-video` edge function** for the player URL. `PublicVideoReview` already loads the `video_edit` row (has `id` + `client_id`); call the function with `{ post_id: videoEditId, client_id }` (playback → proxy-preferred, freshness-aware) instead of `getSignedVideoUrl`. If a download button is later added, call the same function with `prefer:"original"`. No new function required; verify the existing one's ownership gate and payload cover this caller (extend only if a field is missing).

### 3. Playback defaults to the newest version

Version arrays in `file_submission` are stored **oldest-first** (`FootagePanel.persistLinks` appends `[...links, url]`), and `VideoReviewModal` currently defaults `activeIdx = 0` (oldest). Change the initial selection to the **last version entry** (newest) — the last item whose label is `V#` (skip trailing `Link N` externals). For single-path submissions (the common re-upload case, where `file_submission` holds one path) this is unchanged (index 0 is the only/newest). Apply the same "default to newest" rule to any other surface that renders a version list. Folder-listing surfaces (FootagePanel/Scripts) additionally sort the file list newest-first for the default player. No data-model change.

### 4. Re-queue the 30 failed proxy jobs (one-time)

Via Supabase MCP `execute_sql` (schema changes go through the dashboard/MCP, never `db push`):
`update public.footage_proxies set status='queued', attempts=0, error=null, claimed_at=null where status='error';`
The render-worker picks them up on its poll loop. Cap: leave the existing `attempts` guard so a genuinely un-transcodable file (e.g. an 8.6 GB source that times out) lands back in `error` rather than looping forever. Verify progression `queued → processing → done` afterward.

### 5. Lazy backfill — enqueue a proxy when a proxy-less clip is played

When a playback resolver finds no `done` proxy for a `footage`-bucket path, request one (fire-and-forget), so the *next* view is fast:

- **Authenticated (helpers + Scripts/FootagePanel):** call a new `security definer` RPC `request_footage_proxy(p_source_path text)` that does `insert into footage_proxies (source_bucket, source_path, status) values ('footage', p_source_path, 'queued') on conflict (source_path) do nothing;`. Granted to `authenticated`. This avoids opening a broad client INSERT policy on the table.
- **Anonymous (PublicVideoReview):** when `public-calendar-video` signs the original because no fresh proxy exists, it (service role) performs the same idempotent insert before returning. (Small addition to the edge function.)

Lazy backfill only ever *adds* `queued` rows for real footage paths (idempotent via the unique `source_path`), so it can't corrupt state or double-transcode.

## Data-model & versioning notes (no changes, but must be respected)

- `video_edits.file_submission` holds either a single storage path or a JSON array (oldest-first). A **file** upload via `videoUploadService.uploadVideoFile(subfolder='submission')` **overwrites** it with a single path; link management (`FootagePanel.persistLinks`) writes arrays. The physical `…/submission/` folder accumulates every uploaded file. This pre-existing split is **out of scope** to fix.
- Proxy paths mirror source paths 1:1 in `footage-proxies`, so each distinct version/filename has its own proxy row (unique `source_path`). Versioning is transparent to the proxy.
- **Freshness invariant:** a proxy must never win over a newer re-uploaded original at the same path. Client-side helpers rely on `footage_proxies.status='done'` + the trigger re-queueing on re-upload; the public edge function additionally compares bucket timestamps. Preserve both.

## Egress analysis

- **Playback:** 5 MB proxy via signed (uncached) URL. Reaching the 250 GB uncached quota would take ~50,000 plays/mo — not a concern. (Uncached egress currently ~22%.)
- **Downloads:** unchanged — full original, uncached, on explicit action only.
- **Backfill transcode cost:** the render-worker downloads each original once to transcode (service-role egress). Re-queuing 30 clips ≈ one-time ~18 GB uncached; lazy backfill spreads its cost across actual views. Both fit comfortably under quota.
- Cached-egress (public-bucket) quota is untouched — no bucket is made public.

## Invariants — what must NOT break

1. **Downloads always deliver the full-resolution original**, never the proxy (every surface, incl. VideoReviewModal `getDownloadVideoUrl`, FootagePanel/Scripts `download` anchors, public `prefer:"original"`).
2. **No proxy → original fallback** on every surface (never a broken player).
3. **Newest version is the default**; V1/V2/V3 tabs still switch as before.
4. **Google Drive / external URLs** keep their current iframe/link behavior (proxy logic only touches storage paths).
5. **Existing proxy surfaces** (FootagePanel, VideoReviewModal, ContentCalendar, public calendar) keep working unchanged.
6. **Stale proxy never beats a newer re-upload** (freshness invariant).
7. Public (anon) surfaces never expose `footage_proxies` directly (RLS stays authenticated-only; anon goes through the edge function).

## Testing / verification

- **Worker:** `cd render-worker && npm test` (proxy helper unit tests) + `npm run build` (tsc exit 0).
- **Frontend:** `npx tsc --noEmit` exit 0 (CI has no typecheck — verify locally).
- **Manual per surface:** proxy-less clip plays original then, after lazy-backfill completes, plays the proxy fast; clip *with* proxy starts in ~1–2s; **download yields the original** (check file size ≈ original, not ~5 MB); newest version selected by default; Drive/external unchanged.
- **Public review:** anonymous session (logged-out browser) plays the proxy via the edge function; ownership gate still rejects a mismatched `client_id`.
- **DB:** after re-queue, `select status, count(*) from footage_proxies group by status` shows the 30 draining `queued → done`.

## Rollout / deploy

- **Frontend** (`Scripts.tsx`, `PublicVideoReview.tsx`, version-default tweak): commit to `main` → CI auto-builds/deploys.
- **Edge function** (`public-calendar-video` lazy-insert addition, if used): deploy via Supabase MCP (`deploy_edge_function`) — **not** CI.
- **DB** (`request_footage_proxy` RPC + grant; re-queue UPDATE): apply via Supabase MCP/dashboard; verify in prod. Never `db push`.
- **Render-worker:** no code change (keeps 720p). Just processes the re-queued jobs.
- Sequence: RPC + re-queue first (coverage recovers in background) → ship the two proxy-aware surfaces + version default → verify.

## Out of scope (explicit)

- Cloudflare/public-bucket egress optimization (proxies stay signed/private).
- Lowering proxy resolution/bitrate below 720p.
- Fixing the `file_submission` single-vs-array inconsistency or the revisions data model.
- Mass backfill of all 69 legacy clips (lazy backfill covers watched ones; a bulk pass can be a later, separate task).
- Adding a download button to PublicVideoReview (call out only; not required).

## Open risks

- **PublicVideoReview `client_id` availability:** the page must already have (or be able to fetch, anonymously) the edit's `client_id` to satisfy the edge function's ownership gate. Confirm during planning; if absent, fetch it in the same public call path.
- **Large originals (up to 8.6 GB) may keep failing** the transcode (worker timeout). Acceptable — they stay on original playback; flag any persistent failures rather than looping.
- **Lazy-backfill enqueue rate:** bounded by the unique `source_path` (one row per clip ever); no runaway.
