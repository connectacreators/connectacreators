# Footage 720p Proxy Playback Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the 720p proxy rollout so every surface plays the fast proxy (falling back to the original), playback defaults to the newest submission, and proxy-less clips self-heal — without changing download behavior (always full-resolution original).

**Architecture:** The proxy pipeline (trigger → `footage_proxies` queue → render-worker → `footage-proxies` bucket) already runs. This plan (a) makes the two remaining playback surfaces proxy-aware, (b) defaults version tabs to newest, (c) re-queues failed proxy jobs, and (d) adds lazy backfill (enqueue a proxy the first time a proxy-less clip is played). Authenticated surfaces resolve the proxy client-side; the no-login page uses the existing `public-calendar-video` edge function.

**Tech Stack:** React/TypeScript (Vite), Supabase (Postgres + RLS, Storage, Edge Functions/Deno), Supabase MCP for DB + edge-function deploys.

## Global Constraints

- **Build on the worktree off `origin/main`** at branch `feat/proxy-playback-rollout` (the checked-out `feat/video-editor-phase-1` branch is stale — never commit there).
- **Downloads always serve the full-resolution original**; playback always uses proxy-with-fallback. Never cross the two.
- **DB changes go through Supabase MCP / dashboard, never `supabase db push`.** Verify in prod (project `hxojqrilwhhrvloiwmfo`).
- **Edge functions deploy via Supabase MCP `deploy_edge_function`, NOT CI.**
- **Frontend ships via CI** (push to `main`). CI has **no typecheck** — every frontend task ends with `npx tsc --noEmit` exit 0.
- `footage_proxies` is not in the generated Supabase types — query it via `(supabase as any)`.
- App-surface styling uses branding tokens (`hsl(var(--…))`), not hex. (Minimal styling here.)
- Proxy path mirrors the source path 1:1 in `footage-proxies`; `footage_proxies.source_path` is unique.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `request_footage_proxy` RPC (DB) | Create (MCP) | `security definer` fn: idempotently enqueue a proxy job for a footage path (lazy backfill, authenticated) |
| Re-queue UPDATE (DB, one-time) | Run (MCP) | Reset the 30 `error` proxy jobs to `queued` |
| `src/services/videoUploadService.ts` | Modify | `getPlaybackVideoUrl` fires lazy-backfill RPC on proxy miss |
| `src/pages/Scripts.tsx` | Modify | `loadStorageFiles` resolves a proxy `previewUrl`; thumbnails use it |
| `supabase/functions/public-calendar-video/index.ts` | Modify + deploy (MCP) | Lazy-backfill enqueue when signing the original for anon |
| `src/pages/PublicVideoReview.tsx` | Modify | Resolve playback URL via the `public-calendar-video` edge fn |
| `src/components/VideoReviewModal.tsx` | Modify | Default the version tab to the newest entry |
| `src/components/FootagePanel.tsx` | Modify | Download buttons use an attachment-signed original URL (fix "navigates instead of downloads") |

---

## Task 1: `request_footage_proxy` RPC (lazy-backfill enqueue, authenticated)

**Files:**
- Create (Supabase MCP `apply_migration`): function `public.request_footage_proxy(text)`

**Interfaces:**
- Produces: SQL function `request_footage_proxy(p_source_path text) returns void`, callable by `authenticated` via `supabase.rpc('request_footage_proxy', { p_source_path })`. Idempotent: inserts a `queued` row only if no row exists for that `source_path`.

- [ ] **Step 1: Apply the function via Supabase MCP** (`apply_migration`, name `request_footage_proxy`)

```sql
create or replace function public.request_footage_proxy(p_source_path text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.footage_proxies (source_bucket, source_path, status)
  values ('footage', p_source_path, 'queued')
  on conflict (source_path) do nothing;
$$;

grant execute on function public.request_footage_proxy(text) to authenticated;
```

- [ ] **Step 2: Verify it inserts once and is idempotent** (Supabase MCP `execute_sql`)

