# Saratoga Chiropractic — Cash Special Landing Page Redesign

**Date:** 2026-04-27
**Client:** Saratoga Chiropractic (Saratoga Springs, UT)
**Domain:** saratogachiropracticutah.store
**Goal:** Replace the current slow, generic landing page with a high-conversion, message-matched cash-special funnel modeled on foundationchiroclinic.com's value-stack hero formula, while leveraging the existing `PublicLandingPage` infrastructure.

---

## 1. Context & strategy

The clinic runs two distinct paid-ad funnels with different intents and offers:

- **Cash special funnel** (this spec) — `saratogachiropracticutah.store` — targets cold/wellness traffic shopping for a deal. Offer: $75 first visit (consult + exam + digital X-rays + first adjustment), $50 follow-ups.
- **Auto-injury funnel** (out of scope; future spec) — `saratogachiropracticutah.com` — targets auto-accident victims with $0-out-of-pocket PIP-billed care.

Two separate pages, not one branching page, was chosen for message-match optimization: an auto-accident victim landing on a "$75 special" page bounces, and a wellness shopper landing on an "auto injury" page bounces. (This decision is the user's "B" choice in the brainstorm.)

This spec covers only the cash special page. The auto-injury page redesign will reuse this structure with different content in a follow-up spec.

## 2. The offer

| Element | Value |
|---|---|
| Headline price | **$75** new-patient first visit |
| Anchor / regular price | **$249** (Utah/regional first-visit cash benchmark for consult + exam + X-ray + adjustment, sourced from 2026 chiro pricing data) |
| Savings claim | **70% off** |
| Includes | Initial consultation · Posture & orthopedic exam · Digital X-rays (if needed) · First chiropractic adjustment |
| Follow-up rate | **$50** per visit (mentioned in pricing transparency block, not in hero) |
| Audience | New patients (cash pay; no insurance required) |

## 3. Hero design

**Approved variant: A (price-led).** Mirrors foundationchiroclinic.com's exact formula.

```
[Yellow/amber strip] ⚡ NEW PATIENT SPECIAL · LIMITED TIME

Get Out of Pain for $75.

Full consult, exam, digital X-rays, and your first
chiropractic adjustment — at our Saratoga Springs clinic.
Save 70% off the $249 regular price.

[Green-bordered value stack:]
YOUR $75 INCLUDES:
✓ Initial Consultation     ✓ Posture & Orthopedic Exam
✓ Digital X-rays (if needed)  ✓ First Adjustment

[Yellow primary CTA]  Claim My $75 Visit →

⭐ 20+ years experience · Se habla español · Same-day appts
```

CTA scrolls to the calendar section (#3) on click.

## 4. Page section order

All sections map to existing columns in the `landing_pages` table. No schema changes required, except a small layout-control change in `PublicLandingPage.tsx` to move the booking section earlier on this page (see §6).

| # | Section | Backing field(s) |
|---|---|---|
| 1 | Hero — $75 offer, value stack, CTA | `hero_headline`, `hero_subheadline`, `cta_button_text` |
| 2 | Trust strip — 3 stats: 20+ years · 2 doctors · ★5.0 | `trust_stat_1/2/3_number/label` |
| 3 | **Calendar (native connectacreators booking iframe)** | `show_booking = true`, `booking_type = "calendar"` |
| 4 | "What's included" — 4-card value stack | `services[]` (4 items) |
| 5 | Video gallery — existing 4 clips at `/saratoga/clip-N.jpg` | Hostname-gated, already implemented |
| 6 | Meet the doctors — Bell + Davis bios + headshots | `about_section_title`, `about_us_text`, `about_photo_1/2_url` |
| 7 | Testimonials — 3-5 Google review quotes | `testimonials[]` |
| 8 | Contact — address, map, hours, click-to-call phone | `contact_address`, `contact_hours`, `contact_phone`, `map_embed_url` |
| + | Sticky mobile CTA bar — Call + Book buttons | `show_sticky_cta = true` |

## 5. Content (English)

### Hero
- `hero_headline`: "Get Out of Pain for $75."
- `hero_subheadline`: "Full consult, exam, digital X-rays, and your first chiropractic adjustment — at our Saratoga Springs clinic. Save 70% off the $249 regular price."
- `cta_button_text`: "Claim My $75 Visit"

### Trust stats
| # | Number | Label |
|---|---|---|
| 1 | 20+ | Years experience |
| 2 | 2 | Doctors on staff |
| 3 | ★ 5.0 | Google rating |

### Services (the value stack — 4 cards)
| Emoji | Title | Description |
|---|---|---|
| 🩺 | Initial Consultation | We listen to your history and pain points before any adjustment. |
| 🏃 | Posture & Orthopedic Exam | Full assessment of mobility, alignment, and trouble spots. |
| 📷 | Digital X-rays | On-site digital imaging if your case calls for it — no extra cost. |
| 🦴 | First Adjustment | Gentle, targeted manual or instrument-assisted adjustment. |

### About / Meet the doctors
- `about_section_title`: "Meet Your Chiropractors"
- `about_us_text`: "Our team brings 20+ years of combined chiropractic experience to Saratoga Springs. Dr. Jaromy Bell, DC, MS — Logan College, with a Master's in Sports Medicine and Rehabilitation, specializing in sports injuries, TMJ, and pediatric care. Dr. Jared Davis, DC — Logan University, 15+ years in practice, with deep expertise in soft-tissue work and headache treatment. Both doctors take the time to understand your case before recommending care. Se habla español."
- `about_photo_1_url`: doctor headshot — Dr. Bell *(asset needed)*
- `about_photo_2_url`: doctor headshot — Dr. Davis *(asset needed)*

### Testimonials (3 to start; pull real quotes from Google reviews; replace placeholders below with verbatim text from the live profile)
| Quote | Author | Rating |
|---|---|---|
| *"Kayleigh at the front desk and Dr. Davis made me feel taken care of from the second I walked in. The adjustment actually worked."* | Verified Google review | 5 |
| *"Dr. Bell explained exactly what was wrong and gave me a plan. I haven't had headaches in months."* | Verified Google review | 5 |
| *"Same-day appointment, friendly staff, and Spanish-speaking — exactly what we needed."* | Verified Google review | 5 |

### Contact
- `contact_phone`: "(385) 287-7762"
- `contact_address`: "1305 N Commerce Dr, Ste 200, Saratoga Springs, UT 84045"
- `contact_hours`: "Mon–Fri 9:30 AM – 6:30 PM · Sat 9:00 AM – 12:00 PM · Sun closed"
- `map_embed_url`: Google Maps embed for the address

### Spanish overrides (`saratogachiropracticutah.store/es`)
Mirror the existing pattern in `LANG_OVERRIDES` ([PublicLandingPage.tsx:84](src/pages/PublicLandingPage.tsx#L84)). Replace the current Spanish content (which is auto-injury) with cash-special equivalents:
- `hero_headline`: "Salga del Dolor por $75."
- `hero_subheadline`: "Consulta completa, examen, radiografías digitales y su primer ajuste — en nuestra clínica de Saratoga Springs. Ahorre 70% del precio normal de $249."
- `cta_button_text`: "Reservar Mi Visita de $75"
- `about_title` / `about_section_title`: "Conozca a Sus Quiroprácticos"
- (Service titles, trust labels, testimonials, etc. — same structure as English, translated.)

> **Open question (low priority):** The current `LANG_OVERRIDES` for `saratogachiropracticutah.store/es` is *auto-injury*. If `/es` is currently driving auto-injury Spanish traffic, we should not overwrite it without first ensuring that Spanish auto-injury speakers can still reach an auto-injury page (probably the `.com/es` subroute). Confirm with the user before deploying.

## 6. Required code changes

The page redesign is content-only **except** for one structural change: moving the booking section earlier in the render order.

### 6.1 Move booking section to position #3 (saratoga-only)

In [PublicLandingPage.tsx](src/pages/PublicLandingPage.tsx), the booking section is currently rendered late in the layout (around line 503). For `saratogachiropracticutah.store` only, render it after the trust-stat strip and before the services/value-stack section.

**Approach:** mirror the existing hostname-gated gallery pattern at [PublicLandingPage.tsx:570](src/pages/PublicLandingPage.tsx#L570). Wrap the booking iframe in a hostname check: `if (hostname === "saratogachiropracticutah.store") render here`. Keep a fallback render at the original position (gated to other hostnames) so we don't break other clients' pages.

Long-term, this should be replaced with a configurable `booking_position` field on the `landing_pages` table (`"early" | "late"`). Out of scope for this spec; flag as tech debt.

### 6.2 No new tables, columns, or migrations

All other content fits the existing schema.

### 6.3 Asset upload

Two new doctor headshots needed in `public/saratoga/`:
- `dr-bell.jpg`
- `dr-davis.jpg`

User to provide. If not provided before deploy, leave `about_photo_1/2_url` empty — the about section degrades gracefully to text-only.

## 7. Tracking

- **Facebook Pixel `942091105339252`** — already wired via `LEGACY_DOMAIN_PIXELS` ([PublicLandingPage.tsx:267](src/pages/PublicLandingPage.tsx#L267)). Confirms `PageView` on load. No change needed.
- **Lead capture** — the native calendar at `connectacreators.com/book/{client_id}` already writes to the `leads` table on booking, which already populates the lead-tracker dashboard. No additional wiring required.
- **Conversion event** — verify the calendar flow fires a `Lead` or `Schedule` Pixel event on successful booking. If not, add it in the booking iframe's success path. (Out of scope for this content spec; flag for follow-up.)

## 8. Speed / mobile mechanics (must-have, non-negotiable for paid traffic)

The current page renders as "Loading…" on initial fetch — likely a JS-heavy SPA without SSR. This must be fixed regardless of content changes.

- **LCP target:** ≤ 2.5s on 4G mobile (Google ad quality threshold)
- **Hero image:** WebP or AVIF, ≤ 100 KB, responsive `<picture>`
- **No carousels above the fold** — render hero statically
- **Sticky CTA bar on mobile** (already supported via `show_sticky_cta`) — Call + Book buttons fixed bottom
- **Click-to-call** on the phone number in hero, sticky bar, and contact section
- **Defer non-critical JS** — calendar iframe should load on intersection, not on initial render

If `PublicLandingPage` itself doesn't currently meet these targets, that's a separate performance spec — not blocked by this content redesign.

## 9. Out of scope

- Auto-injury page redesign (separate follow-up spec)
- New booking-position schema field (tech debt; hostname-gating is sufficient for now)
- A/B testing infrastructure (the `landing_pages` table is one-row-per-client; multi-variant testing would need a separate variant table)
- New form section — calendar is the sole conversion path; no separate "request info" form (reduces decision paths = higher conversion)
- Performance optimization of `PublicLandingPage` itself (separate spec if current LCP fails the 2.5s threshold)

## 10. Success criteria

- All 8 sections render in the order specified above on `saratogachiropracticutah.store`
- Hero displays the approved $75 offer with the 4-item value stack visible without scroll on a 390px-wide viewport (iPhone 12 baseline)
- Calendar renders at section #3, not at the bottom
- Spanish version (`/es`) shows cash-special content, not auto-injury content
- This redesign does not introduce LCP regressions vs the current page; if current Lighthouse mobile perf is below 70 or LCP exceeds 2.5s, that is addressed in a separate performance spec
- FB Pixel `PageView` fires on load; calendar booking writes a row to the `leads` table

## 11. Open questions for user

1. Doctor headshots — can you provide professional photos, or should I use AI-generated/stock placeholders?
2. The `/es` route currently shows auto-injury Spanish content. Should we move that to `saratogachiropracticutah.com/es` before overwriting `.store/es` with cash-special Spanish content?
3. Pulled testimonial quotes are placeholders. Want me to research and pull 3 verbatim Google review quotes, or do you want to hand-pick them?
