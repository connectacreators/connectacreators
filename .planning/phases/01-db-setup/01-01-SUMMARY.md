---
phase: 01-db-setup
plan: "01"
subsystem: database
tags: [postgres, supabase, rls, migrations, jsonb]

# Dependency graph
requires: []
provides:
  - followup_workflows table (canvas state per client, JSONB nodes/edges/viewport)
  - messages table (inbound/outbound email records per lead)
  - client_email_settings table (per-client SMTP credentials)
  - RLS enabled on all three tables with permissive service_role_all policy
affects:
  - 02-canvas-fix
  - 03-email-engine
  - 04-worker
  - 05-ui-settings

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent migrations: IF NOT EXISTS on all CREATE TABLE + DO $$ block for policies"
    - "Service-role permissive RLS: USING (true) WITH CHECK (true) for all new tables"
    - "Supabase Management API for DDL: POST /v1/projects/{id}/database/query with bearer token"

key-files:
  created:
    - supabase/migrations/20260310_followup_tables.sql
  modified: []

key-decisions:
  - "UNIQUE constraint on client_id in followup_workflows: one workflow canvas per client"
  - "UNIQUE constraint on client_id in client_email_settings: one SMTP config per client"
  - "messages.direction CHECK IN ('inbound','outbound') and channel CHECK IN ('email','sms','whatsapp') for v1 data integrity"
  - "Dollar-quoted policy blocks ($policy$) in SQL file but executed via separate API calls to avoid JSON escaping issues"

patterns-established:
  - "Migration file pattern: comments + CREATE TABLE IF NOT EXISTS + ALTER TABLE ENABLE ROW LEVEL SECURITY + DO block for policy"
  - "API execution pattern: separate curl calls per DDL statement to avoid nested dollar-quoting in JSON"

requirements-completed: [DB-01, DB-02, DB-03]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 1 Plan 01: Create DB Tables Summary

**Three PostgreSQL tables created in Supabase (followup_workflows, messages, client_email_settings) via Management API with RLS and service_role_all policies**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-11T16:13:00Z
- **Completed:** 2026-03-11T16:14:25Z
- **Tasks:** 3
- **Files modified:** 1 (migration SQL created)

## Accomplishments
- Created followup_workflows table with JSONB nodes/edges/viewport for canvas state, UNIQUE per client
- Created messages table with direction/channel CHECK constraints for email tracking per lead
- Created client_email_settings table with UNIQUE SMTP credentials per client
- Enabled RLS and created permissive service_role_all policy on all three tables
- Verified all tables and columns via Supabase Management API information_schema queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration SQL file** - `d91438a` (chore)
2. **Task 2: Execute migration via Supabase Management API** - no file changes (API-only execution)
3. **Task 3: Verify tables exist in Supabase** - no file changes (verification query only)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `supabase/migrations/20260310_followup_tables.sql` - Idempotent SQL defining all three tables with RLS

## Decisions Made
- Dollar-quoted `$policy$` blocks used in the SQL file but circumvented in API calls by using `$outer$` as the outer dollar-quote label to avoid JSON escaping conflicts
- Executed each DDL statement as a separate API call (CREATE TABLE, ALTER TABLE ENABLE RLS, DO block for policy) rather than one combined query to ensure reliable execution

## Deviations from Plan

None - plan executed exactly as written.

The migration SQL file was already present on disk (from prior session work), matching the exact content specified in the plan. Task 1 verified and committed it. Tasks 2 and 3 proceeded as documented.

## Issues Encountered
- Initial verification query used `IN (''table_name'')` with double single-quotes that the API interpreted as column references. Fixed by using proper `IN ('table_name')` single-quote escaping in the shell command.

## User Setup Required
None - no external service configuration required. Migration executed automatically via Management API.

## Next Phase Readiness
- All three foundation tables are live in Supabase public schema with correct columns, constraints, and RLS
- Phase 2 (Canvas Fix) can now read/write followup_workflows
- Phase 3 (Email Engine) can now write to messages and read from client_email_settings
- No blockers

## Self-Check: PASSED

- FOUND: supabase/migrations/20260310_followup_tables.sql
- FOUND: .planning/phases/01-db-setup/01-01-SUMMARY.md
- FOUND commit: d91438a (chore(01-01): write followup tables migration SQL)
- FOUND: All three tables verified live in Supabase via Management API

---
*Phase: 01-db-setup*
*Completed: 2026-03-11*
