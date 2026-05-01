# Subscription Signup Wizard — Design Spec

## Problem

The current signup flow is disconnected: users sign up (email/Google), land on a free-tier dashboard with 250 credits, and may or may not discover the upgrade path later. There is no commitment gate — users get access without selecting a plan or entering payment info. This leads to low conversion from free to paid.

## Goal

Replace the signup flow with a **3-step registration wizard** that requires every new user to select a paid plan (Starter/Growth/Pro) and enter payment info before accessing the app. All plans include a 7-day free trial with 250 credits. Stripe auto-charges after the trial ends. The free tier is removed.

---

## User Flow

```
Landing Page → "Sign Up" → /signup

Step 1: Your Info
  - Full name, email, password, phone (optional)
  - OR "Sign up with Google" button
  - Creates Supabase auth account
  - → Next: Choose Plan

Step 2: Choose Plan
  - 3 plan cards: Starter ($39), Growth ($79), Pro ($139)
  - Each shows: credits/mo, channel scrapes, script limit
  - "POPULAR" badge on Growth
  - Trial banner: "7-day free trial · 250 credits · Cancel anytime"
  - → Next: Payment

Step 3: Payment
  - Order summary: selected plan, price, "$0.00 today", first charge date
  - Stripe Embedded Checkout (card form rendered inline via Stripe SDK)
  - "Start Free Trial →" button
  - Stripe creates subscription with trial_period_days: 7

→ Redirect to /payment-success → polls DB → webhook fires → /dashboard
```

## Architecture

### New file
- **`src/pages/Signup.tsx`** — 3-step wizard page. Manages wizard state (step, form data, selected plan). Each step is a section within the component, toggled by step state.

### Modified files
- **`src/App.tsx`** — Add `/signup` public route
- **`src/components/ScriptsLogin.tsx`** — Remove signup form (keep sign-in only). Add "Don't have an account? Sign up" link pointing to `/signup`
- **`supabase/functions/create-checkout/index.ts`** — Add `subscription_data.trial_period_days: 7` and `payment_method_collection: "always"` to Stripe checkout session creation
- **`supabase/functions/stripe-webhook/index.ts`** — When `subscription.status === "trialing"`, grant 250 credits (not full plan credits). On first `invoice.payment_succeeded` after trial, grant full plan credits. Use `subscription_status` column (not `credits_monthly_cap`) for trial detection.
- **`supabase/functions/check-subscription/index.ts`** — When subscription status is `trialing`, preserve `credits_monthly_cap: 250` and `credits_balance` (do not overwrite with full plan values)
- **`src/hooks/useSubscriptionGuard.ts`** — Remove auto-create free tier logic. If user has no client record/subscription, redirect to `/signup` (Step 2 if already authenticated, Step 1 if not)
- **Landing pages** (`src/pages/Home.tsx`, `src/pages/IndexEN.tsx`, etc.) — Change "Get Started" / "Sign Up" button hrefs from `/dashboard` to `/signup`

### Untouched files
- `src/pages/SelectPlan.tsx` — Still used for plan upgrades from existing subscriptions
- `src/pages/PaymentSuccess.tsx` — Still the redirect target after Stripe checkout
- `src/pages/Subscription.tsx` — Subscription management stays as-is
- `src/pages/Checkout.tsx` — Kept for backwards compatibility but new users use the wizard

---

## Wizard Component Design (`Signup.tsx`)

### State
```typescript
interface WizardState {
  step: 1 | 2 | 3;
  fullName: string;
  email: string;
  password: string;
  phone: string;
  selectedPlan: "starter" | "growth" | "enterprise" | null;
  stripeClientSecret: string | null;
  loading: boolean;
  error: string | null;
}
```

