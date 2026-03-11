# External Integrations

**Analysis Date:** 2026-03-10

## APIs & External Services

**Anthropic (Claude AI):**
- Claude Haiku 4.5 (model: claude-haiku-4-5-20251001)
- What it's used for: Script generation, research facts, hook writing, content analysis
- SDK/Client: Direct REST API via Deno fetch
- Auth: `ANTHROPIC_API_KEY` environment variable
- Endpoint: `https://api.anthropic.com/v1/messages`
- Implementation: `supabase/functions/ai-build-script/index.ts`

**OpenAI:**
- Whisper API - Audio transcription
- What it's used for: Transcribe video audio to text
- Auth: `OPENAI_API_KEY` environment variable
- Implementation: `supabase/functions/transcribe-video/index.ts`
- Integrates with: yt-dlp server (VPS) for audio extraction first

**Facebook Graph API (Meta):**
- OAuth 2.0 flow for page authorization
- Lead Ads form integration
- What it's used for:
  - Authenticate client Facebook pages
  - Retrieve lead forms from business pages
  - Receive lead submissions via webhooks
  - Subscribe to leadgen webhooks
- SDK/Client: Direct REST API via Deno fetch
- Auth:
  - FB_APP_ID: `1458843159177922` (hardcoded in `facebook-oauth/index.ts`)
  - FB_APP_SECRET: Stored in Supabase secrets
  - OAuth callback URL: `https://connectacreators.com/facebook-callback`
- Endpoint: `https://graph.facebook.com/v19.0`
- Implementation:
  - `supabase/functions/facebook-oauth/index.ts` - OAuth flow, page/form management
  - `supabase/functions/facebook-webhook-receiver/index.ts` - Webhook receiver for leads
  - `supabase/functions/get-facebook-leads/index.ts` - Fetch leads from specific form
- Webhook signature verification: `X-Hub-Signature-256` header check

**Notion API:**
- Database/page operations
- What it's used for:
  - Create/update video editing queue items
  - Fetch editing tasks and metadata
  - Update script metadata in Notion
  - Store lead data and workflow triggers
  - Sync content calendar to Notion
- SDK/Client: Direct REST API via Deno fetch
- Auth: `NOTION_API_KEY` environment variable
- Endpoint: `https://api.notion.com/v1/`
- API Version: `2022-06-28`
- Database IDs (per client): Stored in `client_notion_mapping` table
  - `notion_database_id` - Video editing queue database
  - `notion_leads_database_id` - Leads/workflow data database
- Implementation files:
  - `supabase/functions/fetch-editing-queue/index.ts` - Fetch editing queue
  - `supabase/functions/sync-notion-script/index.ts` - Sync single script
  - `supabase/functions/bulk-sync-notion-scripts/index.ts` - Bulk sync scripts
  - `supabase/functions/get-notion-db-schema/index.ts` - Fetch database schema
  - `supabase/functions/schedule-post/index.ts` - Sync to content calendar
  - Edge function: Notion field mapping for workflow steps

