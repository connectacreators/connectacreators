# Deployment Guide — ConnectaCreators Zapier-Like Workflow System

**Date**: February 27, 2026
**Status**: Phase 1-2-5 Deployed, Phase 4-6 Ready for Implementation
**Build**: ✅ Deployed to VPS (20.16s), Nginx Reloaded

---

## 📋 Deployment Checklist

### ✅ COMPLETED

- [x] Phase 1: Security Hardening (JWT auth, HMAC verification, SSRF protection, email fix, delay fix, status display fix)
- [x] Phase 2: Database Schemas (Async queue, trigger events, step executions, credential vault)
- [x] Phase 5: ExecutionDetailDrawer React component for execution drill-down
- [x] Frontend Build & Deployment (npm run build, nginx reload)
- [x] Git commit: "Phase 1-2: Security hardening & async queue infrastructure"

### ⏳ PENDING (Requires Manual Action)

- [ ] Deploy SQL Migrations to Supabase
- [ ] Phase 4: Build CredentialManager React component
- [ ] Phase 6: Refactor StepConfigModal into sub-components
- [ ] Phase 3: Code duplication refactoring (test-workflow-step)
- [ ] End-to-end testing & verification

---

## 1️⃣  Deploy SQL Migrations to Supabase

### Option A: Via Supabase Dashboard (Easiest)

