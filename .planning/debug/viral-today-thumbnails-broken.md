---
status: awaiting_human_verify
trigger: "viral-today-thumbnails-broken — Instagram CDN thumbnail images not displaying on Viral Today page"
created: 2026-03-17T03:34:00Z
updated: 2026-03-17T04:15:00Z
---

## Current Focus

hypothesis: FINAL ROOT CAUSE CONFIRMED — Apify monthly usage hard limit exceeded (HTTP 403: "Monthly usage hard limit exceeded" for ALL channels). Instagram CDN URLs expire in ~3 days (oe= timestamp). Re-scraping is completely blocked until the Apify billing cycle resets or the plan is upgraded. The 9 channels that have fresh URLs (garyvee, etc.) got them from the initial re-scrape run BEFORE the limit was hit.
test: Directly called Apify API from local machine — all 18 broken channels returned HTTP 403 "Monthly usage hard limit exceeded". Not a code bug. Not a timeout. Not a concurrency issue. Billing cap.
expecting: No automated fix possible without Apify account action (upgrade plan or wait for billing reset). Code fix to auto-scrape-channels (batched execution) is still correct for future runs.
next_action: Checkpoint — user must either upgrade Apify plan or wait for billing reset, then trigger re-scrape.

## Symptoms

expected: All video cards on /viral-today should show the video thumbnail image fetched from Instagram CDN (cdninstagram.com / fbcdn.net URLs stored in viral_videos.thumbnail_url)
actual: Most thumbnails show a grey play-button placeholder. Only a handful of cards show actual thumbnail images. ~2 of 10 visible cards have thumbnails.
errors: No JS console errors. img onError handler fires -> imgError=true -> placeholder shown. Proxy returns HTTP 403 for expired URLs.
reproduction: Load connectacreators.com/viral-today — thumbnails broken immediately on page load
started: After: (1) proxyImg() added to route through /img-proxy, (2) full re-scrape triggered March 17 at 01:42 UTC

## Eliminated

- hypothesis: H3 — proxyImg() regex doesn't match all URL patterns
  evidence: Regex matches cdninstagram.com, fbcdn.net, and instagram.f — confirmed all sample URLs match at least one of these
  timestamp: 2026-03-17T03:40:00Z

- hypothesis: H4 — Browser caching failed image loads
  evidence: 67-68% of rows have expired URLs in the DB itself (server-side data issue, not browser cache). Hard refresh would not help.
  timestamp: 2026-03-17T03:42:00Z

- hypothesis: H5 — apify_video_id=null rows skipped by upsert
  evidence: Checked 200 rows, 0% have null apify_video_id. All rows have valid IDs.
  timestamp: 2026-03-17T03:43:00Z

- hypothesis: Proxy server IP bypasses oe= expiry check
  evidence: The comment in ytdlp-server.js says "Expired CDN URLs still work via server IP" — THIS IS FALSE. Direct test: expired URL (oe=69B8B631, expired ~1.5h ago) through proxy -> HTTP 403. Valid URL -> HTTP 200 + 28KB image data.
  timestamp: 2026-03-17T03:38:00Z

## Evidence

- timestamp: 2026-03-17T03:36:00Z
  checked: DB thumbnail_url values via PostgREST — 10 most-recent rows
  found: Mix of oe= expiry dates: some oe=69B8FE83 (valid until 07:10 UTC today), many oe=69B56777 (expired March 14)
  implication: Re-scrape updated SOME rows but not all. Confirmed URLs have hard expiry.

- timestamp: 2026-03-17T03:37:00Z
  checked: oe= hex decode for 10 sample rows
  found: 7 of 10 expired, 3 still valid. Current time = 1773718497 Unix.
  implication: ~70% of thumbnails are expired and will 403 when fetched.

- timestamp: 2026-03-17T03:38:00Z
  checked: Proxy behavior for expired vs valid URL
  found: expired oe=69B8B631 -> HTTP 403 (0 bytes). valid oe=69B8FE83 -> HTTP 200 (28,759 bytes image/jpeg).
  implication: Root cause confirmed. Proxy cannot bypass Instagram's signed URL expiry. The comment in ytdlp-server.js is incorrect.

- timestamp: 2026-03-17T03:39:00Z
  checked: 100 oldest + 100 newest rows — oe= expiry distribution
  found: BOTH oldest and newest rows: ~67-68% expired, ~32-33% valid.
  implication: The re-scrape did not preferentially update newer rows. Many channels simply were not re-scraped successfully.

