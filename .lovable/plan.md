
# Manage Subscription - Stripe Integration

## Overview
Add a "Manage Subscription" section to the dashboard sidebar where clients can view their subscription details, upcoming payments, payment history, and download invoices -- all powered by Stripe.

## What You'll See

- A new **"Manage Subscription"** item in the dashboard sidebar (with a CreditCard icon)
- A dedicated `/subscription` page showing:
  - **Current Plan**: subscription status (active, canceled, past due), next payment date, and amount
  - **Payment History**: a table of all past invoices with date, amount, status, and a download button for each invoice PDF
  - If no subscription is found, a friendly message indicating there's no active subscription

## How It Works (Technical Details)

### 1. Enable Stripe
- We'll use Lovable's native Stripe integration to securely connect your Stripe account

### 2. Store the Stripe-Customer link
- Add a `stripe_customer_id` column to the `clients` table so we can map each client to their Stripe customer
- This is populated when you create subscriptions in Stripe (or can be set manually per client)

### 3. New Edge Function: `get-subscription`
- Receives the authenticated user's request
- Looks up the client's `stripe_customer_id` from the database
- Calls the Stripe API to fetch:
  - Active subscriptions (plan name, amount, next billing date, status)
  - Invoice list (date, amount, status, PDF download URL)
- Returns all data to the frontend

### 4. New Page: `src/pages/Subscription.tsx`
- Shows a card with subscription details (status badge, next payment date, amount)
- Shows a table of past invoices with a "Download" button that opens the Stripe-hosted invoice PDF
- Uses the same sidebar layout as the rest of the dashboard
- Bilingual support (EN/ES) via the existing translation system

### 5. Dashboard & Routing Updates
- Add "Manage Subscription" to the sidebar nav items in `Dashboard.tsx` (using `CreditCard` icon from lucide)
- Add the `/subscription` route in `App.tsx`
- Add translations for the new section in `src/i18n/translations.ts`

## Steps (in order)
1. Enable Stripe integration
2. Run a migration to add `stripe_customer_id` to `clients`
3. Create the `get-subscription` edge function
4. Create the `Subscription.tsx` page component
5. Update `Dashboard.tsx` sidebar with the new nav item
6. Update `App.tsx` with the new route
7. Add translation strings
