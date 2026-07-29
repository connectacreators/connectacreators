# Instagram Lead Prospecting Pipeline — Design

**Date:** 2026-07-29
**Status:** Approved, ready for implementation planning

## Problem

The `/1million` offer sells to owner-operator professional-service experts —
doctors, lawyers, coaches, consultants. Finding those people on Instagram to DM
is currently entirely manual: search by hand, eyeball each profile, keep a list
somewhere, then separately tap the counters on `/outbound`.

The scraper VPS already knows how to search Instagram for accounts, but that
capability is buried inside `/scrape-reels-search` where it serves viral-content
research. The `scrape-hashtag` edge function documents a `/ig-search` endpoint
that was never deployed ([supabase/functions/scrape-hashtag/index.ts:45](../../../supabase/functions/scrape-hashtag/index.ts#L45)),
so keyword→account search falls back to manually-supplied usernames.

Meanwhile `/outbound` tracks aggregate counters only. There are no per-prospect
records anywhere in the system — `connecta_leads` is inbound-only, from the
landing page.

## Goal

Turn keyword search into a worked prospect list that feeds the existing DM
outreach funnel, without inventing a second set of metrics and without
increasing the risk of another Instagram lockout.

## Non-goals

- No automated DM sending. This sources and tracks prospects; a human writes
  and sends every message.
- No lead scoring or auto-qualification. The operator judges the list.
- No changes to how `/outbound`'s existing steppers behave.
- No changes to `/scrape-reels-search`'s existing contract or auth posture.

---

## Architecture

Four layers, one direction of flow:

```
/outbound "Prospects" tab
      │  search "chiropractor austin"
      ▼
edge fn: ig-prospect-search ──► VPS /ig-search ──► fbsearch/topsearch_flat
      │  upsert handles (stage 0, enrichment pending)      (1 IG call)
      ▼
   ig_prospects table  ◄── rows visible immediately, un-enriched
      ▲
      │  claims ≤10 pending rows per tick
edge fn: ig-prospect-enrich ──► VPS /ig-profile-info ──► users/<name>/usernameinfo
      (driven by pg_cron, 1/min)                          (paced, rotated)
```

**Boundary rule:** the VPS owns every Instagram call, because it holds the
session cookies and the WARP SOCKS proxy. Supabase owns all state and
scheduling. The VPS has no Supabase credentials and does not gain any — it
stays a pure scraping service that answers questions and stores nothing.

---

## Layer 1 — VPS routes

Both routes go in `ytdlp-server.js` on `72.62.200.145:3099`. This file is
**VPS-only and not in git**; always `scp` the live copy down before editing, as
the repo copy has drifted stale before.

### `POST /ig-search`

Request: `{ query: string, limit?: number }` (default 15, max 30)

Response: `{ users: [{ username, user_id, full_name, follower_count,
profile_pic_url, is_verified, is_private }] }`

Implementation is an extraction, not new work. The `fbsearch/topsearch_flat`
call at ~line 3367 of the live `ytdlp-server.js` already does exactly this
inside `/scrape-reels-search` and is proven in production. Lift it into a
shared helper (`igTopSearch(query, limit, apiFetch)`) that both routes call, so
there is one implementation rather than a copy.

Cost: **1 Instagram API call per search.**

### `POST /ig-profile-info`

Request: `{ usernames: string[] }` (max 10 per call)

Response: `{ profiles: { [username]: { ...fields } | { error: string } } }`

Per username, calls `https://i.instagram.com/api/v1/users/<name>/usernameinfo/`
— the same call `scrapeInstagramProfile` already makes to resolve user IDs
(~line 327). Extracts:

| Field | Source | Why it matters |
|---|---|---|
| `biography` | `user.biography` | Reads as practitioner vs content account |
| `external_url` | `user.external_url` | Booking link = proven offer |
| `category` | `user.category` | "Chiropractor", "Immigration Lawyer" |
| `is_business` | `user.is_business` | Real practice vs personal |
| `media_count` | `user.media_count` | Already producing content |
| `follower_count` / `following_count` | `user.*` | Size band |
| `public_email` / `public_phone_number` | `user.*` | Contact fallback |
| `city_name` | `user.city_name` | Local-business geo |
| `is_private` / `is_verified` | `user.*` | Reachability |

Pacing: **4–6s randomized gap between profiles** inside the batch. A batch of
10 therefore occupies the route for ~50s.

### Shared behavior for both routes

- Require `x-api-key` (matching `/scrape-profile`). Note `/scrape-reels-search`
  does *not* currently check it — that inconsistency is left alone deliberately;
  changing it is out of scope.
- Use `getNextIgCookies()` for account rotation and `markIgAccountStale()` on
  `login_required` / `challenge_required`, exactly as existing IG calls do.
- Preserve the existing rate-limit distinction: a "Please wait a few minutes"
  reply is transient and must **not** mark an account stale. Getting this wrong
  previously dropped both live accounts from rotation.
- Route all traffic through the WARP proxy (`--socks5-hostname 127.0.0.1:1080`)
  with the existing Android user-agent and `X-IG-App-ID: 936619743392459`.
- When every account is stale, return `503` with a clear reason rather than
  silently returning empty results.

---

## Layer 2 — Storage

Two new tables. Migration files in this repo are **documentation copies applied
via the Management API** — never `db push` (see the header of
[20260717_outbound_metrics.sql](../../../supabase/migrations/20260717_outbound_metrics.sql)).

### `ig_prospect_runs`

One row per search, for provenance — "where did this handle come from?"

```
id            uuid pk
user_id       uuid not null → auth.users
query         text not null
requested     int not null default 0   -- limit asked for
returned      int not null default 0   -- handles IG gave back
inserted      int not null default 0   -- genuinely new after dedupe
created_at    timestamptz not null default now()
```

### `ig_prospects`

One row per handle. **`unique (username)` — global dedupe**, deliberately not
scoped to run or user: a handle already worked must never resurface from a
different query.

```
id                 uuid pk
username           text not null unique
user_id            uuid not null → auth.users     -- who sourced it
run_id             uuid → ig_prospect_runs

-- identity (from /ig-search, always present)
ig_user_id         text
full_name          text
follower_count     int
profile_pic_url    text
is_verified        bool default false
is_private         bool default false

-- enrichment (from /ig-profile-info, filled in later)
biography          text
external_url       text
category           text
is_business        bool
media_count        int
following_count    int
public_email       text
public_phone       text
city_name          text

-- enrichment state
enrichment_status  text not null default 'pending'
                     check (enrichment_status in ('pending','done','failed'))
enrichment_attempts int not null default 0
enriched_at        timestamptz
enrichment_error   text

-- workflow
stage_reached      int not null default 0 check (between 0 and 6)
stage_at           timestamptz
followed           bool not null default false
followed_back      bool not null default false
notes              text
created_at         timestamptz not null default now()
```

Indexes: `(enrichment_status, enrichment_attempts)` for the claim query,
`(user_id, stage_reached)` for the list view.

RLS admin-only on both, matching `outbound_daily_log`'s existing policy:
`FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())`.

---

## Layer 3 — Edge functions

### `ig-prospect-search`

1. Accept `{ query, limit }` from the authenticated admin caller.
2. Create an `ig_prospect_runs` row.
3. Call VPS `/ig-search`.
4. Bulk-insert results with `on conflict (username) do nothing`, so
   already-known handles are skipped silently.
5. Update the run row with `returned` / `inserted` counts.
6. Return the inserted rows plus a count of how many were already known.

Returns in ~2s. All rows land at `stage_reached = 0`,
`enrichment_status = 'pending'`.

### `ig-prospect-enrich`

Invoked by pg_cron every minute via `net.http_post`, guarded by the existing
`x-cron-secret: connectacreators-cron-2026` header pattern.

1. Claim up to 10 rows where `enrichment_status = 'pending'` and
   `enrichment_attempts < 3`, oldest first. Claim by incrementing
   `enrichment_attempts` in the same statement so overlapping ticks cannot
   double-process a row.
2. Call VPS `/ig-profile-info` with those usernames.
3. Write enrichment fields, set `enrichment_status = 'done'`, `enriched_at`.
4. Per-username errors set `enrichment_error` and leave status `pending` for
   retry; on the third failed attempt set `'failed'`.
5. On a `503` (all accounts stale), exit immediately without consuming
   attempts — rows stay `pending` and resume once cookies are restored.

Cron schedule mirrors `daily-content-opportunity-scan`'s structure: an idempotent
`cron.unschedule` in a `do $$ ... exception when others then null; end$$` block,
then `cron.schedule`.

---

## Layer 4 — Funnel integration

This is the highest-risk part of the feature: it mutates numbers the operator
actually relies on.

### Stage vocabulary

Uses the existing six stages verbatim from `STAGE_FIELDS` in
[src/hooks/useOutboundMetrics.ts](../../../src/hooks/useOutboundMetrics.ts).
No new vocabulary is introduced.

| `stage_reached` | Stage key | Label | Code |
|---|---|---|---|
| 0 | *(none)* | Sourced — list-only, uncounted | — |
| 1 | `pre_initiated` | Pre-Initiated | A1 |
| 2 | `message_seen` | Message Seen | IMS |
| 3 | `initiated` | Initiated | A2 |
| 4 | `engaged` | Engaged | B |
| 5 | `calendly_sent` | Calendly'd | C |
| 6 | `booked` | Booked | D |

### Rule 1 — sourcing is not targeting

Scraped rows land at stage 0 and write **nothing** to the counters. The
operator advances a row to A1 when they decide to work it.

This is not a stylistic choice. All five overall rates (IMSR, IR, PRR, CSR,
ABR) divide by `pre_initiated`. Auto-counting a 50-result search as 50 A1
events would inflate the funnel base and silently depress every conversion
percentage on the page. A handle nobody has looked at is not a targeted
prospect.

### Rule 2 — advancing fills the stages below

Setting a row from stage `M` to stage `N` writes `+1` to every stage counter in
`(M, N]`. Moving backwards writes `-1` to every counter in `(N, M]`.

This keeps the funnel monotone — a booked prospect is also counted at engaged
and calendly'd — which is what makes the stage conversion rates meaningful. Without
it, `C → D` could read above 100%.

Both directions must be idempotent: re-setting a row to the stage it already
occupies writes nothing.

### Rule 3 — write through the existing path

Each stage change performs the same two writes the steppers do in
`useOutboundMonth.update`:

1. Upsert `outbound_metrics` on `(user_id, platform, month)`, adjusting the
   affected stage columns.
2. Insert signed rows into `outbound_daily_log` (`user_id`, `platform`,
   `stage`, `delta`) — **current month only**, matching the existing rule that
   editing a past month is backfill, not activity today.

`platform` is always `'instagram'`.

**Whose counters move:** the **acting** user's, not the sourcing user's.
`ig_prospects.user_id` records who first surfaced a handle, but
`outbound_metrics` is per-admin (`auth.uid() = user_id`), so advancing a stage
credits whoever performs the action. If one admin sources a list and another
works it, the second admin's funnel moves.

### Rule 4 — follows are parallel, not stages

`followed` / `followed_back` toggles write `+1`/`-1` to the `follows` and
`follow_backs` counters. They are independent of `stage_reached` and feed FBR%.

### Coexistence

The manual steppers on `/outbound` continue to work untouched, for prospects
sourced outside this tool. Both paths write to the same two tables through the
same semantics, so the totals stay coherent.

---

## Layer 5 — UI

A **Prospects** tab on [src/pages/Outbound.tsx](../../../src/pages/Outbound.tsx),
alongside the existing Monthly / Annual toggle. It sits inside the existing
platform-tab shell but is only available under Instagram, since that is the only
platform this sources.

- **Search bar** — query input, runs `ig-prospect-search`. Reports "N new, M
  already known".
- **Rows appear instantly**, greyed while `enrichment_status = 'pending'`, and
  fill in progressively as the cron drips. The list re-polls every 5s while any
  row on screen is pending, and stops polling once none are.
- **Columns:** handle (links to instagram.com), followers, category, bio
  snippet, link badge (Calendly / Booking / Site / None, derived from
  `external_url`), posts, city.
- **Sorting** on any column, plus filters for follower range and has-link.
  User-driven only — no scoring, no auto-hiding, nothing discarded.
- **Row actions:** the same six-icon stage progression using `STAGE_ICON` and
  the sheet codes, plus follow / follow-back toggles and a notes field.

Reuses the existing page's visual language — the same card, border, and stepper
idioms — so the tab reads as part of the same tool rather than a bolted-on panel.

---

## Risk posture

The Instagram cookie pool is the fragile resource. All six accounts hit
`login_required` / `challenge_required` simultaneously on 2026-07-27, and
recovery requires a human completing a login and 2FA in a browser.

Mitigations:

- **Volume ceiling:** ≤10 profile calls per minute-tick, paced 4–6s apart —
  ~120/hour worst case, a fraction of Viral Today's existing load. Search itself
  is 1 call.
- **Shared staleness:** enrichment uses the same `markIgAccountStale` mechanism,
  so prospecting cannot independently poison the pool.
- **Fail quiet, resume clean:** when all accounts are stale, enrichment stops
  and rows remain `pending`. No attempts are consumed, no rows are marked
  failed, and the drip resumes on its own once fresh cookies land.
- **Bounded retries:** 3 attempts per row, then `failed` — a permanently
  deleted or renamed account cannot loop forever.

---

## Testing

| Area | What gets tested |
|---|---|
| Stage delta math | Forward, backward, and no-op transitions; monotone invariant holds; idempotency |
| Month boundary | Current-month changes write day-log rows; past-month changes do not |
| Dedupe | Same handle from two different queries inserts once |
| Enrichment claim | Overlapping cron ticks cannot double-process a row |
| Retry ceiling | Third failure marks `failed`; stale-account 503 consumes no attempt |
| VPS routes | Live call against a known handle asserts field presence and shape |

The stage delta math is unit-tested against the same `computeRates` helper the
page uses, asserting no rate can exceed 100% after any sequence of transitions.

---

## Delivery

Phased, in dependency order. Each phase is independently verifiable — the VPS
routes can be curled before any database object exists.

1. **VPS routes** — `/ig-search`, `/ig-profile-info`, shared search helper.
2. **Migration** — `ig_prospect_runs`, `ig_prospects`, RLS, indexes.
3. **Edge functions + cron** — `ig-prospect-search`, `ig-prospect-enrich`, schedule.
4. **UI** — Prospects tab, list, filters, stage actions.

### Deployment

Nothing here ships by committing. Per the project's deployment model:

- **VPS:** `scp ytdlp-server.js root@72.62.200.145:/var/www/` then
  `pm2 restart ytdlp-server`. Sync the repo copy afterwards so it does not drift.
- **Edge functions:** `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy
  <name> --project-ref hxojqrilwhhrvloiwmfo`.
- **Migration:** applied directly via the Management API; the file in
  `supabase/migrations/` is a documentation copy.
- **Frontend:** `git push` — CI builds and deploys.