```sql
select public.request_footage_proxy('__plan_test__/req.mp4');
select public.request_footage_proxy('__plan_test__/req.mp4'); -- second call = no-op
select count(*) as n, min(status) as status
from public.footage_proxies where source_path = '__plan_test__/req.mp4';
```
Expected: `n = 1`, `status = queued`.

- [ ] **Step 3: Clean up the test row** (Supabase MCP `execute_sql`)

```sql
delete from public.footage_proxies where source_path = '__plan_test__/req.mp4';
```
Expected: 1 row deleted.

---

## Task 2: Re-queue the 30 failed proxy jobs (one-time)

**Files:**
- Run (Supabase MCP `execute_sql`): UPDATE on `public.footage_proxies`

- [ ] **Step 1: Snapshot current status counts**

```sql
select status, count(*) from public.footage_proxies group by status order by status;
```
Expected: roughly `done ~33`, `error ~30`, `queued 0`, `processing 0`.

- [ ] **Step 2: Re-queue the error rows**

```sql
update public.footage_proxies
set status = 'queued', attempts = 0, error = null, claimed_at = null
where status = 'error';
```
Expected: ~30 rows updated.

- [ ] **Step 3: Confirm the worker drains them** (wait ~2–5 min, then re-run)

```sql
select status, count(*) from public.footage_proxies group by status order by status;
```
Expected: `queued`/`processing` trending toward 0, `done` climbing. Any that land back in `error` are genuinely un-transcodable (e.g. multi-GB timeouts) — leave them; they keep playing the original.

---

## Task 3: `getPlaybackVideoUrl` lazy backfill on proxy miss

**Files:**
- Modify: `src/services/videoUploadService.ts` (the `getPlaybackVideoUrl` method, currently ~lines 280-300)

**Interfaces:**
- Consumes: `request_footage_proxy` RPC (Task 1).
- Produces: unchanged signature `getPlaybackVideoUrl(storagePath: string): Promise<string>` — same return, plus a fire-and-forget enqueue when no `done` proxy exists.

- [ ] **Step 1: Replace the `getPlaybackVideoUrl` body**

Replace the existing method with (keeps existing behavior; adds the enqueue on the miss path):

```ts
  // Proxy-aware resolver for PLAYBACK only. Returns the fast 720p web proxy
  // from `footage-proxies` when one is ready, otherwise the original. On a miss
  // it fire-and-forget enqueues a proxy job (lazy backfill) so the NEXT view is
  // fast. Never use this for downloads — those must pull the full-res original
  // via getSignedVideoUrl / getDownloadVideoUrl.
  async getPlaybackVideoUrl(storagePath: string): Promise<string> {
    try {
      // `footage_proxies` is not in the generated DB types yet — cast to query it.
      const { data: proxy } = await (supabase as any)
        .from('footage_proxies')
        .select('proxy_bucket, proxy_path, status')
        .eq('source_path', storagePath)
        .eq('status', 'done')
        .limit(1)
        .maybeSingle();
      if (proxy?.proxy_path) {
        const { data } = await supabase.storage
          .from(proxy.proxy_bucket || 'footage-proxies')
          .createSignedUrl(proxy.proxy_path, 3600);
        if (data?.signedUrl) return data.signedUrl;
      }
      // No ready proxy — enqueue one for next time (idempotent, non-blocking).
      // Only for storage paths (never http/Drive URLs).
      if (storagePath && !/^https?:\/\//i.test(storagePath)) {
        void (supabase as any)
          .rpc('request_footage_proxy', { p_source_path: storagePath })
          .then(() => {}, () => {});
      }
    } catch {
      // Table missing / proxy not ready / query error — fall back to original.
    }
    return this.getSignedVideoUrl(storagePath);
  },
```

- [ ] **Step 2: Typecheck**

Run (from the worktree root): `npx tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0`, no errors mentioning `videoUploadService`.

- [ ] **Step 3: Commit**

```bash
git add src/services/videoUploadService.ts
git commit -m "feat(footage): lazy-backfill a proxy when playback finds none"
```

