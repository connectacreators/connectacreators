# Subscription Page Redesign — Design Spec

## Context

The current Subscription page (`src/pages/Subscription.tsx`, 780 lines) is feature-rich but cluttered. The user wants a lean, Higgsfield-inspired redesign with:
- Clean dark sections with colored dot headers
- Upgrade/downgrade routed through Stripe Billing Portal for confirmation
- Scrape limits bumped +50% (rounded): 8, 15, 25
- Invoices, payment methods, and cancellation handled by Stripe Portal instead of on-page

## Design

### Page Layout

Single-column content area within the existing app sidebar. Five stacked sections, each with a colored dot + uppercase label header and dark card containers (`#1a1a1a` bg, `#2a2a2a` border, 12px radius).

### Section 1: SUBSCRIPTION (green dot)

- **Plan name** (large, bold) + **"Upgrade plan"** button (accent color, top-right)
- Renewal date: "Your plan renews [date]"
- Two-column feature grid with green checkmarks (included) and red X marks (not included)
- Features: credits/mo, scrapes, scripts, AI Canvas, Lead Tracker (with lead limit), landing pages, Vault templates, unlimited leads & scripts (enterprise only)
- Status badge below plan name for non-standard states (trialing, canceling, past_due)
- Admin users: show "Unlimited" plan with all features checked

### Section 2: CREDITS (green dot)

- Label: "Monthly credits left"
- Large number: **balance / cap** with accent-colored progress bar
- Bar color shifts based on % used: accent when <75% used, amber when >=75% used, red when >=90% used
- Collapsible "Credit costs reference" accordion below (transcribe: 150, script: 50, refine: 25, templatize: 50, hooks/CTAs: 25, canvas: 50)

### Section 3: CHANNEL SCRAPES (blue dot)

- Label: "Scrapes used this cycle"
- Large number: **used / limit** with blue progress bar
- Same color shift rules as credits

### Section 4: CHANGE PLAN (amber dot, hidden by default)

- Revealed when user clicks "Upgrade plan" button (smooth slide-down animation)
- Three plan cards side by side (responsive: stack on mobile):
  - **Starter**: $39/mo, 10,000 credits, 8 scrapes, 75 scripts
  - **Growth**: $79/mo, 30,000 credits, 15 scrapes, 200 scripts
  - **Enterprise**: $139/mo, 75,000 credits, 25 scrapes, 500 scripts
- Current plan: accent border + "Current" badge + "Your Plan" disabled button
- Higher plans: "Upgrade" badge (green) + accent-bordered select button
- Lower plans: "Downgrade" badge (amber) + outline select button
- **On plan selection**: redirect to Stripe Billing Portal via `window.location.href` (same-tab, not new tab) using existing `stripe-billing-portal` edge function with `action: "portal"`. The `change-plan` action in the edge function is kept as-is but no longer called from the frontend — Stripe Portal handles the plan switch and proration preview natively.

### Section 5: MANAGE SUBSCRIPTION (bottom)

- Single card with "Manage Subscription" title + subtitle "Payment methods, invoices, cancellation"
- "Manage" button → opens Stripe Billing Portal session
- Uses existing `stripe-billing-portal` edge function with `action: "portal"`

### Removed Sections

- Invoices list (handled by Stripe Portal)
- Transaction history (not needed for lean design)
- Separate Stripe status card (merged into Section 1)

## Upgrade/Downgrade Flow

1. User clicks "Upgrade plan" → Section 4 slides open showing plan cards
2. User clicks target plan card → frontend calls `stripe-billing-portal` with `action: "portal"`
3. User is redirected to Stripe Billing Portal where they see proration preview, confirm payment
4. Stripe processes the change, fires webhook
5. User clicks "Return to ConnectaCreators" in Stripe → redirected to `/subscription`
6. Page loads fresh data reflecting new plan

## Scrape Limits Update

| Tier | Old | New |
|------|-----|-----|
| Starter | 5 | 8 |
| Growth | 10 | 15 |
| Enterprise | 15 | 25 |

Files to update:
- `supabase/functions/stripe-billing-portal/index.ts` — `PLAN_CONFIG` scrapes values
- `supabase/functions/stripe-webhook/index.ts` — `PLAN_CONFIG` scrapes values
- `supabase/functions/check-subscription/index.ts` — plan config scrapes values
- `src/utils/planLimits.ts` — `PLAN_LIMITS` scrapes values
- `src/pages/Subscription.tsx` — plan display data
## Implementation Notes

- **i18n**: Preserve EN/ES bilingual support via `useLanguage` hook. All new labels ("Monthly credits left", "Scrapes used this cycle", "Credit costs reference", etc.) need both EN and ES translations.
- **Feature grid data source**: Use `planLimits.ts` `PLAN_LIMITS` for lead/script/landing page limits per plan. Credits and scrapes come from the `useCredits` hook / client DB data.
- **Enterprise display name**: Change from "Pro" to "Enterprise" to match plan key naming.
- **Portal navigation**: Use `window.location.href` (same tab) instead of `window.open` (new tab) so the return flow feels seamless.
- **`change-plan` edge function action**: Keep it in `stripe-billing-portal/index.ts` but stop calling it from the frontend. Stripe Portal handles plan changes natively.

## Files to Modify

### Frontend
- `src/pages/Subscription.tsx` — full rewrite of the page layout (remove invoices, transaction history, consolidate into 5 sections)

### Edge Functions (scrape limits only)
- `supabase/functions/stripe-billing-portal/index.ts` — update scrapes in PLAN_CONFIG
- `supabase/functions/stripe-webhook/index.ts` — update scrapes in PLAN_CONFIG
- `supabase/functions/check-subscription/index.ts` — update scrapes in plan config

### Utility
- `src/utils/planLimits.ts` — update scrapes in PLAN_LIMITS

## Verification

1. Load `/subscription` page — verify 5-section layout renders correctly
2. Check credits and scrapes display matches DB values
3. Click "Upgrade plan" — verify plan cards slide open
4. Click a different plan — verify redirect to Stripe Billing Portal
5. Complete a plan change in Stripe Portal — verify redirect back and page reflects new plan
6. Click "Manage" — verify Stripe Portal opens
7. Verify scrape limits show new values (8/15/25) across all plan cards
8. Test admin view — should show unlimited badge
9. Test mobile responsiveness — plan cards should stack vertically
