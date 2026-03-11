# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

### 1. Email Delivery Not Implemented
- **Issue**: Email step in workflows logs to console but doesn't actually send emails
- **Files**: `supabase/functions/execute-workflow/index.ts` (lines 101-129)
- **Impact**: Workflows that include email steps appear to succeed but don't deliver messages to users
- **Fix approach**: Implement actual SMTP integration (Zoho, SendGrid, or Mailgun). Currently code shows TODO comment: "Integrate with SendGrid, Mailgun, or Zoho Mail API for actual email delivery"

### 2. Execute-Workflow Edge Function Size (1310 lines)
- **Issue**: Single monolithic edge function handling all workflow execution logic, variable interpolation, and service integrations
- **Files**: `supabase/functions/execute-workflow/index.ts`
- **Impact**: Difficult to test individual services, high cognitive complexity, harder to debug when workflow fails
- **Fix approach**: Extract service handlers into separate utility modules; consider splitting into multiple edge functions by service type

### 3. StepConfigModal Component Size (2320 lines)
- **Issue**: Single React component with all step configuration UIs, variable picker, Notion schema fetching, test step functionality combined
- **Files**: `src/components/workflow/StepConfigModal.tsx`
- **Impact**: Difficult to maintain, test, or modify individual service configurations without affecting others
- **Fix approach**: Extract each service configuration into separate sub-components; create ConfigService abstraction layer

### 4. Scripts Page Size (2134 lines)
- **Issue**: Large page component mixing script editing, recording, wizard integration, metadata management, and video playback
- **Files**: `src/pages/Scripts.tsx`
- **Impact**: Difficult to locate bugs, slow component repaints, complex state management with multiple concerns
- **Fix approach**: Extract editor, recorder, and wizard into separate modular components with clear interfaces

### 5. Unused Imports & Dead Code in Scripts.tsx
- **Issue**: Line 8 imports unused icons (MicIcon, MicOff, Camera, Settings, Video, GripVertical, RotateCcw, Archive, Wand2, Copy, Play, Clock, AlertTriangle, MoreHorizontal)
- **Files**: `src/pages/Scripts.tsx` (lines 8-10)
- **Impact**: Bloats bundle size, creates maintenance confusion
- **Fix approach**: Remove unused icon imports; audit other pages for similar unused imports

### 6. Loose Type Definitions
- **Issue**: 29 instances of `Record<string, any>` across codebase lacking specific type contracts
- **Files**: Multiple files including `src/components/workflow/StepConfigModal.tsx`, `src/pages/ClientWorkflow.tsx`, edge functions
- **Impact**: Type safety reduced; easier to introduce bugs through property access errors; harder to refactor
- **Fix approach**: Create specific interfaces for workflow configs, step outputs, trigger data (e.g., `WorkflowConfig`, `StepOutput`, `TriggerPayload`)

### 7. Debounce Cleanup Missing
- **Issue**: Line saves in Scripts.tsx use debouncing but no cleanup on component unmount
- **Files**: `src/pages/Scripts.tsx` (debounce handlers for line saves)
- **Impact**: Memory leak risk; pending saves after navigation; console errors during cleanup
- **Fix approach**: Add cleanup function to useCallback effects; cancel pending requests on unmount

## Known Bugs

### 1. Firebase OAuth Migration Incomplete (FIXED)
- **Issue**: Code references old Lovable auth endpoints (`lovable.auth.signInWithOAuth()`) which don't exist
- **Files**: `src/components/ScriptsLogin.tsx` (lines 87-95)
- **Status**: ✅ FIXED - Updated to use Supabase OAuth in Feb 24 rebuild
- **Note**: Monitor browser cache if users still see 404 redirects to `/~oauth/initiate`

### 2. Speech Recognition Hardcoded Language
- **Issue**: Web Speech API hardcoded to Spanish (es-MX) regardless of app language setting
- **Files**: `src/pages/Scripts.tsx` (line 53, `rec.lang = "es-MX"`)
- **Impact**: English users get Spanish speech recognition; not localized
- **Fix approach**: Use `useLanguage()` hook to set speech recognition language dynamically

