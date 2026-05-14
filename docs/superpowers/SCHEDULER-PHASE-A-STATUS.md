# Post Scheduler — Phase A Status

**Last updated:** 2026-05-13
**Branch:** `feat/post-scheduler-phase-a` (merged into `main`)
**Spec:** [specs/2026-05-13-multi-platform-post-scheduler-design.md](specs/2026-05-13-multi-platform-post-scheduler-design.md)
**Plan:** [plans/2026-05-13-multi-platform-post-scheduler.md](plans/2026-05-13-multi-platform-post-scheduler.md)

## TL;DR

Phase A (Foundation + Meta) is **deployed to production and working end-to-end for app admins**. Facebook Pages + Instagram Reels can be connected and the scheduler pipeline (composer → schedule → cron → publisher → status rollup) is wired up. `DRY_RUN_SCHEDULER=true` is currently on, so publishes write fake URLs instead of hitting Meta's API — flip this off when ready to test a real post.

## What's deployed

### Database (Supabase project `hxojqrilwhhrvloiwmfo`)

Applied 8 migrations via Management API:
- `20260513_a01_scheduler_kill_switch.sql` — `app_settings.scheduler_enabled` (currently `true`)
- `20260513_a02_scheduler_user_opt_in.sql` — `user_settings` + per-user opt-in column
- `20260513_a03_social_connections.sql` — per-client OAuth tokens (encrypted)
- `20260513_a04_scheduled_posts.sql` — parent post records
- `20260513_a05_scheduled_post_targets.sql` — per-platform fanout
- `20260513_a06_rollup_trigger.sql` — auto-roll target statuses → parent
- `20260513_a07_scheduler_cron.sql` — pg_cron fires dispatcher every minute
- `20260513_a08_claim_fn.sql` — `claim_scheduler_batch` SQL fn w/ `FOR UPDATE SKIP LOCKED`

**One pre-existing table dropped:** old `scheduled_posts` (0 rows, abandoned earlier design with `platforms` array column).

### Edge functions

- `publish-scheduled-posts` — dispatcher (cron + autopost trigger)
- `publish-to-meta` — IG Reels 3-step container + FB Reels start/upload/finish
- `facebook-oauth` — extended with `purpose=scheduler`, dual-row IG insert, `auth_type=rerequest`, `business_management` scope, `/me/promotable_pages` + `/me/businesses` → `owned_pages`/`client_pages` fallback paths

### Secrets

- `SCHEDULER_TOKEN_KEY` — AES-GCM 32-byte key (rotate would break existing encrypted tokens — keep backed up)
- `DRY_RUN_SCHEDULER=true` — **CURRENTLY ON** — disables real Meta API calls
- `FACEBOOK_APP_ID=1458843159177922`, `FACEBOOK_APP_SECRET=...` (pre-existing)

### Cron

- pg_cron job `process-scheduled-posts` runs every minute (`* * * * *`)
- `fire_scheduler_dispatch()` SQL fn has the dispatcher URL + service role key inlined (because `ALTER DATABASE SET` is denied for the management API user)

### Frontend (deployed via GitHub Actions to VPS)

- `VITE_FEATURE_SCHEDULER=true` in committed `.env` → env gate open for everyone
- Per-user gating via `user_settings.scheduler_beta_enabled` — only opted-in users see the UI
- New route: `/clients/:clientId/social-accounts`
- New components: `SocialAccountsTab`, `SocialAccountCard`, `PublishComposer`, `PostStatusBadge`, `PostDetailsModal`, `ReauthBanner`
- New hooks: `useSchedulerEnabled`, `useSocialConnections`, `useScheduledPosts`, `useStartFacebookOAuth`

## Who's opted in

```sql
SELECT u.email, us.scheduler_beta_enabled
FROM user_settings us JOIN auth.users u ON u.id = us.user_id
WHERE us.scheduler_beta_enabled = true;
```
- `admin@connectacreators.com`
- `robertogaunaj@gmail.com`

To add more: `INSERT INTO user_settings (user_id, scheduler_beta_enabled) VALUES ('<uuid>', true) ON CONFLICT DO UPDATE SET scheduler_beta_enabled = true;`

## What's connected

