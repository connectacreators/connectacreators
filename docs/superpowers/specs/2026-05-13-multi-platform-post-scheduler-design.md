# Multi-Platform Post Scheduler — Design Spec

**Date:** 2026-05-13
**Status:** Draft — pending user review
**Scope:** v1 — autopost / schedule / draft single 9:16 video to Facebook Reels, Instagram Reels, TikTok, YouTube Shorts from inside the connectacreators app.

---

## 1. Goals & non-goals

### Goals
- Let an agency user connect a client's social accounts (FB, IG, TikTok, YouTube) once per client.
- From an `editing_queue` row, open a composer to publish the approved 9:16 video to any subset of those platforms.
- Three publish modes: **Post now** (autopost), **Schedule for…** (publishes at a chosen time), **Save as draft**.
- Per-platform success/failure tracking with retry and clear UI for reauth or hard failures.
- Beta-gate the entire feature so it can be developed and tested without affecting current production behavior.

### Non-goals (v1)
- Multi-asset posts: carousels, multi-image, threads.
- Stories.
- Captions per-platform (single shared caption, editable in composer; per-platform overrides are a v2 follow-up).
- Analytics / insights pulled back from platforms (only the `platform_post_id` and `platform_post_url` are stored for now).
- A separate "compose from scratch" entry point — for v1 every scheduled post originates from an `editing_queue` row.
- TikTok/YouTube publishing in production until their respective app reviews land. Architecture supports them on day one; release is phased.

---

## 2. Architecture overview

```
┌─────────────────────┐        ┌────────────────────────┐
│ EditingQueue row    │  →     │ Composer modal         │
│ "Schedule" button   │        │ (video + caption +     │
└─────────────────────┘        │  platforms + mode)     │
                               └─────────┬──────────────┘
                                         │ insert
                                         ▼
                               ┌────────────────────────┐
                               │ scheduled_posts        │
                               │ scheduled_post_targets │
                               └─────────┬──────────────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  │                      │                      │
       autopost (immediate)    pg_cron every 60s        manual retry
                  │                      │                      │
                  ▼                      ▼                      ▼
                   ┌─────────────────────────────────────┐
                   │ Edge fn: publish-scheduled-posts    │  dispatcher
                   │  SELECT … FOR UPDATE SKIP LOCKED    │
                   │  fan out per target                 │
                   └────────────┬────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
         publish-to-meta   publish-to-tiktok   publish-to-youtube
              │                 │                 │
              └─────────────────┼─────────────────┘
                                ▼
                  scheduled_post_targets updated;
                  scheduled_posts.status rolled up
```

Single dispatcher + per-platform workers gives failure isolation, per-platform retry policy, and independent deploy/review per platform.

---

## 3. Data model

Three new tables. All RLS-scoped by `client_id` (matches existing pattern).

### 3.1 `social_connections`

One row per (client, platform). Stores OAuth credentials and the picked account.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid → clients | RLS key |
| `platform` | text | `facebook` \| `instagram` \| `tiktok` \| `youtube` |
| `account_label` | text | display name (e.g. "Acme FB Page", "@acme") |
| `platform_account_id` | text | FB Page ID / IG Business ID / TT open_id / YT channel ID |
| `access_token` | bytea | pgcrypto `pgp_sym_encrypt` |
| `refresh_token` | bytea | encrypted; null for FB Page tokens |
| `token_expires_at` | timestamptz | null = doesn't expire |
| `scopes` | text[] | granted scopes; used for missing-scope detection |
| `status` | text | `active` \| `needs_reauth` \| `revoked` |
| `connected_by` | uuid → auth.users | |
| `connected_at` | timestamptz | |
| `last_error` | text | last refresh/publish error |

- Unique on `(client_id, platform, platform_account_id)`.
- For v1, business rule: enforce one **active** connection per `(client_id, platform)` at the app layer (allow historical revoked rows).
- Encryption key: `SCHEDULER_TOKEN_KEY` env var. Postgres function `decrypt_social_token(id)` only callable by service role.

