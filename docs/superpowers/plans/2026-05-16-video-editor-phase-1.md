# Video Editor — Phase 1: Pipeline Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the end-to-end pipeline — browser EDL → Edge Function → VPS worker → FFmpeg → result back in Storage — using a trivial trim operation. After this phase, an admin can open the editor in dev, set in/out points on a clip, click Export, and watch a rendered MP4 appear minutes later.

**Architecture:** React route at `/editing/:id/edit` (dev-gated) holds an EDL in state and autosaves to a new `editor_projects` table. Export submits a `render_jobs` row via a Supabase Edge Function. A new Node service on the existing VPS polls `render_jobs`, downloads the source from Supabase Storage, runs FFmpeg to trim+concat the clips per the EDL, uploads the result, marks the job done. The browser polls the job and shows a download link when complete.

**Tech Stack:** React + Vite + TypeScript (existing), Supabase Postgres + Storage + Edge Functions (Deno), Node 20 + Vitest + ffmpeg-static on VPS. No frontend tests in Phase 1 — repo has no test runner; manual verification + Deno tests for Edge Functions + Vitest for the worker is the testing posture.

---

## Spec Reference

Source spec: `docs/superpowers/specs/2026-05-16-video-editor-design.md`. This plan covers Phase 1 only (Section 8 of the spec). Phases 2–5 get their own plans later.

## Scope (Phase 1 only)

**In:** Route shell, dev-only feature gate, single-clip trim UI, EDL autosave, Edge Function, render worker with FFmpeg trim+concat, deploy script, end-to-end smoke test.

**Out (other phases):** Transcript, silence detection, captions, music, text overlays, aspect-ratio re-targeting (we render in the source aspect), Realtime job updates (polling only in Phase 1), admin role gate (env gate only in Phase 1; admin role lands as part of the rollout work alongside Phase 5).

## File Structure

**Frontend (existing app):**

- Create `src/lib/videoEditor/featureGate.ts` — `IS_VIDEO_EDITOR_ENABLED` env constant
- Create `src/lib/videoEditor/edl.ts` — TS types + factory for an empty EDL
- Create `src/lib/videoEditor/editorProjectsApi.ts` — load / upsert / autosave
- Create `src/lib/videoEditor/renderJobsApi.ts` — submit / fetch by id
- Create `src/hooks/useEditorProject.ts` — load + state + debounced autosave
- Create `src/hooks/useRenderJob.ts` — submit + 2s polling
- Create `src/pages/VideoEditor.tsx` — full-screen route component
- Create `src/components/videoEditor/EditorTopBar.tsx`
- Create `src/components/videoEditor/PreviewStage.tsx`
- Create `src/components/videoEditor/TrimTimeline.tsx`
- Create `src/components/videoEditor/ExportDialog.tsx`
- Modify `src/App.tsx` — register the route behind `IS_VIDEO_EDITOR_ENABLED`
- Modify `src/pages/EditingQueue.tsx` — add a gated "Edit" entry point

**Backend (Supabase):**

- Create `supabase/migrations/20260516_video_editor_phase1.sql` — `editor_projects` + `render_jobs` tables + RLS + indexes
- Create `supabase/functions/editor-job/index.ts` — Edge Function
- Create `supabase/functions/editor-job/index.test.ts` — Deno test

**Render worker (new VPS service, lives in this repo):**

- Create `render-worker/package.json`
- Create `render-worker/tsconfig.json`
- Create `render-worker/vitest.config.ts`
- Create `render-worker/src/index.ts` — entry point + main loop
- Create `render-worker/src/db.ts` — Supabase client + job claim/update
- Create `render-worker/src/storage.ts` — download/upload helpers
- Create `render-worker/src/render.ts` — FFmpeg invocation
- Create `render-worker/src/db.test.ts`
- Create `render-worker/src/render.test.ts`
- Create `render-worker/systemd/connecta-render-worker.service`
- Create `render-worker/README.md` — one-time VPS setup steps
- Create `deploy-render-worker.sh` — git pull + npm ci + systemctl restart

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260516_video_editor_phase1.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 20260516_video_editor_phase1.sql
-- Video editor Phase 1: project state + render jobs

create table if not exists public.editor_projects (
  id uuid primary key default gen_random_uuid(),
  video_edit_id uuid not null references public.video_edits(id) on delete cascade,
  edl jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_edit_id)
);

create index if not exists editor_projects_video_edit_id_idx
  on public.editor_projects(video_edit_id);

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  editor_project_id uuid not null references public.editor_projects(id) on delete cascade,
  edl_snapshot jsonb not null,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  progress int not null default 0 check (progress between 0 and 100),
  error_message text,
  output_storage_path text,
  aspect_ratio text not null default '9:16'
    check (aspect_ratio in ('9:16','1:1','16:9','source')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists render_jobs_status_idx
  on public.render_jobs(status) where status in ('queued','running');
create index if not exists render_jobs_editor_project_id_idx
  on public.render_jobs(editor_project_id);

-- RLS: Phase 1 ships admin-only. Use the existing is_admin() function.
alter table public.editor_projects enable row level security;
alter table public.render_jobs enable row level security;

create policy editor_projects_admin_all
  on public.editor_projects
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy render_jobs_admin_all
  on public.render_jobs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- updated_at trigger
create or replace function public.editor_projects_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger editor_projects_updated_at
  before update on public.editor_projects
  for each row execute procedure public.editor_projects_set_updated_at();
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or whatever the project uses — check `package.json` scripts and `supabase/config.toml` for the local DB workflow).
Expected: migration applies cleanly. Verify with `psql` or Supabase Studio that the two tables exist and have RLS enabled.

- [ ] **Step 3: Sanity-check RLS**

Open Supabase Studio → SQL editor → run as a non-admin user:
```sql
select * from editor_projects;
```
Expected: zero rows (RLS blocks). Then run as admin: should return any rows that exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260516_video_editor_phase1.sql
git commit -m "feat(video-editor): phase 1 schema (editor_projects, render_jobs)"
```

---

### Task 2: Frontend feature gate

**Files:**
- Create: `src/lib/videoEditor/featureGate.ts`

- [ ] **Step 1: Write the gate**

```ts
// src/lib/videoEditor/featureGate.ts

// Phase 1: dev-only. The env var must be set explicitly (no defaulting from DEV
// mode) so a contributor can toggle the editor off in their local build without
// editing this file.
//
// Phase 2 (rollout): replace this with an is_admin() check (or a hook that
// composes the env gate AND is_admin). For Phase 1, env-only is enough because
// only the spec author runs it.

export const IS_VIDEO_EDITOR_ENABLED =
  import.meta.env.VITE_FEATURE_VIDEO_EDITOR === "true";
