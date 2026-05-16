# Robby Tool-Coverage Audit

**Date:** 2026-05-16
**Status:** Backlog / Reference doc (not implementation)
**Companion to:** `2026-05-16-robby-plan-preview-design.md`

A walking inventory: every authenticated route in the app, what user actions live on it, and whether Robby can take those actions via `companion-chat` tools.

The goal isn't to implement everything — it's to know where the gaps are so future specs can prioritize. Each gap is rated:

- 🔴 **High** — the user lives here, friction = lost value (e.g., editing-queue had high friction before its 15+ tools).
- 🟡 **Medium** — occasional use; worth tooling but not urgent.
- 🟢 **Low** — rare, sensitive, or fundamentally manual (OAuth, billing).
- ✅ — already covered.

---

## Tool Inventory (67 total)

| Module                | Tools                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `analytics.ts` (7)    | get_post_performance, get_pipeline_summary, run_audience_analysis, compare_clients, get_open_alerts, dismiss_alert, get_morning_brief |
| `client.ts`           | create_client, get_all_clients_status, open_client (in index)                                           |
| `editing.ts` (~22)    | open_editing_item, update_editing_status, mark_post_published, mark_done_and_published, reschedule_post, set_lifecycle_status, mark_script_recorded, add_revision_notes, assign_editor, rename_editing_item, set_deadline, delete_editing_item, permanent_delete_editing_item, restore_editing_item, set_editing_queue_view, list_vault_files, bulk_reschedule_posts, bulk_delete_editing_items, bulk_assign_editor, bulk_update_status, bulk_set_lifecycle_status, bulk_schedule_posts |
| `finances.ts` (3)     | get_finances, get_revenue_vs_goal, log_transaction                                                      |
| `intelligence.ts` (4) | get_weekly_priorities, get_recent_activity, get_overdue_items, generate_week_plan                       |
| `leads.ts` (6)        | get_leads, create_lead, update_lead_status, add_lead_notes, draft_lead_outreach, bulk_update_lead_status |
| `memories.ts` (5)     | save_memory, list_memories, delete_memory, pin_memory, unpin_memory                                     |
| `plans.ts` (3)        | propose_plan, confirm_plan, reject_plan                                                                 |
| `research.ts` (4)     | deep_research, get_instagram_top_posts, scrape_viral_channel, generate_ideas_from_viral                 |
| `scripts.ts` (5)      | update_script_status, delete_script, send_contract, set_caption, generate_caption, get_contracts        |
| `index.ts` (4)        | navigate_to_page, fill_onboarding_fields, find_viral_videos, open_client                                |

---

## Per-page Audit

### ✅ Editing Queue — `/editing-queue`, `/master-editing-queue`, `/clients/:id/editing-queue`
Best-covered surface in the app. Status changes, deadlines, assignments, revisions, captions, deletes, bulk variants, plan flow — all supported.
**No gaps worth implementing now.**

### ✅ Leads — `/leads`, `/clients/:id/leads`
Create, update status, add notes, draft outreach (AI-generated), bulk update, send contract. Solid coverage.
**Gaps (🟡):**
- 🟡 `reschedule_lead_appointment(lead_id, new_datetime)` — Lead Calendar lets users drag appointments; Robby has no equivalent.

