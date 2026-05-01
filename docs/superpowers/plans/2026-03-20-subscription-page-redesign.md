# Subscription Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Subscription page with a lean Higgsfield-inspired layout (5 sections), route plan changes through Stripe Billing Portal, and bump scrape limits +50%.

**Architecture:** Rewrite `Subscription.tsx` from 780 lines to ~400 lines. Remove invoices list, transaction history, and separate Stripe status card. Consolidate into 5 dark-themed sections. Plan changes redirect to Stripe Portal instead of inline API calls. Update scrape limits in 4 edge functions + 1 utility file.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase Edge Functions, Stripe Billing Portal

**Spec:** `docs/superpowers/specs/2026-03-20-subscription-page-redesign-design.md`

---

### Task 1: Update scrape limits in edge functions and utility

**Files:**
- Modify: `src/utils/planLimits.ts:4-8`
- Modify: `supabase/functions/stripe-billing-portal/index.ts:272-274`
- Modify: `supabase/functions/stripe-webhook/index.ts:21-27`
- Modify: `supabase/functions/check-subscription/index.ts:21-27`

- [ ] **Step 1: Update `planLimits.ts`**

Change scrape values: starter 5→8, growth 10→15, enterprise 15→25:

```ts
export const PLAN_LIMITS: Record<string, { leads: number; scripts: number; landing_pages: number; channel_scrapes: number }> = {
  free:       { leads: 25,  scripts: 10,  landing_pages: 0, channel_scrapes: 1 },
  starter:    { leads: 100, scripts: 75,  landing_pages: 1, channel_scrapes: 8 },
  growth:     { leads: 500, scripts: 200, landing_pages: 3, channel_scrapes: 15 },
  enterprise: { leads: -1,  scripts: -1,  landing_pages: -1, channel_scrapes: 25 },
};
```

- [ ] **Step 2: Update `stripe-billing-portal/index.ts` PLAN_CONFIG**

Change `channel_scrapes_limit` in the 3 plan entries (around lines 272-274):

```ts
starter:    { ..., channel_scrapes_limit: 8,  ... },
growth:     { ..., channel_scrapes_limit: 15, ... },
enterprise: { ..., channel_scrapes_limit: 25, ... },
```

- [ ] **Step 3: Update `stripe-webhook/index.ts` PLAN_CONFIG**

Change `channel_scrapes_limit` in 4 entries (free, starter, growth, enterprise) in `PLAN_CONFIG` at lines 24-27:

```ts
free:       { ..., channel_scrapes_limit: 1  },
starter:    { ..., channel_scrapes_limit: 8  },
growth:     { ..., channel_scrapes_limit: 15 },
enterprise: { ..., channel_scrapes_limit: 25 },
```

- [ ] **Step 4: Update `check-subscription/index.ts` PRODUCT_PLAN_MAP**

Change `channel_scrapes_limit` in all 6 entries (lines 21-27):

Change `channel_scrapes_limit` in all 6 product-ID-keyed entries (lines 21-27):

```ts
// New product IDs
"prod_U8CMY29gkbO85Y": { ..., channel_scrapes_limit: 8  },
"prod_U8CMTfvyn4lvgv": { ..., channel_scrapes_limit: 15 },
"prod_U8CMxSv9ZoV1PF": { ..., channel_scrapes_limit: 25 },
// Legacy product IDs
"prod_Tzx3VOK8V8gI11": { ..., channel_scrapes_limit: 8  },
"prod_Tzx4et0Y0iv6LI": { ..., channel_scrapes_limit: 15 },
"prod_Tzx4OBg3PpYuES": { ..., channel_scrapes_limit: 25 },
```

Also update the fallback default on line ~163: `channel_scrapes_limit: 8` (was 5).

- [ ] **Step 5: Deploy edge functions**

```bash
npx supabase functions deploy stripe-billing-portal --project-ref hxojqrilwhhrvloiwmfo
npx supabase functions deploy stripe-webhook --project-ref hxojqrilwhhrvloiwmfo
npx supabase functions deploy check-subscription --project-ref hxojqrilwhhrvloiwmfo
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/planLimits.ts supabase/functions/stripe-billing-portal/index.ts supabase/functions/stripe-webhook/index.ts supabase/functions/check-subscription/index.ts
git commit -m "feat: bump scrape limits +50% — starter 8, growth 15, enterprise 25"
```

---

### Task 2: Rewrite Subscription.tsx — Higgsfield layout

**Files:**
- Modify: `src/pages/Subscription.tsx` (full rewrite)

The new page uses `useCredits`, `useAuth`, `useLanguage` hooks (unchanged). It removes invoices fetching, transaction history, and the inline `change-plan` API call. It adds Stripe Portal redirect for plan changes.

- [ ] **Step 1: Rewrite Subscription.tsx**

Replace the entire file. The new structure:

**Imports:** Keep `useState`, `useEffect`, `useAuth`, `useCredits`, `useLanguage`, `supabase`, `toast`, `Loader2`, `ExternalLink`, `Infinity`. Add `ChevronDown`, `ChevronUp`, `Check`, `X`. Remove `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Zap`, `TrendingDown`, `RefreshCw`, `FileText`, `Download`, `Settings`, `ArrowUpDown`, `AlertTriangle`. Remove `ScriptsLogin` import. Remove `Invoice` interface, `formatInvoiceDate`, `formatCurrency`.

