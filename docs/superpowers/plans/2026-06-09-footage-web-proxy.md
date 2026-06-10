# Footage Web-Proxy Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploaded footage start playing near-instantly in the Footage panel by generating a 720p H.264 + faststart web proxy for each new upload, while leaving the full-quality original untouched.

**Architecture:** A Postgres trigger on `storage.objects` enqueues a `footage_proxies` job whenever a video lands in the `footage` bucket. The existing VPS render-worker (a polling job runner that already has ffmpeg) claims the job, transcodes the original to a 720p faststart MP4, and uploads it to a new `footage-proxies` bucket. The Footage panel reads proxy status and streams the proxy when ready, falling back to the original otherwise.

**Tech Stack:** Supabase (Postgres, Storage, RLS), Node/TypeScript render-worker (ffmpeg-static, supabase-js, vitest), React/TypeScript front-end.

**Spec:** `docs/superpowers/specs/2026-06-09-footage-web-proxy-design.md`

---

## Pre-Flight Notes (read before starting)

- **DB changes go through the Supabase dashboard SQL editor, NOT `supabase db push`.** This project has known migration drift; schema is applied via the dashboard and verified in prod. Each DB task below gives the exact SQL plus a verification query.
- **Front-end ships via CI** (`git push` to `main` auto-builds + deploys). There is no typecheck in CI — verify `tsc` locally by exit code before pushing.
- **The render-worker runs on the VPS via systemd.** Deploy is a separate manual step (Task 8). Worker tests run locally with `npm test` (vitest) inside `render-worker/`.
- **All app/front-end work must be based on `origin/main`** (the checked-out `feat/video-editor-phase-1` branch is stale). Use a worktree off `main`.
- **The original file is read-only throughout.** The worker only downloads it; the proxy is written to a different bucket.

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `footage_proxies` table (DB) | Create (dashboard) | Job queue + proxy status, one row per source object |
| `enqueue_footage_proxy()` + trigger (DB) | Create (dashboard) | Auto-enqueue a job on video upload to `footage` |
| `footage-proxies` bucket + RLS (DB/Storage) | Create (dashboard) | Holds generated proxies, mirrored path |
| `render-worker/src/proxy.ts` | Create | Pure helpers: proxy path derivation + ffmpeg arg builder + `runProxy` (transcode) |
| `render-worker/src/proxy.test.ts` | Create | Unit tests for the pure helpers |
| `render-worker/src/db.ts` | Modify | `ProxyJobRow` type + claim/markDone/markError + reclaim |
| `render-worker/src/index.ts` | Modify | `processProxyJob` + wire into `tick()` |
| `src/components/FootagePanel.tsx` | Modify | Query proxy status, stream proxy when ready, "Optimizing…" hint |
| `src/components/ThemedVideoPlayer.tsx` | Modify | `preload="none"` → `preload="metadata"` |

---

## Task 1: Create the `footage_proxies` table (DB)

**Files:**
- Create (dashboard SQL): `footage_proxies` table

- [ ] **Step 1: Run the table DDL in the Supabase dashboard SQL editor**

```sql
create table if not exists public.footage_proxies (
  id            uuid primary key default gen_random_uuid(),
  source_bucket text not null default 'footage',
  source_path   text not null unique,
  proxy_bucket  text not null default 'footage-proxies',
  proxy_path    text,
  status        text not null default 'queued'
                  check (status in ('queued','processing','done','error')),
  error         text,
  attempts      int  not null default 0,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index if not exists footage_proxies_status_created_idx
  on public.footage_proxies (status, created_at);

-- The worker uses the service-role key (bypasses RLS). Enable RLS and add a
-- read policy so the authenticated front-end can see proxy status.
alter table public.footage_proxies enable row level security;

create policy "authenticated read footage_proxies"
  on public.footage_proxies for select
  to authenticated
  using (true);
```

- [ ] **Step 2: Verify the table exists with the expected columns**

Run in the SQL editor:

```sql
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='footage_proxies'
order by ordinal_position;
```

Expected: rows for `id, source_bucket, source_path, proxy_bucket, proxy_path, status, error, attempts, claimed_at, created_at, finished_at`.

- [ ] **Step 3: Verify the unique constraint and RLS are active**

```sql
select relrowsecurity from pg_class where relname='footage_proxies';      -- expect: t
select indexname from pg_indexes where tablename='footage_proxies';        -- expect footage_proxies_source_path_key + status index
```

Expected: RLS = `t`; a unique index on `source_path` plus the status index.

---

## Task 2: Create the enqueue trigger on `storage.objects` (DB)

