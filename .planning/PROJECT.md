# ConnectaCreators

## What This Is

ConnectaCreators is an agency management platform that helps marketing agencies manage clients, leads, scripts, and viral content discovery. The platform includes a Viral Today page with a TikTok-style Reels feed and a grid view for discovering high-performing content across Instagram, TikTok, and YouTube.

## Core Value

Agencies discover what's gone viral in their niche, understand why it worked, and turn it into client content — without manual research.

## Current Milestone: v1.1 — Viral Reels Experience Fix

**Goal:** Fix all playback, layout, autoplay, thumbnail, and seen-tracking bugs in the Viral Today page so the reels feed feels as smooth and reliable as TikTok/Instagram.

**Target fixes:**
- Black box on first video load (video plays audio but shows no visual)
- Nav arrows drift position after scrolling past video 5
- Active video auto-restarts after a few seconds without user interaction
- Seen/unseen filter incorrectly applied to the grid view (should show all videos)
- Random videos fail to autoplay
- Thumbnails missing across all platforms (Instagram, TikTok, YouTube)

## Requirements

### Validated (existing working features)

- ✓ Leads table with follow_up_step, next_follow_up_at, last_contacted_at, booked, stopped, replied fields — existing
- ✓ Facebook webhook receiver creates leads when FB lead form submitted — existing
- ✓ AIFollowUpBuilder page (route + ReactFlow canvas skeleton) — existing, broken
- ✓ ClientFollowUpAutomation dashboard page (stats + worker panel) — existing, broken
- ✓ followupEngine.ts — orchestration logic written, not wired to real services
- ✓ followupWorker.ts — query logic written, not deployed as cron
- ✓ leadService.ts, messageService.ts, aiGenerator.ts — service layer exists, all placeholder/stub

### Active (to build)

- [ ] AIFollowUpBuilder renders without crashing (5 missing React component files)
- [ ] followup_workflows DB table created (for canvas save/load)
- [ ] messages DB table created (for message history per lead)
- [ ] client_email_settings DB table created (SMTP per client)
- [ ] SMTP settings panel in ClientFollowUpAutomation page (email + app password input)
- [ ] send-followup edge function: generates AI email, sends via SMTP, logs to messages, updates lead state
- [ ] facebook-webhook-receiver wired to call send-followup on new lead
- [ ] leadService.createLead() calls send-followup on any new lead creation
- [ ] process-followup-queue edge function: finds leads due, calls send-followup for each
- [ ] Cron job: process-followup-queue runs every 5 minutes via Supabase pg_cron
- [ ] Fix ClientFollowUpAutomation's deleted_at query bug
- [ ] aiGenerator moved server-side (edge function, not exposed frontend API key)

### Out of Scope

- SMS sending — email only for now (Twilio wiring deferred)
- The visual canvas node editing (NodeConfigPanel) does not need to control the actual sequence — the sequence is hardcoded: 5 attempts at +10min, +1day, +2days, +3days
- Inbound reply detection — stop conditions are manual (booked/stopped flags only for now)
- Per-node AI prompt customization — a single template drives all attempts

## Context

Two pages handle follow-up:
- `/clients/:clientId/followup-builder` → AIFollowUpBuilder (ReactFlow visual canvas, currently crashes because 5 component files are missing from src/components/followup/)
- `/clients/:clientId/followup-automation` → ClientFollowUpAutomation (stats dashboard + test panel)

The follow-up sequence is: immediate email → +10min → +1day → +2days → +3days (5 total). Stop conditions: lead.booked, lead.replied, lead.stopped, or follow_up_step >= 5.

aiGenerator.ts currently calls Anthropic API directly from the browser (exposes key, wrong endpoint). Must move to edge function.

messageService.sendMessage() is a fake — logs to console only. Must wire to real SMTP.

## Constraints

- **Email**: Per-client SMTP credentials (email + app password). Works with Gmail App Passwords, Outlook, Yahoo. No Zoho dependency.
- **AI generation**: Claude Haiku via Anthropic API, server-side only (edge function)
- **Stack**: React + Supabase (edge functions for backend logic, pg_cron for scheduling)
- **Deployment**: VPS at 72.62.200.145, npm run build + nginx reload

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SMTP (not transactional API) | User wants clients to use their own email account | — Pending |
| Server-side AI generation | Cannot expose Anthropic API key in browser | — Pending |
| Hardcoded 5-step sequence | Visual canvas is display-only for now, not controlling sequence timing | — Pending |
| Supabase pg_cron for worker | Existing pattern in app (auto-scrape-channels uses cron) | — Pending |

---
*Last updated: 2026-04-05 after v1.1 milestone start (Viral Reels Experience Fix)*
