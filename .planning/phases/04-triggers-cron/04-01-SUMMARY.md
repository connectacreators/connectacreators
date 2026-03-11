---
phase: 04-triggers-cron
plan: 01
subsystem: followup-pipeline
tags: [edge-functions, pg-cron, supabase-deploy, followup, triggers]
dependency_graph:
  requires: [03-01]
  provides: [TRIG-01, TRIG-02, SCHED-01, SCHED-02, SCHED-03]
  affects: [followup_workflows, leads, cron.job]
tech_stack:
  added: []
  patterns: [pg_cron + net.http_post, fire-and-forget fetch, edge function queue]
key_files:
  created: []
  modified:
    - supabase/functions/process-followup-queue/index.ts
    - supabase/functions/facebook-webhook-receiver/index.ts
    - supabase/migrations/20260310_followup_cron.sql
decisions:
  - Used anon key Bearer auth for cron job (instead of x-cron-secret) — both work since function accepts either
  - Used curl + Node.js file generation to avoid Python SSL cert error on macOS
  - Removed pre-existing cron job before re-creating (idempotent via cron.unschedule)
metrics:
  duration: 12 min
  completed: "2026-03-11"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 3
  checkpoint: human-verify (Task 3 — blocking gate, awaiting human approval)
---

# Phase 4 Plan 1: Deploy Triggers and Schedule Cron — Summary

**One-liner:** Both edge functions deployed to Supabase cloud and pg_cron job scheduled to call process-followup-queue every 5 minutes.

## What Was Built

Two automated trigger paths are now live:

1. **facebook-webhook-receiver** (redeployed) — When Facebook sends a new lead, it upserts the lead into the `leads` table and fires a fire-and-forget fetch to `send-followup` immediately (lines 199-211).

2. **process-followup-queue** (new deploy) — Queries leads where `next_follow_up_at <= now AND booked=false AND stopped=false AND replied=false AND follow_up_step < 5`, then calls `send-followup` for each due lead (up to 50 per run).

3. **pg_cron job** — Runs `process-followup-queue` every 5 minutes via `net.http_post()`. Job ID: 4.

## Task Results

### Task 1: Deploy both edge functions

**process-followup-queue:**
- Deploy output: `Deployed Functions on project hxojqrilwhhrvloiwmfo: process-followup-queue`
- Verification curl response: `{"processed":1,"successful":0,"failed":1,"errors":["Lead f515cfba-c018-498f-adb3-b1e16f38c02c: Client email settings not configured..."]}`
- HTTP status: **200** (function is live and processing)
- The "failed" result is expected — no SMTP settings configured yet (Phase 5 will add the settings UI)

**facebook-webhook-receiver:**
- Deploy output: `Deployed Functions on project hxojqrilwhhrvloiwmfo: facebook-webhook-receiver`
- Contains send-followup fire-and-forget call at lines 199-211 ✓

**Commit:** `eb4b7f8`

### Task 2: Schedule pg_cron job

Steps executed via Supabase Management API:
- Step A: `CREATE EXTENSION IF NOT EXISTS pg_cron` → `[]` (success)
- Step B: `CREATE EXTENSION IF NOT EXISTS pg_net` → `[]` (success)
- Step C: `cron.unschedule('process-followup-queue')` → `[{"unschedule":true}]` (removed existing job)
- Step D: `cron.schedule(...)` → `[{"schedule":4}]` (job ID 4 created)
- Step E (verify): `SELECT jobname, schedule, active FROM cron.job` → `[{"jobname":"process-followup-queue","schedule":"*/5 * * * *","active":true}]`

**Cron job confirmed live:**
- jobname: `process-followup-queue`
- schedule: `*/5 * * * *`
- active: `true`
- Job ID: 4

**Commit:** `57325fe`

### Task 3: Human verification — PENDING

Awaiting human confirmation (checkpoint:human-verify gate).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Python SSL certificate error on macOS**
- **Found during:** Task 2, Step D (schedule cron job)
- **Issue:** Python 3.12 urllib raised `SSLCertVerificationError` when connecting to api.supabase.com — macOS Python SSL cert store not configured
- **Fix:** Used Node.js to generate the JSON payload to a temp file (`/tmp/cron_payload.json`), then used curl with `--data-binary @/tmp/cron_payload.json` to send it
- **Files modified:** None (runtime only)
- **Commit:** Part of `57325fe`

**2. [Rule 1 - Bug] jq quoting failure for complex SQL payload**
- **Found during:** Task 2, Step D initial attempt
- **Issue:** jq HEREDOC with single-quoted SQL strings caused syntax errors; `.format()` with JSON curly braces caused Python KeyError
- **Fix:** Switched to Node.js string concatenation to build the JSON payload cleanly
- **Files modified:** `/tmp/build_cron.js` (temp file, deleted after use)

## Cron Authorization Note

The migration file (`20260310_followup_cron.sql`) uses `x-cron-secret` header, but the deployed cron job uses `Authorization: Bearer {anon_key}`. Both work because `process-followup-queue` accepts either:
- If `x-cron-secret` header is present but wrong → 401
- If `x-cron-secret` header is absent → proceeds normally (only anon/service key needed)

The deployed job (using anon key Bearer auth) will authenticate correctly with Supabase's built-in JWT verification.

## Verification Instructions for Human (Task 3)

**1. Check cron job in Supabase Dashboard:**
- Go to Database → Extensions — confirm pg_cron and pg_net are enabled (green)
- Go to Database → Cron Jobs OR run in SQL Editor:
  ```sql
  SELECT jobname, schedule, active, command FROM cron.job WHERE jobname = 'process-followup-queue';
  ```
- Confirm: `schedule = */5 * * * *` and `active = true`

**2. Manually trigger the queue processor:**
```bash
curl -X POST https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/process-followup-queue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k" \
  -d '{}'
```
Expected responses:
- `{"processed":0,...,"message":"No leads due"}` — if no leads are due
- `{"processed":N,"successful":N,"failed":0,...}` — if leads are queued and SMTP is configured
- `{"processed":1,"failed":1,"errors":["Client email settings not configured..."]}` — expected until Phase 5 (SMTP settings UI)

**3. Verify all 5 requirements are met:**
- TRIG-01: facebook-webhook-receiver calls send-followup at lines 199-211 ✓
- TRIG-02: leadService.createLead() sets next_follow_up_at=now and triggers send-followup ✓
- SCHED-01: Queue processor filters correctly (lte next_follow_up_at, eq booked=false, eq stopped=false, eq replied=false, lt follow_up_step 5) ✓
- SCHED-02: Queue processor calls send-followup for each due lead ✓
- SCHED-03: cron.job row exists with 5-minute schedule ✓

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `supabase/functions/process-followup-queue/index.ts` | FOUND |
| `supabase/functions/facebook-webhook-receiver/index.ts` | FOUND |
| `supabase/migrations/20260310_followup_cron.sql` | FOUND |
| `.planning/phases/04-triggers-cron/04-01-SUMMARY.md` | FOUND |
| Commit `eb4b7f8` (deploy edge functions) | FOUND |
| Commit `57325fe` (pg_cron job) | FOUND |
| Cron job live in Supabase (`active=true`) | VERIFIED |
| process-followup-queue HTTP 200 | VERIFIED |
