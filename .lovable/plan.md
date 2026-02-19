

# Publishing Module for Connecta

## Overview

This plan adds a full social media scheduling and publishing system ("Publishing") to the Connecta dashboard. Since you don't have developer accounts with Meta, TikTok, or YouTube yet, we'll build this in two phases:

- **Phase 1 (this implementation):** Full UI, database, storage, and scheduling infrastructure. Posts can be created, scheduled, and managed. Platform connections show a "Coming Soon" state with instructions on what developer accounts you need.
- **Phase 2 (future, once you have API keys):** Wire up actual OAuth flows and auto-publishing logic for each platform.

This way you get the complete user experience now, and we plug in the real APIs later without restructuring anything.

---

## What gets built

### 1. Database tables

**social_accounts** - Stores connected platform credentials per user

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | References auth user |
| client_id | uuid | References clients table (for staff managing clients) |
| platform | text | instagram, facebook, tiktok, youtube |
| account_name | text | Display name of the connected account |
| access_token | text | Encrypted OAuth token |
| refresh_token | text | Encrypted refresh token |
| expires_at | timestamptz | Token expiry |
| created_at | timestamptz | |

**scheduled_posts** - Each post created by a user

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | Who created it |
| client_id | uuid | Which client this belongs to |
| video_url | text | Path in storage bucket |
| thumbnail_url | text | Auto-generated or first-frame |
| caption | text | Post caption |
| platforms | text[] | Array of platform names |
| scheduled_time | timestamptz | When to publish (null = publish now) |
| status | text | draft, scheduled, publishing, published, failed |
| published_at | timestamptz | When it actually published |
| error_message | text | If status = failed |
| created_at | timestamptz | |

RLS policies ensure users only see their own posts, and staff (admin/videographer) can see posts for their assigned clients.

### 2. Storage bucket

- **post-videos** bucket for uploaded video files
- RLS: authenticated users can upload/read their own files
- Public read for published content

### 3. Sidebar and routing

- Add "Publishing" nav item to the sidebar (with a Send/Share icon) for both client and staff views
- Routes: `/publishing` (client) and `/clients/:clientId/publishing` (staff)
- Add Publishing card to the ClientDetail hub page

### 4. Publishing page UI

The page has two main sections:

**Create Post (top)**
- Video upload area (drag-and-drop or click to browse)
- Caption textarea with character count
- Platform selector chips (Instagram, Facebook, TikTok, YouTube) - each shows connection status
- Date/time picker for scheduling
- Two action buttons: "Publish Now" and "Schedule"

**Posts List (bottom)**
- Filterable by status (All, Scheduled, Published, Failed)
- Each post card shows: video thumbnail, caption preview (truncated), selected platforms as icons, scheduled/published time, and a colored status badge
- Click to expand/edit (if still in scheduled status)

### 5. Social Accounts settings

- New section in the Settings page OR a sub-tab within Publishing
- Shows cards for each platform (Instagram, Facebook, TikTok, YouTube)
- Each card shows: connected/not connected status, account name if connected
- "Connect" button (Phase 1: shows instructions on what developer account is needed)
- "Disconnect" button for connected accounts

### 6. Auto-publishing infrastructure (cron job)

- Edge function `publish-scheduled-posts` that queries for posts where `status = 'scheduled'` and `scheduled_time <= now()`
- Updates status to `publishing`, attempts to publish via platform API, then updates to `published` or `failed`
- pg_cron job runs every minute to invoke this function
- In Phase 1, this function will be ready but will mark posts as `failed` with message "Platform API not yet configured" since no real API keys exist

### 7. Modular service structure

All platform-specific logic lives in the edge function with a clean switch/case per platform, making it straightforward to add real API calls later:

```text
publish-scheduled-posts/
  index.ts          -- Main handler, cron entry point
  platforms/
    instagram.ts    -- Meta Graph API publishing (stub for Phase 1)
    facebook.ts     -- Meta Graph API publishing (stub for Phase 1)
    tiktok.ts       -- TikTok Content Posting API (stub for Phase 1)
    youtube.ts      -- YouTube Data API (stub for Phase 1)
```

---

## What you'll need for Phase 2

To enable actual publishing, you'll need to set up:

1. **Meta (Instagram + Facebook):** Create a Meta Developer App at developers.facebook.com. Request `pages_manage_posts`, `instagram_content_publish`, `pages_read_engagement` permissions. Submit for App Review.

2. **TikTok:** Register at developers.tiktok.com. Apply for the Content Posting API scope. Submit for review.

3. **YouTube:** Create a Google Cloud project, enable YouTube Data API v3, configure OAuth consent screen with `youtube.upload` scope.

Each platform typically takes 1-4 weeks for review and approval.

---

## Technical Details

### Files to create
- `src/pages/Publishing.tsx` - Main publishing page
- `supabase/functions/publish-scheduled-posts/index.ts` - Cron-triggered auto-publisher

### Files to modify
- `src/App.tsx` - Add `/publishing` and `/clients/:clientId/publishing` routes
- `src/components/DashboardSidebar.tsx` - Add "Publishing" nav item for both client and staff views
- `src/pages/Dashboard.tsx` - Add Publishing card to the dashboard home
- `src/pages/ClientDetail.tsx` - Add Publishing card to the client hub
- `supabase/config.toml` - Register new edge function

### Database migrations
- Create `social_accounts` and `scheduled_posts` tables with RLS
- Create `post-videos` storage bucket with policies
- Set up pg_cron job for the auto-publisher

### Edge function structure
The `publish-scheduled-posts` function will:
1. Query `scheduled_posts` where status = 'scheduled' AND scheduled_time <= now()
2. For each post, update status to 'publishing'
3. Look up `social_accounts` for matching platforms
4. Call platform-specific publish function (stub in Phase 1)
5. Update status to 'published' or 'failed' with error message