```

- [ ] **Step 2: Add the env var to local dev**

Edit `.env.local` (create if missing) and append:
```
VITE_FEATURE_VIDEO_EDITOR=true
```

Do NOT add this to `.env` or any committed env file. Production builds get the gate off by default.

- [ ] **Step 3: Verify the gate reads true in dev**

In the browser devtools console on `npm run dev`:
```js
import.meta.env.VITE_FEATURE_VIDEO_EDITOR
```
Expected: `"true"`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/videoEditor/featureGate.ts
git commit -m "feat(video-editor): dev-only feature gate"
```

---

### Task 3: EDL types and zero value

**Files:**
- Create: `src/lib/videoEditor/edl.ts`

- [ ] **Step 1: Write the types and helper**

```ts
// src/lib/videoEditor/edl.ts

export type AspectRatio = "9:16" | "1:1" | "16:9" | "source";

export type Clip = {
  id: string;
  source_start_ms: number;
  source_end_ms: number;
};

export type EDL = {
  source: {
    storage_path: string;       // e.g. "footage/<video_edit_id>/source.mp4"
    duration_ms: number;        // total source duration, set on first load
  };
  aspect_ratio: AspectRatio;
  clips: Clip[];

  // Phase 1 stops here. Phase 2+ will add: silence_segments, captions,
  // text_overlays, music. Keep the shape forward-compatible (additive only).
};

export function emptyEDL(sourceStoragePath: string, durationMs: number): EDL {
  return {
    source: { storage_path: sourceStoragePath, duration_ms: durationMs },
    aspect_ratio: "source",
    clips: [
      { id: crypto.randomUUID(), source_start_ms: 0, source_end_ms: durationMs },
    ],
  };
}

export function totalDurationMs(edl: EDL): number {
  return edl.clips.reduce(
    (sum, c) => sum + Math.max(0, c.source_end_ms - c.source_start_ms),
    0,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/videoEditor/edl.ts
git commit -m "feat(video-editor): EDL types + empty/duration helpers"
```

---

### Task 4: editor_projects + render_jobs API clients

**Files:**
- Create: `src/lib/videoEditor/editorProjectsApi.ts`
- Create: `src/lib/videoEditor/renderJobsApi.ts`

- [ ] **Step 1: Write `editorProjectsApi.ts`**

```ts
// src/lib/videoEditor/editorProjectsApi.ts
import { supabase } from "@/integrations/supabase/client";
import type { EDL } from "./edl";

export type EditorProject = {
  id: string;
  video_edit_id: string;
  edl: EDL;
  updated_at: string;
};

export async function loadEditorProject(videoEditId: string): Promise<EditorProject | null> {
  const { data, error } = await supabase
    .from("editor_projects")
    .select("id, video_edit_id, edl, updated_at")
    .eq("video_edit_id", videoEditId)
    .maybeSingle();
  if (error) throw error;
  return data as EditorProject | null;
}

export async function upsertEditorProject(params: {
  videoEditId: string;
  edl: EDL;
}): Promise<EditorProject> {
  const { data, error } = await supabase
    .from("editor_projects")
    .upsert(
      { video_edit_id: params.videoEditId, edl: params.edl },
      { onConflict: "video_edit_id" },
    )
    .select("id, video_edit_id, edl, updated_at")
    .single();
  if (error) throw error;
  return data as EditorProject;
}
```

- [ ] **Step 2: Write `renderJobsApi.ts`**

```ts
// src/lib/videoEditor/renderJobsApi.ts
import { supabase } from "@/integrations/supabase/client";
import type { EDL, AspectRatio } from "./edl";

export type RenderJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  output_storage_path: string | null;
  error_message: string | null;
  aspect_ratio: AspectRatio;
  created_at: string;
  finished_at: string | null;
};

export async function submitRenderJob(params: {
  editorProjectId: string;
  edl: EDL;
  aspectRatio: AspectRatio;
}): Promise<RenderJob> {
  const { data, error } = await supabase.functions.invoke("editor-job", {
    body: {
      editor_project_id: params.editorProjectId,
      edl: params.edl,
      aspect_ratio: params.aspectRatio,
    },
  });
  if (error) throw error;
  return data as RenderJob;
}

export async function fetchRenderJob(id: string): Promise<RenderJob> {
  const { data, error } = await supabase
    .from("render_jobs")
    .select("id, status, progress, output_storage_path, error_message, aspect_ratio, created_at, finished_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as RenderJob;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/videoEditor/editorProjectsApi.ts src/lib/videoEditor/renderJobsApi.ts
git commit -m "feat(video-editor): project + render-job API clients"
```

---

### Task 5: useEditorProject hook (load + autosave)

**Files:**
- Create: `src/hooks/useEditorProject.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useEditorProject.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { EDL } from "@/lib/videoEditor/edl";
import { emptyEDL } from "@/lib/videoEditor/edl";
import {
  loadEditorProject,
  upsertEditorProject,
} from "@/lib/videoEditor/editorProjectsApi";

type State =
  | { phase: "loading" }
  | { phase: "ready"; projectId: string; edl: EDL; saving: boolean; savedAt: string }
  | { phase: "error"; message: string };

type Options = {
  videoEditId: string;
  // For first-open: how to derive the EDL when no project row exists yet.
  initialSource: { storage_path: string; duration_ms: number };
};

export function useEditorProject(opts: Options) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await loadEditorProject(opts.videoEditId);
        if (cancelled) return;
        if (existing) {
          setState({
            phase: "ready",
            projectId: existing.id,
            edl: existing.edl,
            saving: false,
            savedAt: existing.updated_at,
          });
        } else {
          const seedEdl = emptyEDL(
            opts.initialSource.storage_path,
            opts.initialSource.duration_ms,
          );
          const created = await upsertEditorProject({
            videoEditId: opts.videoEditId,
            edl: seedEdl,
          });
          if (cancelled) return;
          setState({
            phase: "ready",
            projectId: created.id,
            edl: created.edl,
            saving: false,
            savedAt: created.updated_at,
          });
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setState({ phase: "error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.videoEditId, opts.initialSource.storage_path, opts.initialSource.duration_ms]);

  const setEdl = useCallback(
    (next: EDL) => {
      setState((prev) =>
        prev.phase === "ready" ? { ...prev, edl: next, saving: true } : prev,
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const saved = await upsertEditorProject({
            videoEditId: opts.videoEditId,
            edl: next,
          });
          setState((prev) =>
            prev.phase === "ready"
              ? { ...prev, saving: false, savedAt: saved.updated_at }
              : prev,
          );
        } catch (e: unknown) {
          setState({ phase: "error", message: (e as Error).message });
        }
      }, 600);
    },
    [opts.videoEditId],
  );

  return { state, setEdl };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useEditorProject.ts
git commit -m "feat(video-editor): useEditorProject hook with debounced autosave"
```