---

## Task 4: Scripts.tsx thumbnails use the proxy

**Files:**
- Modify: `src/pages/Scripts.tsx` — `loadStorageFiles` (~lines 1833-1852), the two state decls (~1497-1498), and the two `FootageCard url={f.signedUrl}` usages (~3913, ~3976)

> The real player/download in the script view already opens `FootagePanel` (proxy-aware). The only original-served bit here is the `FootageCard` thumbnail `<video src={url}>`. This task points that thumbnail at the proxy; downloads/removal are unaffected.

**Interfaces:**
- Produces: `footageStorageFiles` / `submissionStorageFiles` items gain `previewUrl: string` (proxy-or-original); thumbnails render `previewUrl`, `onRemove` still uses `path`.

- [ ] **Step 1: Extend the two state types (lines ~1497-1498)**

Replace:

```ts
  const [footageStorageFiles, setFootageStorageFiles] = useState<{ name: string; path: string; signedUrl: string }[]>([]);
  const [submissionStorageFiles, setSubmissionStorageFiles] = useState<{ name: string; path: string; signedUrl: string }[]>([]);
```

with:

```ts
  const [footageStorageFiles, setFootageStorageFiles] = useState<{ name: string; path: string; signedUrl: string; previewUrl: string }[]>([]);
  const [submissionStorageFiles, setSubmissionStorageFiles] = useState<{ name: string; path: string; signedUrl: string; previewUrl: string }[]>([]);
```

- [ ] **Step 2: Make `loadStorageFiles` resolve a proxy `previewUrl`**

Replace the `loadStorageFiles` body's `listAndSign` (~lines 1834-1843) with:

```ts
    const listAndSign = async (prefix: string) => {
      const { data } = await supabase.storage.from(BUCKET).list(prefix);
      if (!data?.length) return [];
      const files = data.filter(f => f.name && !f.name.endsWith('/'));
      const sourcePaths = files.map(f => `${prefix}${f.name}`);
      // Proxy lookup for the whole folder in one query. `footage_proxies` isn't
      // in generated types — cast. On error, previewUrl falls back to original.
      const { data: proxies } = await (supabase as any)
        .from('footage_proxies')
        .select('source_path, proxy_bucket, proxy_path, status')
        .in('source_path', sourcePaths);
      const proxyBySource = new Map<string, any>((proxies ?? []).map((p: any) => [p.source_path, p]));
      return Promise.all(files.map(async f => {
        const path = `${prefix}${f.name}`;
        const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (!url) return null;
        let previewUrl = url.signedUrl;
        const proxy = proxyBySource.get(path);
        if (proxy?.status === 'done' && proxy.proxy_path) {
          const { data: purl } = await supabase.storage
            .from(proxy.proxy_bucket || 'footage-proxies')
            .createSignedUrl(proxy.proxy_path, 3600);
          if (purl) previewUrl = purl.signedUrl;
        }
        return { name: f.name, path, signedUrl: url.signedUrl, previewUrl };
      })).then(r => r.filter(Boolean) as { name: string; path: string; signedUrl: string; previewUrl: string }[]);
    };
```

- [ ] **Step 3: Point the two thumbnail cards at `previewUrl`**

In both `footageStorageFiles.map` (~line 3913) and `submissionStorageFiles.map` (~line 3976), change:

```tsx
                        url={f.signedUrl}
```
to:
```tsx
                        url={f.previewUrl}
```

> Leave the GDrive/external `FootageCard` (`url={linkedVideoEdit.footage}` / `url={fileSubmission}`) unchanged.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0`, no errors mentioning `Scripts`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Scripts.tsx
git commit -m "feat(scripts): footage/submission thumbnails use the 720p proxy"
```

---

## Task 5: `public-calendar-video` — lazy backfill for anon original-fallback

**Files:**
- Modify: `supabase/functions/public-calendar-video/index.ts` (the `signFreshest` helper)
- Deploy: Supabase MCP `deploy_edge_function`

