

# Plan: AI Script Wizard Redesign + Brighter Dark Theme

## 1. AI Script Wizard - Sandcastles-style Interface

Currently the wizard shows only one step at a time. The new design will show **all steps visible on a single scrollable page**, with locked steps greyed out until unlocked.

### New Layout

**Jump-to Navigation Bar** (sticky at top):
- Horizontal bar with step pills: Topic | Research | Hook | Generated Hook | Structure | Script
- Completed steps get a checkmark icon
- Current step is highlighted with primary color
- Future (locked) steps appear dimmed/disabled
- Clicking a completed step scrolls to it; locked steps are not clickable

**All Steps Visible**:
- Each step renders as a card section on the page (similar to the screenshot)
- Completed steps show their content (editable/collapsible)
- The current active step is fully interactive
- Locked steps show a dimmed/disabled state with a lock icon
- Each step card has a "Next step: X" label and a "Save & Continue" / "Continue" button at its bottom-right

**Progressive Unlocking**:
- Steps unlock sequentially as users complete each one
- `maxUnlockedStep` state tracks the highest step reached
- Users can jump back to any completed step and re-do from there

### Technical approach

**File: `src/components/AIScriptWizard.tsx`**
- Replace `step` state logic: instead of conditionally rendering one step, render ALL steps
- Add `maxUnlockedStep` state to track progress
- Each step section wrapped with opacity/pointer-events based on lock state
- Add `useRef` per step section for smooth scroll-to behavior
- Add sticky "Jump to:" navigation bar at top with step pills
- Each step card shows "Next step: [name]" + action button at bottom-right
- When going back, reset `maxUnlockedStep` to allow re-doing later steps

## 2. Brighter Dark Theme

The current dark background is `0 0% 5%` (HSL) which is extremely dark (#0d0d0d). We'll brighten it across the board.

**File: `src/index.css`**
- `:root` (default dark mode):
  - `--background`: `0 0% 5%` -> `0 0% 10%` (brighter base)
  - `--card`: `0 0% 8%` -> `0 0% 13%`
  - `--muted`: `0 0% 12%` -> `0 0% 17%`
  - `--border`: `0 0% 15%` -> `0 0% 20%`
  - `--input`: `0 0% 12%` -> `0 0% 17%`
  - `--sidebar-background`: `0 0% 6%` -> `0 0% 11%`
  - `--sidebar-accent`: `0 0% 10%` -> `0 0% 15%`
- `body` hardcoded background: `hsl(0 0% 5%)` -> `hsl(0 0% 10%)`

This shifts the entire dark theme ~5% brighter while maintaining the same relative contrast between elements.

---

### Summary of files to modify

| File | Change |
|------|--------|
| `src/components/AIScriptWizard.tsx` | Full redesign: all-steps-visible layout, jump-to nav, progressive unlock |
| `src/index.css` | Brighten dark theme background/card/muted/border values by ~5% |

