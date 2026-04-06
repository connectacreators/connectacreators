# Roadmap: ConnectaCreators

## Milestones

- ✅ **v1.0 AI Follow-Up Automation** - Phases 1-5 (shipped 2026-03-11)
- 🚧 **v1.1 Viral Reels Experience Fix** - Phases 1-2 (in progress)

## Phases

<details>
<summary>✅ v1.0 AI Follow-Up Automation (Phases 1-5) - SHIPPED 2026-03-11</summary>

### Phase 1: DB Setup
**Goal**: The three database tables required by the follow-up system exist and are accessible
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03
**Success Criteria** (what must be TRUE):
  1. followup_workflows table exists with correct schema (client_id, name, nodes, edges, viewport, is_active)
  2. messages table exists and can store sent message records (lead_id, direction, channel, subject, body, sent_at)
  3. client_email_settings table exists and can store per-client SMTP credentials
**Plans**: 1/1 complete

### Phase 2: Canvas Fix
**Goal**: Users can open the AIFollowUpBuilder page without a crash and interact with the visual canvas
**Depends on**: Phase 1
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05
**Success Criteria** (what must be TRUE):
  1. Navigating to /clients/:clientId/followup-builder renders the ReactFlow canvas without a white or blank crash screen
  2. Clicking a node on the canvas opens the NodeConfigPanel in the right panel
  3. The left sidebar NodeToolbar is visible with draggable node types
  4. On page load, any previously saved workflow loads automatically into the canvas
  5. Clicking Save writes the current nodes/edges/viewport to the followup_workflows table
**Plans**: 1/1 complete

Plans:
- [x] 02-01-PLAN.md — Install @xyflow/react on VPS and rebuild to fix canvas crash (complete 2026-03-11)

### Phase 3: Email Edge Function
**Goal**: A single edge function call generates an AI email and delivers it to the lead via the client's SMTP credentials
**Depends on**: Phase 1
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Success Criteria** (what must be TRUE):
  1. Calling send-followup generates a personalized email body using Claude Haiku server-side (no API key in browser)
  2. The generated email is delivered to the lead's email address via the client's SMTP credentials
  3. The sent message appears as a record in the messages table
  4. After sending, the lead's follow_up_step is incremented and next_follow_up_at is set to the correct scheduled time
**Plans**: 1/1 complete

Plans:
- [x] 03-01-PLAN.md — Fix schedule delays, set ANTHROPIC_API_KEY secret, deploy send-followup to Supabase cloud, and verify end-to-end (complete 2026-03-11)

### Phase 4: Triggers + Cron
**Goal**: New leads automatically receive their first follow-up and the queue processor runs every 5 minutes to send subsequent follow-ups
**Depends on**: Phase 3
**Requirements**: TRIG-01, TRIG-02, SCHED-01, SCHED-02, SCHED-03
**Success Criteria** (what must be TRUE):
  1. When a Facebook lead form is submitted, send-followup is called immediately for the new lead
  2. When leadService.createLead() creates a new lead, next_follow_up_at is set to now so the lead enters the queue
  3. process-followup-queue correctly identifies all leads that are due and not yet completed
  4. process-followup-queue calls send-followup for each due lead in a single run
  5. Supabase pg_cron triggers process-followup-queue every 5 minutes automatically
**Plans**: TBD

### Phase 5: Settings UI
**Goal**: Clients can configure their own SMTP credentials in the app and the automation stats page loads without errors
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. The ClientFollowUpAutomation page shows an SMTP settings panel with email, app password, and from name fields
  2. Saving the settings panel writes the credentials to client_email_settings for the current client
  3. The ClientFollowUpAutomation stats section loads without a query error (deleted_at bug fixed)
**Plans**: TBD

</details>

---

### 🚧 v1.1 Viral Reels Experience Fix (In Progress)

**Milestone Goal:** Fix all playback, layout, autoplay, thumbnail, and seen-tracking bugs in the Viral Today page so the reels feed feels as smooth and reliable as TikTok/Instagram.

#### Phase 6: Playback and Navigation
**Goal**: Videos play reliably with no black box, no auto-restart, and nav arrows stay fixed to the screen at all times
**Depends on**: Nothing (first phase of milestone)
**Requirements**: REEL-01, REEL-02, REEL-03, REEL-04, NAV-01, NAV-02
**Success Criteria** (what must be TRUE):
  1. The first video in the reel feed shows a visible picture AND plays audio immediately on page load — no black box, no visible-only-after-interaction delay
  2. An active video plays through its loop normally and never restarts itself after a few seconds of no user interaction
  3. Scrolling to any video in the feed starts playback automatically — no video sits silent and paused when it is the active reel
  4. A video that fails to load shows a placeholder and stops retrying — no crash, no restart loop
  5. The up and down arrow buttons are fixed to the same screen position no matter how many videos the user has scrolled through
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Fix data-ready black box, stall-timeout restart, autoplay readyState, and arrow fixed positioning in ViralReelFeed.tsx

#### Phase 7: Seen Tracking and Thumbnails
**Goal**: Seen-based filtering is removed from the grid, reels feed retains all videos for the full session, and every video card always shows a thumbnail
**Depends on**: Phase 6
**Requirements**: SEEN-01, SEEN-02, SEEN-03, SEEN-04, THUMB-01, THUMB-02, THUMB-03
**Success Criteria** (what must be TRUE):
  1. The Viral Today grid shows all videos on initial load — no videos are hidden because of prior viewing history
  2. Videos watched in the current reels session remain in the feed for the whole session — the list never shrinks or reorders while the user is scrolling
  3. On the next session, videos the user previously watched appear lower in the feed order but are still visible — they are never completely absent
  4. Every video card in the grid (Instagram, TikTok, and YouTube) shows either the real thumbnail image or a branded gradient placeholder — no blank or broken image slots
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md — Remove seen filter from reels feed, default grid to show-all, add gradient thumbnail fallback in ViralToday.tsx + deploy

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. DB Setup | v1.0 | 1/1 | Complete | 2026-03-11 |
| 2. Canvas Fix | v1.0 | 1/1 | Complete | 2026-03-11 |
| 3. Email Edge Function | v1.0 | 1/1 | Complete | 2026-03-11 |
| 4. Triggers + Cron | v1.0 | 0/? | Deferred (v1.0 shipped before completion) | - |
| 5. Settings UI | v1.0 | 0/? | Deferred (v1.0 shipped before completion) | - |
| 6. Playback and Navigation | 1/1 | Complete    | 2026-04-06 | - |
| 7. Seen Tracking and Thumbnails | 1/1 | Complete   | 2026-04-06 | - |
