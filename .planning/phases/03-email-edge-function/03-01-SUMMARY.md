---
phase: 03-email-edge-function
plan: 01
subsystem: api
tags: [supabase, edge-function, nodemailer, anthropic, smtp, email]

# Dependency graph
requires:
  - phase: 01-db-setup
    provides: leads table with follow_up_step, messages table, client_email_settings table

provides:
  - Live Supabase edge function at /functions/v1/send-followup
  - AI-generated email body via Claude Haiku (ANTHROPIC_API_KEY secret set)
  - SMTP send via nodemailer using client_email_settings credentials
  - Message logging to messages table (direction=outbound, channel=email)
  - Lead state advancement (follow_up_step increment, next_follow_up_at schedule)

affects:
  - 04-cron-queue (process-followup-queue calls send-followup per lead)
  - 05-settings-ui (provides client_email_settings input form for testing end-to-end)

# Tech tracking
tech-stack:
  added: [nodemailer@6 (npm: import in Deno), Anthropic claude-haiku-4-5-20251001]
  patterns:
    - ANTHROPIC_API_KEY set as Supabase secret (never in client code)
    - SMTP config auto-detected from sender domain (gmail/outlook/yahoo/icloud/fallback)
    - Fallback email body if AI generation fails (5 pre-written variants)

key-files:
  created: []
  modified:
    - supabase/functions/send-followup/index.ts

key-decisions:
  - "STEP_DELAYS_MS updated from [0, 10min, 1day, 2days, 3days] to spec [0, 1day, 3days, 7days, 14days]"
  - "ANTHROPIC_API_KEY already set in Supabase secrets — no new secret needed"
  - "client_email_settings table is empty — end-to-end email test blocked until Phase 5 adds settings UI"

patterns-established:
  - "Pattern 1: Edge function responds with {success: false, error: 'lead_id is required'} for missing params"
  - "Pattern 2: Skip conditions checked before SMTP attempt (booked/stopped/replied/step>=5)"
  - "Pattern 3: Fallback email body used if Anthropic API call fails"

requirements-completed: [EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 3 Plan 01: Email Edge Function Summary

**AI-generated personalized email sequence via Claude Haiku + nodemailer SMTP deployed as Supabase edge function with 5-step [immediate, 1day, 3days, 7days, 14days] schedule**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-11T18:00:03Z
- **Completed:** 2026-03-11T18:15:00Z
- **Tasks:** 2 of 2 (Task 1 auto + Task 2 checkpoint:human-verify APPROVED)
- **Files modified:** 1

## Accomplishments
- Fixed STEP_DELAYS_MS to spec values: [0, 1day, 3days, 7days, 14days]
- Confirmed ANTHROPIC_API_KEY already set as Supabase secret (digest: b71e3c...)
- Deployed send-followup edge function to Supabase cloud
- Verified live endpoint responds: POST {} → {"success":false,"error":"lead_id is required"}

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix schedule delays, set ANTHROPIC_API_KEY secret, and deploy** - `8b5fb3c` (feat)
2. **Task 2: Human verify checkpoint APPROVED** - `7ace7fd` (docs — checkpoint metadata commit)

**Plan metadata:** see final commit below

## Files Created/Modified
- `supabase/functions/send-followup/index.ts` - Updated STEP_DELAYS_MS; deployed AI+SMTP+log+advance logic

## Decisions Made
- STEP_DELAYS_MS corrected from [0, 10min, 1day, 2days, 3days] to plan spec [0, 1day, 3days, 7days, 14days]
- ANTHROPIC_API_KEY already in Supabase secrets from prior work — no new secret action needed
- client_email_settings table is currently empty — full end-to-end email test will require Phase 5 (settings UI) first; function correctly returns 400 with descriptive error when settings are missing

## Deviations from Plan

None - plan executed exactly as written (ANTHROPIC_API_KEY was already set, saving one manual step).

## Issues Encountered

**client_email_settings is empty:** The database has no SMTP credentials configured for any client. The function handles this correctly — it returns `{"success":false,"error":"Client email settings not configured..."}` with status 400, which is the expected behavior documented in the plan. Full end-to-end email sending requires Phase 5 (settings UI) to be completed first.

**Leads with real email addresses found for testing:**
- Lead ID: `c7b418c4-096c-41bf-adfb-c1847d286b46` — "Test Lead", email: test@example.com, step: 0
- Lead ID: `f9439b51-adb0-48fe-be5b-a89739484626` — "Test Lead", email: test@example.com, step: 0

## Checkpoint Status

**Task 2 (checkpoint:human-verify):** APPROVED

The function was verified live:
- POST to send-followup with empty body returns `{"success":false,"error":"lead_id is required"}` — confirms function is deployed and responding with structured JSON
- Full SMTP end-to-end test acknowledged as deferred to Phase 5 (client_email_settings table is empty until settings UI is built)
- All EMAIL-01 through EMAIL-04 requirements confirmed implemented in deployed function source

## Next Phase Readiness
- send-followup edge function is live at https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/send-followup
- Phase 4 (cron queue) can now call this function per scheduled lead
- Phase 5 (settings UI) needed for client_email_settings population and full end-to-end test

## Self-Check: PASSED

- FOUND: `.planning/phases/03-email-edge-function/03-01-SUMMARY.md`
- FOUND: commit `8b5fb3c` (feat: deploy send-followup edge function)
- FOUND: commit `7ace7fd` (docs: checkpoint metadata)

---
*Phase: 03-email-edge-function*
*Completed: 2026-03-11*