### 3.2 `scheduled_posts`

One row per composer submission.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid → clients | |
| `editing_queue_id` | uuid → editing_queue | source row (nullable for future) |
| `video_url` | text | 9:16 video URL (Supabase Storage / public CDN) |
| `caption` | text | shared caption, pre-filled from `scripts.caption` |
| `mode` | text | `draft` \| `scheduled` \| `autopost` |
| `scheduled_at` | timestamptz | UTC; null for drafts |
| `timezone` | text | IANA tz user picked the time in (display-only) |
| `status` | text | `draft` \| `scheduled` \| `publishing` \| `published` \| `partial` \| `failed` |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

`status = partial` means some targets published, some failed. Computed by rollup on target updates.

### 3.3 `scheduled_post_targets`

One row per (scheduled_post, platform). The unit of publish + retry.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `scheduled_post_id` | uuid → scheduled_posts | cascade delete |
| `social_connection_id` | uuid → social_connections | the account at submit time |
| `platform` | text | denormalized for indexing |
| `status` | text | `pending` \| `publishing` \| `published` \| `failed` |
| `platform_post_id` | text | platform's post ID after success |
| `platform_post_url` | text | deep link to the live post |
| `attempt_count` | int | starts at 0 |
| `next_attempt_at` | timestamptz | for exponential backoff |
| `last_error` | text | |
| `published_at` | timestamptz | |

Status lifecycle: `pending` → `publishing` → `published` on success. On a non-terminal failure, status goes back to `pending` with `next_attempt_at` set and `last_error` recorded. `failed` is reserved for **terminal** failures (attempt cap reached, hard format error, account disconnected). Manual retry from UI moves a `failed` row back to `pending` with `next_attempt_at = now()` (single-row reuse — no duplicate target rows ever exist for a given (scheduled_post, platform)).

Indexes:
- `(status, next_attempt_at)` — dispatcher scan
- `(scheduled_post_id)` — rollup queries
- unique on `(scheduled_post_id, platform)` — one target row per post+platform, ever.

### 3.4 Relationship to `content_calendar`

`content_calendar` represents Notion-linked calendar entries — different lifecycle. `scheduled_posts` and `content_calendar` link only by `editing_queue_id`. No coupling.

---

## 4. Connection flow (OAuth)

### 4.1 UI

`ClientDetail.tsx` → new "Social accounts" tab. 4-card grid, one per platform. Each card has one of three states:

- **Not connected** → "Connect <platform>" button.
- **Connected** → account label, last-used timestamp, "Reauth" + "Disconnect" links.
- **Needs reauth** → red banner, prominent reconnect button.

### 4.2 Flow (matches existing `facebook-oauth` pattern)

```
Click Connect
  → GET /<platform>-oauth?action=get_url&client_id=&return_path=
  → browser → platform OAuth dialog
  → platform → /<platform>-callback?code=&state=
  → callback page → POST /<platform>-oauth { action: 'callback', code, state }
  → edge fn exchanges code, fetches account info, encrypts + writes social_connections
  → callback page redirects to return_path with toast
```

### 4.3 Per-platform specifics

**Facebook + Instagram (one OAuth, two `social_connections` rows)**

- Extend existing `facebook-oauth`. Required scopes for v1:
  - `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement` (already in app)
  - **add:** `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`
- After token exchange:
  1. `GET /me/accounts` → list user's Pages. User picks one.
  2. Get the Page access token from that response.
  3. `GET /{page-id}?fields=instagram_business_account` → if present, get IG Business Account ID.
  4. Insert `social_connections` row for `facebook` (Page token + Page ID).
  5. If IG account found, insert a second `social_connections` row for `instagram` (same Page token + IG account ID). Otherwise surface a warning: "This Page isn't linked to an Instagram Business account. Connect it from Facebook to enable IG publishing."
- Page tokens don't expire as long as the user token is valid; we still re-derive on each publish via cached Page token + error retry.

**TikTok**