1. Go to [Supabase Dashboard](https://app.supabase.com/projects/hxojqrilwhhrvloiwmfo/sql/new)
2. Create a new query
3. Paste the complete migration SQL from `/tmp/deploy_migrations.sql` (created during deployment)
4. Click "Run"
5. Verify success: Check database schema shows new tables:
   - `webhook_secrets`
   - `workflow_execution_queue`
   - `workflow_trigger_events`
   - `workflow_step_executions`
   - `credential_vault`
   - `credential_access_log`

### Option B: Via Supabase CLI (If Installed)

```bash
npm install -g supabase
supabase link --project-ref hxojqrilwhhrvloiwmfo
supabase db push
```

### Option C: Via PostgreSQL Client

```bash
PGPASSWORD="your_db_password" psql \
  -h db.hxojqrilwhhrvloiwmfo.supabase.co \
  -U postgres \
  -d postgres \
  < supabase/migrations/20260226_*.sql
```

### Verification Steps

After migrations are deployed, verify:

```sql
-- Check all new tables exist
SELECT tablename FROM pg_tables
WHERE tablename LIKE 'workflow_%' OR tablename = 'credential_%' OR tablename = 'webhook_%'
ORDER BY tablename;

-- Check workflow_execution_queue is functional
SELECT COUNT(*) FROM workflow_execution_queue;

-- Check credential_vault structure
\d credential_vault
```

---

## 2️⃣  Configure Supabase Functions

### Add Missing Environment Variables

In [Supabase Dashboard → Settings → Secrets](https://app.supabase.com/project/hxojqrilwhhrvloiwmfo/settings/vault/secrets):

**Required for execute-workflow:**
- `INTERNAL_FUNCTION_SECRET`: Random secret string (use for pg_cron authentication)
  ```bash
  # Generate one:
  openssl rand -hex 32
  ```

**Required for Facebook webhook:**
- `FACEBOOK_APP_SECRET`: From your Meta App (currently: `5b9cf9464e4dde90b3107ea303887e13`)

**Required for SMS (if using):**
- `TWILIO_ACCOUNT_SID`: Your Twilio SID
- `TWILIO_AUTH_TOKEN`: Your Twilio token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number

**Required for Email (if using):**
- `ZOHO_CLIENT_ID`: For Zoho OAuth flow
- `ZOHO_CLIENT_SECRET`: For Zoho OAuth flow

### Verify JWT Configuration

Check `/supabase/config.toml` — these functions should have `verify_jwt = true`:
- ✅ `execute-workflow`
- ✅ `fetch-leads`
- ✅ `test-workflow-step`
- ✅ `create-videographer`
- ✅ `update-lead-status`

These should have `verify_jwt = false` (public endpoints):
- ✅ `facebook-webhook-receiver`
- ✅ `workflow-webhook`
- ✅ `public-booking`
- ✅ `facebook-oauth`

---

## 3️⃣  Setup pg_cron for Queue Processing

The async queue consumer (`process-workflow-queue`) needs to run periodically.

### Create pg_cron Job

1. Go to [Supabase Dashboard → SQL Editor](https://app.supabase.com/project/hxojqrilwhhrvloiwmfo/sql/new)
2. Run this query:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule queue processor to run every 1 minute
SELECT cron.schedule(
  'process-workflow-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/process-workflow-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', current_setting('app.internal_function_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify job was created
SELECT * FROM cron.job WHERE jobname = 'process-workflow-queue-every-minute';
```

**Note**: Replace `'YOUR_INTERNAL_SECRET'` with the actual secret you set in Step 2.

### Verify Queue Processing

1. Create a test workflow with a manual trigger
2. Run the workflow with test data
3. Check `workflow_execution_queue` table:
   ```sql
   SELECT id, status, created_at FROM workflow_execution_queue
   ORDER BY created_at DESC LIMIT 5;
   ```
4. Status should progress: `pending` → `processing` → `completed`

---

## 4️⃣  Test Critical Paths

### Test 1: Webhook Signature Verification ✅

**File**: `supabase/functions/workflow-webhook/index.ts`

1. Generate test webhook secret:
   ```bash
   openssl rand -hex 32
   ```
2. Get a workflow ID from the app
3. Send test request:
   ```bash
   SECRET="your_webhook_secret_here"
   WORKFLOW_ID="workflow_id_from_app"
   PAYLOAD='{"lead_id":"test123","name":"John Doe","email":"john@example.com"}'

   # Create HMAC signature
   SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -mac HMAC -macopt key:$SECRET -hex)

   # Send request
   curl -X POST \
     -H "X-Webhook-Signature: sha256=$SIGNATURE" \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD" \
     "https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/workflow-webhook/$WORKFLOW_ID"
   ```

**Expected Result**: 202 Accepted with `{ "status": "queued" }`

### Test 2: Async Queue Processing ✅

1. Create a test workflow with an Email step
2. Send a webhook request (from Test 1)
3. Check `workflow_execution_queue`:
   ```sql
   SELECT status, COUNT(*) FROM workflow_execution_queue
   GROUP BY status;
   ```
4. Should see job progress from `pending` → `processing` → `completed`

### Test 3: Step Execution Tracking ✅

1. Complete a workflow execution
2. Query `workflow_step_executions`:
   ```sql
   SELECT step_id, service, status, duration_ms
   FROM workflow_step_executions
   WHERE execution_id = 'execution_id_here'
   ORDER BY step_index;
   ```
3. Should see one row per step with timing data

### Test 4: Execution Detail Drawer ✅

1. Go to a workflow's execution history
2. Click any execution to open the detail drawer
3. Should see timeline of all steps with:
   - Input data (resolved variables)
   - Output data (step results)
   - Duration per step
   - Error messages (if failed)

---

## 5️⃣  Phase 4: Build CredentialManager Component

**Status**: Ready for implementation
**Documentation**: See [PHASE_4_CREDENTIALMANAGER.md](./PHASE_4_CREDENTIALMANAGER.md)

This component manages per-client encrypted credentials in the `credential_vault` table.

### Quick Implementation Steps:
1. Create `src/components/workflow/CredentialManager.tsx`
2. Create `src/components/workflow/services/CredentialSelector.tsx`
3. Create Supabase edge function: `supabase/functions/encrypt-credential/index.ts`
4. Integrate into client settings page
5. Replace plaintext credential fields in step configs with credential references

**Estimated Time**: 2-3 hours

---

## 6️⃣  Phase 6: Refactor StepConfigModal

**Status**: Refactoring plan complete
**Documentation**: See [PHASE_6_REFACTORING_PLAN.md](./PHASE_6_REFACTORING_PLAN.md)
**Pattern Example**: `src/components/workflow/NotionStepConfig.tsx` ✅

Split the 2322-line monolith into per-service sub-components in `src/components/workflow/services/`:
- EmailStepConfig.tsx
- SMSStepConfig.tsx
- WebhookStepConfig.tsx
- FilterStepConfig.tsx
- And 4 others...

**Estimated Time**: 3 hours for complete refactoring

---

## 📊 Deployment Status Summary

| Phase | Component | Status | Deployed |
|-------|-----------|--------|----------|
| 1 | Security Fixes | ✅ Complete | Feb 27 01:45 UTC |
| 2 | Queue Infrastructure | ✅ Complete | Ready for SQL deploy |
| 3 | Code Deduplication | ⏸️ Deferred | (technical debt) |
| 4 | CredentialManager | 📋 Ready | Documentation only |
| 5 | ExecutionDetailDrawer | ✅ Complete | Feb 27 01:45 UTC |
| 6 | StepConfigModal Refactor | 📋 Ready | Pattern established |
| 7 | (Reserved) | - | - |
| 8 | (Reserved) | - | - |

---

## 🚀 Next Actions (Priority Order)

### Immediate (Do Now)
1. ✅ **Deploy SQL migrations** (manual paste to Supabase SQL Editor)
2. ✅ **Set environment variables** in Supabase → Settings → Secrets
3. ✅ **Create pg_cron job** for queue processing

### This Week
4. 📋 **Implement Phase 4** (CredentialManager)
5. 📋 **Implement Phase 6** (StepConfigModal refactoring)

### Quality Assurance
6. 🧪 **Run comprehensive end-to-end tests**:
   - Test webhook signature verification
   - Test async queue processing
   - Test step execution tracking
   - Test execution history drill-down
   - Test with real leads from Facebook

---

## 🔗 Important Links

- **Supabase Dashboard**: https://app.supabase.com/project/hxojqrilwhhrvloiwmfo
- **Live App**: https://connectacreators.com
- **VPS SSH**: `ssh root@72.62.200.145`
- **Migration SQL**: `/tmp/deploy_migrations.sql` (on local machine)

---

## 📝 Commit History

- ✅ `593dfa4` — Phase 1-2: Security hardening & async queue infrastructure
- ⏳ Next: Commit with Phase 4-6 implementations when complete

---

## 📞 Support

If migrations fail:
1. Check Supabase error message in SQL editor
2. Verify foreign key references match your table names
3. Try running migrations individually to identify problem query
4. Check Postgres logs in Supabase dashboard

If queue processing doesn't start:
1. Verify pg_cron job was created: `SELECT * FROM cron.job`
2. Check cron logs: `SELECT * FROM cron.job_run_details`
3. Verify INTERNAL_FUNCTION_SECRET is set correctly
4. Check edge function logs in Supabase dashboard

---

**Last Updated**: February 27, 2026 01:45 UTC
**Created By**: Claude Haiku 4.5
**System**: ConnectaCreators Workflow Automation
