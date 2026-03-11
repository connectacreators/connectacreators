# Codebase Structure

**Analysis Date:** 2026-03-10

## Directory Layout

```
connectacreators/
├── src/
│   ├── pages/                    # Route-level components (42 pages)
│   ├── components/               # Reusable React components
│   │   ├── ui/                   # Shadcn UI primitives
│   │   ├── workflow/             # Workflow builder components
│   │   ├── tables/               # Data table components
│   │   ├── en/                   # English-only components
│   │   └── [feature].tsx         # Feature components (AIScriptWizard, etc.)
│   ├── hooks/                    # Custom React hooks
│   ├── services/                 # Business logic layer
│   ├── contexts/                 # React context providers
│   ├── integrations/             # External service clients
│   ├── utils/                    # Utility functions
│   ├── lib/                      # Shared library code
│   ├── workers/                  # Web Workers
│   ├── i18n/                     # Translations (EN/ES)
│   ├── assets/                   # Images, fonts, media
│   ├── App.tsx                   # Main router
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Global styles
├── supabase/
│   ├── functions/                # Edge Functions (37+ functions)
│   ├── migrations/               # SQL migrations
│   └── config.toml               # Function configurations
├── public/                       # Static files
├── package.json                  # NPM dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite build config
├── tailwind.config.ts            # Tailwind CSS config
└── index.html                    # HTML entry point
```

## Directory Purposes

**`src/pages/`:**
- Purpose: Route-level page components (one per URL route)
- Contains: 42 .tsx files, each exports default page component
- Key files:
  - `Dashboard.tsx` - Main authenticated hub with folder navigation
  - `Scripts.tsx` - Script list + AI wizard + editor interface
  - `ClientWorkflow.tsx` - Visual workflow builder interface
  - `ViralToday.tsx` - Viral video analytics dashboard (1400+ videos, paginated)
  - `ContentCalendar.tsx` - Month calendar grid for scheduled posts
  - `LeadTracker.tsx` - Lead database with cards/table view toggle
  - `ClientDatabase.tsx`, `MasterDatabase.tsx` - Inline-editable data tables
  - `LandingPageNew.tsx`, `PublicLandingPage.tsx` - Public marketing pages
  - `Onboarding.tsx` - 5-section client intake form (auto-saves to clients.onboarding_data)
  - `PublicOnboarding.tsx` - Public-facing version of onboarding

**`src/components/`:**
- Purpose: Reusable UI components, feature-specific components
- Contains: 50+ components organized by category
- Subdirectories:
  - `ui/` - Shadcn/Radix UI primitives (button, dialog, input, select, table, etc.)
  - `workflow/` - Workflow builder UI (AddStepModal, StepConfigModal, WorkflowStep, WorkflowAnalytics, LiveRunDrawer, TestRunModal)
  - `tables/` - Data table row editors (inline CRUD for leads, videos, etc.)
  - `en/` - English-only landing page components

**`src/hooks/`:**
- Purpose: Custom React hooks for data fetching and state management
- Contains:
  - `useAuth.ts` - Get current user and role from AuthContext
  - `useScripts.ts` - Script CRUD (fetchScriptsByClient, directSave, reorderSectionLines, etc.)
  - `useClients.ts` - Client list fetching
  - `useSubscriptionGuard.ts` - Check usage quotas, enforce monthly script limits
  - `useLanguage.ts` - Language toggle state (en/es)
  - `useTheme.ts` - Dark/light theme state
  - `usePermissionCheck.ts` - RBAC helpers

**`src/services/`:**
- Purpose: Encapsulate Supabase database operations and external API calls
- Contains:
  - `scriptService.ts` - CRUD for scripts table (create, update, delete, fetch by client)
  - `clientService.ts` - Client record operations
  - `leadService.ts` - Lead table CRUD with 11 columns
  - `videoService.ts` - Video/reel metadata operations
  - `aiGenerator.ts` - Call Supabase AI functions (categorize-script, etc.)
  - `followupEngine.ts` - Follow-up automation logic
  - `messageService.ts` - Send SMS/email via service layers
  - `zohoService.ts` - Zoho CRM integration