**Files:**
- Create (dashboard SQL): `enqueue_footage_proxy()` function + trigger

- [ ] **Step 1: Create the trigger function**

```sql
create or replace function public.enqueue_footage_proxy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only footage bucket, only video files, skip anything already under a
  -- proxies/ path. Images are previewed directly and need no proxy.
  if new.bucket_id = 'footage'
     and lower(new.name) ~ '\.(mov|mp4|m4v|webm|avi|mkv|hevc)$' then
    insert into public.footage_proxies (source_bucket, source_path, status)
    values ('footage', new.name, 'queued')
    on conflict (source_path) do nothing;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 2: Attach the trigger to `storage.objects`**

```sql
drop trigger if exists trg_enqueue_footage_proxy on storage.objects;
create trigger trg_enqueue_footage_proxy
  after insert on storage.objects
  for each row execute function public.enqueue_footage_proxy();
```

- [ ] **Step 3: Verify the trigger fires for a video and skips non-videos (test in a transaction, then roll back)**

```sql
begin;
-- Simulate a video upload row (only the columns the trigger reads).
insert into storage.objects (bucket_id, name, owner, metadata)
  values ('footage', 'test-client/test-edit/clip.mov', null, '{}');
-- Simulate an image upload (should NOT enqueue).
insert into storage.objects (bucket_id, name, owner, metadata)
  values ('footage', 'test-client/test-edit/photo.jpg', null, '{}');

select source_path, status from public.footage_proxies
  where source_path like 'test-client/test-edit/%';
