# Landing Page Conversion Upgrade — Design Spec
**Date:** 2026-04-09
**Approach:** Incremental upgrade (keep current `PublicLandingPage.tsx` + `LandingPageBuilder.tsx` architecture)
**Goal:** Maximize booking conversions through copy, trust signals, typography, and a sticky mobile CTA.

---

## 1. Summary of Changes

| Area | What Changes |
|---|---|
| **Copy** | Headline template picker + CTA button dropdown in builder |
| **Trust Strip** | 3 stats displayed below headline |
| **Font Picker** | 4 font options in builder; applied to entire public page |
| **Hero Image** | Optional full-width hero image behind headline |
| **Sticky Mobile CTA** | Full-width button pinned to bottom of viewport on mobile |
| **FB Pixel** | Per-client pixel ID field in builder → injected on public page |

No DB schema changes are strictly required if we serialize new fields into existing `JSONB` columns, but clean columns are preferred. See Section 6.

---

## 2. Copy Framework

### 2a. Headline Template Picker (Builder — "CTA Text" tab)

Replace the plain `hero_headline` text input with:
- A **template dropdown** above the text field with 5 options + "Custom"
- Selecting a template pre-fills the text field with the formula
- Client then edits the pre-filled text to match their business

**Templates:**

| # | Name | Formula | Example |
|---|---|---|---|
| 1 | Outcome-Focused | `Get [Result] in [Timeframe]` | "Get Your Dream Smile in Just 2 Visits" |
| 2 | Loss-Aversion | `Stop [Pain]. Start [Outcome].` | "Stop Hiding Your Smile. Start Living Confidently." |
| 3 | Social Proof | `Trusted by [X]+ [Clients]` | "Trusted by 2,000+ Families Since 2005" |
| 4 | Question Hook | `Ready to [Achieve Goal]?` | "Ready to Transform Your Business?" |
| 5 | Direct Value | `[Adjective] [Service] for [Audience]` | "Premium Legal Counsel for Growing Businesses" |
| 6 | Custom | *(empty, write freely)* | — |

**Implementation:** A `<select>` dropdown above the headline `<Input>`. On selection, sets `page.hero_headline` to the formula string so the client can fill in the brackets. Selecting "Custom" clears the field.

### 2b. CTA Button Copy Dropdown (Builder — "CTA Text" tab)

Replace the plain `cta_button_text` input with:
- A **dropdown** of proven CTAs + "Custom" option
- If "Custom" selected, show a text input below

**Options:**

```
Book My Free Consultation  ← default recommendation
Reserve My Spot
Get My Free Assessment
Claim My Appointment
Start My Transformation
Schedule a Call
Get Started Today
[Custom…]
```

**Why:** First-person + benefit-driven CTAs ("My") convert measurably better than "Book Now" or "Submit". The dropdown guides clients without requiring copywriting knowledge.

---

## 3. Trust Strip

**What:** 3 small stat badges displayed directly below the hero subheadline, above the calendar.

**Layout:**

```
[ 4.9 ⭐ ]  |  [ 2,000+ ]  |  [ 15+ ]
Google Rating    Happy Clients    Years Exp
```

**Builder fields (CTA Text tab):**
- `trust_stat_1_number` — e.g. "4.9 ⭐" or "2,000+"
- `trust_stat_1_label` — e.g. "Google Rating"
- `trust_stat_2_number`, `trust_stat_2_label`
- `trust_stat_3_number`, `trust_stat_3_label`

**Public page:** Rendered as a flex row (centered, wraps on narrow screens). Only shown if at least one stat is filled. Uses `safeAccent` color for the numbers.

---

## 4. Font Picker

**What:** A single font choice applied to the entire public page (`fontFamily` CSS on the root `<div>`).

**Options (4):**

