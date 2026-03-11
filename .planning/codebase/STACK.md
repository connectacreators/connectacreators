# Technology Stack

**Analysis Date:** 2026-03-10

## Languages

**Primary:**
- TypeScript 5.5.3 - Full codebase (React components, edge functions, type definitions)
- JavaScript/ES6+ - React JSX/TSX, Vite bundling

**Secondary:**
- SQL - Database migrations and Supabase functions
- HTML/CSS - Styled via Tailwind

## Runtime

**Environment:**
- Node.js - Local development and build-time (Vite)
- Deno - Supabase Edge Functions runtime (Deno 1.x via Supabase)
- Browser - React 18.3.1 client application

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 18.3.1 - UI framework
- React Router DOM 6.26.2 - Client-side routing
- Vite 5.4.1 - Build tool and dev server

**UI & Components:**
- shadcn/ui - Component library (Radix UI primitives + Tailwind CSS)
- Radix UI - Unstyled component primitives (26+ components: accordion, dialog, dropdown, select, tooltip, etc.)
- Tailwind CSS 3.4.11 - Utility CSS framework
- Tailwind Merge 2.5.2 - CSS class merging utility
- Tailwind Animate 1.0.7 - Animation utilities
- Class Variance Authority 0.7.1 - Component styling patterns

**Animations & Motion:**
- Framer Motion 12.23.26 - React animation library
- Embla Carousel 8.3.0 + autoplay - Image carousel component

**Data & Forms:**
- React Hook Form 7.53.0 - Form state management
- Hookform/resolvers 3.9.0 - Schema validation integration
- Zod 3.23.8 - TypeScript schema validation
- TanStack React Query 5.56.2 - Server state management
- Recharts 2.12.7 - React charting library

**Drag & Drop:**
- dnd-kit (core 6.3.1, sortable 10.0.0, utilities 3.2.2) - Headless drag-and-drop library

**Additional UI:**
- Lucide React 0.462.0 - Icon library
- Sonner 1.5.0 - Toast notification library
- React Resizable Panels 2.1.3 - Resizable panel layout
- Vaul 0.9.3 - Drawer/sheet component
- React Day Picker 8.10.1 - Calendar date picker
- Input OTP 1.2.4 - OTP input component
- cmdk 1.0.0 - Command palette component
- next-themes 0.3.0 - Theme management (dark/light mode)

**Testing & Dev:**
- ESLint 9.9.0 - Code linting
- ESLint Plugin React Hooks 5.1.0-rc.0 - React hooks rules
- ESLint Plugin React Refresh 0.4.9 - Vite React refresh
- TypeScript ESLint 8.0.1 - TypeScript linting rules
- Lovable Tagger 1.1.7 - Component documentation

**Build Tools:**
- @vitejs/plugin-react-swc 3.5.0 - Vite React plugin with SWC compiler
- Autoprefixer 10.4.20 - CSS vendor prefixing
- PostCSS 8.4.47 - CSS transformation

**Auth & Third-Party:**
- @lovable.dev/cloud-auth-js 0.0.2 - Lovable authentication client
- @supabase/supabase-js 2.95.3 - Supabase client SDK

**Payment & Subscriptions:**
- @stripe/stripe-js 8.7.0 - Stripe.js client
- @stripe/react-stripe-js 5.6.0 - React Stripe integration
- stripe (server-side, via edge functions)

**Utilities:**
- date-fns 3.6.0 - Date utilities and formatting
- clsx 2.1.1 - Conditional CSS classes

## Configuration

**TypeScript:**
- Base config: `tsconfig.json` (baseUrl: ".", paths: "@/*": "src/*")
- App-specific: `tsconfig.app.json`
- Node-specific: `tsconfig.node.json`
- Settings: skipLibCheck, allowJs enabled; noImplicitAny, noUnusedParameters disabled

**Build:**
- `vite.config.ts` - Vite configuration
- PostCSS config - Autoprefixer + Tailwind
- Tailwind CSS config - Custom theme configuration
- ESLint config: `eslint.config.js`

**Project Setup:**
- `package.json` - NPM dependencies and scripts
  - `npm run dev` - Start Vite dev server
  - `npm run build` - Production build
  - `npm run build:dev` - Development build
  - `npm run lint` - Run ESLint
  - `npm run preview` - Preview build locally

**Environment:**
- `.env` file present (contains configuration, secrets handled separately in Supabase)
- Vue-based development with Vite hot module replacement

## Supabase Edge Functions

**Runtime:** Deno 1.x (TypeScript-first)

**Deployment:** Supabase Functions (serverless backend)

**Configuration:** `supabase/config.toml` (22 functions listed, all with `verify_jwt = false` for internal auth via `supabase.auth.getUser()`)

**Key Functions:**
- `ai-build-script` - Claude API integration for script generation
- `execute-workflow` - Multi-step workflow execution (email, SMS, webhooks, Notion, Google Sheets)
- `facebook-oauth` - Facebook Lead Ads OAuth flow
- `facebook-webhook-receiver` - Webhook receiver for lead sync
- `transcribe-video` - OpenAI Whisper audio transcription
- `auto-scrape-channels` - Cron job for daily Instagram scraping
- `scrape-channel` - On-demand Instagram scraping via Apify
- `google-sheets` - Google Sheets API integration
- And 14+ others for various integrations

## Platform Requirements

**Development:**
- Node.js 18+ (for npm, Vite)
- npm 8+ (package manager)
- TypeScript 5.5.3+ (TypeScript compiler)
- Modern browser with ES2020+ support

**Production:**
- Deployment target: Vercel or similar (static frontend + edge functions)
- Supabase cloud or self-hosted PostgreSQL (database)
- VPS at 72.62.200.145 (connectacreators.com) for:
  - yt-dlp server (port 3099) for audio extraction
  - nginx reverse proxy
  - Node.js build environment

## Database

**Type:** PostgreSQL via Supabase

**Key Tables:**
- `users` - Authentication
- `clients` - Client/customer records
- `scripts` - Generated scripts with versioning
- `leads` - Lead tracking with Facebook integration
- `client_workflows` - Workflow definitions (triggers, steps, actions)
- `workflow_executions` - Workflow execution history and analytics
- `content_calendar` - Scheduled posts with Notion sync
- `subscriptions` - Stripe subscription tracking
- `user_roles` - RBAC role mapping
- `viral_channels` - Instagram channel scrape status
- `viral_items` - Scraped video metadata with engagement analytics
- `script_versions` - Version history for scripts
- `facebook_pages` - Connected Facebook pages per client
- `facebook_lead_forms` - Cached lead forms from Facebook

**Migrations:** 20+ SQL migration files in `supabase/migrations/` (created 2026-02-11 onwards)

---

*Stack analysis: 2026-03-10*