-- Expected: exactly ONE row, for clip.mov, status 'queued'. No photo.jpg row.
rollback;
```

Expected: one `queued` row for `clip.mov`; the `.jpg` produced no row. `rollback` discards the test data.

---

## Task 3: Create the `footage-proxies` storage bucket + RLS (DB/Storage)

**Files:**
- Create (dashboard): `footage-proxies` bucket + storage policies

- [ ] **Step 1: Create the bucket**

In the dashboard SQL editor (or Storage UI — SQL shown for repeatability):

```sql
insert into storage.buckets (id, name, public)
values ('footage-proxies', 'footage-proxies', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Add RLS policies mirroring the `footage` bucket (authenticated read; service-role writes bypass RLS)**

```sql
create policy "Authenticated read footage proxies"
  on storage.objects for select
  using (bucket_id = 'footage-proxies' and auth.role() = 'authenticated');
```

> Note: the worker writes proxies with the service-role key, which bypasses RLS, so no INSERT/UPDATE/DELETE policy is required for the worker. We intentionally do NOT add a client write policy — the front-end never writes proxies.

- [ ] **Step 3: Verify**

```sql
select id, public from storage.buckets where id='footage-proxies';   -- expect public=false
select policyname from pg_policies
  where schemaname='storage' and tablename='objects'
    and policyname='Authenticated read footage proxies';              -- expect one row
```

---

## Task 4: Worker — pure proxy helpers + tests (`render-worker/src/proxy.ts`)

**Files:**
- Create: `render-worker/src/proxy.ts`
- Test: `render-worker/src/proxy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `render-worker/src/proxy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { proxyPathFor, buildProxyArgs } from "./proxy.js";

describe("proxyPathFor", () => {
  it("mirrors the source path and forces a .mp4 extension", () => {
    expect(proxyPathFor("c1/v1/IMG_6001.MOV")).toBe("c1/v1/IMG_6001.mp4");
    expect(proxyPathFor("c1/v1/submission/clip.webm")).toBe("c1/v1/submission/clip.mp4");
  });
  it("handles names with dots", () => {
    expect(proxyPathFor("c1/v1/my.clip.final.mov")).toBe("c1/v1/my.clip.final.mp4");
  });
});

describe("buildProxyArgs", () => {
  it("produces a 720p H.264 + AAC + faststart transcode that never upscales", () => {
    const args = buildProxyArgs("/in/input.mov", "/out/output.mp4");
    expect(args).toContain("-i");
    expect(args).toContain("/in/input.mov");
    expect(args.join(" ")).toContain("scale=-2:'min(720,ih)'");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args.join(" ")).toContain("+faststart");
    expect(args[args.length - 1]).toBe("/out/output.mp4");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd render-worker && npm test -- proxy`
Expected: FAIL — `Cannot find module './proxy.js'` / exports not defined.

- [ ] **Step 3: Implement `render-worker/src/proxy.ts`**

```ts
// render-worker/src/proxy.ts
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");

/** Mirror a source object key into the proxy bucket, forcing a .mp4 extension. */
export function proxyPathFor(sourcePath: string): string {
  const dir = path.posix.dirname(sourcePath);
  const base = path.posix.basename(sourcePath);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const name = `${stem}.mp4`;
  return dir === "." ? name : `${dir}/${name}`;
}

/**
 * ffmpeg args for a 720p web-preview proxy: H.264 video, AAC audio, moov atom
 * at the front (+faststart) so playback starts without a full download.
 * `scale=-2:'min(720,ih)'` caps height at 720p, keeps aspect, and never
 * upscales a smaller source. Re-encoding to H.264 also fixes HEVC sources.
 */
export function buildProxyArgs(input: string, output: string): string[] {
  return [
    "-i", input,
    "-vf", "scale=-2:'min(720,ih)'",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output,
  ];
}

/** Transcode `input` to a proxy at `output`. Throws on non-zero ffmpeg exit. */
export async function runProxy(input: string, output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = buildProxyArgs(input, output);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg proxy exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd render-worker && npm test -- proxy`
Expected: PASS (both describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add render-worker/src/proxy.ts render-worker/src/proxy.test.ts
git commit -m "feat(render-worker): proxy path + ffmpeg arg helpers for footage web proxies"
```

---

## Task 5: Worker — proxy queue DB helpers (`render-worker/src/db.ts`)

**Files:**
- Modify: `render-worker/src/db.ts`

- [ ] **Step 1: Add the `ProxyJobRow` type and claim/mark helpers**

Append to `render-worker/src/db.ts` (after the audio-import helpers, before `getVideoEditStoragePath`):

```ts
// ---- Footage proxy jobs ----

export type ProxyJobRow = {
  id: string;
  source_bucket: string;
  source_path: string;
  proxy_bucket: string;
  status: "queued" | "processing" | "done" | "error";
};

export async function claimNextProxyJob(client: SupabaseClient): Promise<ProxyJobRow | null> {
  const { data: candidate } = await client
    .from("footage_proxies")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!candidate) return null;

  const { data: claimed, error } = await client
    .from("footage_proxies")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, source_bucket, source_path, proxy_bucket, status")
    .maybeSingle();
  if (error) throw error;
  return (claimed as ProxyJobRow | null) ?? null;
}

export async function markProxyDone(client: SupabaseClient, id: string, proxyPath: string) {
  await client
    .from("footage_proxies")
    .update({ status: "done", proxy_path: proxyPath, finished_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markProxyError(client: SupabaseClient, id: string, message: string) {
  await client
    .from("footage_proxies")
    .update({
      status: "error",
      error: message.slice(0, 2000),
      attempts: undefined, // see Step 2 — incremented via RPC-free pattern below
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}
```

- [ ] **Step 2: Fix the attempts increment (the `undefined` above won't increment) — replace `markProxyError` with a read-then-write version**

Replace the `markProxyError` body from Step 1 with:

```ts
export async function markProxyError(client: SupabaseClient, id: string, message: string) {
  const { data: row } = await client
    .from("footage_proxies")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();
  const attempts = ((row as { attempts: number } | null)?.attempts ?? 0) + 1;
  await client
    .from("footage_proxies")
    .update({
      status: "error",
      error: message.slice(0, 2000),
      attempts,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}
```

- [ ] **Step 3: Add proxy reclaim to `reclaimOrphanedJobs`**

In `reclaimOrphanedJobs`, after the `audio_import_jobs` reclaim block, add (note the proxy queue uses `status='processing'` and column `claimed_at`, and has no `progress` column):

```ts
  await client
    .from("footage_proxies")
    .update({ status: "queued", claimed_at: null })
    .eq("status", "processing")
    .lt("claimed_at", cutoff);
```

- [ ] **Step 4: Typecheck the worker**

Run: `cd render-worker && npm run build`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add render-worker/src/db.ts
git commit -m "feat(render-worker): footage_proxies queue claim/mark/reclaim helpers"
```

---

## Task 6: Worker — `processProxyJob` + wire into `tick()` (`render-worker/src/index.ts`)

**Files:**
- Modify: `render-worker/src/index.ts`

- [ ] **Step 1: Add imports**

In the `./db.js` import block, add the new symbols:

```ts
  claimNextProxyJob,
  markProxyDone,
  markProxyError,
  type ProxyJobRow,
```

And add a new import line near the other module imports:

```ts
import { proxyPathFor, runProxy } from "./proxy.js";
```

- [ ] **Step 2: Add the `PROXY_BUCKET` constant**

Near the other bucket constants (`SOURCE_BUCKET`, `OUT_BUCKET`):

```ts
const PROXY_BUCKET = process.env.SUPABASE_PROXY_BUCKET ?? "footage-proxies";
```

- [ ] **Step 3: Add the `processProxyJob` function**

Add near the other `process*Job` functions:

```ts
async function processProxyJob(client: ReturnType<typeof makeClient>, job: ProxyJobRow) {
  const workDir = path.join(WORK_DIR, `proxy-${job.id}`);
  const input = path.join(workDir, "input" + path.extname(job.source_path));
  const output = path.join(workDir, "output.mp4");
  await fs.mkdir(workDir, { recursive: true });
  try {
    await downloadToFile(client, job.source_bucket, job.source_path, input);
    await runProxy(input, output);
    const proxyPath = proxyPathFor(job.source_path);
    await uploadFile(client, PROXY_BUCKET, proxyPath, output, "video/mp4");
    await markProxyDone(client, job.id, proxyPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

- [ ] **Step 4: Wire it into `tick()` after the transcribe block (proxies are background; they yield to render + transcribe)**

At the end of `tick()`, after the transcribe handling, add:

```ts
  const pj = await claimNextProxyJob(client);
  if (pj) {
    try {
      await processProxyJob(client, pj);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      console.error(`[render-worker] proxy ${pj.id} failed:`, msg);
      await markProxyError(client, pj.id, msg);
    }
  }
```

- [ ] **Step 5: Typecheck the worker**

Run: `cd render-worker && npm run build`
Expected: exit 0.

- [ ] **Step 6: Run the full worker test suite**

Run: `cd render-worker && npm test`
Expected: PASS (existing tests + the new `proxy.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add render-worker/src/index.ts
git commit -m "feat(render-worker): process footage proxy jobs in the poll loop"
```

---

## Task 7: Panel — stream the proxy when ready, fall back otherwise (`src/components/FootagePanel.tsx` + `ThemedVideoPlayer.tsx`)

**Files:**
- Modify: `src/components/FootagePanel.tsx` (type at line 37, `loadFiles` ~line 98, player mount ~line 434)
- Modify: `src/components/ThemedVideoPlayer.tsx` (`preload` ~line 166)

> Do this on a worktree off `origin/main` (the working copy is on a stale branch).

- [ ] **Step 1: Extend the `StorageFile` type (line 37)**

Replace:

```ts
interface StorageFile { name: string; signedUrl: string; }
```

with:

```ts
interface StorageFile {
  name: string;
  signedUrl: string;                 // ALWAYS the original — used for download/copy-link
  previewUrl: string;                // proxy signed URL if ready, else the original
  proxyStatus?: "queued" | "processing" | "done" | "error";
}
```

- [ ] **Step 2: Make `loadFiles` proxy-aware (replace the `loadFiles` body, ~lines 98-114)**

```ts
  const loadFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
    if (error || !data?.length) { setFiles([]); setLoading(false); return; }
    const fileObjects = data.filter(f => f.name && !f.name.endsWith('/'));

    // Fetch proxy status for every source path in this folder in one query.
    const sourcePaths = fileObjects.map(f => `${prefix}${f.name}`);
    const { data: proxies } = await supabase
      .from('footage_proxies')
      .select('source_path, proxy_bucket, proxy_path, status')
      .in('source_path', sourcePaths);
    const proxyBySource = new Map(
      (proxies ?? []).map((p: any) => [p.source_path, p])
    );

    const signed = await Promise.all(
      fileObjects.map(async (f) => {
        const sourcePath = `${prefix}${f.name}`;
        const { data: orig } = await supabase.storage.from(BUCKET).createSignedUrl(sourcePath, 3600);
        if (!orig) return null;
        const proxy = proxyBySource.get(sourcePath);
        let previewUrl = orig.signedUrl;
        if (proxy?.status === 'done' && proxy.proxy_path) {
          const { data: purl } = await supabase.storage
            .from(proxy.proxy_bucket || 'footage-proxies')
            .createSignedUrl(proxy.proxy_path, 3600);
          if (purl) previewUrl = purl.signedUrl;
        }
        return {
          name: f.name,
          signedUrl: orig.signedUrl,
          previewUrl,
          proxyStatus: proxy?.status as StorageFile['proxyStatus'],
        };
      })
    );
    setFiles(signed.filter(Boolean) as StorageFile[]);
    setLoading(false);
  };
```

- [ ] **Step 3: Use the proxy for playback (the `<ThemedVideoPlayer src>` at ~line 435)**

Replace:

```tsx
                        <ThemedVideoPlayer
                          src={f.signedUrl}
```

with:

```tsx
                        <ThemedVideoPlayer
                          src={f.previewUrl}
```

> Leave every OTHER `f.signedUrl` (download links, copy-link, image `src`) unchanged — downloads must serve the full-quality original, not the proxy.

- [ ] **Step 4: Add the "Optimizing…" hint (inside the player wrapper, right before the `</div>` that closes the `mx-auto` wrapper at ~line 440)**

Add directly under the `<ThemedVideoPlayer ... />`:

```tsx
                        {(f.proxyStatus === 'queued' || f.proxyStatus === 'processing') && (
                          <div className="text-[11px] text-muted-foreground/70 mt-1 text-center">
                            Optimizing for faster playback…
                          </div>
                        )}
```

- [ ] **Step 5: Bump the player preload (`src/components/ThemedVideoPlayer.tsx`, ~line 166)**

Replace:

```tsx
          preload="none"
```

with:

```tsx
          preload="metadata"
```

- [ ] **Step 6: Typecheck locally (CI does not typecheck)**

Run (from the worktree root): `npx tsc --noEmit -p tsconfig.json; echo "EXIT=$?"`
Expected: `EXIT=0` and no errors mentioning `FootagePanel` or `ThemedVideoPlayer`.

- [ ] **Step 7: Commit and push to main**

```bash
git add src/components/FootagePanel.tsx src/components/ThemedVideoPlayer.tsx
git commit -m "feat(footage): stream 720p web proxy in panel when ready, fall back to original"
git push origin HEAD:main
```

---

## Task 8: End-to-end verification + worker deploy

**Files:** none (operational)

- [ ] **Step 1: Deploy the render-worker to the VPS**

Per the project deploy process (`./deploy-expect.sh` from this shell, or the worker's documented systemd deploy). Confirm the worker restarts cleanly:

Expected: worker logs show `[render-worker] starting; poll=…ms` with no startup errors.

- [ ] **Step 2: Confirm the worker has the proxy bucket env (or default)**

The worker defaults `PROXY_BUCKET` to `footage-proxies`. If the VPS pins buckets via env, ensure `SUPABASE_PROXY_BUCKET=footage-proxies` is set in the systemd EnvironmentFile. Otherwise the default applies.

- [ ] **Step 3: Upload a fresh iPhone `.MOV` through the Footage panel**

In the app, open a script's Footage panel and upload a real iPhone `.MOV`.

- [ ] **Step 4: Watch the job flow**

```sql
select source_path, status, error, attempts, proxy_path
from public.footage_proxies
order by created_at desc limit 5;
```

Expected progression within ~30-60s: `queued` → `processing` → `done` with a non-null `proxy_path`.

- [ ] **Step 5: Confirm fast playback**

Re-open the panel for that clip and press play. Expected: playback starts in ~1-2s (vs ~20s before). Confirm the "Optimizing…" hint is gone once `status='done'`.

- [ ] **Step 6: Confirm the original is intact**

Click **Download** on the same clip. Expected: the downloaded file is the original full-resolution `.MOV` (NOT the 720p proxy) — i.e. download still uses `signedUrl`.

- [ ] **Step 7: Confirm HEVC handling (if a sample is available)**

Upload an HEVC `.MOV`. Expected: proxy job reaches `done`, and the clip — which may have stalled/failed before — now plays as H.264.

---

## Self-Review Notes

- **Spec coverage:** bucket (Task 3), table (Task 1), trigger (Task 2), worker job type incl. HEVC-via-H.264 transcode (Tasks 4-6), panel proxy playback + fallback + hint + `preload` (Task 7), originals untouched / download uses original (Task 7 Step 3 + Task 8 Step 6), new-uploads-only / no backfill (no backfill task by design), error fallback to original (Task 7 Step 2 leaves `previewUrl=original` unless proxy `done`). All covered.
- **Naming consistency:** `claimNextProxyJob` / `markProxyDone` / `markProxyError` / `ProxyJobRow` / `proxyPathFor` / `buildProxyArgs` / `runProxy` / `PROXY_BUCKET` used identically across Tasks 4-6. Table `footage_proxies`, bucket `footage-proxies`, status values `queued|processing|done|error` consistent across DB + worker + panel.
- **Note:** the proxy queue uses `status='processing'` (not `'running'`) and has no `progress` column, unlike the render/transcribe queues — reflected in the reclaim helper (Task 5 Step 3) and claim helper (Task 5 Step 1).
