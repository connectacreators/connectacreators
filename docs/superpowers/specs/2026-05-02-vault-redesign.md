# Vault Page Redesign — Design Spec
**Date:** 2026-05-02

---

## Problem

The current Vault page feels bare and generic — a plain header, an empty-state message, and a loosely structured masonry grid. It lacks visual hierarchy and doesn't feel like a premium media library.

---

## Goal

Redesign the Vault page as a dark, content-heavy media library. Thumbnails are front and center. The grid is dense and compact. Creating a new template opens a slide-in drawer rather than an inline form.

---

## Page Layout

### Header (compact)
- Small teal dot + "TEMPLATE LIBRARY" label (uppercase, spaced)
- Bold "Vault" heading + short subtitle
- Gradient "**+ New Template**" button (top right) — triggers the drawer

### Stats Bar
A slim bar below the header showing aggregate counts across the library:
- **Templates** — total count
- **Hook** (teal) — total hook lines across all templates
- **Body** (green) — total body lines
- **CTA** (amber) — total CTA lines

These are derived client-side by summing `template_lines` arrays from all fetched templates.

### Template Grid
- **6 columns** on desktop, responsive down to 2 on mobile
- **Gap:** 10px
- Each card: `aspect-ratio: 9/14` (portrait, like a phone screen)
- Last slot: ghost "+" card that also triggers the New Template drawer

---

## Template Card

Each card is a compact portrait tile:

**Structure (layered):**
1. **Background** — thumbnail image (`thumbnail_url`) if available; falls back to a dark gradient tinted by platform color
2. **Gradient overlay** — `transparent 35% → rgba(0,0,0,0.95) 100%` — makes bottom text legible
3. **Platform badge** (top-left, 9px bold) — "TikTok", "IG", "YT" — dark pill with blur backdrop
4. **Template name** (bottom, 11px bold white, max 2 lines)
5. **Line count badge** (below name) — teal pill showing total lines

**Hover state:** Slight scale up (`scale(1.02)`), border highlight

**Click:** Opens the existing template detail modal (no changes to modal)

---

## New Template Drawer

Replaces the current inline create form. Slides in from the right side of the screen as a fixed panel.

**Dimensions:** 420px wide, full viewport height, `z-index: 50`

**Backdrop:** Dark overlay (`rgba(0,0,0,0.5)`) behind the drawer — clicking it closes the drawer

**Header:**
- "New Template" title
- X close button

**Body (same fields as current form):**
- Video URL input (TikTok, Instagram, YouTube)
- Template name input (optional — auto-generated if blank)
- "Transcribe & Templatize" button (gradient, full width)
- Loading state with progress message while edge functions run

**Success:** Drawer closes, new card appears in grid

**Error:** Inline error message within the drawer

---

## Responsive Behavior

| Breakpoint | Columns |
|---|---|
| ≥1280px (xl) | 6 |
| ≥1024px (lg) | 5 |
| ≥768px (md) | 4 |
| ≥640px (sm) | 3 |
| <640px | 2 |

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/Vault.tsx` | Full page restructure — new header, stats bar, 6-col grid, compact cards, drawer replaces inline form |

The existing template detail modal, data fetching logic, and edge function calls are preserved unchanged. Only the visual structure and the create-form presentation change.

---

## Out of Scope

- Changing the template detail modal
- Changing the transcription/AI logic
- Adding search or filter functionality
- Master mode admin layout changes