**`src/contexts/`:**
- Purpose: Global React context providers
- Contains:
  - `AuthContext.tsx` - User session, role, loading state (143 lines)
  - `LeadNotificationContext.tsx` - Real-time lead notifications

**`src/integrations/`:**
- Purpose: Third-party service client initialization and configuration
- Contains:
  - `supabase/client.ts` - Supabase JS client initialization with Auth config
  - `supabase/types.ts` - Auto-generated TypeScript types from Supabase schema
  - `lovable/index.ts` - Lovable auth integration (deprecated, replaced by Supabase)

**`src/utils/`:**
- Purpose: Utility functions and helpers
- Contains:
  - `csvExport.ts` - CSV export for tables

**`src/i18n/`:**
- Purpose: Translations and language management
- Contains: Translation objects for EN and ES, helper functions for key lookup

**`src/assets/`:**
- Purpose: Images, logos, brand assets
- Contains: Founder photos, testimonial images, background graphics

**`src/workers/`:**
- Purpose: Web Workers for heavy computation off main thread
- Contains: Background processing tasks

**`supabase/functions/`:**
- Purpose: Server-side edge functions (Deno-based)
- Contains 37+ functions:
  - **AI & Content Generation:**
    - `ai-build-script/` - 3-step wizard: research → structure → generate
    - `categorize-script/` - Parse script lines into filming/actor/editor categories
  - **Workflow Orchestration:**
    - `execute-workflow/` - Main workflow step executor (email, SMS, Notion, webhook, etc.)
    - `test-workflow-step/` - Test single step with mock data
    - `run-scheduled-workflows/` - Cron-triggered workflow runner
  - **Integrations:**
    - `facebook-oauth/` - OAuth flow for Facebook page connection
    - `facebook-webhook-receiver/` - Receives lead form submissions, creates leads, triggers workflows
    - `get-notion-db-schema/` - Fetch real Notion database schema (properties, select options)
    - `fetch-editing-queue/` - Pull video queue from Notion database
    - `sync-notion-script/` - Create/update Notion record when script saved
  - **Data Scraping & Sync:**
    - `scrape-channel/` - Apify task to scrape YouTube channel videos
    - `auto-scrape-channels/` - Daily cron: fetch last 2 videos from all channels
    - `fetch-leads/` - Fetch leads from Supabase, populate Notion workflows database
  - **Payments & Subscriptions:**
    - `create-checkout/` - Stripe checkout session creation
    - `check-subscription/` - Verify subscription status and script usage
    - `cancel-subscription/` - Cancel Stripe subscription
  - **Utility:**
    - `public-booking/` - Handle video booking form submissions
    - `deploy-migrations/` - Run SQL migrations programmatically
    - `schedule-post/` - Schedule content calendar posts
    - `sync-calendar-status/` - Update post status in calendar

**`supabase/migrations/`:**
- Purpose: SQL migration scripts applied sequentially
- Contains: Migrations for tables (scripts, script_lines, clients, leads, client_workflows, workflow_executions, viral_videos, viral_channels, etc.)

**`supabase/config.toml`:**
- Purpose: Edge function manifest (function entries, auth config, env vars)
- Contains: [functions.*] sections mapping function directory to HTTP entry point

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React root render
- `src/App.tsx`: Route definitions (BrowserRouter with 50+ Route entries)
- `index.html`: HTML shell with root div

**Configuration:**
- `package.json`: Dependencies (React, React Router, Supabase, Stripe, Framer Motion, etc.)
- `vite.config.ts`: Build configuration (React SWC plugin)
- `tsconfig.json`: TypeScript compiler options (strict mode enabled)
- `tailwind.config.ts`: Tailwind theme colors (dark/light mode variables)

**Core Logic:**
- `src/services/scriptService.ts`: Script CRUD
- `src/hooks/useScripts.ts`: Script state management (directSave, reorderSectionLines, undo/redo)
- `src/pages/Scripts.tsx`: Script editor UI with drag-and-drop lines
- `src/pages/ClientWorkflow.tsx`: Workflow builder with step orchestration
- `supabase/functions/execute-workflow/index.ts`: Workflow step executor