**Apify (Web Scraping):**
- Instagram Reel Scraper actor
- What it's used for: Scrape Instagram profiles for video metadata (views, likes, comments, etc.)
- SDK/Client: Direct REST API via Deno fetch
- Auth: `APIFY_TOKEN` hardcoded in edge functions
- Actor: `apify~instagram-reel-scraper` (Apify's public actor)
- Endpoints:
  - Actor runs: `https://api.apify.com/v2/acts/{ACTOR_ID}/runs?token={APIFY_TOKEN}`
  - Dataset items: `https://api.apify.com/v2/datasets/{datasetId}/items?token={APIFY_TOKEN}`
- Implementation:
  - `supabase/functions/scrape-channel/index.ts` - On-demand scrape
  - `supabase/functions/auto-scrape-channels/index.ts` - Daily cron job (runs 9am UTC)
- Usage: Fetches last 200-2000 videos per channel with engagement metrics

**Google Sheets API:**
- What it's used for: Append/search/update rows in spreadsheets
- SDK/Client: Direct REST API via Deno JWT auth
- Auth: `GOOGLE_SERVICE_ACCOUNT_JSON` environment variable (JWT-based)
- Scope: `https://www.googleapis.com/auth/spreadsheets`
- Implementation: `supabase/functions/google-sheets/index.ts`
- Workflow step support: append_row, find_row, update_row actions

**Twilio:**
- SMS messaging
- WhatsApp messaging
- What it's used for:
  - Send SMS messages in workflows
  - Send WhatsApp messages in workflows
  - Customer engagement automation
- SDK/Client: Direct REST API via Deno fetch (Basic Auth)
- Auth:
  - `TWILIO_ACCOUNT_SID` environment variable
  - `TWILIO_AUTH_TOKEN` environment variable
  - `TWILIO_PHONE_NUMBER` - SMS sender number
  - `TWILIO_WHATSAPP_NUMBER` - WhatsApp sender number (with whatsapp: prefix)
- Endpoints:
  - Messages API: `https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json`
- Implementation: `supabase/functions/execute-workflow/index.ts` (SMS and WhatsApp step handlers)

**Stripe (Payments & Subscriptions):**
- What it's used for: Subscription billing, payment processing
- SDK/Client:
  - Frontend: `@stripe/stripe-js` 8.7.0, `@stripe/react-stripe-js` 5.6.0
  - Backend: Stripe API via Deno fetch in edge functions
- Auth:
  - Publishable key: `pk_live_[REDACTED]`
  - Secret key: Stored in Supabase environment variables (`STRIPE_SECRET_KEY`)
- Price IDs (hardcoded):
  - Starter ($30/month): `price_1T4PkQCp1qPE081LmYoLD2dZ`
  - Growth ($60/month): `price_1T4PkRCp1qPE081LiK3EokBD`
  - Enterprise ($150/month): `price_1T4PkSCp1qPE081LbcNAFmHb`
- Implementation:
  - `supabase/functions/create-checkout/index.ts` - Create checkout sessions
  - `src/components/StripePaymentButton.tsx` - Frontend payment UI
  - `src/hooks/useStripeCheckout.ts` - Checkout hook
- Webhook receiver: `stripe-webhook` function (signature verification via `Stripe-Signature` header)

**yt-dlp (Audio Extraction):**
- What it's used for: Extract audio from videos for transcription
- Location: VPS at `http://72.62.200.145:3099` (internal server)
- Auth: `ytdlp_connecta_2026_secret` API key
- Endpoint: `/extract-audio`
- Implementation: Used in `supabase/functions/transcribe-video/index.ts` before sending to Whisper

## Data Storage

**Databases:**
- PostgreSQL via Supabase
  - Connection: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (client-side)
  - Service connection: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (backend)
  - Client: `@supabase/supabase-js` 2.95.3
  - ORM: Direct SQL queries via Supabase client `.from().select().eq()` pattern (no traditional ORM)

**File Storage:**
- Google Drive - Video storage for clients
  - Stored as URLs in database (`google_drive_link` field)
  - Embedded in public content calendar via iframe
  - No direct upload integration (clients add manually)

**Caching:**
- None detected - Uses TanStack React Query for client-side caching

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in)
  - Implementation: `src/integrations/supabase/client.ts`
  - Storage: localStorage with session persistence
  - Auto-refresh enabled
- Google OAuth (via Supabase)
  - For user login/signup
- Facebook OAuth
  - For Facebook page authorization (separate from user auth)

**Role-Based Access Control:**
- Custom role system via `user_roles` table
  - Roles: admin, user, client, videographer, editor, connecta_plus
  - Implementation: `src/contexts/AuthContext.tsx` fetches role on login