**Interfaces:**
- Consumes: nothing new (uses the existing service-role client).
- Produces: unchanged response shape; side effect — enqueues a `footage_proxies` row when it signs the `footage` original for playback and no proxy exists.

- [ ] **Step 1: Add the idempotent enqueue in `signFreshest`**

In `signFreshest`, replace the loop that signs from the chosen `order` with a version that enqueues a proxy when it serves the original for playback:

```ts
    const signFreshest = async (fullPath: string) => {
      const [tFootage, tProxy] = await Promise.all([
        tsOf("footage", fullPath),
        tsOf("footage-proxies", fullPath),
      ]);
      if (tFootage === null && tProxy === null) return null;
      const preferProxy = !preferOriginal && tProxy !== null && (tFootage === null || tProxy >= tFootage);
      // Playback with no usable proxy yet → enqueue one for next time (idempotent).
      if (!preferOriginal && tProxy === null) {
        await service
          .from("footage_proxies")
          .upsert(
            { source_bucket: "footage", source_path: fullPath, status: "queued" },
            { onConflict: "source_path", ignoreDuplicates: true }
          )
          .then(() => {}, () => {}); // best-effort; never block playback
      }
      const order = preferProxy ? ["footage-proxies", "footage"] : ["footage", "footage-proxies"];
      for (const bucket of order) {
        const { data, error } = await service.storage.from(bucket).createSignedUrl(fullPath, SIGN_TTL);
        if (!error && data?.signedUrl) return { url: data.signedUrl, bucket };
      }
      return null;
    };
```

- [ ] **Step 2: Deploy via Supabase MCP**

Deploy `public-calendar-video` with the modified `index.ts` (MCP `deploy_edge_function`, project `hxojqrilwhhrvloiwmfo`). Confirm the returned version increments (currently v3 → v4).

- [ ] **Step 3: Smoke-test the endpoint still returns a URL**

Invoke with a real `{ post_id, client_id }` that has a Supabase video (use the in-app public-calendar share, or `supabase.functions.invoke`). Expected: `{ url, kind: "video", bucket }` with HTTP 200; a subsequent `select status from footage_proxies where source_path = '<that path>'` shows a row (`queued` if it was missing).

- [ ] **Step 4: Commit the source**

```bash
git add supabase/functions/public-calendar-video/index.ts
git commit -m "feat(public-video): lazy-backfill a proxy when serving the original to anon"
```

---

## Task 6: PublicVideoReview plays via the edge function (proxy for anon)

**Files:**
- Modify: `src/pages/PublicVideoReview.tsx` (the "Load signed URL" effect, ~lines 88-92)

**Interfaces:**
- Consumes: deployed `public-calendar-video` (Task 5), which returns `{ url }` (proxy-preferred, freshest, ownership-checked).
- Produces: `videoUrl` now points at the proxy when ready.

- [ ] **Step 1: Replace the signed-URL effect**

Replace:

```ts
  // Load signed URL for Supabase videos
  useEffect(() => {
    if (!isSupabaseVideo || !video?.storage_path) return;
    videoUploadService.getSignedVideoUrl(video.storage_path)
      .then(setVideoUrl)
      .catch(() => toast.error('Failed to load video'));
  }, [isSupabaseVideo, video?.storage_path]);
```

with:

```ts
  // Resolve the playback URL through the public edge function so anonymous
  // viewers get the fast 720p proxy (client-side proxy lookup is blocked by RLS
  // for anon). The function is ownership-checked and prefers the freshest copy.
  useEffect(() => {
    if (!isSupabaseVideo || !video?.id || !video?.client_id) return;
    supabase.functions
      .invoke('public-calendar-video', { body: { post_id: video.id, client_id: video.client_id } })
      .then(({ data, error }) => {
        if (error || !data?.url) { toast.error('Failed to load video'); return; }
        setVideoUrl(data.url as string);
      })
      .catch(() => toast.error('Failed to load video'));
  }, [isSupabaseVideo, video?.id, video?.client_id]);
```

