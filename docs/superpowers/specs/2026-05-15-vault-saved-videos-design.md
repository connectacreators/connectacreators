# Vault → Saved Videos Library — Design

**Date:** 2026-05-15
**Branch context:** `feat/viral-today-canvas-unification`
**Status:** Approved (sections 1–5), awaiting spec review.

## Problem

The current Vault page is built around an "extract hook/body/CTA template lines from a video" concept stored in `vault_templates`. In practice users don't reach for this — they want a place to bookmark viral videos so they can come back to them later (and they're already pasting URLs into Super Canvas anyway).

The Vault should become a saved-videos library that points at `viral_videos` rows — the same data shape used by Viral Today and the Super Canvas video node. Saving and opening a saved video should reuse the existing detail page; pasting a URL into the Vault should reuse the existing analyze pipeline.

## Goals

1. Replace the templates UI on the Vault page with a saved-videos grid sourced from `viral_videos`.
2. Let users save a video from three surfaces: the ViralVideoDetail page, the Super Canvas video node, and a URL paste directly in the Vault page.
3. Reuse the existing `scrape-framework-url` pipeline and the existing `/viral-today/video/:videoId` detail route — no parallel implementations.
4. Keep the per-client scoping model (matching the rest of the app).

## Non-goals

- Migrating existing `vault_templates` rows into the new model. The two have no overlap (templates carry hook/body/CTA lines, saves don't). Old templates disappear from the UI; the table itself stays in the DB for now.
- Dropping the `vault_templates` table in this change. Separate cleanup later.
- Tags, folders, or a per-save note UI. The `note` column exists for a future iteration.
- Changes to Viral Today, the video player, or the analysis pipeline.

## Data model

**New table `saved_videos`:**

```sql
create table saved_videos (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  viral_video_id  uuid not null references viral_videos(id) on delete cascade,
  saved_by        uuid references auth.users(id) on delete set null,
  saved_at        timestamptz not null default now(),
  note            text,
  unique (client_id, viral_video_id)
);

create index idx_saved_videos_client_recent
  on saved_videos (client_id, saved_at desc);

create index idx_saved_videos_video
  on saved_videos (viral_video_id);
```

**RLS:** same per-client pattern as the rest of the app. Read/write allowed when the user has access to `client_id`; admins see all rows. The exact policy mirrors `vault_templates` policies for consistency.

**`vault_templates`:** untouched in the DB. All UI references removed. Can be dropped in a later cleanup migration.

**Type regeneration:** run `supabase gen types` after the migration so `src/integrations/supabase/types.ts` includes `saved_videos`.

## UX surfaces

### Vault page (`src/pages/Vault.tsx`)

Full rewrite of the page logic. Routes unchanged: `/clients/:clientId/vault` (per-client) and `/vault` (admin master).

- **Card grid** uses the same visual model as Viral Today cards: thumbnail, channel handle, views, outlier score, platform badge. Reuse the card component from Viral Today by extracting it into `src/components/viral-today/ViralVideoCard.tsx` (it currently lives inline at `ViralToday.tsx:575`). Both pages then consume the same component.
- **Card click** → `navigate('/viral-today/video/${viral_video_id}')`. No new detail route.
- **Stats bar**: replace `Templates / Hook / Body / CTA` with `Saved / Analyzed / Pending` counts.
- **Header copy**: `Saved Videos` / `Your saved viral videos`. Master mode keeps "Master Vault" but with the same new subtitle.
- **Add by URL** button opens the existing right-side drawer, simplified:
  - Single URL input. Drop the optional "Template Name" field and the "AI is extracting the viral structure..." animation.
  - Loading state: a regular spinner with "Adding & analyzing…".
  - Submit → see "URL paste pipeline" below.
- **Master Vault**: client filter dropdown stays; each card gets the existing client badge in master mode.
- **Empty state**: "Vault is empty / Paste a URL or save a video from Viral Today to start your library."

### ViralVideoDetail page (`src/pages/ViralVideoDetail.tsx`)

The existing "Save to Vault" section at `ViralVideoDetail.tsx:154` and `:340` runs a transcribe → analyze-template → insert-into-`vault_templates` flow. Replace with a one-shot save:

- Keep the client picker (`saveClientId` state and dropdown).
- On click:
  ```ts
  const { error } = await supabase
    .from("saved_videos")
    .upsert(
      { client_id: saveClientId, viral_video_id: video.id, saved_by: user.id },
      { onConflict: "client_id,viral_video_id", ignoreDuplicates: true }
    );
  ```
  After the upsert resolves, query whether a pre-existing row was already present (or compare `saved_at` from a follow-up select) and toast "Already saved to this client's Vault" vs. "Saved to Vault" accordingly. Errors fall through to the `error` toast path.
- Button states: `Save to Vault` → `Saving…` → `Saved ✓` (filled). Re-saves to a different client are allowed via the client picker.
- Remove the `saveMode` state machine's `transcribing` / `analyzing` stages. Keep `idle` / `saving` / `done` / `error`.
- Drop all `vault_templates` references and the `ai-build-script` `analyze-template` call from this file's save flow.

### Super Canvas video node (`src/components/canvas/VideoNode.tsx`)

The current `handleSaveToVault` at `VideoNode.tsx:556` writes to `vault_templates`. Replace its body:

- Require `d.viralVideoId` and `d.clientId`. If `viralVideoId` is missing (analysis hasn't completed yet), disable the button with tooltip "Analyzing — try again when ready".
- Insert into `saved_videos` exactly like ViralVideoDetail does.
- Button copy: `Save to Vault` → `Saved`. Same conflict behavior.

## URL paste pipeline (Vault drawer)

Mirrors `ViralToday.tsx:1668` (`handlePasteUrl`):

1. `POST /functions/v1/scrape-framework-url` with `{ url }`.
2. Handle the four documented statuses from the response:
   - `already_analyzed` / `raced_existing` → toast "Already in your library — @channel".
   - `analyzed_existing` → toast "Framework analyzed — @channel".
   - default (`analyzed_new` or similar) → toast "Framework added & analyzed — @channel".
   - Non-OK with `data.id` present → toast warning "Added but analysis failed — open to retry" (still proceed to save).
3. Insert into `saved_videos` with the returned `viral_video_id` and the active `client_id`. On unique-constraint conflict, toast "Already saved".
4. Out-of-credits: same `showOutOfCreditsModal()` branch the existing paste flow uses.
5. Refresh the Vault list.

## Code changes (file-level)

- **Migration**: `supabase/migrations/20260515_saved_videos.sql` — table, indexes, RLS.
- **Types**: regenerate `src/integrations/supabase/types.ts`.
- **Component extraction**: lift the inline card from `src/pages/ViralToday.tsx` (~line 575) into `src/components/viral-today/ViralVideoCard.tsx`. Both Viral Today and Vault import it. Keep the component prop surface small enough that both call sites are clean.
- **Rewrite** `src/pages/Vault.tsx`:
  - Drop `VaultTemplate` type, `template_lines` stats, `SECTION_CONFIG`, `VaultTemplateCard` component, and the analyze-template fetch chain.
  - Add `SavedVideo = { id, saved_at, viral_video: ViralVideo }` type sourced from a joined query.
  - Replace `fetchTemplates` with `fetchSavedVideos` (`supabase.from('saved_videos').select('*, viral_video:viral_videos(*)').eq('client_id', …).order('saved_at', desc)`).
  - Replace `handleCreate` with `handlePasteUrl` (see above).
  - Replace `handleDelete` with `handleUnsave` (deletes the `saved_videos` row by `id`; toast "Removed from Vault").
- **Update** `src/pages/ViralVideoDetail.tsx`: replace the save section + `handleSaveToVault` body.
- **Update** `src/components/canvas/VideoNode.tsx`: replace `handleSaveToVault` body; remove the `analyze-template` fetch.
- **Cleanup**: remove `vault_templates` imports and any associated copy strings from the three rewritten files. Leave the table and any back-end edge-function references untouched.

## Out-of-scope follow-ups

- Drop `vault_templates` table in a later migration once we're sure nothing else reads it.
- Per-save notes UI (column exists).
- Tags / folders inside the Vault.
- "Recently saved" badge on Viral Today cards (cross-surface awareness).

## Open risks

- **Component extraction churn**: lifting the inline Viral Today card into a shared component touches a 2500-line file. Risk: regressions on Viral Today filters/states. Mitigation: keep the extraction pure (no behavior change), and verify Viral Today still renders identically before changing the Vault page.
- **`scrape-framework-url` response shape**: relied on but only loosely typed today. Mitigation: handle missing/unknown statuses the same defensive way Viral Today does.
- **RLS for `saved_videos`**: must match the per-client policy used elsewhere. Mitigation: copy verbatim from `vault_templates` policies and adapt.