- New edge fn `tiktok-oauth`. TikTok for Developers app. Scopes: `user.info.basic`, `video.upload`, `video.publish`.
- Access token TTL 24h; refresh token TTL 365d. Both stored encrypted. Lazy refresh: publisher checks `token_expires_at < now() + 5min` and refreshes before publish.
- Callback page: `/tiktok-callback`.

**YouTube**

- New edge fn `youtube-oauth`. Google OAuth2. Scope: `https://www.googleapis.com/auth/youtube.upload` (consider also `youtube.readonly` to fetch channel name for `account_label`).
- Access token TTL 1h; refresh token long-lived. Lazy refresh same as TikTok.
- Callback page: `/youtube-callback`.

### 4.4 Token encryption

v1: **AES-GCM in the edge function layer** (Web Crypto API). `SCHEDULER_TOKEN_KEY` env var holds a base64-encoded 32-byte key. The key never enters Postgres; tokens are encrypted before INSERT and decrypted after SELECT inside the edge functions only. Reading the plaintext requires going through an edge function — direct SQL queries see only base64 ciphertext. RLS remains as a second layer.

(Earlier draft suggested pgcrypto; AES-GCM in Deno was chosen because it removes the need for SQL-side key management and `SECURITY DEFINER` decryption functions.)

Migration to Supabase Vault is a follow-up if needed.

### 4.5 Disconnect

- `DELETE social_connections WHERE id = ?`.
- Best-effort token revoke:
  - Facebook: `DELETE /{user-id}/permissions`.
  - Google: `https://oauth2.googleapis.com/revoke`.
  - TikTok: no public revoke endpoint — drop locally.
- Pending `scheduled_post_targets` for that connection move to `status='failed'`, `last_error='Account disconnected'`.

---

## 5. Composer UX

### 5.1 Entry point

`EditingQueue.tsx` already has `scheduleItem`, `scheduleDate`, and a schedule modal. Reuse that as the composer host. The button only enables when `file_submission` URL is present (i.e. video uploaded).

### 5.2 Layout

```
┌─────────────────────┬────────────────────────────────────┐
│                     │ Caption                            │
│                     │ [pre-filled from scripts.caption,  │
│   9:16 video        │  editable, char-count visible]     │
│   preview           │                                    │
│                     │ Publish to:                        │
│                     │  ☑ Facebook Reels — Acme FB Page   │
│                     │  ☑ Instagram Reels — @acme         │
│                     │  ☐ TikTok      — Connect first →   │
│                     │  ☑ YouTube Shorts — Acme Channel   │
│                     │                                    │
│                     │ When:                              │
│                     │  ○ Post now                        │
│                     │  ● Schedule for: [date] [time] [tz]│
│                     │  ○ Save as draft                   │
│                     │                                    │
│                     │      [Cancel]  [Schedule →]        │
└─────────────────────┴────────────────────────────────────┘
```

- Submit-button label switches on mode: **Publish now** / **Schedule** / **Save draft**.
- Disabled checkboxes (no connection) show "Connect first →" linking to that client's social-accounts tab in a new tab so the composer state isn't lost.
- Per-platform character-count hints under the caption (TikTok 2,200; IG 2,200; FB ~63k; YT description 5,000). Just hints; we don't truncate.

### 5.3 Submit behavior

1. Validate: at least one platform selected, scheduled time in future (if scheduled), caption length within max for selected platforms.
2. Insert `scheduled_posts` row.
3. For each selected platform: insert `scheduled_post_targets` row (status `pending`).
4. **autopost** → immediately invoke `publish-scheduled-posts` dispatcher with `force_post_id=<scheduled_post_id>` (skips the time-window check).
5. **scheduled** → leave for cron.
6. **draft** → no targets inserted; only the `scheduled_posts` row with `status='draft'`. Re-opening the composer hydrates from the row.

### 5.4 Drafts / scheduled list

Surface on `ContentCalendar.tsx`. New filter tabs alongside existing calendar: **All / Drafts / Scheduled / Published / Failed**. Each row shows the per-platform status icons and links back into the composer.

---

