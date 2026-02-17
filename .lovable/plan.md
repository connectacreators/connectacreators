# Dynamic Rotating Text on Login Page

## What Changes

The login headline "Your content, leads, and systems in one place." becomes animated:

**"Your `[rotating word]` in one place."**

The rotating word cycles through **content**, **leads, systems** every 3 seconds with a roll-down (slide-down + fade +blur) transition effect. The rotating word is styled in your primary blue color.

## How It Works

- A small state machine in `ScriptsLogin.tsx` cycles through 3 words using `setInterval` (3s)
- Each word animates in with a vertical slide-down + fade-in effect, and the previous word slides out
- The rotating word is wrapped in a `<span>` with `text-primary` (blue) styling
- Uses `framer-motion` (already installed) `AnimatePresence` + `motion.span` for smooth enter/exit transitions

## Technical Details

### 1. Update `ScriptsLogin.tsx`

- Add a `useState` for the current word index and a `useEffect` with a 3-second interval
- Define word arrays for EN (`["leads", "content", "systems"]`) and ES (`["leads", "contenido", "sistemas"]`)
- Replace the static `{tr(t.login.headline, language)}` with a template:
  - Static: "Your" / "Tu"
  - Animated blue word (framer-motion `AnimatePresence` with `key` swap)
  - Static: "in one place." / "en un solo lugar."
- The animated word uses `motion.span` with:
  - Enter: `y: 20, opacity: 0` to `y: 0, opacity: 1`
  - Exit: `y: -20, opacity: 0`
  - Duration: ~0.4s ease-out
- Word styled with `text-primary` class for blue color

### 2. Update `src/i18n/translations.ts`

- Split the headline into parts: `headlinePre`, `headlinePost` (static parts) and `headlineWords` (rotating words array) for both EN and ES

### Files Modified

- `src/components/ScriptsLogin.tsx` -- add rotating word animation
- `src/i18n/translations.ts` -- split headline into parts for bilingual support