### 3. Trailing Whitespace Not Validated Server-Side
- **Issue**: Line saves trim whitespace on frontend but server doesn't enforce — could accept scripts with unexpected formatting
- **Files**: `src/pages/Scripts.tsx` (auto-save trimming), database doesn't have NOT NULL constraint on text
- **Impact**: Edge case where malformed data could bypass frontend validation
- **Fix approach**: Add server-side validation and NOT NULL / CHECK constraints in migrations

## Security Concerns

### 1. All Edge Functions Disable JWT Verification
- **Issue**: ALL 30+ edge functions set `verify_jwt = false` in `supabase/config.toml`
- **Files**: `supabase/config.toml` (lines 1-106)
- **Impact**: Supabase gateway doesn't validate JWT tokens; functions must implement auth manually or be completely open
- **Fix approach**:
  - Set `verify_jwt = true` for authenticated endpoints (ai-build-script, execute-workflow, etc.)
  - Use header-based verification ONLY for webhook receivers (facebook-webhook-receiver, workflow-webhook) and cron jobs (auto-scrape-channels)
  - Current implementation requires EVERY function to call `supabase.auth.getUser()` manually, increasing risk of bypass

### 2. Hardcoded API Credentials in Edge Functions
- **Issue**: APIFY_TOKEN and CRON_SECRET stored as string literals in source code
- **Files**: `supabase/functions/auto-scrape-channels/index.ts` (lines 9, 11)
  - `APIFY_TOKEN = "apify_api_[REDACTED]"`
  - `CRON_SECRET = "[REDACTED]"`
- **Impact**: Tokens visible in git history, deployable artifacts, and any code audit; if repo is breached, attacker can scrape channels
- **Fix approach**:
  - Move both to Supabase environment variables (Project Settings → Edge Functions → Secrets)
  - Use `Deno.env.get("APIFY_TOKEN")!` instead of hardcoded values
  - Rotate APIFY_TOKEN and CRON_SECRET immediately

### 3. Facebook App Secret Not Required in Webhook Fallback
- **Issue**: Webhook receiver has fallback path that processes events WITHOUT signature verification if app secret not configured
- **Files**: `supabase/functions/facebook-webhook-receiver/index.ts` (lines 82-97)
- **Code**: `if (appSecret && signatureHeader) { ... } else { // Fallback for when app secret is not configured ... }`
- **Impact**: Production could silently fall back to accepting unsigned webhooks; attacker could inject fake leads
- **Fix approach**: Remove fallback logic; throw error if FACEBOOK_APP_SECRET not configured; never accept unsigned webhook payloads