### Step 1: Your Info
- Form fields: full name (required), email (required), password (required), phone (optional)
- "Sign up with Google" button — uses existing `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/signup" } })`
- On submit: calls `signUpWithEmail(email, password, fullName)` from `AuthContext`
- **Email confirmation**: Supabase email confirmation must be disabled (or set to "Confirm email" = off in Auth settings) so signup creates an active session immediately. If confirmation is enabled, users would be blocked at Step 1 waiting for email verification.
- On success: auto-signs in, creates a minimal client record in `clients` table (`user_id`, `name`, `email`, `plan_type: null`, `subscription_status: null`), advances to Step 2
- On Google OAuth return: wizard detects authenticated user via `useAuth()`, creates client record if needed, auto-advances to Step 2
- If user already has auth + client record with `subscription_status: null` (abandoned previous attempt), wizard detects this and skips to Step 2
- "Already have an account? Sign in" link → navigates to `/scripts` (login page)

### Step 2: Choose Plan
- 3 plan cards with radio-style selection (one active at a time)
- Plan data (hardcoded, matching existing `SelectPlan.tsx` values):
  - Starter: $39/mo, 10,000 credits, 5 channel scrapes, 75 scripts
  - Growth: $79/mo, 30,000 credits, 10 channel scrapes, 200 scripts (POPULAR badge)
  - Pro: $139/mo, 75,000 credits, 15 channel scrapes, 500 scripts
- Trial banner below cards
- "Back" button returns to Step 1
- "Next: Payment →" button (disabled until plan selected) advances to Step 3

### Step 3: Payment
- Order summary box showing: plan name, price/mo, "7-day free trial", "Today's charge: $0.00", "First charge: {date 7 days from now}"
- Calls `create-checkout` edge function to get Stripe `client_secret`
- Renders Stripe `EmbeddedCheckout` component (from `@stripe/react-stripe-js`)
- On Stripe completion: redirects to `/payment-success?session_id={id}`
- "Back" button returns to Step 2

### Progress Bar
- 3 circles connected by lines at the top
- Completed steps: green circle with checkmark
- Current step: green circle with number
- Future steps: gray circle with number

---

## Stripe Changes

### `create-checkout` edge function
Add to the Stripe checkout session creation:
```typescript
subscription_data: {
  trial_period_days: 7,
},
payment_method_collection: "always",  // card collected upfront during trial
```

This creates a subscription in `trialing` state. Card is collected upfront. When the trial ends, Stripe automatically charges the card. If payment fails, Stripe's default dunning behavior applies (retries, then cancels).

### `stripe-webhook` edge function
**On `customer.subscription.created` with status `trialing`:**
Modify the existing `syncSubscription` function: when `subscription.status === "trialing"` and `isNew === true`, override the credit grant to use trial values instead of full plan credits:
- Set `credits_balance: 250` (not `planCfg.credits_monthly_cap`)
- Set `credits_monthly_cap: 250` (trial cap)
- Set `subscription_status: "trialing"`
- Set `trial_ends_at` from `subscription.trial_end`
- All other fields (plan_type, stripe_customer_id, channel_scrapes_limit, script_limit) sync normally from `planCfg`
- Log `credit_transactions` with action `"trial_grant"`

**On `invoice.payment_succeeded` — modify the existing `billing_reason` filter:**
The current code skips invoices where `billing_reason !== "subscription_cycle"`. Change this to also allow `"subscription_create"` (which is the billing_reason Stripe sends for the first charge after a trial ends). Updated filter:
```typescript
if (billing_reason !== "subscription_cycle" && billing_reason !== "subscription_create") {
  // skip non-cycle, non-first-charge invoices
}
```

**First post-trial charge (detect by checking `subscription_status === "trialing"` in DB, NOT `credits_monthly_cap`):**
- Set `credits_balance` to full plan amount (10k/30k/75k based on plan_type)
- Set `credits_monthly_cap` to full plan amount
- Set `credits_used: 0`
- Set `subscription_status: "active"`
- Log `credit_transactions` with action `"initial_grant"`

**Regular monthly renewal (`subscription_status === "active"` in DB):**
- Reset `credits_balance` to `credits_monthly_cap` (existing behavior)
- Reset `credits_used: 0`
- Log `credit_transactions` with action `"monthly_reset"`