Per `social_connections` table — one client has a working connection to date:
- **Facebook: DJ R3.** (Page ID needed for posting)
- **Instagram: @r3.productions** (linked to DJ R3. via Page's Instagram Business Account)

Both rows created via the new `connect_for_scheduling` action. Tokens are AES-GCM encrypted at rest.

## Key lessons from the OAuth saga (avoid these next time)

1. **Pages owned by a Business Portfolio are invisible to `/me/accounts` unless `business_management` is granted.** Meta silently filters them out — no error, just empty data array.
2. **`business_management` requires Business Verification** of the Meta app's associated Business Portfolio. Without it, the scope is silently revoked at grant time even when checked in the consent dialog.
3. **The fix:** transfer the Page's ownership to an already-verified Business Portfolio. Took ~1 min. After this, `business_management` is grantable, `/me/businesses` returns the portfolio, and `/{biz}/owned_pages` returns the Pages.
4. **Auth caching:** if you previously granted partial scopes, `auth_type=rerequest` re-prompts only for previously-DECLINED scopes — won't trigger a fresh dialog for newly-added scope requests. To re-prompt for newly-added scopes, remove the app at https://www.facebook.com/settings?tab=business_tools and re-OAuth.
5. **OAuth code is single-use.** The page-picker flow requires two backend calls; the second call must echo back the long-lived user token from the first instead of re-exchanging the code.

## Next steps

### Immediate — verify the publish pipeline works (DRY_RUN)

See "Test plan" below. Should produce a row in `scheduled_post_targets` with `status='published'` and a fake `dryrun-*` URL.

### Then — test a real post

Disable dry-run:
```bash
curl -X DELETE "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/secrets" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '["DRY_RUN_SCHEDULER"]'
```
Then schedule a post 2 min out. After it fires, the post should be visible on DJ R3.'s Reels tab AND @r3.productions' Reels tab. The `platform_post_url` columns will have real Meta URLs.

### Composer redesign — Metricool-style polish (deferred, Phase A.1)

User wants the composer to look like Metricool's "Create new post" UI. Reference screenshots saved in session history. Constraints: their brand only (no emojis, font-caslon headers, dark theme with pink/teal accents).

**Target features (in priority order):**
1. **Platform tabs at top** — circular brand-colored icons for FB / IG / TikTok / YT (instead of current checkbox list). Click a tab to switch active platform context.
2. **Live phone preview pane on the right** — renders the 9:16 video with platform-specific UI overlay (TikTok-style icons on TikTok tab, IG-style on IG tab, etc.). Toggle button for mobile/desktop preview.
3. **Per-platform character counters** — visible at bottom-right of caption area. TikTok 2200, IG 2200, FB ~63k, YT 5000.
4. **Single-click datetime picker** in footer — replaces the current radio + 3 inputs.
5. **Split-button schedule** — primary action "Schedule" with dropdown for "Post now" / "Save as draft".
6. **Collapsible per-network presets sections** — initially empty, future home for pinned comments, location tags, audience targeting.
7. **"Edit by network" toggle** (biggest change — needs schema migration) — when ON, each platform tab has its own caption. Add `caption_overrides jsonb` column on `scheduled_posts`. Publisher reads `caption_overrides[platform] ?? caption`.

**Files this would touch:**
- `src/components/scheduler/PublishComposer.tsx` — major rewrite
- New: `src/components/scheduler/PreviewPhone.tsx` — phone mockup component
- New: `src/components/scheduler/PlatformTab.tsx` — tab button with brand icon
- New migration: `scheduled_posts.caption_overrides` jsonb column (only if "Edit by network" is in scope)
- `publish-to-meta/index.ts` — read caption from override if present

**Estimate:** ~half day for full parity, ~2 hours for visual polish without "Edit by network". Decide after Stage 1+2 tests pass.

### Later — open to non-admin users (Phase D — GA)

Requires:
- Meta App Review submission for `pages_manage_posts` and `instagram_content_publish` (each needs a screen-recorded demo + privacy/ToS URLs)
- Then any Connecta agency user can OAuth their clients' accounts

Until App Review, only app admins/developers/testers can OAuth.

### Phase B (TikTok)

- Apply for TikTok Content Posting API access
- Write `tiktok-oauth` and `publish-to-tiktok` edge functions (outlined in plan doc)
- Enable TikTok in `SocialAccountsTab` (remove the `disabled` flag)

### Phase C (YouTube)

- Create Google Cloud project, enable YouTube Data API v3
- Apply for quota raise (default 10K units/day = ~6 uploads)
- Write `youtube-oauth` and `publish-to-youtube` edge functions
- Enable YouTube in `SocialAccountsTab`

## Integration with the unified lifecycle_status (Phase 1)

Parallel work added a `video_edits.lifecycle_status` column to merge the old `status` + `post_status` pair. Values: **Not started / In progress / Needs Revisions / Scheduled / Published**. Helper: `src/lib/lifecycleStatus.ts` with `LIFECYCLE_VALUES`, `LifecycleStatus` type, `splitLegacy()` for dual-write.

**Scheduler integration (migrations a10/a11/a12):**
- Trigger on `scheduled_posts` INSERT/UPDATE of status syncs to `video_edits.lifecycle_status` via the `editing_queue_id` link
- Mapping:
  - `scheduled` / `publishing` → `lifecycle_status = 'Scheduled'`
  - `published` → `'Published'`
  - `partial` / `failed` → `'Needs Revisions'` (any failure rolls back to revisions per user spec)
  - `draft` → no change (drafts don't touch the editing row)
- Dual-write to legacy `status`/`post_status` per Phase 1 spec — readers of the old columns keep working until Phase 2 drops them
- Rollup trigger fixed (a11): freshly-submitted posts with all `pending` targets now stay `scheduled` instead of jumping to `publishing` on insert. Only `c_publishing > 0` triggers the `publishing` parent state.

**Inline failure UI in ContentCalendar:**
- Failed target's `last_error` shows inline on the card in a red banner
- Card-level "Retry" button resets all failed targets to `pending` + fires dispatcher
- Per-target "Retry" still available in PostDetailsModal for surgical retries

## Where we are in testing (resume point)

**State as of 2026-05-13 evening:**
- Robert + Connecta Creators Business Portfolio + DJ R3. + @r3.productions connected
- DRY_RUN_SCHEDULER is still ON
- Stale test post (id `98a7b66c…`) deleted — left over from before the approval gate landed
- **Major workflow change shipped: client approval gate.** Posts no longer auto-publish at scheduled_at — they land in the Content Calendar "Awaiting approval" tab and must be approved before the dispatcher fires.

**Recent fixes (commit `a28e94c`):**
- Video URL resolution: `lib/videoUrl.ts` handles Storage paths (signed URLs from `footage` bucket), Google Drive paths (`/file/d/{id}` → `/uc?id={id}`), full URLs pass through. Used in composer preview, ScheduledPostCard thumbnails, and publish-to-meta (signs for 6h before passing to Meta).
- Migration a09: `client_approved_at` + `client_approved_by` columns on `scheduled_posts`, `claim_scheduler_batch` filters on `client_approved_at IS NOT NULL`.
- `ScheduledPostCard` shows 9:16 muted thumbnail + caption + status badge + Approve / Un-approve buttons.
- ContentCalendar filter tabs: All / **Awaiting approval** / **Approved** / Drafts / Published / Failed.
- PostStatusBadge surfaces "Awaiting approval" pill until `client_approved_at` is set.
- Composer success toast: "Sent to Content Calendar for client approval" (no longer "Scheduled").

**Immediate next action:** wait for the GitHub Actions deploy (~5-8 min from commit `a28e94c`), then run the test plan below.

## Test plan (next thing to do)

Walks the composer → calendar → approve → publish flow. DRY_RUN_SCHEDULER is still ON so no real Meta API calls are made.

1. Go to `https://connectacreators.com/clients/fc4c9ad5-50fd-4354-bc08-95c479bec4d1/editing-queue`
2. Pick a row with an uploaded video (has `file_submission`)
3. "..." menu → **Schedule / Publish** → composer opens
4. In the composer:
   - **Video preview should now play** (resolved via signed Storage URL)
   - Caption pre-fills (editable)
   - Check **Facebook Reels** + **Instagram Reels**
   - Mode: **"Schedule for…"** ~2 minutes from now
   - Click **Schedule**
   - Toast: "Sent to Content Calendar for client approval"
5. Open `https://connectacreators.com/clients/<id>/content-calendar`
6. New filter tabs visible. Switch to **"Awaiting approval"** → your row appears with:
   - 9:16 video thumbnail on the left
   - Caption + scheduled time
   - "Awaiting approval" pill badge
   - **Approve** button
7. Click **Approve** → toast "Approved — will publish when ready" → row moves to **Approved** tab
8. Within ~60 sec (or instantly if Approve fires the dispatcher), targets transition to `publishing` → `published`
9. Row moves to **Published** tab with green icons on FB + IG
10. Click row → details modal shows both targets `published` with `dryrun-*` URLs

When this works end-to-end, that's Stage 1 complete. Stage 2 = flip off DRY_RUN_SCHEDULER and post for real:

```bash
SUPABASE_ACCESS_TOKEN=<token> /tmp/supabase secrets unset DRY_RUN_SCHEDULER --project-ref hxojqrilwhhrvloiwmfo
# or set to false in the dashboard
```
Then schedule + approve a new post. Real post appears on DJ R3.'s Reels tab AND @r3.productions' Reels tab.

If anything fails, check:
- `app_settings.scheduler_enabled` is `true`
- `user_settings.scheduler_beta_enabled` is `true` for your user
- `social_connections` has the FB + IG rows for the client
- Edge function logs in Supabase Dashboard → Functions

## Important state to preserve

- **`SCHEDULER_TOKEN_KEY`** is stored in Supabase Edge Function secrets. If lost, all tokens in `social_connections` become unrecoverable (would need re-OAuth on every client). Document/back up out-of-band.
- The pre-existing `scheduled_posts` table was dropped (0 rows). If a future feature needs that schema, it'll need its own migration.
- `editing_queue_id` in `scheduled_posts` is a soft uuid — no FK — because `editing_queue` (production calls it `video_edits`) isn't in the migrations history. Foreign-key integrity is enforced at the app layer.