### 4. State Parameter in Facebook OAuth Not Validated on Callback
- **Issue**: Facebook OAuth function encodes state with nonce but callback function (`facebook-oauth` action=callback) doesn't decode or validate state
- **Files**: `supabase/functions/facebook-oauth/index.ts` (lines 23-29 encode state, but callback at lines 62-80 doesn't validate it)
- **Impact**: CSRF attacks possible; attacker could complete OAuth flow for different user
- **Fix approach**:
  - Decode state from response parameters
  - Verify nonce matches what was created
  - Check timestamp to prevent replay attacks

### 5. Variable Interpolation Lacks Sanitization
- **Issue**: User-controlled lead data inserted directly into emails, SMS, and Notion without escaping or sanitization
- **Files**: `supabase/functions/execute-workflow/index.ts` (lines 52-73, `interpolateVariables()` function)
- **Impact**: If lead contains `{{lead.email}}` as actual value, could break email formatting; SQL injection not applicable but template injection possible
- **Fix approach**:
  - Escape/HTML-encode values before substitution
  - Validate that interpolated variables don't contain nested template syntax like `{{...}}`
  - Add unit tests for malicious variable payloads

### 6. Notion API Key Exposed in Console Logs (Indirect)
- **Issue**: Functions don't log API keys directly, but error messages from Notion API might contain sensitive details
- **Files**: Multiple edge functions (execute-workflow, sync-notion-script, etc.) log errors with `console.error("...", error)`
- **Impact**: Sensitive Notion error responses could be logged and exposed in function logs
- **Fix approach**:
  - Sanitize error messages before logging; remove PII and credentials
  - Log error codes, not full error objects
  - Use structured logging with error codes mapped to user-friendly messages

### 7. No Rate Limiting on Edge Functions
- **Issue**: Public endpoints (public-booking, facebook-webhook-receiver, workflow-webhook) have no rate limiting
- **Files**: All webhook and public endpoints in `supabase/functions/`
- **Impact**: DDoS vulnerability; attacker could spam webhook endpoints or trigger expensive operations
- **Fix approach**:
  - Implement per-IP rate limiting (Supabase doesn't provide built-in, but can use Redis or header-based throttling)
  - Add request deduplication for webhook handlers (check if event already processed)
  - Consider moving to paid tier with DDoS protection

### 8. Facebook Webhook Signature Verification Uses Timing-Safe Compare But Has Edge Case
- **Issue**: Signature verification at line 52-66 of facebook-webhook-receiver is correct but relies on `crypto.subtle` which might not be available in older Deno versions
- **Files**: `supabase/functions/facebook-webhook-receiver/index.ts` (lines 39-50)
- **Impact**: Function might fail silently in production if crypto API unavailable, falling back to unsigned processing
- **Fix approach**:
  - Add explicit error handling for crypto API failures
  - Throw error instead of falling back
  - Test with actual Deno runtime version in production

## Performance Bottlenecks

### 1. Large Video List Fetches (1300+ videos)
- **Issue**: ViralToday page fetches up to 50,000 videos without pagination limit check (`.limit(50000)`)
- **Files**: `src/pages/ViralToday.tsx` (video fetch logic)
- **Impact**: Frontend loads entire dataset into memory; if list grows beyond 50K, performance degrades; sorting/filtering on client-side expensive
- **Fix approach**:
  - Implement server-side pagination in edge function instead of client-side
  - Fetch 100 videos per page with offset
  - Move sorting/filtering to database queries (use indexes on outlier, engagement_rate, created_at)

### 2. Auto-Scrape Function Processes All Channels Sequentially
- **Issue**: Loop at line 54 of auto-scrape-channels processes channels one at a time; could timeout if many channels
- **Files**: `supabase/functions/auto-scrape-channels/index.ts` (lines 54-160)
- **Impact**: If 100+ channels exist, scrape could exceed 30-second timeout; later channels never processed
- **Fix approach**:
  - Use Promise.all() for parallel scraping (with concurrency limit of 5-10)
  - Move long-running scrapes to async queue (Supabase functions can't run > 120s anyway)
  - Return 202 Accepted with status endpoint for long operations

### 3. Notion Schema Fetch on Every Modal Open
- **Issue**: Fetches entire Notion database schema every time StepConfigModal opens, even if unchanged
- **Files**: `src/components/workflow/StepConfigModal.tsx` (auto-load on mount)
- **Impact**: Slow modal opens; unnecessary API calls to Notion (rate limited to 100 req/min)
- **Fix approach**:
  - Cache schema in localStorage or React Context
  - Add manual refresh button (already exists) but don't auto-fetch
  - Invalidate cache only when database ID changes

### 4. No Database Indexes on Frequently Filtered Columns
- **Issue**: ViralToday filters by engagement_rate, outlier, created_at but no indexes verified in migrations
- **Files**: Video fetch queries lack visible index definitions
- **Impact**: Filter queries do full table scans on large datasets (1000+ videos)
- **Fix approach**:
  - Add indexes: `CREATE INDEX idx_viral_videos_engagement_rate ON viral_videos(engagement_rate)`
  - Add composite index: `CREATE INDEX idx_viral_videos_created_outlier ON viral_videos(created_at DESC, outlier DESC)`
  - Verify with EXPLAIN ANALYZE in Supabase SQL editor

### 5. Console.log Calls in Production Code
- **Issue**: 128 console.log/error calls across 33 edge functions; logs in production reduce performance
- **Files**: All edge function files (auto-scrape-channels, execute-workflow, facebook-oauth, etc.)
- **Impact**: Noisy logs; degrades cold-start performance; expensive in production environments
- **Fix approach**:
  - Create shared logger utility with environment-aware levels (log in dev, error only in prod)
  - Remove verbose logging statements
  - Use structured logging (JSON format) for debugging

## Fragile Areas

### 1. Workflow Step Execution Error Recovery Missing
- **Issue**: If a step fails, subsequent steps still execute (unless filter fails); no rollback mechanism
- **Files**: `supabase/functions/execute-workflow/index.ts` (step execution loop doesn't halt on failure)
- **Impact**: Partial state updates; if email fails but Notion update succeeds, data is inconsistent
- **Fix approach**:
  - Add `on_error` field to step config: 'continue' | 'halt' | 'retry'
  - Implement transactional semantics or compensation logic
  - Store execution logs for replay/debugging

### 2. Facebook Lead Deduplication Relies on Unique Constraint
- **Issue**: Deduplication of facebook_lead_id happens at database level (unique constraint); if constraint fails, workflow triggers again
- **Files**: `supabase/functions/facebook-webhook-receiver/index.ts` (relies on unique constraint)
- **Impact**: If lead already exists, webhook returns error 500 instead of 200 (idempotent); could retry and create duplicates
- **Fix approach**:
  - Check if facebook_lead_id exists before insert
  - Return 200 OK if already processed (idempotent webhook)
  - Use UPSERT (ON CONFLICT) instead of INSERT

### 3. Notion Record Search Assumes Only One Match
- **Issue**: Notion search returns first result only; if multiple records match, others are ignored silently
- **Files**: `supabase/functions/execute-workflow/index.ts` (lines 211, `const firstResult = data.results?.[0]`)
- **Impact**: Wrong record updated if search property is not unique
- **Fix approach**:
  - Add validation that search returned exactly one result
  - Error out if multiple matches
  - Add UI warning: "Search must match only one record"

### 4. Script History Without Rollback Transaction
- **Issue**: Script versions stored but no transaction when reverting; could create inconsistent state
- **Files**: `supabase/migrations/20260224_script_versions.sql`, `src/pages/Scripts.tsx` (restore logic)
- **Impact**: If restore fails mid-operation, script is partially reverted
- **Fix approach**:
  - Wrap restore in database transaction (BEGIN/COMMIT)
  - Ensure all lines deleted and re-inserted atomically

### 5. Lead Status Change Triggers Workflows Without Checking is_active
- **Issue**: Update-lead-status function executes workflows even if is_active = false
- **Files**: `supabase/functions/update-lead-status/index.ts` (workflow query doesn't filter by is_active)
- **Impact**: Disabled workflows still trigger unexpectedly
- **Fix approach**:
  - Add WHERE is_active = true to workflow query
  - Add test to verify inactive workflows don't trigger

## Missing Critical Features

### 1. Workflow Execution Retry Logic Not Implemented in Production
- **Issue**: Config UI accepts retry settings (0-3 attempts) but execute-workflow doesn't retry on failure
- **Files**: `src/components/workflow/StepConfigModal.tsx` (retry UI exists), `supabase/functions/execute-workflow/index.ts` (no retry loop)
- **Impact**: Retry settings ignored; transient failures fail immediately
- **Fix approach**: Implement exponential backoff retry loop in executeStepWithRetry(); save attempts in execution logs

### 2. Workflow Timeout Management Missing
- **Issue**: No timeout field for long-running steps (delays, API calls)
- **Files**: `supabase/functions/execute-workflow/index.ts`
- **Impact**: If external API hangs, workflow hangs; user never notified
- **Fix approach**:
  - Add timeout per step config (default 30s, max 120s)
  - Wrap fetch calls in AbortController with timeout
  - Return timeout error to user

### 3. No Webhook Retry on 5xx Errors from External Services
- **Issue**: If external webhook endpoint returns 500, no retry attempted
- **Files**: Any step that calls external webhook
- **Impact**: Failed integrations silently dropped
- **Fix approach**:
  - Detect 5xx errors and retry with backoff
  - Store failed attempts in workflow_executions for manual retry

### 4. No Audit Trail for Who Changed Client Settings
- **Issue**: Client database updates don't log who made changes or when
- **Files**: Client update operations in edge functions
- **Impact**: Can't track unauthorized changes to API keys, Notion mappings, etc.
- **Fix approach**:
  - Add audit_logs table with user_id, action, changes, timestamp
  - Log all client setting changes

## Test Coverage Gaps

### 1. Workflow Execution Untested
- **What's not tested**: Full end-to-end workflow with multiple steps, variable interpolation, error handling
- **Files**: `supabase/functions/execute-workflow/index.ts` (no test file)
- **Risk**: Bugs in step execution go unnoticed; complex variable interpolation may fail
- **Priority**: High
- **Approach**: Create test suite with mock leads, multiple service types, error scenarios

### 2. Variable Interpolation Edge Cases Untested
- **What's not tested**: Nested variables, missing fields, special characters, unicode in variables
- **Files**: `supabase/functions/execute-workflow/index.ts` (lines 52-73)
- **Risk**: Template injection attacks possible; unicode corruption
- **Priority**: High
- **Approach**: Add unit tests for interpolateVariables() with payloads like `{{lead.email}}`=`{{steps.x.y}}`

### 3. Facebook Webhook Signature Verification Untested
- **What's not tested**: HMAC-SHA256 calculation, timing-safe comparison, edge cases in signature format
- **Files**: `supabase/functions/facebook-webhook-receiver/index.ts` (lines 39-66)
- **Risk**: Signature bypass; attacker injects fake leads
- **Priority**: Critical
- **Approach**: Create test with known Facebook webhook payload + signature; verify matches

### 4. Notion Integration Error Handling Untested
- **What's not tested**: Notion API errors (404, 403, 429), missing database ID, invalid field names
- **Files**: `supabase/functions/execute-workflow/index.ts` (Notion step handling)
- **Risk**: Unclear error messages to users; silent failures
- **Priority**: Medium
- **Approach**: Create test suite with mock Notion API returning various error codes

### 5. OAuth State Validation Untested
- **What's not tested**: State parameter encoding/decoding, nonce verification, timestamp checks
- **Files**: `supabase/functions/facebook-oauth/index.ts`
- **Risk**: CSRF attacks possible
- **Priority**: Critical
- **Approach**: Test state decoding with valid/invalid payloads; verify nonce matches

## Scaling Limits

### 1. Video Dataset Growth (1300+ → 10000+)
- **Current capacity**: ~50,000 videos loaded into memory on client
- **Limit**: Beyond 50K, browser becomes unresponsive; sorting/filtering extremely slow
- **Scaling path**:
  - Implement server-side pagination with database queries
  - Add full-text search index on description/title
  - Use Apache Superset or Metabase for complex analytics queries

### 2. Workflow Execution Concurrency
- **Current capacity**: Single cron-triggered workflow execution per scheduled time
- **Limit**: If 100 workflows trigger simultaneously, Supabase functions queue them; some may timeout
- **Scaling path**:
  - Implement distributed job queue (Bull Redis, AWS SQS, or Supabase pg_cron)
  - Horizontal scaling: spawn multiple execution instances
  - Add circuit breaker pattern for external API failures

### 3. Notion API Rate Limit (100 req/min)
- **Current capacity**: Each workflow can make 3+ Notion calls (search, create/update)
- **Limit**: If 50+ workflows execute simultaneously, hits Notion rate limit
- **Scaling path**:
  - Implement request queueing with exponential backoff
  - Batch Notion operations (e.g., multi_object operations)
  - Consider caching Notion records locally

### 4. Edge Function Execution Timeout (120s)
- **Current capacity**: Auto-scrape processes ~20-30 channels before timeout
- **Limit**: If dataset grows to 100+ channels, scrape times out
- **Scaling path**:
  - Move to async queue (Bull, Inngest, or similar)
  - Implement pagination in scrape job
  - Return 202 Accepted; poll for completion

## Dependencies at Risk

### 1. Deno Ecosystem Dependency on deno-smtp
- **Risk**: `deno-smtp` library is unmaintained (no recent updates)
- **Impact**: If Deno runtime changes, SMTP might break
- **Migration plan**: Implement native SMTP with `deno.land/std/net`; or use SendGrid/Mailgun HTTP API instead

### 2. Apify Instagram Scraper Actor
- **Risk**: Apify changes actor API, Instagram changes interface, or actor gets banned
- **Impact**: Auto-scrape fails; no fallback
- **Migration plan**:
  - Add abstraction layer for video scraping (IntegraiScraper interface)
  - Implement backup scraper using Playwright or Puppeteer
  - Monitor Apify status page

### 3. Claude API (Anthropic)
- **Risk**: Token limits, rate limiting, model changes, API deprecation
- **Impact**: AI-Build-Script, Categorize-Script, AI-FollowUp features fail
- **Migration plan**:
  - Implement fallback to local LLM (Ollama, LLaMA)
  - Add caching for research results, scripts
  - Monitor Anthropic API status

---

*Concerns audit: 2026-03-10*