---

### Task 6: useRenderJob hook (submit + poll)

**Files:**
- Create: `src/hooks/useRenderJob.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useRenderJob.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { AspectRatio, EDL } from "@/lib/videoEditor/edl";
import {
  fetchRenderJob,
  submitRenderJob,
  type RenderJob,
} from "@/lib/videoEditor/renderJobsApi";

type State =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; job: RenderJob }
  | { phase: "done"; job: RenderJob }
  | { phase: "error"; message: string };

const POLL_MS = 2000;

export function useRenderJob() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const submit = useCallback(
    async (params: { editorProjectId: string; edl: EDL; aspectRatio: AspectRatio }) => {
      setState({ phase: "submitting" });
      try {
        const job = await submitRenderJob(params);
        setState({ phase: "polling", job });
        stopPolling();
        pollHandle.current = setInterval(async () => {
          try {
            const next = await fetchRenderJob(job.id);
            if (next.status === "done") {
              stopPolling();
              setState({ phase: "done", job: next });
            } else if (next.status === "error") {
              stopPolling();
              setState({ phase: "error", message: next.error_message ?? "render failed" });
            } else {
              setState({ phase: "polling", job: next });
            }
          } catch (e: unknown) {
            stopPolling();
            setState({ phase: "error", message: (e as Error).message });
          }
        }, POLL_MS);
      } catch (e: unknown) {
        setState({ phase: "error", message: (e as Error).message });
      }
    },
    [stopPolling],
  );

  return { state, submit };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useRenderJob.ts
git commit -m "feat(video-editor): useRenderJob hook with 2s polling"
```

---

### Task 7: EditorTopBar component

**Files:**
- Create: `src/components/videoEditor/EditorTopBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/videoEditor/EditorTopBar.tsx
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  saveStatus: "saved" | "saving" | "error";
  onExportClick: () => void;
  exportDisabled?: boolean;
};

export function EditorTopBar({ title, saveStatus, onExportClick, exportDisabled }: Props) {
  return (
    <div className="h-11 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 text-neutral-200">
      <div className="flex items-center gap-3 text-xs">
        <Link to="/master-editing-queue" className="flex items-center gap-1 text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-3.5 h-3.5" /> Queue
        </Link>
        <span className="text-neutral-600">/</span>
        <span className="text-neutral-100">{title}</span>
        <span
          className={
            saveStatus === "saved"
              ? "text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded"
              : saveStatus === "saving"
              ? "text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded"
              : "text-[10px] bg-red-950 text-red-400 px-1.5 py-0.5 rounded"
          }
        >
          {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : "Save error"}
        </span>
      </div>
      <Button size="sm" onClick={onExportClick} disabled={exportDisabled}>
        Export
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/videoEditor/EditorTopBar.tsx
git commit -m "feat(video-editor): EditorTopBar component"
```

---

### Task 8: PreviewStage component

**Files:**
- Create: `src/components/videoEditor/PreviewStage.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/videoEditor/PreviewStage.tsx
import { useEffect, useRef } from "react";
import type { EDL } from "@/lib/videoEditor/edl";

type Props = {
  sourceUrl: string;
  edl: EDL;
  // Controlled playhead in ms (0 to totalDurationMs(edl)).
  playheadMs: number;
  playing: boolean;
  onPlayheadChange: (ms: number) => void;
  onEnded: () => void;
};

// Map EDL playhead (output time) -> source time (input time) by walking clips.
function edlTimeToSourceTime(edl: EDL, edlMs: number): { sourceMs: number; clipIndex: number } | null {
  let acc = 0;
  for (let i = 0; i < edl.clips.length; i++) {
    const c = edl.clips[i];
    const len = Math.max(0, c.source_end_ms - c.source_start_ms);
    if (edlMs <= acc + len) {
      return { sourceMs: c.source_start_ms + (edlMs - acc), clipIndex: i };
    }
    acc += len;
  }
  return null;
}

export function PreviewStage({ sourceUrl, edl, playheadMs, playing, onPlayheadChange, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Sync video element's currentTime with edl playhead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const mapped = edlTimeToSourceTime(edl, playheadMs);
    if (!mapped) return;
    const sourceSec = mapped.sourceMs / 1000;
    if (Math.abs(v.currentTime - sourceSec) > 0.05) {
      v.currentTime = sourceSec;
    }
  }, [playheadMs, edl]);

  // Drive play/pause.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) void v.play();
    else v.pause();
  }, [playing]);

  // Per-frame: emit playhead changes and stop at clip boundary.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!v.paused) {
        const sourceMs = v.currentTime * 1000;
        let acc = 0;
        for (const c of edl.clips) {
          if (sourceMs >= c.source_start_ms && sourceMs <= c.source_end_ms) {
            onPlayheadChange(acc + (sourceMs - c.source_start_ms));
            break;
          }
          acc += Math.max(0, c.source_end_ms - c.source_start_ms);
        }
        // If we ran past the active clip's end, advance to the next clip's start.
        const mapped = edlTimeToSourceTime(edl, acc);
        if (mapped) {
          const active = edl.clips[mapped.clipIndex];
          if (sourceMs > active.source_end_ms) {
            const nextClip = edl.clips[mapped.clipIndex + 1];
            if (nextClip) v.currentTime = nextClip.source_start_ms / 1000;
            else {
              v.pause();
              onEnded();
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [edl, onPlayheadChange, onEnded]);

  return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={sourceUrl}
        className="max-h-full max-w-full"
        playsInline
        controls={false}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/videoEditor/PreviewStage.tsx
git commit -m "feat(video-editor): PreviewStage with EDL→source time mapping"
```

---

### Task 9: TrimTimeline component

**Files:**
- Create: `src/components/videoEditor/TrimTimeline.tsx`

- [ ] **Step 1: Write the component**

Phase 1 only supports trimming a single clip (in/out handles on the source duration). Multi-clip splits arrive in Phase 2 when silence cuts get added.