| Name | CSS Value | Feel |
|---|---|---|
| **Clean & Modern** *(default)* | `'Inter', sans-serif` | Professional, SaaS-like |
| **Trustworthy & Warm** | `'Lato', sans-serif` | Healthcare, services |
| **Premium & Elegant** | `'Playfair Display', serif` | Luxury, beauty, legal |
| **Bold & Direct** | `'Oswald', sans-serif` | Fitness, automotive, bold brands |

**Implementation:**
- Builder "Branding" tab: 4 clickable font cards showing sample text in each font
- Load fonts via Google Fonts `<link>` tag in `<head>` of `PublicLandingPage` (load all 4 lazily, apply selected)
- New field: `font_family` (string, one of the 4 CSS values above, default `'Inter', sans-serif`)

---

## 5. Hero Image

**What:** Optional full-width image displayed as the hero background behind the headline + subheadline.

**Layout behavior:**
- If `hero_image_url` is set: hero section becomes a relative-positioned container with the image as `background-image` (cover, center). Overlay: `rgba(0,0,0,0.45)` so text stays readable regardless of image.
- Text colors in hero section flip to white when image is active (ignores `bgIsLight` logic for hero only).
- If no image: existing behavior (plain background color).

**Builder:** Upload button in "Branding" tab (same pattern as existing logo upload via Supabase storage). New field: `hero_image_url`.

**Note:** This is the hero background only — not a split layout. The three hero layout variants (image/video/split) discussed in brainstorm are scoped to a future iteration; for this build we do hero background image only.

---

## 6. Sticky Mobile CTA

**What:** A full-width button pinned to the bottom of the viewport on mobile (hidden on desktop ≥768px). Scrolls the page to the booking section when tapped.

**Behavior:**
- Appears immediately on page load
- Text = `page.cta_button_text` (same as inline CTA)
- Color = `safeAccent` background, contrasting text
- On tap: `document.getElementById('booking-section').scrollIntoView({ behavior: 'smooth' })`
- Add `id="booking-section"` to the booking `<div>`

**Builder toggle:** "Booking" tab — `show_sticky_cta` boolean (default `true`).

---

## 7. Facebook Pixel

**Current state:** Pixel IDs are hardcoded in a `DOMAIN_PIXELS` record in `PublicLandingPage.tsx` (line 176). This is unscalable — adding a new client requires a code deploy.

**New behavior:**
- Add `fb_pixel_id` field to `landing_pages` table (nullable string)
- Builder: "SEO" tab — add a labeled input "Facebook Pixel ID" with helper text "Paste your Pixel ID (numbers only, e.g. 942091105339252)"
- `PublicLandingPage`: replace the hardcoded `DOMAIN_PIXELS` lookup with `page.fb_pixel_id` — inject pixel script when the field is set
- Keep the existing hardcoded entry for `saratogachiropracticutah.store` as a fallback until that client's page is updated through the builder

---

## 9. DB Migration

New columns on `landing_pages`:

```sql
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS hero_image_url    text,
  ADD COLUMN IF NOT EXISTS font_family       text DEFAULT 'Inter, sans-serif',
  ADD COLUMN IF NOT EXISTS fb_pixel_id       text,
  ADD COLUMN IF NOT EXISTS show_sticky_cta   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS trust_stat_1_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_1_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_2_label  text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_number text,
  ADD COLUMN IF NOT EXISTS trust_stat_3_label  text;
```

---

## 10. Files Changed

| File | Change |
|---|---|
| `src/pages/PublicLandingPage.tsx` | Font loading, hero image overlay, trust strip, sticky CTA, WhatsApp button, dynamic FB Pixel |
| `src/pages/LandingPageBuilder.tsx` | Headline template picker, CTA dropdown, font picker, hero image upload, trust strip fields, FB Pixel field, WhatsApp field, sticky CTA toggle |
| `supabase/migrations/20260409_landing_page_conversion.sql` | New columns (Section 9) |

**Not changed:** routing, auth, supabase client, any other page.

---

## 11. Out of Scope (Future)

- Split / video hero layout variants
- Section drag-reorder
- Before/After image slider
- Urgency countdown timer
- Google Analytics / GA4 tracking
