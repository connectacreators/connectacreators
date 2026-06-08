# FAST Mode — Mobile-First Voice Onboarding (Design Spec)

**Date:** 2026-06-08
**Status:** Approved (design)
**Builds on:** the onboarding overhaul shipped 2026-06-08 (shared `OnboardingFormBody`, `transcribe-onboarding` edge fn, login-gated form, `clients.onboarding_access_open`).

## Goal

Let a logged-in client complete onboarding fast on their phone by **speaking** the
long free-text answers instead of typing them. One question per swipeable card,
tap-to-record, transcript shown for verification. Structured fields (name, email,
socials, dropdowns) stay typed in one compact step. Standard typed mode remains
available and is the desktop/admin default.

## Decisions (from brainstorming)

- **Scope:** voice cards for the 6 long questions + competitor profiles, PLUS one
  quick typed "basics" step for the structured fields. Self-contained.
- **Record control:** tap to start, tap to stop (not hold-to-talk).
- **After transcription:** show the transcript; client re-records / edits inline /
  advances manually (swipe or Next). No silent auto-advance.
- **Entry:** on arrival the client picks "Answer by voice (fastest)" vs "Type it
  out", with voice highlighted. They can switch anytime.
- **Order:** voice cards first → quick basics → review & submit.
- **Optional:** only "Additional Notes" is skippable.

## Architecture

`Onboarding.tsx` stays the single entry/gatekeeper. A new local `uiMode` state
(`"choose" | "fast" | "standard"`) selects what renders inside the gated `ok`
branch:

- `"choose"` → `ArrivalChooser`
- `"standard"` → existing `OnboardingFormBody` (unchanged)
- `"fast"` → new `FastOnboardingFlow`

Both modes operate on the **same** `OnboardingData` object and the same
`handleChange` / `handleSave` already in `Onboarding.tsx`. Data shape, autosave,
and every downstream consumer are unchanged. Voice answers are plain text (a valid
subset of the rich-text HTML the fields already accept).

### New files (`src/components/onboarding/fast/`)
- `FastOnboardingFlow.tsx` — orchestrates phases (cards → basics → review), holds
  step index, drives autosave.
- `VoiceAnswerCard.tsx` — one full-screen question: mic, recording state, transcript,
  re-record/edit/skip, Next/Back, swipe.
- `QuickBasicsStep.tsx` — compact mobile layout of the structured fields (reuses the
  same inputs/selects as `OnboardingFormBody`).
- `ReviewStep.tsx` — summary of all answers, each tappable to jump back; Submit;
  privacy line + "Go back to main".
- `ArrivalChooser.tsx` — the two-option entry screen.

### Shared hook (`src/components/onboarding/hooks/`)
- `useVoiceRecorder.ts` — extract MediaRecorder + `transcribe-onboarding` logic
  currently inside `VoiceButton`. Returns `{ status, start, stop, transcript }`.
  `VoiceButton` is refactored to consume it (no behavior change), and the cards use
  it too. Single pipeline, one place to fix.

## Flow detail

### 1. ArrivalChooser
Two large buttons: **🎙️ Answer by voice — fastest (~3 min)** (highlighted) and
**⌨️ Type it out**. Selecting sets `uiMode`. A small persistent "switch to typing /
voice" link is available in both flows.

### 2. Voice cards (7)
Order: Unique Offer · Top Values · Differentiator · Story · Target Client ·
Profiles to emulate · Additional Notes (optional).

Per card:
1. Big center mic (~72px). Tap → record (pulsing stop + elapsed timer). Tap → stop.
2. Stop → transcribe via `transcribe-onboarding`; spinner while pending.
3. Transcript renders in an editable block. Actions: **↺ re-record**, tap-to-edit
   inline, **Next** (button or swipe-left), **Back** (button or swipe-right).
4. Progress dots at top; "✕ skip" only on Additional Notes.

**Profiles card:** transcript is split on commas / "and" into `top3Profiles[]`
entries (trimmed, empties dropped). No URLs in fast mode.

### 3. QuickBasicsStep
One thumb-friendly scroll: name*, email*, IG/TikTok/YT/FB handle+password, package,
industry (+ other), state, ad budget, call link. Typed. Same validation as standard.

### 4. ReviewStep
Scrollable summary; each item tappable → jumps to its card (voice) or the basics
step (structured). One **Submit** (calls existing `handleSave`). Footer: privacy
reassurance + "Go back to main".

## Data & persistence

- Voice/typed answers write into the existing `OnboardingData` fields via
  `handleChange`. `top3Profiles` stays `string[]`.
- **Autosave per card/step**: after each answer settles, persist
  `onboarding_data` (debounced) using the same authenticated update as
  `handleSave` (RLS allows the linked client). A subtle "saved ✓" tick.
  Offline-tolerant: queue + retry; never blocks navigation.
- Final Submit marks completion via the existing save + success toast.

## Mobile optimizations (priority)

- Full-screen cards; primary controls bottom-anchored within thumb reach.
- Safe-area insets (`env(safe-area-inset-*)`) for notch/home indicator.
- Swipe left/right between cards (Framer Motion or pointer handlers); buttons too.
- Sticky slim progress bar; large readable transcript; keyboard-aware inline edit
  (card scrolls field into view, controls stay reachable).
- `~72px` mic tap target; pulsing recording affordance + timer.
- Standard mode unchanged as the desktop/admin default.

## Out of scope (future)

- "One long recording → AI splits into all fields" (separate power-up).
- Social pre-fill from scraped bio/posts.
- Resolving spoken competitor names to profile URLs (enrichment).
- Resume-by-link across devices (autosave already covers same-device resume).

## Testing

- Unit: `useVoiceRecorder` state machine; profiles voice→array split; OnboardingData
  round-trips identically between fast and standard.
- Manual (mobile): record→transcribe→edit→advance; swipe nav; skip optional; autosave
  survives reload mid-flow; review jump-to-fix; submit; mode switch preserves answers;
  safe-area layout on a notched device.
- Regression: standard mode + `VoiceButton` behave exactly as before after the hook
  refactor; `tsc --noEmit` exit 0; `vite build` ok.