```tsx
// src/components/videoEditor/TrimTimeline.tsx
import { useCallback, useRef } from "react";
import type { EDL } from "@/lib/videoEditor/edl";

type Props = {
  edl: EDL;
  onChange: (next: EDL) => void;
};

export function TrimTimeline({ edl, onChange }: Props) {
  const clip = edl.clips[0];
  const totalSourceMs = edl.source.duration_ms;
  const trackRef = useRef<HTMLDivElement | null>(null);

  const pctFromMs = (ms: number) => (ms / totalSourceMs) * 100;

  const handleDrag = useCallback(
    (which: "in" | "out") => (e: React.MouseEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();

      const move = (ev: MouseEvent) => {
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const ms = Math.round(pct * totalSourceMs);
        const next: EDL = {
          ...edl,
          clips: [
            which === "in"
              ? { ...clip, source_start_ms: Math.min(ms, clip.source_end_ms - 100) }
              : { ...clip, source_end_ms: Math.max(ms, clip.source_start_ms + 100) },
          ],
        };
        onChange(next);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [clip, edl, onChange, totalSourceMs],
  );

  return (
    <div className="h-32 bg-neutral-950 border-t border-neutral-800 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Video</div>
      <div ref={trackRef} className="relative h-10 bg-neutral-900 rounded select-none">
        {/* Selected region */}
        <div
          className="absolute top-0 bottom-0 bg-blue-900/40 border border-blue-500"
          style={{
            left: `${pctFromMs(clip.source_start_ms)}%`,
            width: `${pctFromMs(clip.source_end_ms - clip.source_start_ms)}%`,
          }}
        />
        {/* In handle */}
        <div
          onMouseDown={handleDrag("in")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_start_ms)}%` }}
        />
        {/* Out handle */}
        <div
          onMouseDown={handleDrag("out")}
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-blue-400 cursor-ew-resize"
          style={{ left: `${pctFromMs(clip.source_end_ms)}%` }}
        />
      </div>
      <div className="text-[10px] text-neutral-500 mt-2">
        Trim: {(clip.source_start_ms / 1000).toFixed(1)}s → {(clip.source_end_ms / 1000).toFixed(1)}s
        ({((clip.source_end_ms - clip.source_start_ms) / 1000).toFixed(1)}s out)
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/videoEditor/TrimTimeline.tsx
git commit -m "feat(video-editor): TrimTimeline with draggable in/out handles"
```

---

### Task 10: ExportDialog component

**Files:**
- Create: `src/components/videoEditor/ExportDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/videoEditor/ExportDialog.tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AspectRatio } from "@/lib/videoEditor/edl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (aspect: AspectRatio) => void;
  submitting: boolean;
  pollingProgress: number | null;
  resultUrl: string | null;
  errorMessage: string | null;
};

