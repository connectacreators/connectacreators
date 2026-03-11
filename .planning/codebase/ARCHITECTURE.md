# Architecture

**Analysis Date:** 2026-03-10

## Pattern Overview

**Overall:** Multi-tier Full-Stack SaaS with Client-Centric Dashboard Architecture

**Key Characteristics:**
- React + TypeScript frontend with Vite build system
- Supabase backend with PostgreSQL + RLS policies
- Role-based access control (admin, user, client, videographer, editor, connecta_plus)
- Server-side orchestration via Supabase Edge Functions
- Workflow automation engine with multi-step integration platform
- Client tenancy with cross-client admin views

## Layers

**Presentation Layer (React Frontend):**
- Purpose: Interactive UI for all user roles; real-time dashboard, script editors, lead tracking
- Location: `src/pages/`, `src/components/`
- Contains: Page components (42 pages), reusable UI components, workflow builders
- Depends on: Supabase client, React Query for data fetching, Framer Motion for animations
- Used by: End users via browser at connectacreators.com

**State Management Layer:**
- Purpose: Manage auth, user roles, client data, subscription state
- Location: `src/contexts/`, `src/hooks/`
- Contains: AuthContext for session/role loading, custom hooks (useScripts, useClients, useSubscriptionGuard)
- Depends on: Supabase Auth, Supabase database queries
- Used by: All pages via React context

**Service Layer (Business Logic):**
- Purpose: Encapsulate Supabase queries and data transformations
- Location: `src/services/`
- Contains: scriptService.ts, clientService.ts, leadService.ts, videoService.ts, aiGenerator.ts, followupEngine.ts, messageService.ts, zohoService.ts
- Depends on: Supabase client (`@/integrations/supabase/client`)
- Used by: Pages and hooks for CRUD operations

**Integration Layer:**
- Purpose: External service connections (Supabase, Stripe, Notion, Facebook, etc.)
- Location: `src/integrations/`
- Contains: Supabase client initialization, types, Lovable auth integration
- Depends on: @supabase/supabase-js, environment variables
- Used by: All layers for database/auth access

**Orchestration Layer (Edge Functions):**
- Purpose: Server-side logic that coordinates workflows, syncs external data, processes webhooks
- Location: `supabase/functions/`
- Contains: 37+ functions (ai-build-script, execute-workflow, scrape-channel, fetch-leads, etc.)
- Depends on: Supabase client, external APIs (Notion, Facebook, Apify, Twilio, etc.)
- Used by: Frontend via HTTP POST, webhooks, scheduled cron jobs

**Database Layer:**
- Purpose: Persistent data storage with row-level security
- Location: Supabase PostgreSQL
- Contains: Tables for clients, scripts, leads, workflows, videographers, subscriptions, etc.
- Depends on: RLS policies for multi-tenant isolation
- Used by: All backend/frontend queries

## Data Flow

**Script Generation Workflow:**

1. User fills AIScriptWizard form (3 steps: Topic & Research → Structure & Hook → Script)
2. Frontend calls `ai-build-script` edge function with onboarding context
3. Edge function executes AI chain: research → structure → generate script
4. Returns script lines as structured data
5. `directSave` hook saves directly to `scripts` and `script_lines` tables
6. Fire-and-forget sync-notion-script triggers asynchronously
7. UI updates with new script in Scripts page list

**Lead Workflow Execution:**

1. Trigger fires (new Facebook lead, status change, schedule, or manual test)
2. `execute-workflow` edge function retrieves workflow steps from `client_workflows`
3. For each step:
   - Interpolates variables: `{{lead.name}}` → actual value, `{{steps.STEP_ID.field}}` → output from previous step
   - Executes action (email via Zoho SMTP, SMS via Twilio, create Notion record, etc.)
   - Stores output in step context for next step
   - On failure: either stops workflow or runs else_steps (if configured)
   - On retry: re-attempts up to 3 times with exponential backoff
4. `workflow_executions` table records all step results and timings
5. WorkflowAnalytics dashboard aggregates 30-day execution stats

**Real-Time Data Sync (Viral Today):**

1. Daily cron job `auto-scrape-channels` runs at 9am UTC
2. Queries all channels with `scrape_status = 'done'`
3. For each: calls Apify API with `resultsLimit: 2` (latest 2 videos)
4. Deduplicates by `video_url` before inserting to `viral_videos` table
5. Updates `last_scraped_at` per channel
6. Frontend ViralToday page shows all 1400+ videos with pagination (100/page)

**State Management:**
- Auth state: Supabase `onAuthStateChange` listener in AuthContext
- User role: Fetched from `user_roles` table on initial load
- Client data: Loaded on Dashboard mount, cached in state
- Workflow data: Loaded from `client_workflows` JSON blob on ClientWorkflow page open
- Script lines: Fetched as separate `script_lines` rows, stored in undo stack

## Key Abstractions

