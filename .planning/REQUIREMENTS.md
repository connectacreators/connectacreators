# Requirements: AI Follow-Up Automation

**Defined:** 2026-03-10
**Core Value:** When a new lead arrives, an AI-generated email sequence fires automatically and stops the moment the lead books.

## v1 Requirements

### Database

- [ ] **DB-01**: followup_workflows table exists (client_id, name, nodes JSONB, edges JSONB, viewport JSONB, is_active)
- [ ] **DB-02**: messages table exists (lead_id, direction, channel, subject, body, sent_at)
- [ ] **DB-03**: client_email_settings table exists (client_id, smtp_email, smtp_password, from_name)

### Canvas (AIFollowUpBuilder)

- [ ] **CANVAS-01**: AIFollowUpBuilder page renders without crashing (TriggerNode, ActionNode, ConditionNode components exist)
- [ ] **CANVAS-02**: NodeConfigPanel renders when a node is selected (right panel)
- [ ] **CANVAS-03**: NodeToolbar renders (left sidebar with draggable node types)
- [ ] **CANVAS-04**: Canvas loads saved workflow from followup_workflows on page open
- [ ] **CANVAS-05**: Save button writes nodes/edges/viewport to followup_workflows

### Email Sending

- [ ] **EMAIL-01**: send-followup edge function generates AI email via Anthropic API (server-side, not browser)
- [ ] **EMAIL-02**: send-followup sends email via SMTP using client's credentials from client_email_settings
- [ ] **EMAIL-03**: send-followup logs the sent message to messages table
- [ ] **EMAIL-04**: send-followup updates lead: increments follow_up_step, sets last_contacted_at, sets next_follow_up_at per schedule

### Triggers

- [ ] **TRIG-01**: facebook-webhook-receiver calls send-followup immediately after creating a new lead
- [ ] **TRIG-02**: Any new lead created via leadService.createLead() queues for follow-up (sets next_follow_up_at = now)

### Scheduling

- [ ] **SCHED-01**: process-followup-queue edge function finds leads where next_follow_up_at <= now AND not booked/stopped/replied AND follow_up_step < 5
- [ ] **SCHED-02**: process-followup-queue calls send-followup for each due lead
- [ ] **SCHED-03**: Supabase pg_cron runs process-followup-queue every 5 minutes

### Settings UI

- [ ] **UI-01**: SMTP settings panel in ClientFollowUpAutomation page (email field + app password field + from name)
- [ ] **UI-02**: Settings save to client_email_settings table
- [ ] **UI-03**: ClientFollowUpAutomation stats query fixed (remove deleted_at filter)

## v2 Requirements

### Future

- SMS via Twilio (channel routing in send-followup)
- Per-node prompt customization in canvas
- Inbound reply detection (webhook to set replied=true)
- Per-lead sequence override (different timing)

## Out of Scope

| Feature | Reason |
|---------|--------|
| SMS sending | Email only for v1 |
| Canvas controls actual sequence | Canvas is display-only; sequence is hardcoded |
| Inbound reply detection | Requires email webhook; deferred |
| Zoho SMTP | Using client's own email instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Pending |
| DB-02 | Phase 1 | Pending |
| DB-03 | Phase 1 | Pending |
| CANVAS-01 | Phase 2 | Pending |
| CANVAS-02 | Phase 2 | Pending |
| CANVAS-03 | Phase 2 | Pending |
| CANVAS-04 | Phase 2 | Pending |
| CANVAS-05 | Phase 2 | Pending |
| EMAIL-01 | Phase 3 | Pending |
| EMAIL-02 | Phase 3 | Pending |
| EMAIL-03 | Phase 3 | Pending |
| EMAIL-04 | Phase 3 | Pending |
| TRIG-01 | Phase 4 | Pending |
| TRIG-02 | Phase 4 | Pending |
| SCHED-01 | Phase 4 | Pending |
| SCHED-02 | Phase 4 | Pending |
| SCHED-03 | Phase 4 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