> Behavior note to verify: the edge fn resolves `file_submission` first, then `storage_path`. For a review page that is the correct "show the submission" behavior; confirm the expected clip plays. `videoUploadService.getSignedVideoUrl` may now be an unused import — remove it if so to keep tsc clean.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0`, no errors mentioning `PublicVideoReview`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicVideoReview.tsx
git commit -m "feat(public-review): play the 720p proxy via public-calendar-video edge fn"
```

---

## Task 7: VideoReviewModal defaults to the newest version

**Files:**
- Modify: `src/components/VideoReviewModal.tsx` (the source-list `useEffect`, the `setActiveIdx(0)` line ~148)

**Interfaces:**
- Consumes: the `list: VideoSource[]` built just above (labels `V1`, `V2`, … oldest-first; trailing `Link N` externals).
- Produces: initial `activeIdx` points at the newest version instead of the oldest.

- [ ] **Step 1: Replace `setActiveIdx(0)` with newest-version selection**

Replace:

```ts
    setSources(list);
    setActiveIdx(0);
```

with:

```ts
    setSources(list);
    // Version arrays are stored oldest-first, so default to the NEWEST version
    // (the last entry labelled V#). Ignore trailing external "Link N" items.
    let defaultIdx = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (/^V\d+$/.test(list[i].label)) { defaultIdx = i; break; }
    }
    setActiveIdx(defaultIdx);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0`, no errors mentioning `VideoReviewModal`.

- [ ] **Step 3: Commit**

```bash
git add src/components/VideoReviewModal.tsx
git commit -m "feat(review): default the version tab to the newest submission"
```

---

## Task 8: Fix FootagePanel download (attachment URL, not navigate)

**Files:**
- Modify: `src/components/FootagePanel.tsx` — add a `handleDownload` helper; convert the four `<a href={f.signedUrl} download={f.name}>` download controls (~lines 479, 539, 558, 592) to buttons that call it. Leave copy-link and the "Open" (`target="_blank"`) anchor unchanged.

**Bug:** the HTML `download` attribute is ignored for cross-origin URLs (a Supabase signed URL is cross-origin), so clicking "Download" navigates to the link instead of saving the file. Fix by signing with `Content-Disposition: attachment` (`getDownloadVideoUrl`, already used by VideoReviewModal) and clicking a temp anchor. Still the full-resolution original.

**Interfaces:**
- Consumes: `videoUploadService.getDownloadVideoUrl(path, filename)` (already imported at line 9); `prefix` (component scope, `${clientId}/${videoEditId}/${subfolder ? subfolder + '/' : ''}`); `StorageFile` type.

- [ ] **Step 1: Add the `handleDownload` helper** (near the other handlers, e.g. after `handleDeleteFile`)

```tsx
  // Downloads the full-resolution ORIGINAL. A plain <a download> is ignored for
  // cross-origin signed URLs (the browser just navigates to the link — the
  // "opens the public link instead of downloading" bug), so sign with a
  // Content-Disposition: attachment header and click a temporary anchor.
  const handleDownload = async (f: StorageFile) => {
    try {
      const url = await videoUploadService.getDownloadVideoUrl(`${prefix}${f.name}`, f.name);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast.error('Download failed');
    }
  };
```

- [ ] **Step 2: Convert download control #1 — the row icon (~line 479)**

Replace:

```tsx
                    <a
                      href={f.signedUrl}
                      download={f.name}
                      onClick={(e) => e.stopPropagation()}
                      className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </a>
```

with:

```tsx
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                      className="w-6 h-6 rounded border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="w-3 h-3" />
                    </button>
```

- [ ] **Step 3: Convert download control #2 — archive/doc/other (~line 539)**

Replace:

```tsx
                              <a
                                href={f.signedUrl}
                                download={f.name}
                                className="text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                              >
                                <Download className="w-3 h-3" /> Download
                              </a>
```

with:

```tsx
                              <button
                                type="button"
                                onClick={() => handleDownload(f)}
                                className="text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                              >
                                <Download className="w-3 h-3" /> Download
                              </button>
```

