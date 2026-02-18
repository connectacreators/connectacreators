

# Native Checkout Page with Embedded Stripe Payment

## Overview
Replace the current flow that redirects users to Stripe's hosted checkout page with a custom, in-app checkout experience. Users will see their personal and contact information pre-filled (from their account), review their selected plan, and complete payment without leaving the app -- all while Stripe still handles the secure payment processing.

## How It Will Work

1. User selects a plan on `/select-plan`
2. Instead of redirecting to Stripe, they go to a new `/checkout` page
3. The checkout page has:
   - **Personal Info section**: First name, last name, email (pre-filled from their account)
   - **Contact Info section**: Phone number, email (no double-typing -- pulled from their profile)
   - **Plan summary**: Shows selected plan name, price, and features
   - **Payment section**: Stripe's Embedded Checkout renders inline (secure card form handled by Stripe)
4. After successful payment, they're taken to `/payment-success` as usual

## User Experience Flow

```text
Select Plan Page --> Checkout Page --> Payment Success
                    +---------------------------+
                    | Personal Info (pre-filled) |
                    | - First Name               |
                    | - Last Name                |
                    | - Email                    |
                    +---------------------------+
                    | Contact Info               |
                    | - Phone Number             |
                    | - Email (same, read-only)  |
                    +---------------------------+
                    | Plan Summary               |
                    | - Plan name & price        |
                    +---------------------------+
                    | [Stripe Embedded Checkout] |
                    | (card form renders here)   |
                    +---------------------------+
```

## Technical Details

### 1. Install Stripe React libraries
- Add `@stripe/stripe-js` and `@stripe/react-stripe-js` as dependencies
- These provide the `EmbeddedCheckoutProvider` and `EmbeddedCheckout` components that render Stripe's secure payment form inline

### 2. Update the edge function (`create-checkout`)
- Modify the existing `create-checkout` edge function to return a `client_secret` instead of a `url`
- Set `ui_mode: "embedded"` on the Stripe Checkout Session so it works with the embedded component
- Set a `return_url` instead of `success_url`/`cancel_url`
- Accept optional `phone` parameter to store on the Stripe customer

### 3. Create a new `/checkout` page (`src/pages/Checkout.tsx`)
- Accepts the selected plan via URL query param (e.g., `/checkout?plan=starter`)
- Fetches user profile data to pre-fill name, email, and phone
- Displays a form with personal info and contact info sections (pre-filled, editable)
- On "Continue to Payment", calls the updated `create-checkout` edge function
- Renders Stripe's `EmbeddedCheckout` component inline with the returned client secret
- The Stripe form handles card input, validation, and 3D Secure -- all within the page

### 4. Update `SelectPlan.tsx`
- Change the Stripe plan buttons to navigate to `/checkout?plan=starter` (etc.) instead of calling the edge function directly
- Non-Stripe plans (Connecta DFY, Connecta Plus) continue redirecting to `/coming-soon`

### 5. Add route in `App.tsx`
- Register `/checkout` route pointing to the new `Checkout` page

### 6. Profile data
- The checkout page will query the `clients` table and `profiles` table to get the user's name and email
- If any info is missing, the user can fill it in manually
- Phone number will be saved to the client record for future use

### Notes
- Stripe's embedded checkout is fully PCI-compliant -- card data never touches your server
- PayPal button: Stripe Checkout supports PayPal as a payment method if enabled in your Stripe dashboard. The "Continue with PayPal" option would appear automatically within Stripe's embedded form if you enable it in Stripe settings. No custom code needed for that.
- The personal info form is purely for your records and display -- Stripe handles the actual payment security

