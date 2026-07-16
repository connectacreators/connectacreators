# Batch Analyze — Reliability & Scale Plan

**Date:** 2026-07-15
**Feature:** "Bulk analyze filtered videos" (Viral Today → Analyze N)
**Problem:** "sometimes it fails… some videos analyze and others don't," now that we run much larger batches.
**Measured impact (live, mid-batch):** ~30% failure rate — 174 done / 74 failed / 54 queued in one ~96-video run.

---

## 1. How it works (traced end-to-end)

| Layer | Location | Role |
|---|---|---|
| Modal / enqueue | `viral-analyze-queue` `action:"enqueue"` | Inserts ≤100 rows into `viral_analyze_queue` (one `batch_id`), skips already analyzed/analyzing, returns immediately. |
| Queue | `viral_analyze_queue` | `queued → running → done/failed`, `attempts`, `error`. Partial unique index = one active row per video. |
| Drain | pg_cron job **22** `* * * * *` | POSTs `viral-analyze-queue` `action:"drain"`. Healthy — succeeds every minute. |
| Worker | `viral-analyze-queue/index.ts` `processQueueRow` | `DRAIN_CONCURRENCY=2`, `DRAIN_DEADLINE_MS=110s`, `MAX_ATTEMPTS=5`. |
| Pipeline | `_shared/viral-video-analyzer.ts` `runFullAnalysis` | 1) download video (Cobalt→`/stream-reel`), 2) transcript (YT captions→`/extract-audio`→Whisper), 3) visual (tolerant), 4) Haiku tag (tolerant). |
| Media services | VPS `72.62.200.145:3099` | `/cobalt-proxy`, `/stream-reel`, `/extract-audio`; yt-dlp + Cobalt (localhost:9001) backends; IG cookie rotation `getNextIgCookies()`; `/extract-audio` capped 20/min per IP. |

The queue infrastructure is **healthy**. The failures are entirely in the per-video media pipeline.

---

## 2. Root cause — three compounding problems (all evidence-backed)

### A. yt-dlp's Instagram extractor is broken right now *(acute)*
Tested every IG reel across all 3 accounts, direct and via WARP proxy, on **both** the installed yt-dlp `2026.03.17` and the **latest** `2026.07.04`: every one fails with `HTTP Error 404 / "Instagram API is not granting access."` **Updating yt-dlp does not fix it** — Instagram changed something that breaks yt-dlp's IG extractor across versions.

Meanwhile **Cobalt resolves the same reels fine** (returns a valid `cdninstagram.com` mp4 URL), and the mobile API (`X-IG-App-ID`, used by the scraper) works. So Instagram media is reachable — only yt-dlp's method is dead. Any pipeline step that falls through to yt-dlp fails.

### B. The transcript step re-fetches from Instagram (via yt-dlp) instead of reusing the video it just downloaded
Step 1 downloads the mp4 (via Cobalt) and uploads it to Storage. Step 2 (`acquireTranscript`) then calls VPS `/extract-audio` **with the Instagram URL again**, which re-resolves through Cobalt/yt-dlp. When it falls to yt-dlp (now broken), transcription fails **even though we already have the video**. And `extractWithYtDlp` uses a single account (index 0), with **no rotation and no retry** — unlike `/stream-reel` (alt-account retry) and the scraper (round-robin).

### C. Under batch load the download path also fails, and nothing retries *(scale)*
Live failure breakdown (last 40 min): **`download_failed` 39**, yt-dlp-IG-broken 21, whisper 2. The download failures spike under concurrency: `DRAIN_CONCURRENCY=2` but `DRAIN_DEADLINE_MS` (110s) > cron period (60s) so drains **overlap** (observed **5 running** at once), hammering the 4 GB VPS and IG's CDN → Cobalt/stream-reel start failing. With yt-dlp broken, the stream-reel fallback can't rescue a Cobalt miss. **Every pipeline error is terminal — `processQueueRow`'s catch goes straight to `failed`, never requeues (all failed rows have `attempts=1`).** A video that fails under load is never retried, so ~30% are permanently lost per run.

**Net:** "some analyze, some don't" = whether Cobalt happened to win the race before the VPS got overloaded, with no retry to catch the rest, and a broken yt-dlp fallback under everything.

---

## 3. Plan (priority order — highest leverage first)

### Phase 1 — Stop depending on yt-dlp for Instagram; transcribe the file we already have
- In `acquireTranscript`, when step 1 already produced a video file, extract audio **from that file** (ffmpeg on the stored mp4 / its signed URL — the `/extract-audio` `isDirectCDN` branch already does ffmpeg-from-URL) instead of re-fetching from Instagram. Removes the yt-dlp dependency for every video we successfully downloaded.
- In `extractWithYtDlp` (the remaining fallback): make Instagram **prefer Cobalt**, and if yt-dlp is used, rotate accounts + retry on `429/404/login-required` (mirror `/stream-reel` lines 2146-2183) and route through the WARP proxy.
- *This is what's actually breaking today.* After this, re-queuing the failed rows will actually clear them.

### Phase 2 — Retry transient failures at the queue level
Classify `AnalyzerError.code` in `processQueueRow`'s catch:
- **Retryable → `requeue()`** (attempts-capped): `download_failed`, `audio_extract_failed`, `audio_empty`, `storage_*_failed`, `whisper_failed`, `db_update_failed`.
- **Permanent → terminal fail:** `whisper_no_text`, `audio_too_large`, `openai_missing_key`, video-not-found.
- Add `next_attempt_at` + backoff (longer for rate-limit errors) so retries wait instead of hammering. Fix credit accounting so a requeue doesn't churn deduct/refund each attempt.

### Phase 3 — Pace the VPS so batches don't self-DOS *(the "more videos now" fix)*
- **Single-drain lock** (Postgres advisory lock) or shorten `DRAIN_DEADLINE_MS` < 60s so drain invocations stop overlapping and stacking load.
- Exempt the internal analyzer (trusted `x-api-key`) from the `/extract-audio` 20/min-per-IP cap.
- Bound analyzer concurrency deliberately and add jitter so it doesn't starve the live scraper sharing the box; only raise concurrency once download success is stable.

### Phase 4 — Visibility & one-click recovery
- Per-`batch_id` progress (done/running/queued/failed) in the modal + a realistic ETA.
- **"Retry failed"** button: reset just the failed rows to `queued`, `attempts=0`.
- Distinguish permanent (silent video, unavailable content) from transient so users don't retry hopeless ones.

### Phase 5 — Observability
- Daily failure summary grouped by error code (reuse the cron pattern) to catch yt-dlp/IG/VPS degradation before users report it. yt-dlp-IG breakage will recur — it should page us, not surprise us.

---

## 4. Immediate levers
1. **Done today:** restored connectabroski + fixed account-4 cookie-format bug → 3 working IG accounts (helps the mobile-API/scraper paths; does NOT fix the yt-dlp extractor breakage, which is version-independent).
2. **Do NOT just `yt-dlp -U`** — verified the latest version fails identically. The fix is Phase 1 (route IG through Cobalt / reuse the downloaded file).
3. **Re-queuing the 74 failed rows only helps *after* Phase 1** — today they'd just re-fail on the broken yt-dlp audio path.

## 5. Sequencing
Phase 1 + Phase 2 together convert "~30% silently lost" into "reliably completes." Phase 3 is the higher-volume hardening. Ship 1+2, re-measure the failed rate, then tune throughput.
