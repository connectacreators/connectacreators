# /thank-you Landing Page — Design Spec

**Date:** 2026-06-28
**Status:** Approved, ready for implementation

## Purpose

A post-booking confirmation ("thank you") landing page reached after a prospect
schedules a call. Reassures them the appointment is confirmed, tells them to add
it to their calendar, and points them at a "what to do next" video. Modeled on
the orza.io/thank-you reference supplied by the user.

## Scope

- **In:** Static, public, standalone page at `/thank-you`. Clean light visual
  style (NOT the dark `.landing-editorial` system). Logo, confirmation heading +
  subtext, a video placeholder frame, a row of placeholder testimonials, footer.
- **Out:** Conversion pixels / tracking, reading booking details from the URL,
  the user's "Video Tips" recording checklist (that is direction for filming the
  video, not page content), real testimonial/video content (placeholders only).
- **No emojis anywhere** — plain text only (per user). The success badge is an
  SVG checkmark graphic, not an emoji character.

## Visual style

Clean light / orza-style — distinct from the existing dark editorial landing:

- Background: off-white / soft warm white.
- Text: near-black ink.
- Single accent color for the success badge + CTA touches (green check for the
  confirmation badge; one brand-ish accent for small flourishes).
- Generous whitespace, centered single-column layout, mobile-first.
- Styles scoped under a root class (e.g. `.thank-you-page`) in a dedicated
  `src/pages/thank-you.css` so nothing leaks in/out of the editorial system.
- This is a public/landing surface, so literal hex colors are acceptable here
  (the branding-token rule applies to in-app surfaces, not landing pages).

## Page structure (top → bottom, centered)

1. **Logo** — `@/assets/connecta-logo-hand-ink.png`, centered near the top.
2. **Success badge** — a green circular ✓.
3. **H1** — "Congratulations! Your Appointment Has Been Scheduled & Confirmed…"
4. **Subtext** — confirmation sent via email & text + "please make sure that you
   put this in your calendar right now." then a bold line: "Watch this brief
   video for what to do next." (no emoji).
5. **Video frame** — styled 16:9 placeholder (poster background + centered play
   button). The video source is a single named constant (`VIDEO_URL`) at the top
   of the component, empty by default; when set, render the real `<video>`/embed,
   otherwise show the placeholder. Clearly commented so the URL can be dropped in
   later.
6. **Social proof** — an eyebrow/title "Real clients, real results" above a
   responsive row of 3 placeholder result cards, each with a name + a one-line
   headline result + a short supporting quote. Defined as an editable array at
   the top of the component (mirrors orza's "Robert — $0 to $21.7K in 46 days"
   style, but with placeholder copy).
7. **Footer** — small Connecta wordmark, copyright line, and links to
   `/privacy-policy` and `/terms-and-conditions`.

## Files

- **New:** `src/pages/ThankYou.tsx` — self-contained component.
- **New:** `src/pages/thank-you.css` — scoped light theme for the page.
- **Edit:** `src/App.tsx` — add `const ThankYou = lazy(() => import("./pages/ThankYou"));`
  and `<Route path="/thank-you" element={<ThankYou />} />` in the public routes
  block (next to `/es`).

## Responsive

Mobile-first single column. At wider widths the testimonials become a 3-up row;
on mobile they stack. Heading and video scale down fluidly.

## Verification

- `npx tsc --noEmit` passes (CI does not typecheck — verify by exit code).
- `/thank-you` renders the page; video shows the placeholder frame; testimonials
  show 3 placeholder cards; layout holds at mobile and desktop widths.
