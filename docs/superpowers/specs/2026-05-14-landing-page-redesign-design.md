# Landing Page Redesign — Editorial · Strategy-First

**Status:** Spec draft for review
**Date:** 2026-05-14
**Scope:** Replace `src/pages/LandingPageNew.tsx` (English) — `LandingPageNewES.tsx` is out of scope for this plan and will be addressed in a follow-up
**Companion plan:** `2026-05-14-app-rebrand-design.md` (whole-app token enforcement) — separate spec, sequenced after this one ships

---

## 1. Goal

Reposition Connecta from "tool that helps you make viral videos" to **"the AI strategist that plans, produces, and (soon) publishes your entire content operation."** Land this through a single English page that converts creators and creator-agencies on the same scroll.

The current landing leads with production. The new one leads with **strategy**, then proves the operating system underneath it.

## 2. Positioning shift (locked from brainstorm)

| | Old | New |
|---|---|---|
| Lead promise | "Make viral content faster" | **"Your AI strategist for viral growth"** |
| Hero verb | Make / Produce | **Plan / Direct / Deploy** |
| Primary reader | Solo creator | Creator-leaning, but agencies in second-half |
| Anchor metaphor | Editorial workspace | **Jarvis for creator strategy** |
| Implicit competitor frame | Notion / Air | **A strategist on retainer, minus the retainer** |

## 3. Visual system (locked — no further exploration)

### Palette (Ink + Aqua + Honey · 5 shades)

| Role | Name | Hex | HSL |
|---|---|---|---|
| Background | Ink | `#0A0E12` | `222 27% 7%` |
| Surface | Graphite | `#1A1F26` | `215 19% 13%` |
| Foreground | Bone | `#EAE6DC` | `42 23% 89%` |
| Primary accent | Aqua Mist | `#8FD0D5` | `184 41% 70%` |
| Warm accent | Honey | `#E0A560` | `30 67% 63%` |

**Rule:** No color outside this 5-shade system appears on the page. No greens, no reds, no extra blues, no Tailwind defaults. Status states route to Aqua (calm/positive) or Honey (urgent/featured); negative/error uses a desaturated Honey, not red.

### Typography (locked — same as wisprflow)

- **Serif:** `EB Garamond` — H1/H2 headlines, hero, marquee numbers, pull quotes. Use italic + roman pairing for emphasis. Load weights 400, 500, italic 400, italic 500.
- **Sans:** `Figtree` — all body, UI, buttons, nav, eyebrows. Load weights 400, 500, 600, 700.
- **Mono:** `JetBrains Mono` — code snippets, keyboard hints, timestamps. Optional.
- **No other font families. No `font-caslon`. No system fallback chains that resolve to anything other than the three above.**

### Decorative motif (wisprflow signature, retained)

Curved italic annotations in the hero — short hand-written-style EB Garamond italic lines rotated 3–8° in the negative space around the H1. Three to four total across the page, each 12–14px, opacity 0.30. They carry voice without competing with copy.

---

## 4. Page architecture

The page is one long scroll, eight named sections plus footer. Each section has a clear job.

```
┌──────────────────────────────────────────────────────────────┐
│ 0. Announcement banner — "Viral Today is live" or release    │
├──────────────────────────────────────────────────────────────┤
│ 1. HERO — Strategy promise + dual CTA                        │
│    H1: "Your AI strategist for viral growth."                │
│    Sub: One sentence on the Jarvis angle                     │
│    CTAs: Primary (Aqua) "Start free" · Ghost "Watch the demo"│
│    Visual: Super Canvas mockup (the Jarvis brain in action)  │
├──────────────────────────────────────────────────────────────┤
│ 2. SOCIAL PROOF — Logo strip (creators + brands they worked) │
├──────────────────────────────────────────────────────────────┤
│ 3. THE BRAIN — Super Canvas deep-dive (PRIORITY 1)           │
│    Split layout. Left: copy about the strategy engine.       │
│    Right: live-feeling Super Canvas mockup with nodes.       │
│    Eyebrow: "The Jarvis"  Headline italic+roman pairing.     │
├──────────────────────────────────────────────────────────────┤
│ 4. VIRAL TODAY — Trend discovery (PRIORITY 2a)               │
│    Centered layout. Mockup of Viral Today scroll.            │
│    Three pills: "Spot the trend" "Borrow the hook" "Ship it" │
├──────────────────────────────────────────────────────────────┤
│ 5. SUPER CANVAS — Visual planning (PRIORITY 2b)              │
│    Note: this overlaps with section 3 conceptually but here  │
│    it shows the *canvas grid* perspective vs section 3       │
│    showing the *strategy generation* perspective.            │
│    If too redundant, merge sections 3 + 5 into one expanded  │
│    section with two tabs. Decide during implementation.      │
├──────────────────────────────────────────────────────────────┤
│ 6. THE PIPELINE — Editing Queue + Content Calendar           │
│    Three feature cards in Graphite, each with an icon mock.  │
│    Cap: "The production layer underneath the strategy."      │
├──────────────────────────────────────────────────────────────┤
│ 7. PUBLISHING — Coming soon teaser                           │
│    Honey badge "Late 2026". Show a blurred mockup.           │
│    Caption: "Strategy → production → publish. The last mile  │
│    closes this year."                                        │
├──────────────────────────────────────────────────────────────┤
│ 8. TESTIMONIAL — Single big pull-quote in EB Garamond        │
├──────────────────────────────────────────────────────────────┤
│ 9. PRICING — Three plans (Solo · Studio · Agency)            │
├──────────────────────────────────────────────────────────────┤
│ 10. FINAL CTA — Big serif headline + Aqua button             │
├──────────────────────────────────────────────────────────────┤
│ 11. FOOTER                                                   │
└──────────────────────────────────────────────────────────────┘
```

