---
phase: phase-1-db-setup
plan: "01"
title: Create three follow-up database tables
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260310_followup_tables.sql
autonomous: true
requirements:
  - DB-01
  - DB-02
  - DB-03

must_haves:
  truths:
    - "followup_workflows table exists with client_id, name, nodes, edges, viewport, is_active columns"
    - "messages table exists with lead_id, direction, channel, subject, body, sent_at columns"
    - "client_email_settings table exists with client_id, smtp_email, smtp_password, from_name columns"
    - "All three tables have RLS enabled and a permissive service-role policy"
    - "All tables can be created multiple times without error (IF NOT EXISTS)"
  artifacts:
    - path: "supabase/migrations/20260310_followup_tables.sql"
      provides: "SQL migration defining all three tables"
      contains: "CREATE TABLE IF NOT EXISTS followup_workflows"
  key_links:
    - from: "followup_workflows"
      to: "clients"
      via: "client_id UUID FK → clients(id)"
      pattern: "REFERENCES clients\\(id\\)"
    - from: "messages"
      to: "leads"
      via: "lead_id UUID FK → leads(id)"
      pattern: "REFERENCES leads\\(id\\)"
    - from: "client_email_settings"
      to: "clients"
      via: "client_id UUID FK → clients(id)"
      pattern: "REFERENCES clients\\(id\\)"
---

<objective>
Create the three database tables that the AI Follow-Up Automation system requires: followup_workflows (canvas save/load), messages (sent email records), and client_email_settings (per-client SMTP credentials).

Purpose: Every other phase depends on these tables existing. Phase 2 reads/writes followup_workflows. Phase 3 writes to messages and reads client_email_settings. Nothing else can be built until these tables exist.

Output: supabase/migrations/20260310_followup_tables.sql committed locally, tables live in the Supabase project.
</objective>

<execution_context>
@/Users/admin/.claude/get-shit-done/workflows/execute-plan.md
@/Users/admin/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

Supabase project ID: hxojqrilwhhrvloiwmfo
Management API token: sbp_4926c014d722d299f587bacf345d781f5dfee77c
Management API base: https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo

Existing tables referenced as FKs (already in DB):
- clients (id UUID PK)
- leads (id UUID PK)

Follow-up sequence context (from PROJECT.md):
- Sequence: immediate → +10min → +1day → +2days → +3days (5 total steps)
- Stop conditions: lead.booked, lead.replied, lead.stopped, or follow_up_step >= 5
- Email is the only channel for v1 (SMS deferred)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write migration SQL file</name>
  <files>supabase/migrations/20260310_followup_tables.sql</files>
  <action>
Create the file `/Users/admin/Desktop/connectacreators/supabase/migrations/20260310_followup_tables.sql` with the following exact content:

```sql
-- Migration: 20260310_followup_tables
-- Creates three tables for the AI Follow-Up Automation system.
-- Idempotent: uses IF NOT EXISTS throughout.

-- ─────────────────────────────────────────
-- 1. followup_workflows
--    Stores visual canvas state per client.
--    UNIQUE on client_id: one workflow per client (canvas is display-only for now).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Default Workflow',
  nodes       JSONB NOT NULL DEFAULT '[]',
  edges       JSONB NOT NULL DEFAULT '[]',
  viewport    JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT followup_workflows_client_id_unique UNIQUE (client_id)
);

ALTER TABLE followup_workflows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'followup_workflows'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON followup_workflows
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 2. messages
--    Stores every sent (and future inbound) message per lead.
--    direction CHECK ensures only 'inbound' or 'outbound'.
--    channel CHECK ensures only 'email', 'sms', or 'whatsapp'.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  subject     TEXT,
  body        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON messages
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 3. client_email_settings
--    Stores per-client SMTP credentials for outbound email.
--    UNIQUE on client_id: one settings row per client.
--    smtp_password stores app passwords (Gmail/Outlook/Yahoo).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_email_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  smtp_email     TEXT NOT NULL,
  smtp_password  TEXT NOT NULL,
  from_name      TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_email_settings_client_id_unique UNIQUE (client_id)
);

ALTER TABLE client_email_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_email_settings'
      AND policyname = 'service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY service_role_all ON client_email_settings
        FOR ALL
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
```

Write this file exactly as shown. Do not modify column names, constraints, or SQL keywords.
  </action>
  <verify>
Read the file back and confirm it contains CREATE TABLE IF NOT EXISTS statements for all three tables: followup_workflows, messages, client_email_settings.
  </verify>
  <done>File exists at supabase/migrations/20260310_followup_tables.sql with all three CREATE TABLE blocks and RLS policies.</done>
</task>

<task type="auto">
  <name>Task 2: Execute migration via Supabase Management API</name>
  <files></files>
  <action>
Run the migration by POSTing the SQL to the Supabase Management API database query endpoint. Execute the following curl command (one request, full SQL inline):