## 6. Publish pipeline

### 6.1 Dispatcher (`publish-scheduled-posts` edge function)

Triggered by:
- pg_cron `'process-scheduled-posts'` every 60s.
- Direct invocation from composer on `mode='autopost'`.
- Manual retry from UI.

Logic:

```sql
-- inside dispatcher
WITH due AS (
  SELECT t.id
  FROM scheduled_post_targets t
  JOIN scheduled_posts p ON p.id = t.scheduled_post_id
  WHERE
    t.status = 'pending'
    AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
    AND p.status IN ('scheduled', 'publishing')           -- 'publishing' covers in-flight retries
    AND (p.scheduled_at <= now() OR p.mode = 'autopost')  -- autopost has scheduled_at = creation time
    AND (SELECT scheduler_enabled FROM app_settings LIMIT 1) = true
  ORDER BY t.next_attempt_at NULLS FIRST
  LIMIT 50
  FOR UPDATE OF t SKIP LOCKED
)
UPDATE scheduled_post_targets
SET status = 'publishing', attempt_count = attempt_count + 1
WHERE id IN (SELECT id FROM due)
RETURNING *;
```

For each returned row, call the per-platform publisher edge function (parallel, fire-and-forget — publishers update their own rows). `SKIP LOCKED` prevents two concurrent cron invocations from picking the same row.

After all in-batch calls dispatched, dispatcher returns. Rollup of `scheduled_posts.status` happens via a trigger on `scheduled_post_targets` updates.

### 6.2 Per-platform publishers

Each publisher takes `{ target_id }`, fetches the target + parent + decrypted token, and runs the platform's publish flow. On a non-terminal error, writes `last_error`, sets `status='pending'`, computes `next_attempt_at` from `attempt_count`. On a terminal error (attempt cap reached, hard format error, missing scope, account disconnected), writes `last_error` and sets `status='failed'`. On success, writes `platform_post_id`, `platform_post_url`, `status='published'`, `published_at`.

**Idempotency**: publisher first checks `platform_post_id IS NOT NULL` → if so, returns `already_published` and does nothing. Safe against double-cron and double-retry.

#### `publish-to-meta` — handles both Facebook Reels and Instagram Reels

Graph API v19.0. Per-platform branch in the same function (they share the Page access token).

**Instagram Reels (3-step container flow)**:
1. `POST /{ig-user-id}/media` with `media_type=REELS`, `video_url`, `caption` → returns `container_id`.
2. Poll `GET /{container_id}?fields=status_code` every 10s, up to 5 min, until `FINISHED`.
3. `POST /{ig-user-id}/media_publish` with `creation_id=container_id` → returns the IG Media ID. Build permalink via `GET /{media-id}?fields=permalink`.

**Facebook Reels**:
1. `POST /{page-id}/video_reels?upload_phase=start&access_token=...` → returns `video_id`, `upload_url`.
2. Either upload bytes or `POST {upload_url}` with `file_url=<video_url>` header.
3. `POST /{page-id}/video_reels?upload_phase=finish&video_id=...&video_state=PUBLISHED&description=<caption>`.
4. Construct URL: `https://www.facebook.com/reel/{video_id}`.

#### `publish-to-tiktok`

Content Posting API. PULL_FROM_URL flow (no byte upload from us — TikTok pulls from `video_url`):

