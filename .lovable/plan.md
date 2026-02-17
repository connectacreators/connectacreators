

# Home Page - Connecta Creators CRM Introduction

## Overview
Create a new public Home page at `/` that introduces the Connecta Creators CRM. The current Dashboard (which includes the login) moves to `/dashboard`. The Home page will showcase CRM features with stock imagery, matching the existing branding (gold/blue theme, Arial font), and have "Registrarte" buttons at top and bottom that link to `/dashboard` (the login page).

## What You'll See

1. **Hero Section**: Full-width header with headline "Connecta con tus clientes mas rapido" (ES) / "Connect with your clients faster" (EN), a subtitle explaining the CRM, and a prominent "Registrarte" / "Sign Up" button. Uses a gradient background matching the existing design system.

2. **Features Section**: 3 cards highlighting the main CRM tools:
   - **Script Builder**: AI-powered script creation
   - **Lead Tracker**: Manage and track your leads
   - **Lead Calendar**: Schedule and organize follow-ups
   Each card uses a Lucide icon and a brief description.

3. **How It Works**: 3-step visual flow (Sign Up -> Set Up Your Clients -> Start Creating) with numbered steps.

4. **Bottom CTA**: Repeated "Registrarte" button with a closing line.

5. **Footer**: Connecta logo, minimal links (Privacy Policy, Terms).

All sections use `framer-motion` fade-in animations on scroll for polish. Stock images will use placeholder gradient backgrounds and icons rather than external URLs, keeping the app self-contained.

## Technical Details

### 1. New Page: `src/pages/Home.tsx`
- Public page, no auth required
- Includes `ThemeToggle` and `LanguageToggle` in top-right corner (same as login page)
- Uses existing components: `Button`, `motion` from framer-motion
- Bilingual via `useLanguage` + `t` / `tr` helpers
- "Registrarte" buttons use `<Link to="/dashboard">` via react-router

### 2. Route Changes in `src/App.tsx`
- `/` -> `Home` (new public intro page)
- `/dashboard` -> `Dashboard` (existing, includes login)
- All sidebar nav links (`/scripts`, `/leads`, etc.) remain unchanged since they already check auth internally

### 3. Update Navigation References
- `DashboardSidebar.tsx`: Update the logo link / home link if it points to `/` to point to `/dashboard`
- Existing links to `/` in sidebar/topbar should go to `/dashboard` instead

### 4. Translations in `src/i18n/translations.ts`
- Add a `home` section with all strings: hero headline, subtitle, feature titles/descriptions, CTA button labels, how-it-works steps

### Files Modified
- `src/pages/Home.tsx` (new)
- `src/App.tsx` (add `/` route, move Dashboard to `/dashboard`)
- `src/i18n/translations.ts` (add home strings)
- `src/components/DashboardSidebar.tsx` (update home link to `/dashboard`)