**Webhook event ordering note:** When a trial ends, Stripe fires both `customer.subscription.updated` (status → active) and `invoice.payment_succeeded` (billing_reason: subscription_create). These may arrive in any order. To prevent races:
- The `customer.subscription.updated` handler (`syncSubscription` with `isNew: false`) must check if `subscription_status === "trialing"` in DB before updating — if trialing, it should set `subscription_status: "active"` but NOT touch `credits_balance` or `credits_monthly_cap` (let `invoice.payment_succeeded` handle the credit grant).
- The `invoice.payment_succeeded` handler detects first post-trial by checking `subscription_status` in DB: if `"trialing"` → grant full credits + set active. If already `"active"` (because `subscription.updated` fired first) → still grant full credits if `credits_monthly_cap === 250` (fallback check).

### `check-subscription` edge function
When the Stripe subscription status is `trialing`, the function must preserve trial credit values:
- Do NOT overwrite `credits_monthly_cap` with the full plan amount
- Do NOT overwrite `credits_balance`
- Do update `subscription_status: "trialing"` and other non-credit fields normally
This prevents page refreshes during the trial from breaking the trial credit limits.

---

## Subscription Guard Changes (`useSubscriptionGuard.ts`)

**Current behavior:** Auto-creates free tier client record if none exists.

**New behavior:**
- If user has no client record OR `subscription_status` is null/empty → redirect to `/signup`
- If user is already authenticated when hitting `/signup`, wizard auto-advances to Step 2
- Remove all free tier auto-creation logic
- Keep the `check-subscription` reconciliation call for existing subscribers

---

## Login Flow Changes (`ScriptsLogin.tsx`)

**Current:** Has both sign-in and sign-up tabs/forms.

**New:**
- Remove the sign-up form entirely
- Keep sign-in form (email/password + Google + password reset)
- Add link at bottom: "Don't have an account? [Sign up](/signup)"
- Existing users sign in → `/dashboard` as before

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User abandons at Step 2/3 (has auth, no subscription) | `useSubscriptionGuard` redirects to `/signup`, wizard detects auth and shows Step 2 |
| User navigates to `/signup` with active subscription | Check on mount → redirect to `/dashboard` |
| Google OAuth callback returns to `/signup` | Wizard detects authenticated user, auto-advances to Step 2 |
| Trial expires, card declines | Stripe fires `customer.subscription.deleted` or `invoice.payment_failed` → webhook updates status → guard redirects to `/select-plan` |
| Existing free tier users | They keep their current access (`subscription_status: "active"`, `plan_type: "free"`). Guard only redirects users with NO client record or `subscription_status` null |
| User has auth + client record with null status | Previous abandoned attempt. Wizard detects existing auth, skips Step 1, shows Step 2 |
| `check-subscription` runs during trial | Preserves `credits_monthly_cap: 250` and `credits_balance` — does not overwrite with full plan values |

---

## Visual Design

- Dark theme matching existing app aesthetic (glassmorphism, `bg-card`, `border-border`)
- Centered card layout, max-width ~480px
- Progress bar with green circles (completed/current) and gray (future)
- Plan cards with border highlight on selection, "POPULAR" badge on Growth
- Stripe Embedded Checkout renders inside a bordered container
- Bilingual support (EN/ES) using existing `useLanguage()` hook

---

## Verification

1. `npm run build` — no TypeScript errors
2. Navigate to `/signup` — wizard renders Step 1
3. Fill form + submit — account created, advances to Step 2
4. Select a plan — advances to Step 3
5. Complete Stripe test payment — redirects to `/payment-success` → `/dashboard`
6. Check DB: client record has `subscription_status: "trialing"`, `credits_balance: 250`, `trial_ends_at` set
7. Sign out → sign in → `/dashboard` works (subscription valid)
8. New user → `/dashboard` without subscription → redirected to `/signup`
9. Google OAuth: click "Sign up with Google" → returns to `/signup` Step 2
10. Existing subscriber → `/signup` → redirected to `/dashboard`