1. `POST /v2/post/publish/inbox/video/init/` with body `{ source_info: { source: 'PULL_FROM_URL', video_url } }` → returns `publish_id`.
2. Poll `POST /v2/post/publish/status/fetch/` with `{ publish_id }` every 10s, up to 10 min, until `status = 'SUCCESS'` or terminal failure.
3. On success, the response includes `publicaly_available_post_id` (sic — note TikTok's actual field name varies). Compose URL: `https://www.tiktok.com/@{handle}/video/{id}`.

#### `publish-to-youtube`

YouTube Data API v3 resumable upload.

1. `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with metadata body:
   ```json
   {
     "snippet": { "title": "<first line of caption or script title>",
                  "description": "<caption>",
                  "categoryId": "22" },
     "status":  { "privacyStatus": "public", "selfDeclaredMadeForKids": false }
   }
   ```
   → returns upload URL in `Location` header.
2. Stream the video bytes (fetched from `video_url`) to that URL in one PUT (or chunked if >100MB).
3. Response body is the `videos.list` resource. Use `id` → URL `https://www.youtube.com/shorts/{id}`.

Quota: each upload = 1,600 units. Default cap 10,000/day. Apply for raise before GA.

### 6.3 Rollup trigger

```sql
CREATE OR REPLACE FUNCTION rollup_scheduled_post_status() RETURNS trigger AS $$
DECLARE
  counts record;
BEGIN
  SELECT
    count(*) FILTER (WHERE status='pending'    OR status='publishing') AS in_flight,
    count(*) FILTER (WHERE status='published') AS published,
    count(*) FILTER (WHERE status='failed')    AS failed,
    count(*) AS total
  INTO counts
  FROM scheduled_post_targets WHERE scheduled_post_id = NEW.scheduled_post_id;

  UPDATE scheduled_posts
  SET
    status = CASE
      WHEN counts.in_flight > 0                         THEN 'publishing'
      WHEN counts.failed = counts.total                 THEN 'failed'
      WHEN counts.published = counts.total              THEN 'published'
      WHEN counts.published > 0 AND counts.failed > 0   THEN 'partial'
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.scheduled_post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Trigger fires `AFTER UPDATE OF status` on `scheduled_post_targets`.

---

## 7. Errors & retry policy

### 7.1 Backoff

`next_attempt_at` per attempt: +5 min, +15 min, +1 h, +4 h, give up. Cap at 5 attempts.

### 7.2 Error classes

| class | example | handling |
|---|---|---|
| **Token expired / invalid** | FB `OAuthException 190`; Google `invalid_grant`; TikTok `access_token_invalid` | flip `social_connections.status='needs_reauth'`; mark target failed; **no retry until reconnect**; surface banner in client workspace |
| **Missing scope** | Meta error code `200` "permissions" | same as token expired |
| **Rate limit / 429** | Retry-After header | set `next_attempt_at = now() + Retry-After`, status back to `pending` |
| **Video format / size error** | IG `Invalid media format`, YT quota exceeded for resolution | mark `failed` permanently, no retry, show exact platform message in UI |
| **Network / 5xx** | timeout, 502 | normal backoff retry |
| **Account disconnected mid-flight** | connection row deleted | mark `failed`, "Account disconnected" |

### 7.3 UI surfaces

- **Per-row badge** on ContentCalendar: status pill + 4 platform icons (FB / IG / TT / YT). Icon color per `scheduled_post_targets.status` (green / yellow / red / grey-if-not-targeted).
- **Details modal** on row click: per-platform status, last error, attempt count, "Retry now" button (resets `next_attempt_at = now()`).
- **Workspace-level banner** if any `social_connections.status = 'needs_reauth'` or any target in `failed` within last 7 days.
- **Toast** on autopost path: "Publishing to 3 platforms…" → resolves to "Published to 3 platforms" or "2 published, 1 failed — view details".

### 7.4 Logging

- `last_error` on target row (one-liner for UI).
- Full request/response payloads → Supabase Function Logs (don't store in DB — too large, leak risk).
- Optional: small `scheduled_post_events` table for auditable timeline (insert one row per state transition). Defer to v2 if v1 logs are sufficient.

---

## 8. Beta gating & deployment

### 8.1 Three layers of off-switch

1. **Frontend env flag** `VITE_FEATURE_SCHEDULER`. When `false`:
   - "Schedule" button in EditingQueue uses the existing Notion-only path.
   - Social-accounts tab hidden in `ClientDetail`.
   - New filter tabs hidden in `ContentCalendar`.
   - No new code paths reachable.
2. **Per-user opt-in** `user_settings.scheduler_beta_enabled`. Even with the env flag on, user only sees new UI if opted in. Lets you ship to prod and onboard testers gradually.
3. **Backend kill-switch** `app_settings.scheduler_enabled` (single-row table). Dispatcher reads this on every invocation; when `false`, it returns 200 immediately and does nothing. Lets you stop a runaway publish without redeploy.

### 8.2 Local testing

- `supabase start` runs Postgres + edge functions + pg_cron locally.
- OAuth redirect URIs: for local dev, register `http://localhost:8081/<platform>-callback` in each platform's dev app config. Alternative: `cloudflared tunnel` to expose local Supabase to platforms requiring https callbacks.
- Each platform's sandbox / test-user mode:
  - **Meta**: app must be in Development mode with test users assigned a role on the test Page.
  - **TikTok**: Sandbox app + sandbox users.
  - **Google**: OAuth consent screen in Testing mode + listed test users.
- **DRY_RUN_SCHEDULER** env var on publisher functions. When `true`, publisher logs the API call payload but doesn't POST. Exercises the entire pipeline (cron → dispatcher → publisher → rollup) without real posts. Useful for CI / automated tests.

### 8.3 Phasing

| phase | scope | gating | unblock condition |
|---|---|---|---|
| **A — Foundation + Meta** | Tables, RLS, encryption fn, social-accounts tab UI, composer modal, `publish-scheduled-posts`, `publish-to-meta`, pg_cron job, kill-switch, env flag, opt-in flag | env flag off in prod; opt-in self only | Meta publish scopes already in app review (or already approved) |
| **B — TikTok** | `tiktok-oauth`, `tiktok-callback`, `publish-to-tiktok` | same | TikTok Content Posting API approval |
| **C — YouTube** | `youtube-oauth`, `youtube-callback`, `publish-to-youtube` | same | Google project + (optional) quota raise |
| **D — GA** | Remove env flag, remove opt-in gate | — | Phases A–C stable for ≥2 weeks of beta usage |

---

## 9. Open questions

- **Caption defaults from script**: today `editing_queue.caption` exists alongside `scripts(title, idea_ganadora)`. Which is the canonical source the composer should pre-fill from — `editing_queue.caption` if set, else `scripts.caption`? Confirm during implementation.
- **Drafts ownership**: should drafts be visible to all agency users of a client, or only `created_by`? v1 assumption: visible to all (matches `content_calendar` behavior). Confirm.
- **YT title**: caption is one field, but YT needs a title (≤100 chars) + description. v1 plan: first line of caption (truncated to 100) becomes title; full caption becomes description. Alternative: explicit Title field in composer. v1 takes the implicit path.
- **Time zone source of truth**: composer defaults to browser tz. If user explicitly sets a different tz, store IANA name in `timezone` column. Display in that tz everywhere in UI. `scheduled_at` always UTC.

---

## 10. File-level work breakdown (orientation only — full plan in writing-plans phase)

**Database**
- new migration: `social_connections`, `scheduled_posts`, `scheduled_post_targets`, `app_settings`, `user_settings.scheduler_beta_enabled` column
- pgcrypto enc/dec functions
- rollup trigger
- pg_cron job registration

**Edge functions**
- `facebook-oauth` (extend scopes + dual-row IG insert)
- `tiktok-oauth` (new) + `youtube-oauth` (new)
- `publish-scheduled-posts` (dispatcher)
- `publish-to-meta` / `publish-to-tiktok` / `publish-to-youtube`

**Frontend**
- `src/pages/ClientDetail.tsx` — Social-accounts tab
- `src/pages/EditingQueue.tsx` — replace schedule modal with composer
- `src/pages/ContentCalendar.tsx` — new status filters and per-platform badges
- `src/pages/TiktokCallback.tsx`, `src/pages/YoutubeCallback.tsx` (new; mirror `FacebookCallback.tsx`)
- Feature-flag wrapper utility

**Configuration**
- env: `VITE_FEATURE_SCHEDULER`, `SCHEDULER_TOKEN_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `DRY_RUN_SCHEDULER`
- dev-app callback URIs registered for localhost