**Security:**
- RLS (Row Level Security) policies on Supabase tables
- Webhook signature verification (Facebook: `X-Hub-Signature-256`, custom: `X-Webhook-Signature`, cron: `X-Cron-Secret`)
- All edge functions use internal auth via `supabase.auth.getUser()` instead of gateway JWT validation

## Monitoring & Observability

**Error Tracking:**
- None detected - Uses console.error() for logging in edge functions

**Logs:**
- Deno console.log/console.error in edge functions
- Browser console logs in React application
- Supabase function logs accessible via dashboard

## CI/CD & Deployment

**Hosting:**
- Frontend: Deployed to VPS at `72.62.200.145` (connectacreators.com)
  - Build: `npm run build` → Vite bundles to `/dist/`
  - Served via nginx from `/var/www/connectacreators/dist/`
  - Root config: Updated to point to `/dist/` subdirectory
- Backend: Supabase Edge Functions (serverless)
  - Deployment: `npx supabase functions deploy {function-name}`

**CI Pipeline:**
- None detected - Manual deployment process via VPS SSH/SCP

**Build Process:**
- Local: `npm run build` (15-27 second build times observed)
- VPS: Builds directly on production server
- No GitHub Actions or automated pipelines detected

## Environment Configuration

**Required env vars (Frontend):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key

**Required env vars (Backend/Edge Functions):**
- `SUPABASE_URL` - Supabase URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role (admin operations)
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key
- `NOTION_API_KEY` - Notion integration token
- `STRIPE_SECRET_KEY` - Stripe secret key (live mode)
- `FACEBOOK_APP_ID` - Facebook app ID
- `FACEBOOK_APP_SECRET` - Facebook app secret
- `TWILIO_ACCOUNT_SID` - Twilio account ID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio SMS sender number
- `TWILIO_WHATSAPP_NUMBER` - Twilio WhatsApp sender number
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Google Sheets service account (JSON stringified)

**Secrets location:**
- `.env` file for local development (not committed)
- Supabase Dashboard → Settings → Secrets for production

## Webhooks & Callbacks

**Incoming Webhooks:**
- Facebook Lead Ads: `/functions/v1/facebook-webhook-receiver`
  - Triggered when new leads submitted to form
  - Signature verification: `X-Hub-Signature-256` header
  - Creates leads in database, triggers workflows
- Custom Workflows: `/functions/v1/workflow-webhook`
  - External webhook receiver for custom integrations
  - Signature verification: `X-Webhook-Signature` header

**Outgoing Webhooks:**
- Notion webhooks: Configured in page/database configuration
- Stripe webhooks: Configured in Stripe dashboard → Webhooks
  - Events: checkout.session.completed, customer.subscription.updated, etc.
  - Receiver: `stripe-webhook` edge function

**Scheduled Jobs:**
- Auto-scrape channels: Cron job running daily at 9am UTC
  - Triggered via Supabase Cron (set via SQL)
  - Endpoint: `https://hxojqrilwhhrvloiwmfo.supabase.co/functions/v1/auto-scrape-channels`
  - Auth: `X-Cron-Secret` header check
  - Fetches last 2 videos from all previously-scraped Instagram channels

## Integration Patterns

**Workflow Engine:**
- Multi-step automation system: `supabase/functions/execute-workflow/index.ts`
- Supports: Email (Zoho SMTP), SMS (Twilio), WhatsApp (Twilio), Webhooks, Notion CRUD, Google Sheets operations, delays, conditional branching
- Variable interpolation: `{{lead.field}}` for trigger data, `{{steps.STEP_ID.field}}` for step outputs
- Execution tracking: Stores execution history in `workflow_executions` table for analytics

**Data Mapper:**
- Step outputs available to subsequent steps via variable reference
- Each service defines output schema (e.g., notion.create_record → page_id, url)
- Enables chaining of operations (search → update using search result ID)

---

*Integration audit: 2026-03-10*