### Section priority (resolved from user input)

1. **Super Canvas / The Brain** (sections 3 + 5) — the headline differentiator
2. **Viral Today** (section 4) — trend discovery, second most important
3. **The Pipeline** (section 6) — editing queue + calendar
4. **Publishing** (section 7) — coming-soon teaser
5. Hero, social proof, testimonial, pricing, CTA — table stakes

If 3 and 5 read redundant in implementation, merge into one Super Canvas section with two visual tabs (Strategy Generation / Visual Canvas). Default to merging unless they obviously tell different stories.

---

## 5. Copy direction

### Voice

- **Tone:** Confident but warm. Editorial cadence, not SaaS-speak. Allow sentence fragments. Lean on italics for emphasis.
- **Sentence rhythm:** Vary lengths. Short. Then long enough to set up the next short one. Wisprflow does this well.
- **Forbidden words:** "leverage," "synergy," "ecosystem," "solution," "unleash," "supercharge," any em-dash AI tells.
- **No emojis in copy.** The visual system carries the personality.

### Anchor headlines (suggested — refine during implementation)

| Section | Headline (with italic emphasis) |
|---|---|
| Hero | *Your AI strategist* **for viral growth.** |
| Super Canvas | The brain. *It plans before you post.* |
| Viral Today | What's working *right now,* sorted for you. |
| Pipeline | The production layer *underneath the strategy.* |
| Publishing | Soon, *the last mile.* |
| Final CTA | Stop guessing. *Start directing.* |

### Sub-copy character budget

- Hero sub: ≤ 130 chars
- Section ledes: ≤ 180 chars
- Feature card body: ≤ 220 chars
- No paragraph longer than 3 lines on desktop

---

## 6. Component inventory (what gets built)

Build as plain JSX/Tailwind inside `LandingPageNew.tsx` — no new shared components unless reused 3+ times. List of inline components:

- `<Banner>` — top announcement strip (Ink bg, Bone text, Aqua link)
- `<Nav>` — sticky frosted Ink/80 with backdrop-blur
- `<HeroBlock>` — H1 + sub + dual CTA + curved annotations + Super Canvas mockup
- `<LogoStrip>` — horizontal scroll of magazine-styled wordmarks
- `<SplitSection>` — copy + mock side-by-side (reused for sections 3, 6)
- `<CenterSection>` — copy + mock centered (reused for section 4)
- `<FeatureCardTrio>` — three Graphite cards with icons (section 6)
- `<ComingSoonTeaser>` — Honey badge + blurred mockup card (section 7)
- `<PullQuote>` — big serif testimonial (section 8)
- `<PricingTrio>` — three plan cards, middle one in Aqua (section 9)
- `<FinalCTA>` — full-bleed Honey-bordered section
- `<Footer>` — three-column footer with brand mark

Mocks are inline JSX, not real screenshots. They should feel real (use actual creator names like the existing dashboard does — Luna Reyes, Marco Quintero, Sofia Tran) but be obviously hand-built.

---

## 7. Out of scope for this plan

- Spanish version (`LandingPageNewES.tsx`) — separate ticket after English lands
- Whole-app rebrand — that's `2026-05-14-app-rebrand-design.md`
- Real screenshots of the product — use illustrative mockups
- A/B test infrastructure — ship the new page as the only version
- New marketing routes (`/agencies`, `/creators`) — handle later

---

## 8. Files affected

| File | Change |
|---|---|
| [src/pages/LandingPageNew.tsx](src/pages/LandingPageNew.tsx) | Full rewrite |
| [src/index.css](src/index.css) | Add `@import` for Google Fonts (EB Garamond + Figtree). Add CSS variables under a scoped `.landing-editorial` class (do NOT touch `:root` — that's plan 2's job) |
| [src/landing.css](src/landing.css) | Replace contents with section-specific helpers or delete |

Critical: this plan must NOT change global Tailwind config or global CSS variables. Scope all new tokens to a `.landing-editorial` wrapper class on the landing page root. That way the rest of the app stays untouched until plan 2 runs.

## 9. Acceptance criteria

A reviewer should be able to:

- Load `/` (or wherever LandingPageNew is mounted) and see the new editorial layout in Ink + Aqua + Honey
- See zero hex colors outside the 5-shade palette in the rendered DOM (verify with devtools)
- See EB Garamond on every H1/H2 and Figtree on every body/button
- Read all 8 named sections in order, with Super Canvas and Viral Today getting the heaviest visual treatment
- Confirm the rest of the app (dashboard, internal pages) is visually unchanged from before
- See the announcement banner at the top with messaging room for a release callout
- Click both hero CTAs and have them route somewhere sensible (existing `/login` and a video URL are fine placeholders)

---

## 10. Open questions (resolve before writing-plans)

1. **Hero mockup content:** Should it show the Super Canvas (strategy view) or Viral Today (trending feed)? Recommendation: Super Canvas, since it's the headline differentiator. Viral Today gets its own section below.
2. **Announcement banner text:** What's the current most-shipworthy launch? Suggested default: *"Viral Today is live. Spot trends before your feed catches on. →"*
3. **Logos in the trust strip:** Real creator/brand names or fabricated placeholders? Need a small list (6–8) from the user.
4. **Testimonial source:** Real customer or placeholder? Need name + role + 1-sentence quote if real.