```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer sbp_4926c014d722d299f587bacf345d781f5dfee77c" \
  -H "Content-Type: application/json" \
  -d @- <<'CURL_EOF'
{
  "query": "CREATE TABLE IF NOT EXISTS followup_workflows (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, name TEXT NOT NULL DEFAULT 'Default Workflow', nodes JSONB NOT NULL DEFAULT '[]', edges JSONB NOT NULL DEFAULT '[]', viewport JSONB NOT NULL DEFAULT '{\"x\":0,\"y\":0,\"zoom\":1}', is_active BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT followup_workflows_client_id_unique UNIQUE (client_id)); ALTER TABLE followup_workflows ENABLE ROW LEVEL SECURITY; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'followup_workflows' AND policyname = 'service_role_all') THEN EXECUTE $policy$ CREATE POLICY service_role_all ON followup_workflows FOR ALL USING (true) WITH CHECK (true) $policy$; END IF; END $$; CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE, direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')), channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')), subject TEXT, body TEXT NOT NULL, sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()); ALTER TABLE messages ENABLE ROW LEVEL SECURITY; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'service_role_all') THEN EXECUTE $policy$ CREATE POLICY service_role_all ON messages FOR ALL USING (true) WITH CHECK (true) $policy$; END IF; END $$; CREATE TABLE IF NOT EXISTS client_email_settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE, smtp_email TEXT NOT NULL, smtp_password TEXT NOT NULL, from_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT client_email_settings_client_id_unique UNIQUE (client_id)); ALTER TABLE client_email_settings ENABLE ROW LEVEL SECURITY; DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_email_settings' AND policyname = 'service_role_all') THEN EXECUTE $policy$ CREATE POLICY service_role_all ON client_email_settings FOR ALL USING (true) WITH CHECK (true) $policy$; END IF; END $$;"
}
CURL_EOF
```

If the API returns an error about the `$policy$` dollar-quoting being mangled in JSON, fall back to running three separate curl calls — one per table — using the individual CREATE TABLE + ALTER TABLE + DO $$ block for each table.

If the single-query approach returns `{"message":"..."}` with an error about nested dollar quoting in JSON, run each table's DDL as a separate API call in this order:
1. followup_workflows (CREATE TABLE + RLS)
2. messages (CREATE TABLE + RLS)
3. client_email_settings (CREATE TABLE + RLS)

For each separate call the pattern is:
```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer sbp_4926c014d722d299f587bacf345d781f5dfee77c" \
  -H "Content-Type: application/json" \
  -d '{"query": "<single table DDL here without dollar-quoted policy block>"}'
```

For the RLS policy creation, use CREATE POLICY with OR REPLACE if needed, or skip the DO block and just run:
```sql
CREATE POLICY IF NOT EXISTS service_role_all ON <tablename> FOR ALL USING (true) WITH CHECK (true);
```
Note: `CREATE POLICY IF NOT EXISTS` requires Postgres 15+. If it fails, catch the "already exists" error and continue.

Capture and display the API response for each call. Any response other than an error is a success (the API returns empty result set `[]` for DDL statements that succeed).
  </action>
  <verify>
API response does not contain `"error"` or `"message"` keys indicating failure. A successful DDL execution returns `[]` (empty result set) or a result without an error field.
  </verify>
  <done>All three tables created in Supabase without errors. API returned success responses for each CREATE TABLE statement.</done>
</task>

<task type="auto">
  <name>Task 3: Verify tables exist in Supabase</name>
  <files></files>
  <action>
Run a verification query against the Supabase Management API to confirm all three tables exist in the information_schema:

```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer sbp_4926c014d722d299f587bacf345d781f5dfee77c" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT table_name FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_name IN (''followup_workflows'', ''messages'', ''client_email_settings'') ORDER BY table_name;"
  }'
```

The response must contain all three table names: `client_email_settings`, `followup_workflows`, `messages`.

Additionally run a column check for the most critical columns:

```bash
curl -s -X POST \
  "https://api.supabase.com/v1/projects/hxojqrilwhhrvloiwmfo/database/query" \
  -H "Authorization: Bearer sbp_4926c014d722d299f587bacf345d781f5dfee77c" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = '\''public'\'' AND table_name IN (''followup_workflows'', ''messages'', ''client_email_settings'') ORDER BY table_name, ordinal_position;"
  }'
```

Confirm the response includes:
- followup_workflows: client_id, name, nodes, edges, viewport, is_active
- messages: lead_id, direction, channel, subject, body, sent_at
- client_email_settings: client_id, smtp_email, smtp_password, from_name
  </action>
  <verify>
Verification query returns exactly 3 rows (one per table name). Column check confirms all required columns are present with correct data types (uuid, text, jsonb, boolean, timestamptz).
  </verify>
  <done>API confirms all three tables exist in public schema with all required columns. DB-01, DB-02, DB-03 requirements met.</done>
</task>

</tasks>

<verification>
After all tasks complete:

1. File check: `supabase/migrations/20260310_followup_tables.sql` exists locally with all three CREATE TABLE blocks
2. API confirmation: All three table names appear in `information_schema.tables` for schema `public`
3. Column confirmation: All required columns present with correct types
4. No orphaned objects: RLS enabled on all three tables
</verification>

<success_criteria>
- followup_workflows table exists with: id, client_id (FK→clients), name, nodes (JSONB), edges (JSONB), viewport (JSONB), is_active (BOOLEAN), created_at, updated_at, UNIQUE(client_id)
- messages table exists with: id, lead_id (FK→leads), direction (CHECK inbound/outbound), channel (CHECK email/sms/whatsapp), subject (nullable), body, sent_at (nullable), created_at
- client_email_settings table exists with: id, client_id (FK→clients UNIQUE), smtp_email, smtp_password, from_name, created_at, updated_at
- All three tables have RLS enabled
- Migration SQL file committed to supabase/migrations/
</success_criteria>

<output>
After completion, create `.planning/phases/phase-1-db-setup/phase-1-01-SUMMARY.md` with:
- What was built (three tables, columns, constraints)
- How the migration was run (Management API endpoint used)
- Verification results (table names and column counts confirmed)
- Any issues encountered and how they were resolved
- Next phase: Phase 2 Canvas Fix
</output>
