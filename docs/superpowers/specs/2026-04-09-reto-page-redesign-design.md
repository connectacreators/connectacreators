# /reto Page Redesign — Design Spec
**Date:** 2026-04-09
**Route:** `/reto` (Spanish, replaces `src/pages/Index.tsx`)

---

## Goal

Replace the current 659-line VSL-heavy landing page with a simple, results-first page modeled after pblaunch.com. No video sales letter. Show client before/afters, Roberto's origin story, packages, and a strong Calendly CTA.

---

## Page Structure (7 sections in order)

### ① HERO
- Dark background (`#080604`)
- Large serif headline (Cormorant Garamond) — bold claim about results
- 1-line subline in Syne
- Single primary CTA button → Calendly (`https://calendly.com/robertogaunaj/demo-presentation`)
- No video, no VSL embed
- Trust micro-copy below button: "✓ Llamada de 15 minutos · ✓ Sin compromiso · ✓ Estrategia personalizada"

### ② TRUST STRIP
- 3 numbers side by side, full width
- **250M+** Views Generated
- **3** Platforms (Instagram, TikTok, YouTube)
- **40K+** Followers Built
- Gold (`#E8B458`) labels, cyan (`#0891B2`) numbers, dark card backgrounds
- Count-up animation on scroll into view

### ③ FEATURED CLIENT — Dr. Calvin
- Large card, full width
- Side-by-side before/after images
  - Before: `src/assets/dr-calvin-new.webp`
  - After: `src/assets/dr-calvin-after.png`
- Stat overlay: **7K → 40K followers**
- 2–3 lines: specialty (chiropractor), what changed, outcome
- Cyan border accent (`#0891B2`)

### ④ CLIENT RESULT — ZiguFit
- Slightly smaller card than Dr. Calvin
- Side-by-side before/after images
  - Before: `src/assets/zigufit-before.png`
  - After: `src/assets/zigufit-after.png`
- Stat: **+1,275% growth**
- 1–2 lines of context
- Gold accent (`#E8B458`)

### ⑤ ORIGIN STORY — Intermountain Immigration
- Positioned as Roberto's credibility/backstory, NOT a client case study
- Copy: "Antes de Connecta, dirigí el contenido de un despacho de abogados de inmigración — Intermountain Immigration — de cero. Así fue como aprendí que cualquier profesional puede construir una audiencia si tiene el sistema correcto."
- Visual: `src/assets/jonathan-instagram.png` + `src/assets/jonathan-tiktok.png` shown as screenshots/proof
- Jonathan Pena named as the attorney; framed as Roberto's origin, not a paid engagement
- Subtle section — muted border, no big stat callout

### ⑥ PACKAGES
- Section headline: "Elige tu punto de entrada"
- 4 cards in a 2×2 grid (desktop) / stacked (mobile)
- **Tier 1 — Content System · $1,500/mo**
  - 20 scripts/mo, 20 edits, ManyChat setup, filming direction notes
- **Tier 2 — Done-For-You Content · $2,500/mo**
  - Everything in Tier 1 + on-site filming, weekly/bi-weekly shoot days, priority editing
- **Tier 3 — Full Brand & Growth · $3,500/mo + $1,000 min. ad spend** ⭐ MOST POPULAR
  - Everything in Tier 2 + Meta ads strategy/copy/management, monthly report, brand positioning
  - Highlighted with cyan border and "Most Popular" badge
- **Tier 4 — Ads Management Only · $800/mo + $1,000 min. ad spend**
  - Meta ad copy + creative direction, campaign setup, monthly reporting, no content production
- Each card: tier name, price, bullet list of 3–4 features
- CTA on Tier 3 card: "Agendar llamada" → Calendly

### ⑦ FINAL CTA
- Repeated Calendly button, larger
- Headline: strong closing line
- Trust bullets beneath: "✓ Llamada de 15 minutos · ✓ Sin compromiso · ✓ Estrategia personalizada"
- Gradient background (cyan → gold)

---

## Design System

| Token | Value |
|-------|-------|
| Background | `#080604` |
| Text | `#F0EAD8` |
| Cyan accent | `#0891B2` |
| Gold accent | `#E8B458` |
| Muted text | `#8A7E6A` |
| Heading font | Cormorant Garamond (serif) |
| Body/UI font | Syne (sans-serif) |

- Framer Motion `fadeUp` scroll animations (same as current page)
- Responsive: single column mobile, max-width 1100px desktop
- All section padding via existing `.sec-inner` pattern

---

## Assets

| Asset | Path | Used in |
|-------|------|---------|
| Dr. Calvin before | `src/assets/dr-calvin-new.webp` | Section ③ |
| Dr. Calvin after | `src/assets/dr-calvin-after.png` | Section ③ |
| ZiguFit before | `src/assets/zigufit-before.png` | Section ④ |
| ZiguFit after | `src/assets/zigufit-after.png` | Section ④ |
| Jonathan Instagram | `src/assets/jonathan-instagram.png` | Section ⑤ |
| Jonathan TikTok | `src/assets/jonathan-tiktok.png` | Section ⑤ |

---

## What Gets Removed

The current `src/pages/Index.tsx` has these sections that are **cut entirely**:
- VSL video player (Vimeo embed)
- Founder bio section (Roberto portrait + signature)
- Services 6-card grid
- 5-step Method section
- Platform stats section (Instagram/TikTok/YouTube counters)
- "Why Connecta" differentiators
- "For Who" ideal client profiles

The new page reuses only: color tokens, fonts, `fadeUp` animation variant, and the Calendly link.

---

## Calendly Link
`https://calendly.com/robertogaunaj/demo-presentation`

---

## File to Replace
`src/pages/Index.tsx` — full rewrite, same export name `Index` and same route `/reto`.
`IndexEN.tsx` is out of scope for this redesign.