**Workflow Step (Service/Action Pattern):**
- Purpose: Represents single action in multi-step workflow (email, SMS, Notion, webhook, etc.)
- Examples: `src/components/workflow/WorkflowStep.tsx`, `src/components/workflow/StepConfigModal.tsx`
- Pattern: Step is object with { id, type: 'trigger'|'action', service, action, label, config }
  - Service determines action options: email→{send_email}, notion→{search_record, create_record, update_record}
  - Config varies by service: email config has {to, subject, body, credentials}, notion has {database_id, record_title_field, fields_to_update}
  - Used by AddStepModal for service/action selection, StepConfigModal for step-specific UI, execute-workflow for execution

**Script as Structured Lines:**
- Purpose: Break scripts into filmable units (filming instructions, actor dialogue, editor cuts)
- Examples: `src/hooks/useScripts.ts` exports ScriptLine type
- Pattern: Script = { id, title, raw_content } + script_lines[] = { line_number, line_type: 'filming'|'actor'|'editor', section: 'hook'|'body'|'cta', text }
  - DragEndEvent from @dnd-kit reorders lines
  - `reorderSectionLines` updates all line_numbers atomically
  - Undo stack stores full script state before each mutation

**Client Tenancy:**
- Purpose: Isolate data per client while allowing admin cross-client views
- Examples: RLS policies in Supabase, Dashboard viewMode state
- Pattern: All tables have client_id foreign key, RLS policy checks auth role
  - Clients can only see their own data (RLS: `auth.uid() = user_id`)
  - Admins/videographers bypass RLS with service role key (edge functions)
  - Dashboard switches viewMode: 'master' (all clients) vs 'me' (own client) vs specific clientId

**Variable Interpolation:**
- Purpose: Allow step configs to reference trigger data and previous step outputs
- Examples: `execute-workflow` edge function
- Pattern: Before executing step, replace `{{lead.name}}` with actual trigger field value, `{{steps.STEP_ID.field}}` with output from previous step
  - Regex: `/\{\{([^}]+)\}\}/g` matches variables
  - Trigger data: `lead.{name, email, phone, status, source, created_at}`
  - Step outputs defined in STEP_OUTPUT_SCHEMAS constant: notion.search_record → {page_id, title, url}

## Entry Points

**Browser Root Route:**
- Location: `src/App.tsx` (line 54-59)
- Triggers: User visits connectacreators.com or subdomain
- Responsibilities: Route to PublicLandingPage (custom domains) or LandingPageNew (main site)

**Dashboard:**
- Location: `src/pages/Dashboard.tsx`
- Triggers: User navigates /dashboard (protected by AuthProvider)
- Responsibilities: Display folder-based navigation (Content, Sales, Setup), client selector for staff, role-based menu items

**Scripts Page (AI Script Generator):**
- Location: `src/pages/Scripts.tsx`
- Triggers: User clicks "Scripts" in dashboard or navigates /scripts
- Responsibilities: Show script list, launch AIScriptWizard, inline edit script lines, auto-save functionality

**Workflow Builder:**
- Location: `src/pages/ClientWorkflow.tsx`
- Triggers: Staff clicks "Automation" in client detail
- Responsibilities: Visual workflow builder, step drag-and-drop, test trigger, test run with live logs, analytics

**Public Pages (No Auth):**
- PublicScript: `/s/:id` - Share script as public link
- PublicBooking: `/book/:clientId` - Video booking form
- PublicContentCalendar: `/public/calendar/:clientId` - Content calendar client can share
- PublicOnboarding: `/public/onboard/:clientId` - Multi-section form for client info

**Webhook Entry Points:**
- facebook-webhook-receiver: `POST /functions/v1/facebook-webhook-receiver` - Receives lead form submissions
- Supabase function verify_jwt=false to allow public access

## Error Handling

**Strategy:** Try-catch with Sonner toast notifications for user feedback

**Patterns:**
- Service functions wrap Supabase calls in try-catch, log errors to console, throw to caller
- Page components catch promises with .then(({data, error})) pattern
- Edge functions return { status, output, error } JSON
- UI shows toast.error() with user-friendly message
- Workflow step failures trigger on_fail action: 'stop' (default) or 'else_steps' (conditional branch)
- Retries with exponential backoff: attempt 1 after 1s, attempt 2 after 3s, attempt 3 after 5s

## Cross-Cutting Concerns

**Logging:** Console.log for development, Sonner toasts for user-facing notifications

**Validation:**
- Frontend: React Hook Form + Zod for form validation (select forms, email inputs, etc.)
- Backend: Edge functions validate required fields before processing
- Script lines: Required minimum checks (id_ganadora not empty, at least one line)

**Authentication:**
- Supabase Auth with session persistence in localStorage
- AuthContext provides user, role, isAdmin flags
- Protected pages check useAuth() and redirect to /home if not logged in
- RLS policies enforce multi-tenant data isolation at database layer

**Authorization:**
- Role-based: admin, client, videographer, editor, connecta_plus
- Dashboard only shows permitted menu items based on role
- Edge functions use service role key for cross-client operations
- Client pages check clientId route param against user.id or user's assigned clients

**Rate Limiting:** None detected - Supabase applies default rate limits

**Caching:** React Query used for API response caching, configured in App.tsx as QueryClientProvider

---

*Architecture analysis: 2026-03-10*
