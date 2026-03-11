# Roadmap: AI Follow-Up Automation

## Overview

Five phases turn a partially-built follow-up system into a working end-to-end pipeline. Phase 1 creates the database tables everything depends on. Phase 2 fixes the broken visual canvas so developers can work without crashes. Phase 3 builds the core send-followup edge function that generates AI emails and sends them via SMTP. Phase 4 wires up the triggers (Facebook webhook + leadService) and the cron-driven queue processor. Phase 5 adds the settings UI so clients can enter their own SMTP credentials and view their stats.

## Phases

- [x] **Phase 1: DB Setup** - Create the three missing database tables
- [ ] **Phase 2: Canvas Fix** - Fix AIFollowUpBuilder so it renders without crashing
- [ ] **Phase 3: Email Edge Function** - Build send-followup: AI generation + SMTP send + state updates
- [ ] **Phase 4: Triggers + Cron** - Wire new leads to send-followup, deploy queue processor with cron
- [ ] **Phase 5: Settings UI** - SMTP settings panel, save to DB, fix stats query bug

## Phase Details

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
**Plans**: 1 plan

Plans:
- [ ] 02-01-PLAN.md — Install @xyflow/react on VPS and rebuild to fix canvas crash

### Phase 3: Email Edge Function
**Goal**: A single edge function call generates an AI email and delivers it to the lead via the client's SMTP credentials
**Depends on**: Phase 1
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Success Criteria** (what must be TRUE):
  1. Calling send-followup generates a personalized email body using Claude Haiku server-side (no API key in browser)
  2. The generated email is delivered to the lead's email address via the client's SMTP credentials
  3. The sent message appears as a record in the messages table
  4. After sending, the lead's follow_up_step is incremented and next_follow_up_at is set to the correct scheduled time
**Plans**: TBD

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
**Goal**: Clients can configure their own SMTP credentials in the app and the automaton stats page loads without errors
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. The ClientFollowUpAutomation page shows an SMTP settings panel with email, app password, and from name fields
  2. Saving the settings panel writes the credentials to client_email_settings for the current client
  3. The ClientFollowUpAutomation stats section loads without a query error (deleted_at bug fixed)
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. DB Setup | 1/1 | Complete | 2026-03-11 |
| 2. Canvas Fix | 0/1 | Not started | - |
| 3. Email Edge Function | 0/? | Not started | - |
| 4. Triggers + Cron | 0/? | Not started | - |
| 5. Settings UI | 0/? | Not started | - |
