# Client Strategy Page — Design Spec
**Date:** 2026-05-02
**Status:** Approved — ready for implementation

---

## Goal

A dedicated Strategy tab on each client's profile page that shows the client's content strategy, real-time health indicators, and a fulfillment score. Same view for agency and client. Serves as both a visual dashboard and the source of truth that Robby reads when making decisions.

---

## Location

New tab on the client profile page (`/clients/:clientId`), alongside existing tabs (Scripts, Vault, etc.). Label: "Strategy".

---

## Database

### New table: `client_strategies`

```sql
CREATE TABLE client_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Content targets
  posts_per_month integer NOT NULL DEFAULT 20,
  scripts_per_month integer NOT NULL DEFAULT 20,
  videos_edited_per_month integer NOT NULL DEFAULT 20,
  stories_per_week integer NOT NULL DEFAULT 10,
  -- Content mix (percentages, must sum to 100)
  mix_reach integer NOT NULL DEFAULT 60,
  mix_trust integer NOT NULL DEFAULT 30,
  mix_convert integer NOT NULL DEFAULT 10,
  -- Platform
  primary_platform text DEFAULT 'instagram',
  -- ManyChat
  manychat_active boolean NOT NULL DEFAULT false,
  manychat_keyword text,
  cta_goal text DEFAULT 'manychat',
  -- Ads
  ads_active boolean NOT NULL DEFAULT false,
  ads_budget integer DEFAULT 0,
  ads_goal text,
  -- Content pillars (array of strings)
  content_pillars jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strategy_admin_access" ON client_strategies FOR ALL USING (
  EXISTS (SELECT 1 FROM clients WHERE id = client_id AND (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'user'))
  ))
);
```

---

## Fulfillment Score (0–100)

Calculated client-side from weighted components:

| Component | Weight | How scored |
|-----------|--------|-----------|
| Monthly scripts pace | 25% | (scripts_created / scripts_per_month) × 100 |
| Monthly videos pace | 25% | (videos_edited / videos_edited_per_month) × 100 |
| Content calendar fill | 20% | (posts_scheduled / posts_per_month) × 100 |
| ManyChat active | 15% | 100 if active, 0 if not |
| Stories pace | 15% | (avg_stories_this_week / stories_per_week) × 100 |

All components capped at 100. Final score: weighted sum.

**Score thresholds:**
- 80–100 → Green "On Track"
- 50–79 → Yellow "Needs Attention"
- 0–49 → Red "Action Required"

---

## Page Sections

Each section has a left-side color bar (4px) + status badge (Green/Yellow/Red) based on its own health.

### 1. Header + Score
- Client name, email, package, active since date
- Circular score dial (conic-gradient) showing 0–100 score
- Score label + sub-text: "Robby has X draft scripts ready" when behind
- Score breakdown list (each component with colored dot)
- "Edit Strategy" button (opens inline edit mode)

### 2. Social Media Presence
- One card per platform: Instagram, TikTok, YouTube
- Each shows: handle (from onboarding_data), follower count + engagement rate if available, connection status
- Section status: Green if 2+ platforms connected, Yellow if 1, Red if 0
- Source: `clients.onboarding_data.instagram`, `.tiktok`, `.youtube`

### 3. Monthly Pace (uses `client_strategies` + live DB counts)
- Scripts created this month vs. target
- Videos edited this month vs. target
- Posts scheduled this month vs. target
- Each with progress bar
- Section status: Red if any metric < 30%, Yellow if any < 70%, Green if all ≥ 70%
- Note if Robby has drafts ready: "Robby has 14 drafts ready to review"

### 4. Content Mix
- Horizontal bar showing Reach / Trust / Convert percentages
- Editable via "Edit Strategy"
- Labels in plain English — never TOFU/MOFU/BOFU
- Actual vs. target mix (based on `review_status` and script tags when available)
- Section status: Green if within 10% of target, Yellow if off by 10–25%, Red if off by 25%+

### 5. Audience Alignment (manual scores, editable by agency)
- "Talking to the right people?" — 0–10 slider, saved to strategy
- "Content shocking/unique enough to stop the scroll?" — 0–10 slider
- "Overall interest ratio" — auto-calculated from above two
- Section status: Green if avg ≥ 7, Yellow if 4–7, Red if < 4

### 6. ManyChat & CTAs
- ManyChat active: toggle
- Keyword: text field
- CTA goal: dropdown (ManyChat trigger / Follow / Link in bio / Book a call)
- Same keyword used consistently: derived from checking scripts (future)
- Section status: Green if active + keyword set, Yellow if active but no keyword, Red if inactive

### 7. Stories
- Target per week (from strategy)
- Note: actual count is manual entry (no automated tracking yet)
- Editable target with progress display
- Section status: Green if target set, Yellow otherwise

### 8. Ads
- Toggle: running ads yes/no
- Budget: number input
- Goal: text field
- Section status: Green if active, Gray if not running

---

## Edit Mode

Clicking "Edit Strategy" turns the page into an inline form. All fields become editable in place. "Save" button commits to `client_strategies`. No separate edit page — inline editing only.

---

## Robby Integration

The `get_client_strategy` tool (to be added to companion-chat) queries `client_strategies` for a given client and returns all fields. Robby uses this to:
- Know the monthly target when checking if a client is behind
- Use the correct ManyChat keyword in every CTA it writes
- Follow the content mix when generating content plans
- Know if ads are running when advising on content strategy

---

## Files to Create / Modify

| Action | File | Purpose |
|--------|------|---------|
| DB migration | `supabase/migrations/20260502_client_strategies.sql` | New table |
| Create | `src/pages/ClientStrategy.tsx` | Full strategy page component |
| Modify | Client profile routing | Add `/clients/:clientId/strategy` route and tab |
| Modify | `src/components/DashboardSidebar.tsx` | Link from sidebar if needed |
| Modify | `supabase/functions/companion-chat/index.ts` | Add `get_client_strategy` tool |

---

## Out of Scope

- Automated social media metric pulling (follower counts entered manually or left blank for now)
- Actual stories count tracking (target is set, actual is manual)
- Content mix analysis from existing scripts (future — requires tagging scripts by type)
- Robby's Monday sweep automation (separate spec)
