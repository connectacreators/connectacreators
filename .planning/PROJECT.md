# ConnectaCreators — AI Follow-Up Automation

## What This Is

ConnectaCreators is an agency management platform that helps marketing agencies manage clients, leads, scripts, and content. This project focuses on making the AI Follow-Up Automation system fully functional end-to-end — from when a new lead arrives to when an automated, AI-generated email sequence is sent using the client's own email credentials.

## Core Value

When a new lead arrives, an AI-generated email sequence fires automatically and stops the moment the lead books — zero manual effort required.

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
*Last updated: 2026-03-10 after initialization*
