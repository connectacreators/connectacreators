# Google Calendar-Style Lead Calendar Upgrade

## Current State

The calendar already has month, week, and year views with a sidebar, time grid, and lead positioning. It works but feels static compared to Google Calendar.

## Improvements

### 1. Day View

Add a new "Day" view mode showing a full time-grid for a single day with larger event blocks, similar to Google Calendar's day view. Clicking a day in month/year view will navigate to this day view.

### 2. Lead Detail Popover (Click-to-Expand)

Instead of showing selected leads at the bottom of the page, clicking a lead block in the week or day view will open a popover/card right next to the block with:

- Full name, phone (clickable), email
- Status badge
- Appointment time
- Client name (admin only)
- Notes preview
- Link to Notion

### 3. Visual Polish (Google Calendar Style)

- Color-code events by **status** (not just green for everything) using the existing `STATUS_COLORS` map
- Rounder, pill-shaped event blocks with subtle left-border accent
- Smoother hover effects and transitions
- Half-hour grid lines (lighter) in week/day views
- Current time indicator with a red line + dot (already exists, will refine)

### 4. Quick Navigation

- Clicking a day number in **month view** switches to **day view** for that date
- Clicking a month in **year view** switches to **month view** (already works)
- Add a mini-calendar in the sidebar for quick date jumping

### 5. Drag-less but Responsive Improvements

- Better overflow handling: when many leads exist on the same day/hour, show a "+N more" badge that expands
- Responsive week view: on mobile, show 3-day view instead of full 7 days

---

## Technical Details

### Files Modified

- `**src/pages/LeadCalendar.tsx**` -- all changes are in this single file

### New ViewMode

```text
type ViewMode = "day" | "week" | "month" | "year";
```

### Day View Implementation

- Reuse the same `HOURS` / `HOUR_HEIGHT` time grid from week view
- Single column layout with wider event blocks
- Half-hour sub-lines at 50% opacity

### Lead Popover

- Use the existing `Popover` component from shadcn
- Triggered on click of any event block in week/day view
- Contains lead details with action buttons (call, email)

### Status-Based Colors

Map each lead's `leadStatus` to a distinct color for event blocks instead of hardcoded green:

```text
"Appointment Booked"       -> green
"Follow up #1"             -> orange  
"Follow up #2"             -> blue
"Follow up #3"             -> pink
"Meta Ad (Not Booked)"     -> yellow
default                    -> gray
```

### Mini Calendar in Sidebar

- Small month grid below the client filter
- Highlights days with leads using dots
- Click a date to navigate to it

### Mobile 3-Day View

- Detect mobile via existing `use-mobile` hook
- In week mode on mobile, show current day +/- 1 day (3 columns) instead of 7

&nbsp;