### ✅ Scripts (incl. Super Canvas) — `/scripts`, `/clients/:id/scripts`
Update status, delete, mark recorded, generate caption. The build-session machinery handles full script drafting via the `BUILT a complete script` flow (no explicit `draft_script` tool — it's the orchestrator).
**Gaps (🟡):**
- 🟡 `pin_script` / `unpin_script` — Scripts page has a pin feature; Robby can't pin/unpin.
- 🟡 `link_script_to_video` — when user wants to associate a script with an existing editing-queue item.

### ✅ Finances — `/finances`
Read, goal-compare, log transaction. Coverage is light but matches the page's actual surface.
**No gaps.**

### ⚠️ Content Calendar — `/content-calendar`, `/clients/:id/content-calendar`
Reschedule + bulk schedule exist (via editing.ts). But no read tool for "what's on the calendar this week" — Robby has to query via get_pipeline_summary or get_overdue_items, neither of which mirrors the calendar view.
**Gaps (🟡):**
- 🟡 `get_calendar_view(client_id?, range: "this_week" | "next_week" | "month")` — read-only structured snapshot of scheduled posts.

### ⚠️ Vault — `/vault`, `/clients/:id/vault`
`list_vault_files` exists, but it appears to list editing-queue footage, not the actual script-template Vault.
**Gaps (🟡):**
- 🟡 `add_vault_template(client_id, viral_video_id)` — save a Viral Today video as a script template.
- 🟡 `list_vault_templates(client_id)` — read templates already saved.

### ⚠️ Contracts — `/contracts`, `/clients/:id/contracts`
`send_contract` and `get_contracts` exist. No way to draft / upload / generate.
**Gaps (🟡):**
- 🟡 `generate_contract_from_template(client_id, lead_id, template_id)`.
- 🟢 `upload_contract` — usually a manual file upload.

### ❌ Strategy — `/clients/:id/strategy`
Goals, content mix, ManyChat config, fulfillment score. **Zero tool coverage.** Robby can't read or set the client's strategy.
**Gaps (🔴):**
- 🔴 `get_content_strategy(client_id)` — read current goals, mix, fulfillment score.
- 🔴 `set_content_strategy(client_id, fields)` — partial update.
- 🟡 `set_content_mix_targets(client_id, hook_%, story_%, cta_%)` — distinct goal-setter.

### ❌ Booking Settings — `/clients/:id/booking-settings`
Calendly-style availability config. **Zero tool coverage.**
**Gaps (🔴):**
- 🔴 `get_booking_availability(client_id)`.
- 🔴 `set_booking_availability(client_id, slots)` — update available time blocks.
- 🟡 `set_booking_buffer(client_id, minutes_before, minutes_after)`.

### ❌ Landing Page Builder — `/clients/:id/landing-page`
Page builder for the client's public booking landing page. **Zero tool coverage.**
**Gaps (🟡):**
- 🟡 `get_landing_page(client_id)` — read current sections + copy.
- 🟡 `update_landing_section(client_id, section, copy)` — text edits.
- 🟢 `publish_landing_page(client_id)` — usually the user wants final say.

### ❌ Followup Automation — `/clients/:id/followup-automation`, `/clients/:id/followup-builder`
Configures lead-follow-up sequences. **Zero tool coverage.**
**Gaps (🟡):**
- 🟡 `get_followup_sequence(client_id)`.
- 🟡 `set_followup_step(client_id, step_index, delay, message)`.
- 🟡 `toggle_followup_automation(client_id, enabled)`.

### ❌ Videographers — `/videographers`, `/videographers/:id`
Directory page for videographers across the agency. `assign_editor` exists per editing item, but no directory-level tools.
**Gaps (🟡):**
- 🟡 `list_videographers(client_id?)` — names + current loads.
- 🟡 `get_videographer_load(videographer_id)` — how many open assignments.
- 🟢 `create_videographer(name, email)` — usually admin manual.

### ❌ Subscribers — `/subscribers`
Admin oversight of agency subscribers.
**Gaps (🟢):**
- 🟢 `list_subscribers()` — admin can do this manually; low Robby ROI.

### ❌ Database — `/master-database`, `/clients/:id/database`
Raw DB access. Robby has dozens of typed tools already; this page is the "escape hatch" for power users. **Intentionally no tools.**

### ❌ Social Accounts — `/clients/:id/social-accounts`
Connect Facebook/Instagram for scheduling. OAuth flow — fundamentally not a Robby task.
**No gaps to fix.**

### ❌ Settings — `/settings`
Profile, password, AI name, viral threshold, delete account. Mostly preferences; some sensitive.
**Gaps (🟢):**
- 🟢 `rename_ai_assistant(new_name)` — possible but low value.
- 🟢 `set_viral_threshold(value)` — possible but low value.

### ❌ Trainings — `/trainings`
Read-only library.
**Gaps (🟢):**
- 🟢 `find_training(query)` — Robby could surface relevant training videos.

### ❌ Subscription / Billing — `/subscription`, `/select-plan`, `/checkout`
Financial actions. **Intentionally no tools.**

### ❌ Onboarding — `/onboarding`, `/onboarding/:id`
`fill_onboarding_fields` exists for the form. ✅

---

## Prioritized Backlog (top 10)

If/when we ship more Robby coverage, in roughly this order:

1. 🔴 **Strategy tools** — `get_content_strategy`, `set_content_strategy`. Big surface, zero coverage, agency operators live here.
2. 🔴 **Booking availability** — `get_booking_availability`, `set_booking_availability`. Subscribers configure this monthly; manual UX is fiddly.
3. 🟡 **Calendar read** — `get_calendar_view(range)`. Robby can't "show me the week" without scraping multiple tools.
4. 🟡 **Vault templates** — `add_vault_template`, `list_vault_templates`. The Viral Today → Vault save flow.
5. 🟡 **Followup automation** — three tools for sequence config.
6. 🟡 **Lead appointment reschedule** — `reschedule_lead_appointment`.
7. 🟡 **Landing page edits** — `get_landing_page`, `update_landing_section`.
8. 🟡 **Videographer load read** — `list_videographers`, `get_videographer_load`.
9. 🟡 **Script pin / link** — `pin_script`, `link_script_to_video`.
10. 🟡 **Contract generation** — `generate_contract_from_template`.

Anything tagged 🟢 stays in the backlog without an action.

---

## Notes for future implementers

- **Naming convention:** existing tools use snake_case verb_noun (e.g., `set_lifecycle_status`, `get_morning_brief`). Match it.
- **Plan flow:** if a new tool is destructive or hits 3+ writes, the existing `propose_plan` flow must be respected — see the worked example in `companion-chat/index.ts` system prompt.
- **`target_item_titles`:** new tools that operate on rows in a list page should accept titles and resolve them via the shared resolver pattern (see `_shared/editing-resolver.ts`). This keeps the row-pulse highlight working out of the box.
- **Per-client scope:** if the tool takes a `client_name`, also honor `lockedClient` from `ToolModuleContext` so URL-pinned clients can't be overridden by the model.