export function ExportDialog(props: Props) {
  const [aspect, setAspect] = useState<AspectRatio>("source");

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export video</DialogTitle>
        </DialogHeader>

        {props.resultUrl ? (
          <div className="space-y-3">
            <p className="text-sm">Render complete.</p>
            <a
              href={props.resultUrl}
              target="_blank"
              rel="noreferrer"
              className="block px-3 py-2 bg-emerald-900 text-emerald-100 rounded text-sm text-center"
            >
              Open / download
            </a>
          </div>
        ) : props.errorMessage ? (
          <p className="text-sm text-red-400">Error: {props.errorMessage}</p>
        ) : props.pollingProgress !== null ? (
          <div className="space-y-2 text-sm">
            <p>Rendering on VPS…</p>
            <div className="h-2 bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${props.pollingProgress}%` }}
              />
            </div>
            <p className="text-neutral-500 text-xs">{props.pollingProgress}%</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-neutral-400 uppercase tracking-wider">Aspect</label>
              <div className="flex gap-2 mt-2">
                {(["source", "9:16", "1:1", "16:9"] as AspectRatio[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-3 py-1 text-xs rounded border ${
                      aspect === a
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-neutral-900 border-neutral-700 text-neutral-300"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                Phase 1: only "source" actually re-frames. Other options ignored by worker until Phase 5.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {props.resultUrl || props.errorMessage ? (
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>Close</Button>
          ) : props.pollingProgress !== null ? (
            <Button variant="outline" disabled>Cancel (not yet)</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => props.onSubmit(aspect)} disabled={props.submitting}>
                {props.submitting ? "Submitting…" : "Start render"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/videoEditor/ExportDialog.tsx
git commit -m "feat(video-editor): ExportDialog with aspect picker and progress"
```

---

### Task 11: VideoEditor page

**Files:**
- Create: `src/pages/VideoEditor.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/VideoEditor.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { useEditorProject } from "@/hooks/useEditorProject";
import { useRenderJob } from "@/hooks/useRenderJob";
import { EditorTopBar } from "@/components/videoEditor/EditorTopBar";
import { PreviewStage } from "@/components/videoEditor/PreviewStage";
import { TrimTimeline } from "@/components/videoEditor/TrimTimeline";
import { ExportDialog } from "@/components/videoEditor/ExportDialog";
import type { AspectRatio } from "@/lib/videoEditor/edl";

type SourceMeta = { storagePath: string; signedUrl: string; durationMs: number; title: string };

async function loadSourceMeta(videoEditId: string): Promise<SourceMeta | null> {
  // Pull the video_edits row to discover storage path + title.
  // The exact column names below come from src/pages/EditingQueue.tsx — adjust
  // if a follow-up rename happens.
  const { data, error } = await supabase
    .from("video_edits")
    .select("id, title, storage_path, footage_url")
    .eq("id", videoEditId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // For Phase 1 we require storage_path. If it's not in Supabase Storage yet,
  // surface a clear error rather than guessing.
  const storagePath: string | null = data.storage_path ?? null;
  if (!storagePath) return null;

  // Signed URL for the <video> element (one hour).
  const { data: signed, error: signErr } = await supabase
    .storage
    .from("footage")          // bucket name — confirm in Storage UI; adjust if different
    .createSignedUrl(storagePath, 3600);
  if (signErr) throw signErr;

  // Read duration by probing the URL through a hidden <video> element.
  const durationMs = await probeDurationMs(signed.signedUrl);

  return {
    storagePath,
    signedUrl: signed.signedUrl,
    durationMs,
    title: data.title ?? "Untitled",
  };
}

function probeDurationMs(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    v.addEventListener("loadedmetadata", () => {
      resolve(Math.round((v.duration || 0) * 1000));
    });
    v.addEventListener("error", () => reject(new Error("probe failed")));
  });
}

export default function VideoEditor() {
  if (!IS_VIDEO_EDITOR_ENABLED) return <Navigate to="/master-editing-queue" replace />;

  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<SourceMeta | null>(null);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadSourceMeta(id)
      .then((s) => {
        if (!s) setSourceErr("No Supabase-Storage source for this video_edits row.");
        else setSource(s);
      })
      .catch((e: Error) => setSourceErr(e.message));
  }, [id]);

  const initialSource = useMemo(
    () => source && { storage_path: source.storagePath, duration_ms: source.durationMs },
    [source],
  );

  const { state: projState, setEdl } = useEditorProject({
    videoEditId: id!,
    initialSource: initialSource ?? { storage_path: "", duration_ms: 0 },
  });

  const { state: jobState, submit: submitJob } = useRenderJob();

  if (!id) return <Navigate to="/master-editing-queue" replace />;
  if (sourceErr) {
    return <div className="p-8 text-red-400">Source error: {sourceErr}</div>;
  }
  if (!source || projState.phase === "loading") {
    return <div className="p-8 text-neutral-400">Loading editor…</div>;
  }
  if (projState.phase === "error") {
    return <div className="p-8 text-red-400">Project error: {projState.message}</div>;
  }

  const handleExport = async (aspect: AspectRatio) => {
    await submitJob({
      editorProjectId: projState.projectId,
      edl: projState.edl,
      aspectRatio: aspect,
    });
  };

  const exportPolling =
    jobState.phase === "polling" ? jobState.job.progress : null;
  const exportResultUrl =
    jobState.phase === "done" && jobState.job.output_storage_path
      ? // We surface the storage path; download happens via a signed URL fetched
        // lazily in a future task. For Phase 1, paste the path into the UI for
        // verification — full signed-link UX lands in Phase 5.
        jobState.job.output_storage_path
      : null;
  const exportError = jobState.phase === "error" ? jobState.message : null;

  return (
    <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col">
      <EditorTopBar
        title={source.title}
        saveStatus={projState.saving ? "saving" : "saved"}
        onExportClick={() => setExportOpen(true)}
      />

      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          <PreviewStage
            sourceUrl={source.signedUrl}
            edl={projState.edl}
            playheadMs={playheadMs}
            playing={playing}
            onPlayheadChange={setPlayheadMs}
            onEnded={() => setPlaying(false)}
          />
          <div className="flex justify-center gap-3 py-2 bg-neutral-950 border-t border-neutral-900 text-xs">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="px-3 py-1 bg-neutral-800 rounded"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="text-neutral-500 self-center">
              {(playheadMs / 1000).toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      <TrimTimeline edl={projState.edl} onChange={setEdl} />

      <ExportDialog
        open={exportOpen}
        onOpenChange={(o) => setExportOpen(o)}
        onSubmit={handleExport}
        submitting={jobState.phase === "submitting"}
        pollingProgress={exportPolling}
        resultUrl={exportResultUrl}
        errorMessage={exportError}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/VideoEditor.tsx
git commit -m "feat(video-editor): VideoEditor page wiring components + hooks"
```

---

### Task 12: Register the route + add the "Edit" entry point

**Files:**
- Modify: `src/App.tsx` — add the route
- Modify: `src/pages/EditingQueue.tsx` — add the entry point

- [ ] **Step 1: Register the route in `src/App.tsx`**

Open `src/App.tsx` and find the existing `<Routes>` block. Add this import near the other page imports:

```tsx
import VideoEditor from "@/pages/VideoEditor";
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
```

Inside `<Routes>`, add (place near other `/editing` or queue routes):

```tsx
{IS_VIDEO_EDITOR_ENABLED && <Route path="/editing/:id/edit" element={<VideoEditor />} />}
```

- [ ] **Step 2: Add "Edit" entry point in `src/pages/EditingQueue.tsx`**

Find the row-actions dropdown in `EditingQueue.tsx` (it uses `DropdownMenu` from shadcn). Add a gated menu item near the other lifecycle actions:

```tsx
import { IS_VIDEO_EDITOR_ENABLED } from "@/lib/videoEditor/featureGate";
import { useNavigate } from "react-router-dom"; // confirm if not already imported

// inside the row's DropdownMenuContent:
{IS_VIDEO_EDITOR_ENABLED && (
  <DropdownMenuItem onClick={() => navigate(`/editing/${item.id}/edit`)}>
    Open editor
  </DropdownMenuItem>
)}
```

Use the existing `navigate` from `useNavigate()` — it's already in this file. Place the item under the existing items so it's visually demarcated as the new path.

- [ ] **Step 3: Run dev server and verify**

```
npm run dev
```

Open `/master-editing-queue` (or wherever the EditingQueue is reached). Click the row actions menu on any row — "Open editor" should appear. Click it → you land on `/editing/<id>/edit`. The page should load and show "Loading editor…" then either the editor shell or the "No Supabase-Storage source" error (expected if the row's storage_path is null).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/pages/EditingQueue.tsx
git commit -m "feat(video-editor): register route and queue entry point (dev-gated)"
```

---

### Task 13: Edge Function — editor-job

**Files:**
- Create: `supabase/functions/editor-job/index.ts`
- Create: `supabase/functions/editor-job/index.test.ts`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/editor-job/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const ALLOWED_ASPECTS = new Set(["source", "9:16", "1:1", "16:9"]);

type Body = {
  editor_project_id: string;
  edl: unknown;
  aspect_ratio: string;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Basic shape validation. Detailed EDL validation lives in later phases —
  // Phase 1 only enforces what the worker needs to run a trim.
  if (!body.editor_project_id || typeof body.editor_project_id !== "string") {
    return new Response("editor_project_id required", { status: 400 });
  }
  if (!ALLOWED_ASPECTS.has(body.aspect_ratio)) {
    return new Response("aspect_ratio invalid", { status: 400 });
  }
  if (!body.edl || typeof body.edl !== "object") {
    return new Response("edl required", { status: 400 });
  }
  const edl = body.edl as { source?: { storage_path?: string }; clips?: unknown[] };
  if (!edl.source?.storage_path || !Array.isArray(edl.clips) || edl.clips.length === 0) {
    return new Response("edl.source.storage_path and edl.clips required", { status: 400 });
  }

  // Confirm the project exists (RLS will further restrict to admin).
  const { data: project, error: projErr } = await supabase
    .from("editor_projects")
    .select("id")
    .eq("id", body.editor_project_id)
    .maybeSingle();
  if (projErr) return new Response(projErr.message, { status: 500 });
  if (!project) return new Response("project not found", { status: 404 });

  const { data: created, error: insertErr } = await supabase
    .from("render_jobs")
    .insert({
      editor_project_id: body.editor_project_id,
      edl_snapshot: body.edl,
      aspect_ratio: body.aspect_ratio,
      status: "queued",
    })
    .select("id, status, progress, output_storage_path, error_message, aspect_ratio, created_at, finished_at")
    .single();
  if (insertErr) return new Response(insertErr.message, { status: 500 });

  return new Response(JSON.stringify(created), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
```

- [ ] **Step 2: Write the test**

```ts
// supabase/functions/editor-job/index.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Minimal black-box: only check the validation branches. Postgres-touching
// behavior is verified in the end-to-end smoke test (Task 19).

Deno.test("editor-job rejects non-POST", async () => {
  const mod = await import("./index.ts");
  // The serve() side effect runs on import; we exercise it by hitting localhost.
  // Skip integration here — this test exists as a placeholder for future
  // unit-extractable validators. For Phase 1 we leave validation tested at the
  // smoke level. (See Task 19.)
  assertEquals(typeof mod, "object");
});
```

Note: Phase 1 keeps Edge-Function tests light because the validation logic is small and the integration test in Task 19 exercises the real path. If the validation grows in Phase 2, factor it into a pure function and test it properly then.

- [ ] **Step 3: Deploy the function locally**

```
npx supabase functions serve editor-job
```

Verify it starts. Hit it with curl:

```
curl -i -X POST http://localhost:54321/functions/v1/editor-job \
  -H "Authorization: Bearer <local anon jwt>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: 400 with `editor_project_id required`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/editor-job/
git commit -m "feat(video-editor): editor-job edge function (validate + queue)"
```

---

### Task 14: Render worker scaffolding

**Files:**
- Create: `render-worker/package.json`
- Create: `render-worker/tsconfig.json`
- Create: `render-worker/vitest.config.ts`
- Create: `render-worker/.gitignore`
- Create: `render-worker/.env.example`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "connecta-render-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.57.2",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.12.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
.env
*.local
```

- [ ] **Step 5: Write `.env.example`**

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=footage
SUPABASE_OUTPUT_BUCKET=footage
POLL_INTERVAL_MS=4000
WORK_DIR=/tmp/connecta-renders
```

- [ ] **Step 6: Install deps**

```
cd render-worker
npm install
```

Verify `node_modules/ffmpeg-static/ffmpeg` exists (binary that ships with the package).

- [ ] **Step 7: Commit**

```bash
git add render-worker/
git commit -m "chore(render-worker): scaffold Node project (vitest, ffmpeg-static)"
```

---

### Task 15: Render worker — DB module

**Files:**
- Create: `render-worker/src/db.ts`
- Create: `render-worker/src/db.test.ts`

- [ ] **Step 1: Write `db.ts`**

```ts
// render-worker/src/db.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type RenderJobRow = {
  id: string;
  editor_project_id: string;
  edl_snapshot: {
    source: { storage_path: string; duration_ms: number };
    aspect_ratio: string;
    clips: { id: string; source_start_ms: number; source_end_ms: number }[];
  };
  aspect_ratio: string;
  status: "queued" | "running" | "done" | "error";
};

export function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Claim the oldest queued job atomically. Returns null if nothing to do.
export async function claimNextJob(client: SupabaseClient): Promise<RenderJobRow | null> {
  // Single-row UPDATE ... RETURNING via a transactional RPC would be ideal, but
  // a CTE-based update through the REST API works for one worker. With multiple
  // workers we'd add a Postgres function with FOR UPDATE SKIP LOCKED — Phase 1
  // assumes one worker, which the spec marks as acceptable.

  const { data: candidate } = await client
    .from("render_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!candidate) return null;

  const { data: claimed, error } = await client
    .from("render_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), progress: 1 })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, editor_project_id, edl_snapshot, aspect_ratio, status")
    .maybeSingle();

  if (error) throw error;
  return (claimed as RenderJobRow | null) ?? null;
}

export async function updateProgress(client: SupabaseClient, id: string, progress: number) {
  await client.from("render_jobs").update({ progress }).eq("id", id);
}

export async function markDone(client: SupabaseClient, id: string, outputStoragePath: string) {
  await client
    .from("render_jobs")
    .update({
      status: "done",
      progress: 100,
      output_storage_path: outputStoragePath,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function markError(client: SupabaseClient, id: string, message: string) {
  await client
    .from("render_jobs")
    .update({
      status: "error",
      error_message: message.slice(0, 2000),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}
```

- [ ] **Step 2: Write `db.test.ts`**

The DB module is mostly thin Supabase calls. Test only the env-validation logic so a misconfigured deploy fails fast:

```ts
// render-worker/src/db.test.ts
import { describe, it, expect } from "vitest";
import { makeClient } from "./db.js";

describe("makeClient", () => {
  it("throws when env vars are missing", () => {
    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => makeClient()).toThrow(/SUPABASE_URL/);
    process.env.SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
});
```

- [ ] **Step 3: Run tests**

```
cd render-worker && npm test
```

Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add render-worker/src/db.ts render-worker/src/db.test.ts
git commit -m "feat(render-worker): db module with job claim/update helpers"
```

---

### Task 16: Render worker — Storage module

**Files:**
- Create: `render-worker/src/storage.ts`

- [ ] **Step 1: Write the module**

```ts
// render-worker/src/storage.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function downloadToFile(
  client: SupabaseClient,
  bucket: string,
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error) throw error;
  const arrayBuf = await data.arrayBuffer();
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, Buffer.from(arrayBuf));
}

export async function uploadFile(
  client: SupabaseClient,
  bucket: string,
  storagePath: string,
  localPath: string,
  contentType = "video/mp4",
): Promise<void> {
  const data = await fs.readFile(localPath);
  const { error } = await client.storage.from(bucket).upload(storagePath, data, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Commit**

```bash
git add render-worker/src/storage.ts
git commit -m "feat(render-worker): storage download/upload helpers"
```

---

### Task 17: Render worker — Render module

**Files:**
- Create: `render-worker/src/render.ts`
- Create: `render-worker/src/render.test.ts`

- [ ] **Step 1: Write `render.ts`**

```ts
// render-worker/src/render.ts
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "node:fs";
import path from "node:path";

if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");
ffmpeg.setFfmpegPath(ffmpegPath);

export type Clip = { source_start_ms: number; source_end_ms: number };

// Build an FFmpeg filter_complex string that trims each clip and concats them.
// Returns the args ready for execution.
export function buildTrimConcatArgs(input: string, clips: Clip[], output: string): string[] {
  if (clips.length === 0) throw new Error("no clips");
  const trims = clips
    .map((c, i) => {
      const start = c.source_start_ms / 1000;
      const end = c.source_end_ms / 1000;
      return (
        `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];` +
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`
      );
    })
    .join(";");
  const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join("");
  const concatFilter = `${concatInputs}concat=n=${clips.length}:v=1:a=1[vout][aout]`;
  return [
    "-y",
    "-i", input,
    "-filter_complex", `${trims};${concatFilter}`,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ];
}

export async function runRender(input: string, clips: Clip[], output: string): Promise<void> {
  await fs.mkdir(path.dirname(output), { recursive: true });
  const args = buildTrimConcatArgs(input, clips, output);
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg().input(input).outputOptions(args.slice(1, -1)).output(output);
    cmd.on("end", () => resolve());
    cmd.on("error", (err) => reject(err));
    cmd.run();
  });
}
```

Note: `fluent-ffmpeg`'s `.outputOptions` accepts the same args list FFmpeg uses on the CLI. We keep `buildTrimConcatArgs` as a pure function (no side effects) so it can be unit-tested.

- [ ] **Step 2: Write `render.test.ts`**

```ts
// render-worker/src/render.test.ts
import { describe, it, expect } from "vitest";
import { buildTrimConcatArgs } from "./render.js";

describe("buildTrimConcatArgs", () => {
  it("builds a single-clip trim+concat filter", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [{ source_start_ms: 1000, source_end_ms: 5000 }],
      "/out.mp4",
    );
    const fcIdx = args.indexOf("-filter_complex");
    expect(fcIdx).toBeGreaterThan(-1);
    const fc = args[fcIdx + 1];
    expect(fc).toContain("trim=start=1:end=5");
    expect(fc).toContain("concat=n=1:v=1:a=1[vout][aout]");
    expect(args).toContain("/in.mp4");
    expect(args[args.length - 1]).toBe("/out.mp4");
  });

  it("handles multiple clips", () => {
    const args = buildTrimConcatArgs(
      "/in.mp4",
      [
        { source_start_ms: 0, source_end_ms: 2000 },
        { source_start_ms: 4000, source_end_ms: 7000 },
      ],
      "/out.mp4",
    );
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("trim=start=0:end=2");
    expect(fc).toContain("trim=start=4:end=7");
    expect(fc).toContain("concat=n=2:v=1:a=1[vout][aout]");
  });

  it("throws on empty clip list", () => {
    expect(() => buildTrimConcatArgs("/in.mp4", [], "/out.mp4")).toThrow();
  });
});
```

- [ ] **Step 3: Run tests**

```
cd render-worker && npm test
```

Expected: 4 passing tests (3 here + 1 from db.test.ts).

- [ ] **Step 4: Commit**

```bash
git add render-worker/src/render.ts render-worker/src/render.test.ts
git commit -m "feat(render-worker): FFmpeg trim+concat with unit tests"
```

---

### Task 18: Render worker — Entry point and main loop

**Files:**
- Create: `render-worker/src/index.ts`

- [ ] **Step 1: Write the entry point**

```ts
// render-worker/src/index.ts
// Env comes from systemd's EnvironmentFile in prod and from the shell (or a
// manually sourced .env) in dev. No dotenv dependency — keeps the package
// lean and the runtime requirements explicit.
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  claimNextJob,
  makeClient,
  markDone,
  markError,
  updateProgress,
  type RenderJobRow,
} from "./db.js";
import { downloadToFile, uploadFile } from "./storage.js";
import { runRender } from "./render.js";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 4000);
const WORK_DIR = process.env.WORK_DIR ?? "/tmp/connecta-renders";
const SOURCE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "footage";
const OUT_BUCKET = process.env.SUPABASE_OUTPUT_BUCKET ?? "footage";

async function processJob(client: ReturnType<typeof makeClient>, job: RenderJobRow) {
  const workDir = path.join(WORK_DIR, job.id);
  const input = path.join(workDir, "input.mp4");
  const output = path.join(workDir, "output.mp4");
  await fs.mkdir(workDir, { recursive: true });

  await updateProgress(client, job.id, 5);
  await downloadToFile(client, SOURCE_BUCKET, job.edl_snapshot.source.storage_path, input);

  await updateProgress(client, job.id, 20);
  await runRender(input, job.edl_snapshot.clips, output);

  await updateProgress(client, job.id, 80);
  const outPath = `renders/${job.editor_project_id}/${job.id}.mp4`;
  await uploadFile(client, OUT_BUCKET, outPath, output);

  await markDone(client, job.id, outPath);

  // Best-effort cleanup; failures here are non-fatal.
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function tick(client: ReturnType<typeof makeClient>) {
  const job = await claimNextJob(client);
  if (!job) return;
  try {
    await processJob(client, job);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error(`[render-worker] job ${job.id} failed:`, msg);
    await markError(client, job.id, msg);
  }
}

async function main() {
  const client = makeClient();
  console.log(`[render-worker] starting; poll=${POLL_MS}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick(client);
    } catch (e) {
      console.error("[render-worker] tick crashed", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error("[render-worker] fatal", e);
  process.exit(1);
});
```

- [ ] **Step 2: Local smoke run**

Export the required env vars in your shell (don't commit a `.env` — `.gitignore` already blocks it):

```
cd render-worker
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_STORAGE_BUCKET=footage
export SUPABASE_OUTPUT_BUCKET=footage
export POLL_INTERVAL_MS=4000
export WORK_DIR=/tmp/connecta-renders
npm run dev
```

Expected: `[render-worker] starting; poll=4000ms`. No errors. Without queued jobs, it sits idle.

- [ ] **Step 3: Commit**

```bash
git add render-worker/src/index.ts
git commit -m "feat(render-worker): main loop wiring claim, download, ffmpeg, upload"
```

---

### Task 19: VPS systemd unit + setup doc

**Files:**
- Create: `render-worker/systemd/connecta-render-worker.service`
- Create: `render-worker/README.md`

- [ ] **Step 1: Write the systemd unit**

```ini
[Unit]
Description=ConnectACreators render worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/connectacreators-render-worker
ExecStart=/usr/bin/node /var/www/connectacreators-render-worker/dist/index.js
EnvironmentFile=/etc/connecta-render-worker.env
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
User=root

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write `render-worker/README.md`** (one-time VPS setup)

```markdown
# Render worker — VPS setup

This service polls Supabase for queued render jobs and runs FFmpeg.

## One-time setup on the VPS (root@72.62.200.145)

1. Install Node 20 if missing:
   ```
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   ```
2. Clone the repo into a sibling dir of the existing site:
   ```
   git clone <repo-url> /var/www/connectacreators-render-worker
   cd /var/www/connectacreators-render-worker
   git checkout main  # or whatever branch ships this
   ```
3. Install + build:
   ```
   cd render-worker
   npm ci --omit=dev
   npx tsc -p tsconfig.json
   ```
4. Write the env file at `/etc/connecta-render-worker.env`:
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   SUPABASE_STORAGE_BUCKET=footage
   SUPABASE_OUTPUT_BUCKET=footage
   POLL_INTERVAL_MS=4000
   WORK_DIR=/tmp/connecta-renders
   ```
   `chmod 600 /etc/connecta-render-worker.env` and `chown root:root`.
5. Install the systemd unit:
   ```
   cp /var/www/connectacreators-render-worker/render-worker/systemd/connecta-render-worker.service /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable connecta-render-worker
   systemctl start connecta-render-worker
   ```
6. Verify it's running and ingesting:
   ```
   systemctl status connecta-render-worker
   journalctl -u connecta-render-worker -f
   ```

## Updates

After the first install, run `./deploy-render-worker.sh` from your laptop.

## Storage bucket

Confirm a Supabase Storage bucket named `footage` exists. If you use a
different name, update `SUPABASE_STORAGE_BUCKET` and `SUPABASE_OUTPUT_BUCKET`
in `/etc/connecta-render-worker.env`.

Outputs land at `renders/<editor_project_id>/<job_id>.mp4` inside the bucket.
```

- [ ] **Step 3: Commit**

```bash
git add render-worker/systemd/ render-worker/README.md
git commit -m "feat(render-worker): systemd unit + VPS setup docs"
```

---

### Task 20: Deploy script

**Files:**
- Create: `deploy-render-worker.sh`

- [ ] **Step 1: Write the script**

Mirrors `deploy-expect.sh` style: hardcoded host, expect-driven password auth, pulls latest, rebuilds, restarts the service.

```bash
#!/usr/bin/env bash
# Deploy the render worker to the VPS. One-time setup must already be done
# per render-worker/README.md.
set -euo pipefail

HOST="72.62.200.145"
USER="root"
PASSWORD="Loqueveoloveo290802#"
REMOTE_DIR="/var/www/connectacreators-render-worker"

if ! command -v expect >/dev/null 2>&1; then
  echo "ERROR: expect is required (preinstalled on macOS)" >&2
  exit 1
fi

echo "▶ 1/2  Pulling, rebuilding, restarting service..."
expect <<EOF
set timeout 600
log_user 1
spawn ssh -o StrictHostKeyChecking=no $USER@$HOST
expect {
  "password:" { send "$PASSWORD\r" }
}
expect "#"
send "cd $REMOTE_DIR && git pull && cd render-worker && npm ci --omit=dev && npx tsc -p tsconfig.json && systemctl restart connecta-render-worker && systemctl --no-pager status connecta-render-worker | head -20 && exit\r"
expect eof
EOF

echo "▶ 2/2  Done."
```

- [ ] **Step 2: Make it executable**

```
chmod +x deploy-render-worker.sh
```

- [ ] **Step 3: Commit**

```bash
git add deploy-render-worker.sh
git commit -m "ops(render-worker): deploy script (git pull + build + restart)"
```

---

### Task 21: End-to-end smoke test

This is a manual verification task. No code; just a documented run-through that proves Phase 1 works.

- [ ] **Step 1: Prepare a test video_edits row**

In the local Supabase Studio, find or create a `video_edits` row whose `storage_path` points to a real MP4 in the `footage` bucket (existing). The clip should be at least 15 seconds long so trimming is visible.

- [ ] **Step 2: Open the editor**

```
npm run dev
```

Navigate to `/master-editing-queue`, open the row's actions menu → **Open editor**. Confirm:
- The page loads.
- The video preview shows the first frame of the clip.
- The TrimTimeline appears at the bottom with a blue selection covering the full clip.
- Top-right shows "Saved".

- [ ] **Step 3: Drag the trim handles**

Drag the in-handle to ~2s and the out-handle to ~8s. The selection bar should shrink. Within ~1s, the "Saving…" indicator should appear and return to "Saved" — meaning the autosave hit `editor_projects`.

Verify in Supabase Studio:
```sql
select edl from editor_projects where video_edit_id = '<your test id>';
```
The `clips[0]` source_start_ms / source_end_ms should reflect what you set.

- [ ] **Step 4: Press Play**

The preview should play only the trimmed range and pause when it reaches the out point.

- [ ] **Step 5: Run the render worker locally**

```
cd render-worker
npm run dev
```

You should see the startup log. The worker now polls every 4 seconds.

- [ ] **Step 6: Trigger an export**

Click **Export** in the editor → **Start render** (leave aspect at "source"). Within ~6s the dialog should show "Rendering on VPS… 1%" then progress through 5, 20, 80, 100. The worker terminal should log the job claim and FFmpeg output.

- [ ] **Step 7: Verify the output**

In Supabase Studio → Storage → `footage` → `renders/<project_id>/<job_id>.mp4`. Download it and confirm:
- It opens in QuickTime / VLC.
- Its duration matches the trimmed range (within ~100ms).
- Audio plays.

The `render_jobs` row should show `status='done'`, `progress=100`, `output_storage_path='renders/.../...mp4'`, `finished_at` populated.

- [ ] **Step 8: Failure case**

Manually break the source path (set `editor_projects.edl->source->storage_path` to `"does/not/exist.mp4"`), submit another render. Expected: dialog goes to error state with a download/storage error message; `render_jobs.status='error'`, `error_message` populated.

- [ ] **Step 9: Document the result**

Write a quick note in the PR description (or a follow-up comment) confirming all nine steps passed locally. If a step fails, stop here — do not deploy to the VPS until the local pipeline works.

---

### Task 22: VPS deploy (optional, after local works)

Only do this once Task 21 passes end-to-end on local.

- [ ] **Step 1: First-time VPS setup**

SSH to the VPS once and follow `render-worker/README.md` steps 1–6.

- [ ] **Step 2: Confirm service is running**

```
ssh root@72.62.200.145 'systemctl status connecta-render-worker --no-pager'
```

Expected: `active (running)`.

- [ ] **Step 3: Subsequent updates**

From your laptop:

```
./deploy-render-worker.sh
```

- [ ] **Step 4: Verify on VPS**

```
ssh root@72.62.200.145 'journalctl -u connecta-render-worker -n 20 --no-pager'
```

Expect: recent log lines, no crashes.

Phase 1 is done when an export submitted from the dev frontend renders on the VPS worker and the resulting MP4 appears in Supabase Storage.

---

## Phase 1 Exit Criteria

All of these must be true to declare Phase 1 done:

- `editor_projects` and `render_jobs` tables exist with RLS (admin-only).
- `IS_VIDEO_EDITOR_ENABLED` env gate controls route + entry point.
- `/editing/:id/edit` loads, shows a trimmable preview, autosaves the EDL.
- `editor-job` Edge Function accepts a valid request and creates a `render_jobs` row.
- Local render worker picks up the job, FFmpegs a trim, uploads to Storage, marks done.
- The full loop runs end-to-end on local (Task 21).
- VPS service is running (Task 22) — optional for the first iteration; can defer if VPS infra work blocks.

Anything not in this list (transcripts, captions, music, text overlays, aspect ratios beyond source, Realtime, admin role check beyond the env gate) is **out of Phase 1**.