- timestamp: 2026-03-17T03:41:00Z
  checked: DB total row count via content-range header
  found: 4,649 total viral_videos rows
  implication: 28 channels * 200 max = 5,600 possible upserts, so coverage should be sufficient if all runs succeeded.

- timestamp: 2026-03-17T03:43:00Z
  checked: Per-channel expiry rate across 1000 rows
  found: Split into two groups: (A) 0% expired: leilahormozi, thechrisrigoudis, higherupwellness, garyvee, jack.scalise, williamscxtt, cera.jacob, araaprudente, personalbrand_baddie — these have oe= expiring March 21+. (B) ~100% expired: grant_martinezz, mrbeast, iampeachfit, avamistruzzi, minolee.mp4, kentjandraa, shelby.sapp, bryson.bowman, taylormccsolar, devinjatho, herasmedia, brezscales, danmartell, plus partial for jeremyleeminer (96%), timon.kriek (83%), personalbrandlaunch (100%), jun_yuh (100%).
  implication: The auto-scrape Apify run FAILED or TIMED OUT for ~19 of 28 channels. waitForFinish=90s is insufficient for fetching 200 Instagram reels per channel under parallel load across 28 channels simultaneously.

- timestamp: 2026-03-17T03:44:00Z
  checked: grant_martinezz (100% expired) URL timestamps vs garyvee (0% expired)
  found: grant_martinezz = all March 14 URLs (not updated). garyvee = all March 21 URLs (properly updated).
  implication: Confirms some channels updated, some not. Root cause is Apify concurrent limit.

- timestamp: 2026-03-17T03:55:00Z
  checked: Apify account plan via API /users/me
  found: plan=STARTER, MAX_CONCURRENT_ACTOR_RUNS=5. Old code ran 28 channels in parallel.
  implication: 23 of 28 channels exceeded concurrency limit and failed immediately. This is the proximate cause of the failed re-scrape.

- timestamp: 2026-03-17T03:58:00Z
  checked: auto-scrape-channels response from the previous job that ran with parallel code
  found: "success":true, "new_videos":0, 23 errors of "Apify request failed", 5 channels returned "Run status: READY"
  implication: The "Apify request failed" errors are ALL HTTP 403 "Monthly usage hard limit exceeded" — not a concurrency issue.

- timestamp: 2026-03-17T04:12:00Z
  checked: Direct Apify API calls for all 18 broken channels from local machine
  found: EVERY channel returned HTTP 403 {"error":{"type":"platform-feature-disabled","message":"Monthly usage hard limit exceeded"}}
  implication: The Apify STARTER plan monthly credit limit is exhausted. No new runs can be fired until the billing cycle resets. This is the true root cause of why all re-scrape attempts are failing. The 9 channels that show fresh URLs got them from early in the March 17 01:42 UTC scrape run, before the limit was hit.

## Resolution

root_cause: TWO-LAYER ROOT CAUSE. (1) Instagram CDN URLs have a hard ~3-day cryptographically signed expiry (oe= hex Unix timestamp). The VPS proxy cannot bypass this — Instagram returns HTTP 403 for expired URLs regardless of source IP. The proxy correctly passes through the 403, which triggers the browser's onError handler, which shows the placeholder. (2) ALL re-scrape attempts (auto-scrape-channels) are returning HTTP 403 "Monthly usage hard limit exceeded" from Apify. The Apify STARTER plan's monthly credit budget is exhausted. This blocks any automated thumbnail refresh. The 9 channels with fresh URLs got them from early in the March 17 01:42 UTC run, before the limit was hit during that run.

fix: Code fix applied to auto-scrape-channels/index.ts: changed from firing all 28 channels in parallel to processing in batches of 5 (APIFY_MAX_CONCURRENT), with 4x30s poll loop for slow runs. This fix is structurally correct but CANNOT run until Apify's monthly limit resets or the plan is upgraded.

REQUIRED HUMAN ACTION: Either (A) upgrade the Apify plan at https://console.apify.com/billing or (B) wait for the monthly billing cycle to reset, then trigger: curl -X POST https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/auto-scrape-channels -H "x-cron-secret: connectacreators-cron-2026" -d '{}'

verification: empty
files_changed:
  - supabase/functions/auto-scrape-channels/index.ts
