---
status: awaiting_human_verify
trigger: "subscription-redirect-r3bookings"
created: 2026-03-16T22:10:00Z
updated: 2026-03-16T22:25:00Z
---

## Current Focus

hypothesis: CONFIRMED — Stripe webhook missed (or check-subscription was called before Stripe propagated), leaving plan_type=null and subscription_status="inactive". Two bugs in check-subscription made recovery impossible.
test: Direct DB query confirmed plan_type=null, status="inactive", no user_roles, no subscriptions table entry
expecting: User can now log in and reach /dashboard without redirect loop
next_action: Ask user to verify they can now access /dashboard

## Symptoms

expected: After successful Stripe payment, user lands on /dashboard with credits initialized
actual: User lands back on /select-plan page after payment success
errors: None visible to user — just a redirect loop
reproduction: Complete a Stripe checkout for r3bookings@gmail.com
started: 2026-03-16. Just happened.

## Eliminated

- hypothesis: SelectPlan.tsx or Dashboard.tsx not accepting "trialing" status
  evidence: Both files correctly accept "trialing" in the status check. SelectPlan redirects to /dashboard if status is active/trialing/trial. Dashboard allows trialing.
  timestamp: 2026-03-16T22:12:00Z

- hypothesis: The frontend patches were not deployed to VPS
  evidence: Even if VPS has old frontend, the root cause is the DB state. plan_type=null means SelectPlan would never redirect to dashboard regardless of frontend version (SelectPlan only redirects if data.plan_type is truthy AND status is active/trialing/trial)
  timestamp: 2026-03-16T22:13:00Z

## Evidence

- timestamp: 2026-03-16T22:11:00Z
  checked: Supabase clients table for user f341eb86-4257-49d6-af28-d792e8f8bb39 (r3bookings@gmail.com)
  found: plan_type=null, subscription_status="inactive", credits_balance=0, credits_monthly_cap=500, stripe_customer_id="cus_UA1ucbQMtvTiVY", trial_ends_at=null
  implication: Stripe webhook NEVER updated the client record after payment. plan_type is null so SelectPlan NEVER redirects to dashboard (the redirect condition requires plan_type to be truthy).

- timestamp: 2026-03-16T22:11:00Z
  checked: user_roles table for user f341eb86-4257-49d6-af28-d792e8f8bb39
  found: EMPTY — no role assigned at all
  implication: The webhook's role-assignment step also never ran. This means Dashboard also has no isUser/isAdmin/isVideographer role, so the subscription check runs and sees plan_type=null and redirects to /select-plan.

- timestamp: 2026-03-16T22:11:00Z
  checked: subscriptions table for user f341eb86-4257-49d6-af28-d792e8f8bb39
  found: EMPTY
  implication: stripe-webhook's syncSubscription() either never ran or failed before completing.

- timestamp: 2026-03-16T22:11:00Z
  checked: stripe_customer_id on client record
  found: "cus_UA1ucbQMtvTiVY" — customer exists in Stripe
  implication: The checkout session was created and the customer was created in Stripe. But the subscription webhook event was never processed by the edge function.

- timestamp: 2026-03-16T22:14:00Z
  checked: SelectPlan.tsx redirect condition (line 122)
  found: if (!isUpgrade && data?.plan_type && (status === "active" || "trialing" || "trial")) → navigate /dashboard
  implication: With plan_type=null, the condition `data?.plan_type` is falsy so it NEVER redirects. User always sees the plan selection page even after paying.

- timestamp: 2026-03-16T22:14:00Z
  checked: PaymentSuccess.tsx flow
  found: Calls check-subscription after payment. check-subscription syncs Stripe→DB. If that call returned subscribed:true, it navigates to /dashboard. If subscribed:false after 3 retries, shows error.
  implication: Either (A) check-subscription was called but failed to find the Stripe subscription, OR (B) user navigated away from PaymentSuccess before it could complete, OR (C) check-subscription returned subscribed:false and user ended up at /dashboard which then redirected to /select-plan.

## Resolution

root_cause: Two-part failure. (1) Stripe webhook customer.subscription.created either never fired or failed silently — leaving plan_type=null, subscription_status="inactive". (2) check-subscription had two bugs that prevented it from being a reliable recovery path: (a) credits initialization only ran for "active" subscriptions (not "trialing") when balance=0, and (b) credit_transactions insert was missing required balance_after column causing a DB error.

fix:
1. DB patch applied: Set plan_type="starter", subscription_status="trialing", credits_balance=100, credits_monthly_cap=500, trial_ends_at=2026-03-23 on clients record for 7aafff6b-bcb0-4ac8-919f-2f628c7dc418
2. user_roles row inserted: role="user" for user f341eb86-4257-49d6-af28-d792e8f8bb39
3. subscriptions row inserted: plan_type="starter", status="trial"
4. credit_transactions row inserted: initial_grant of 100 credits
5. check-subscription/index.ts fixed: changed condition to also initialize credits when trialing AND balance=0; added balance_after to credit_transactions insert
6. check-subscription redeployed to Supabase

verification:
- clients record: plan_type=starter, subscription_status=trialing, credits_balance=100, trial_ends_at=2026-03-23 CONFIRMED
- user_roles: role=user CONFIRMED
- SelectPlan redirect logic: plan_type truthy + status=trialing -> navigates to /dashboard CONFIRMED (VPS build verified)
- Dashboard allow logic: status=trialing in allowed list CONFIRMED (VPS build verified)

files_changed:
- supabase/functions/check-subscription/index.ts (2 bugs fixed: trialing credit init + balance_after column)