**Constants:**

```ts
const PLAN_OPTIONS = [
  { key: "starter",    name: "Starter",    price: 39,  credits: 10000, scrapes: 8,  scripts: 75,  amount: 3900  },
  { key: "growth",     name: "Growth",     price: 79,  credits: 30000, scrapes: 15, scripts: 200, amount: 7900  },
  { key: "enterprise", name: "Enterprise", price: 139, credits: 75000, scrapes: 25, scripts: 500, amount: 13900 },
];

const CREDIT_COSTS = [
  { en: "Transcribe video (Vault)", es: "Transcribir video (Vault)", cost: 150 },
  { en: "AI Research + Script",     es: "Investigación AI + Guión",  cost: 50 },
  { en: "Refine / Translate script", es: "Refinar / Traducir guión", cost: 25 },
  { en: "Templatize / Extract",     es: "Convertir en plantilla",    cost: 50 },
  { en: "Generate Hooks / CTAs",    es: "Generar Hooks / CTAs",      cost: 25 },
  { en: "Canvas Generate",          es: "Generar Canvas",            cost: 50 },
];

const PLAN_FEATURES: Record<string, { en: string; es: string; included: (plan: string) => boolean }[]> = computed from PLAN_OPTIONS + planLimits;
```

**State:** Remove `invoices`, `invoicesLoading`, `confirmPlan`, `changePlanLoading`. Keep `portalLoading`, `stripeStatus`, `statusLoading`. Add `showPlans` (boolean, default false) and `costsOpen` (boolean, default false).

**Functions:**
- Keep `handleManageSubscription` but change `window.open(data.url, "_blank")` → `window.location.href = data.url`
- Keep `fetchStripeStatus` as-is
- Remove `fetchInvoices`, `handleChangePlan`
- Add `handleSelectPlan` — calls portal action and redirects (same as handleManageSubscription)

**useEffect:** Remove `fetchInvoices()` call. Keep `fetchStripeStatus()`.

**Render structure (5 sections):**

Each section uses a `SectionHeader` pattern:
```tsx
<div className="flex items-center gap-2 mb-4">
  <div className="w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />
  <span className="text-[11px] font-bold tracking-[2px] uppercase text-muted-foreground">{label}</span>
</div>
```

Each card uses:
```tsx
<div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
```

**Section 1 — SUBSCRIPTION:** Current plan name + renewal date + feature grid + "Upgrade plan" button. Feature grid is two columns on desktop, one on mobile. Each feature: green check or red X + label. Status badge for trialing/canceling/past_due. The "Upgrade plan" button toggles `showPlans` state.

**Section 2 — CREDITS:** "Monthly credits left" label, large balance/cap numbers, progress bar. Color: accent (primary) when <75% used, amber when >=75%, red when >=90%. Uses `percentUsed` from `useCredits` but inverts the bar width to show *remaining* (like Higgsfield). Below: collapsible credit costs using `<details>`.

**Section 3 — CHANNEL SCRAPES:** Same pattern as credits but blue accent. Uses `scrapePercentUsed` from `useCredits`.

**Section 4 — CHANGE PLAN:** Conditionally rendered when `showPlans` is true. Three plan cards in a grid. Current plan has accent border. Clicking a non-current plan calls `handleManageSubscription` (redirects to Stripe Portal where user can change plan).

**Section 5 — MANAGE:** Card with "Manage Subscription" + "Payment methods, invoices, cancellation" + "Manage" button → Stripe Portal.

**Admin view:** Simplified — show SUBSCRIPTION section with "Unlimited" as plan name, all features checked, no other sections.

**Full JSX structure:**

```tsx
return (
  <div className="max-w-[800px] mx-auto px-4 py-8 space-y-8">
    {/* Section 1: SUBSCRIPTION */}
    {/* Section 2: CREDITS */}
    {/* Section 3: CHANNEL SCRAPES */}
    {/* Section 4: CHANGE PLAN (conditional) */}
    {/* Section 5: MANAGE */}
  </div>
);
```

- [ ] **Step 2: Verify build compiles**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep -i "subscription\|error"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Subscription.tsx
git commit -m "feat: redesign Subscription page — Higgsfield-inspired lean layout with 5 sections"
```

---

### Task 3: Build and deploy to VPS

**Files:** None (deployment only)

- [ ] **Step 1: Build frontend**

```bash
npm run build
```

Expected: builds successfully with no errors.

- [ ] **Step 2: SCP to VPS**

```bash
expect -c '
spawn scp -r dist root@72.62.200.145:/var/www/connectacreators/
expect { "password:" { send "Loqueveoloveo290802#\r"; exp_continue } eof }
'
```

- [ ] **Step 3: Reload nginx**

```bash
expect -c '
spawn ssh root@72.62.200.145 "nginx -s reload"
expect { "password:" { send "Loqueveoloveo290802#\r"; exp_continue } eof }
'
```

- [ ] **Step 4: Verify live site**

Open `https://connectacreators.com/subscription` and verify:
- 5-section layout renders correctly
- Credits and scrapes show correct values from DB
- "Upgrade plan" toggles plan cards
- Clicking a plan redirects to Stripe Portal
- "Manage" button opens Stripe Portal
- Admin view shows unlimited badge
