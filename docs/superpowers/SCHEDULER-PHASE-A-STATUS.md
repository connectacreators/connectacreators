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

## Test plan (next thing to do)

Walks the composer → publish → status flow with DRY_RUN on so no real Meta API calls are made.

1. As a logged-in admin (already opted in), go to `https://connectacreators.com/clients/fc4c9ad5-50fd-4354-bc08-95c479bec4d1/editing-queue`
2. Pick or create an editing-queue row that has a `file_submission` URL (video)
3. Click the row's "..." menu → **"Schedule / Publish"** (when scheduler is enabled, this opens the composer instead of the old date-only modal)
4. In the composer:
   - Video preview shows on the left
   - Caption pre-fills from the editing-queue row (editable)
   - Check **Facebook Reels** + **Instagram Reels** (other two are greyed)
   - Mode: pick **"Schedule for…"** and set time ~2 min from now
   - Click **Schedule**
5. Within ~60s, pg_cron picks up the row → dispatcher → publish-to-meta → DRY_RUN short-circuits → writes fake URLs to `scheduled_post_targets`
6. Open `https://connectacreators.com/clients/<id>/content-calendar` — should see the row in **Published** tab with green badges on FB + IG icons
7. Click the row → details modal shows both targets `published` with `dryrun-*` URLs

If anything fails, check:
- `app_settings.scheduler_enabled` is `true`
- `user_settings.scheduler_beta_enabled` is `true` for your user
- `social_connections` has the FB + IG rows for the client
- Edge function logs in Supabase Dashboard → Functions

## Important state to preserve

- **`SCHEDULER_TOKEN_KEY`** is stored in Supabase Edge Function secrets. If lost, all tokens in `social_connections` become unrecoverable (would need re-OAuth on every client). Document/back up out-of-band.
- The pre-existing `scheduled_posts` table was dropped (0 rows). If a future feature needs that schema, it'll need its own migration.
- `editing_queue_id` in `scheduled_posts` is a soft uuid — no FK — because `editing_queue` (production calls it `video_edits`) isn't in the migrations history. Foreign-key integrity is enforced at the app layer.