- [ ] **Step 4: Convert download control #3 — "Download to watch" (~line 558)**

Replace:

```tsx
                          <a
                            href={f.signedUrl}
                            download={f.name}
                            className="mt-1 text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                          >
                            <Download className="w-3 h-3" /> Download to watch
                          </a>
```

with:

```tsx
                          <button
                            type="button"
                            onClick={() => handleDownload(f)}
                            className="mt-1 text-xs border border-border/50 rounded px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                          >
                            <Download className="w-3 h-3" /> Download to watch
                          </button>
```

- [ ] **Step 5: Convert download control #4 — bottom action bar (~line 592)**

Replace:

```tsx
                      <a
                        href={f.signedUrl}
                        download={f.name}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
                      >⬇ Download</a>
```

with:

```tsx
                      <button
                        type="button"
                        onClick={() => handleDownload(f)}
                        className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
                      >⬇ Download</button>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit; echo "EXIT=$?"`
Expected: `EXIT=0`, no errors mentioning `FootagePanel`.

- [ ] **Step 7: Commit**

```bash
git add src/components/FootagePanel.tsx
git commit -m "fix(footage): download button saves the original instead of opening the link"
```

---

## Task 9: Integration verification + push

**Files:** none (operational)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit; echo "EXIT=$?"` → Expected `EXIT=0`.

- [ ] **Step 2: Push the branch and open a PR to `main`**

```bash
git push -u origin feat/proxy-playback-rollout
gh pr create --base main --head feat/proxy-playback-rollout \
  --title "Finish 720p proxy playback rollout" \
  --body "Proxy-aware playback on Scripts thumbnails + PublicVideoReview; default-to-newest version; re-queue failed proxy jobs; lazy backfill. Downloads stay full-resolution. See docs/superpowers/specs/2026-07-01-footage-proxy-playback-rollout-design.md"
```

- [ ] **Step 3: Manual acceptance (after CI deploys) — walk the invariants**

  - Editing queue → open a clip **with** a proxy: player starts in ~1–2s. **Download** button → file size ≈ original (hundreds of MB), not ~5 MB.
  - Open a clip **without** a proxy: plays original (slow) once; after ~1 min the `footage_proxies` row for it reaches `done`; reopening plays fast.
  - Multi-version submission: the **newest** version is selected by default; V1/V2 tabs still switch.
  - Public review link (logged-out browser): the clip plays the proxy; a wrong `client_id` is rejected.
  - Google Drive / external submissions: unchanged (iframe/link).

- [ ] **Step 4: Confirm coverage recovered**

```sql
select status, count(*) from public.footage_proxies group by status order by status;
```
Expected: the re-queued 30 are mostly `done`; new lazy-backfill rows appear as clips get watched.

---

## Self-Review

- **Spec coverage:** Scripts.tsx proxy (Task 4) ✓; PublicVideoReview proxy via edge fn (Tasks 5-6) ✓; default-to-newest (Task 7) ✓; re-queue failed (Task 2) ✓; lazy backfill authenticated (Tasks 1,3) + anon (Task 5) ✓; downloads unchanged (untouched `getDownloadVideoUrl` / signedUrl paths) ✓; keep 720p / signed URLs (no worker or bucket change) ✓. Out-of-scope items (Cloudflare, quality drop, version data-model, mass backfill) are intentionally absent.
- **Placeholder scan:** every code step shows full code; no TBD/TODO.
- **Type consistency:** `previewUrl: string` added to both Scripts state types and produced by `loadStorageFiles`; `request_footage_proxy(p_source_path text)` name/param matches the `.rpc('request_footage_proxy', { p_source_path })` call; edge-fn `signFreshest` keeps its existing return shape `{ url, bucket } | null`.
- **Ordering:** Task 1 (RPC) precedes Task 3 (calls it); Task 5 (edge-fn deploy) precedes Task 6 (calls it). Tasks 2, 4, 7 are independent.