**Testing:**
- `supabase/functions/test-workflow-step/index.ts`: Step-level test executor
- `src/components/workflow/TestRunModal.tsx`: Manual test trigger UI

## Naming Conventions

**Files:**
- Pages: PascalCase (Dashboard.tsx, ClientWorkflow.tsx, PublicOnboarding.tsx)
- Components: PascalCase (AIScriptWizard.tsx, DashboardSidebar.tsx)
- Utilities: camelCase (csvExport.ts)
- Hooks: camelCase (useScripts.ts, useAuth.ts)
- Services: camelCase (scriptService.ts, clientService.ts)
- Edge functions: kebab-case directory names (ai-build-script/, execute-workflow/)

**Variables & Functions:**
- Components: PascalCase (function Dashboard(), function AIScriptWizard())
- Hooks: camelCase, "use" prefix (useScripts(), useAuth())
- Services: camelCase objects (scriptService, clientService)
- Functions: camelCase (fetchScriptsByClient(), reorderSectionLines())
- Constants: UPPERCASE (CALENDLY, VIMEO, STEP_OUTPUT_SCHEMAS)
- React state: camelCase (scripts, loading, activeFolder)

**Types:**
- Interfaces: PascalCase with "Type" suffix or no suffix
  - `AuthContextType`, `Workflow`, `WorkflowStep`, `Script`, `ScriptLine`, `Client`
- Enums: PascalCase
- Generic types: camelCase (scriptId, clientId)

## Where to Add New Code

**New Feature (e.g., new automation step type):**
1. Page component: `src/pages/[FeatureName].tsx` (e.g., NewFeaturePage.tsx)
2. Sub-components: `src/components/[feature]/` directory
3. Hooks: `src/hooks/use[Feature].ts`
4. Services: `src/services/[feature]Service.ts` if calling external APIs
5. Edge function: `supabase/functions/[feature-name]/index.ts`

**New Component/Module:**
- Implementation: `src/components/[feature]/[Component].tsx`
- Export from barrel: `src/components/index.ts` (if needed)
- Use: Import with `import [Component] from "@/components/[feature]/[Component]"`

**Utilities:**
- Shared helpers: `src/utils/[utility].ts`
- Use: Import with `import { helperFn } from "@/utils/[utility]"`

**Database Migrations:**
- Create: `supabase/migrations/[YYYYMMDD]_[description].sql`
- Run in Supabase Dashboard SQL Editor or via deploy-migrations edge function

**Edge Functions:**
- Create: `supabase/functions/[function-name]/index.ts`
- Update: `supabase/config.toml` with [functions.[function-name]] entry
- Deploy: `npx supabase functions deploy [function-name] --project-ref hxojqrilwhhrvloiwmfo`

## Special Directories

**`src/components/workflow/`:**
- Purpose: Workflow builder UI (shared across ClientWorkflow and ClientFollowUpAutomation pages)
- Generated: No
- Committed: Yes
- Key files:
  - `AddStepModal.tsx` - Service/action selector (email, SMS, Notion, webhook, WhatsApp, HTTP)
  - `StepConfigModal.tsx` - Service-specific configuration UI (VariablePicker, Notion schema loader)
  - `WorkflowStep.tsx` - Drag-and-drop step card
  - `TestRunModal.tsx` - Manual trigger + test data input
  - `LiveRunDrawer.tsx` - Real-time step execution visualization
  - `WorkflowTemplates.tsx` - Pre-built workflow templates
  - `WorkflowAnalytics.tsx` - 30-day execution stats dashboard

**`src/components/tables/`:**
- Purpose: Inline-editable data table rows
- Generated: No
- Committed: Yes
- Patterns: Edit mode switches on double-click, save button triggers Supabase update

**`supabase/functions/_shared/`:**
- Purpose: Shared utilities across edge functions
- Generated: No
- Committed: Yes
- Contains: CORS helper, shared type definitions

**`.env` file (NOT in git):**
- Contains: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
- Set locally and on VPS in /var/www/connectacreators/.env
- Never commit secrets

**`public/` directory:**
- Purpose: Static assets served at root
- Generated: No (manually placed)
- Committed: Yes

---

*Structure analysis: 2026-03-10*
