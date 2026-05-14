# AI Capability Gaps — 2026-05-07

Read-only audit of `supabase/functions/companion-chat/*`. The system already has 50+ tools and is read-write across most agency primitives; this is about what an agency owner running this every morning would still need to leave the chat to do.

---

## Top 10 highest-impact additions

1. **`bulk_schedule_posts`** — accept N items in one call so "schedule these 5 for next week" doesn't burn 5 round trips and 5 chances for Claude to forget mid-loop.
2. **`get_morning_brief` tool** *and* prepend it to the system prompt when path is `/dashboard` or `/ai` — the single "what changed since I logged off" summary that anchors every conversation.
3. **`get_overdue_items`** — scripts past expected record date, edits past `deadline` (column exists per `20260429_video_edits_deadline.sql`), leads with `next_follow_up_at < now()` — currently invisible to the AI.
4. **`draft_lead_outreach`** — generates a personalized first-touch DM/email per lead given source + notes. Today the AI can list leads but cannot help close them; this is the most-asked agency workflow that is missing.
5. **`bulk_update_lead_status`** + **`bulk_add_lead_notes`** — every CRM session is bulk; one-at-a-time is the wrong shape (`tools/leads.ts:126,145`).
6. **`split tools by domain (tool subset routing)`** — pick a 12-tool subset based on `current_path` instead of always sending all 50+ tools (Anthropic billed tokens + accuracy hit; rule 19 in `index.ts:736` is a 50-name string the model can ignore).
7. **`generate_week_plan`** — given a client, propose a 7-day mix-of-content plan (reach/trust/convert) sized to their `client_strategies` targets, returning draft `schedule_content` calls the user can confirm.
8. **`require_confirmation` flag on destructive tools** — `delete_script` (`tools/scripts.ts:93`), `update_lead_status` to "lost", `send_contract` (`tools/intelligence.ts:152`), `mark_post_published` should emit a structured `pending_confirmation` action in auto mode rather than firing immediately.
9. **`get_editor_workload`** + **suggest editor on `submit_to_editing_queue`** — model has no way to know who is busy; today every "assign to who?" question forces a UI trip.
10. **Proactive trigger via Postgres cron + `companion_alerts` table** — surface "client X has not posted in 21 days" the next time the user opens chat. Without this the AI is purely reactive.

---

## By category

### 1. Daily-driver gaps

| Gap | Proposed tool | Why | Effort |
|---|---|---|---|
| "What changed overnight?" | `get_morning_brief()` — last 24h script/edit/lead/post events, plus alerts | The user opens `/ai` cold every morning; today they have to ask three separate questions | ~1h, mostly a SQL union over `scripts`, `leads`, `video_edits`, `contracts` (the query already exists in `tools/analytics.ts:179` — repackage it) |
| "Schedule these 5 reels next week" | `bulk_schedule_posts({client_name, items:[{title,date,caption}]})` | Today the model loops `schedule_content` 5x; it forgets dates, repeats titles, hits round limits | ~30m |
| "Draft DMs for these 3 leads" | `draft_lead_outreach({client_name, lead_names:[…], style})` | Single largest agency workflow that the AI cannot touch right now | ~2h (Haiku call per lead with onboarding+notes context) |
| "Who's behind this week?" | Already covered by `get_weekly_priorities` (`tools/intelligence.ts:96`) — but result format is icon-prefixed plain text. Make it return structured JSON-in-string so the model can act on items, not just paraphrase | Keep | ~30m output reshape |
| "What's stuck?" | `get_overdue_items()` — joins `scripts.status='Approved' AND grabado=false AND created_at < now()-7d`, edits past `deadline`, leads past `next_follow_up_at` | None of these are visible today | ~1h |

### 2. Workflow handoffs (AI does step 1 of N)

- **Script created → no preview / no send-for-review.** `create_script` (`index.ts:846`) saves and navigates to `/clients/:id/scripts`. Add `request_script_review({script_title, reviewer_email})` so the next step doesn't require leaving chat.
- **Video added to canvas → cannot trigger transcription.** `add_video_to_canvas` (`index.ts:1100`) relies on the canvas opening to auto-transcribe. Add `transcribe_canvas_video({node_id})` that hits the existing transcription edge function so research can complete in chat.
- **Editing item submitted → editor unassigned.** `submit_to_editing_queue` (`index.ts:992`) leaves `assignee = null`. Either auto-suggest based on workload or add `editor_name` parameter inline.
- **Caption generated → not saved.** `generate_caption` (`tools/editing.ts:162`) returns text only. Add optional `auto_apply_to: video_edit_id` so the caption lands on the row.
- **`scrape_viral_channel` → no auto-add to canvas.** Add `auto_add_to_canvas_for: client_name` so the viral pull immediately becomes reference material.
- **`run_audience_analysis` → user has to interpret it.** Have it append a `save_memory` for the audience score so it persists into the system prompt.

### 3. Intelligence the AI doesn't have (load by default)

System prompt today loads strategy + savedMemories + onboarding (`index.ts:692-714`). Should also include, gated by current path:

1. **Today's overdue list** (3-line max) — so "what should I do now?" doesn't need a tool call.
2. **This week's calendar gaps** — "Tue/Thu have nothing scheduled" surfaces unprompted.
3. **Editor capacity snapshot** — count of in-progress edits per assignee. Without this `assign_editor` is darts.
4. **Leads gone cold** — count of leads where `last_contacted_at < now() - 14d AND status NOT IN ('lost','booked')`.
5. **Last 3 published posts + their outlier scores** — gives the AI feedback to reason about what's working without calling `get_post_performance`.

These should sum to under 600 tokens. Today the prompt is ~2.5k tokens of rules; trimming rule 19 (the tool-name list) frees room.

### 4. Proactive triggers

There is no mechanism today — the chat is request/response. To enable proactive surfacing without inventing push:

- New table `companion_alerts(id, user_id, client_id, kind, payload, created_at, read_at, dismissed_at)`.
- pg_cron job (or scheduled edge function) every 6h that scans for: clients with no post in 14d, scripts approved >7d not recorded, edits past `deadline`, leads past `next_follow_up_at`, finance month-to-date <50% of goal at >70% through month.
- New tool `get_open_alerts()` and a one-line system-prompt insertion when alerts exist: `"You have 3 alerts the user hasn't seen — mention them when relevant."`
- Optional: dismiss via `dismiss_alert(id)` so the AI can clear them after addressing.

This is the single biggest "feels different" change. Effort ~4h.

### 5. Bulk operations (1-at-a-time today, should accept arrays)

| Tool | File:line | Add |
|---|---|---|
| `update_lead_status` | `tools/leads.ts:126` | `bulk_update_lead_status({client_name, updates:[{lead_name,new_status},…]})` |
| `add_lead_notes` | `tools/leads.ts:145` | bulk variant |
| `reschedule_post` | `tools/editing.ts:151` | bulk — agency owner reshuffles a whole week at once |
| `submit_to_editing_queue` | `index.ts:992` | accept array — when 5 raw clips arrive together |
| `update_editing_status` | `tools/editing.ts:104` | bulk — Friday "mark these 6 done" |
| `schedule_content` | `index.ts:964` | superseded by #1 above |

Each ~20m. The pattern is identical: take an array, loop server-side, return one consolidated tool_result.

### 6. Output quality

- **`get_finances` blob** (`tools/finances.ts:103-110`) — already serviceable but pre-grouped cats are buried in indented lines. Return a markdown table and a `net_pct_of_goal` field; the model can quote the table and skip the math.
- **`get_pipeline_summary`** (`tools/leads.ts:107`) — returns counts as `status: N` lines; add a `next_action` per status (e.g., "interested: 3 → schedule call invites").
- **`get_all_clients_status`** (`tools/intelligence.ts:50`) — uses ⚠ emoji in the result string but rule 2 of the system prompt forbids emojis in output. The model gets confused; replace with `[stalled]` text marker.
- **`deep_research`** (`tools/research.ts:126`) — slices `JSON.stringify(json).slice(0,800)` as a fallback. That truncates mid-string; emit a structured "result missing" instead.
- **`get_recent_activity`** (`tools/analytics.ts:162`) — good shape, but always returns 30 even when 5 would suffice; add `top_per_kind` parameter.

### 7. Trust / confirmation

Currently in **auto mode**, `tool_choice: { type: "any" }` (`index.ts:803`) forces a tool call every turn. There is no confirm step for destructive actions:

- `delete_script` (`tools/scripts.ts:93`) — hard-deletes script + `script_lines`. Description says "always confirm in ask/plan mode" but that is a model-side rule that breaks under prompt injection. Add server-side: in auto mode, queue a `pending_confirmation` action and return it; require a follow-up `confirm_pending(token)` to actually delete.
- `update_lead_status` to `lost` or `stopped` — same.
- `send_contract` (`tools/intelligence.ts:152`) — emails a contract; should require an explicit confirm token.
- `mark_post_published` — irreversible status flip; cheap to add an undo via `revert_last_action(id)`.
- `update_client_strategy` — already validates numerics (`index.ts:1331-1376`) but should diff old→new and require confirm if any field drops by >50%.

Pattern: server-side `pending_confirmations(id, action_payload, user_id, expires_at)` + `confirm_pending` tool. ~2h.

### 8. Context window management

Rule 19 (`index.ts:736`) is a 50-name string. Useful for a smaller tool set, dead weight at 50 — model already has tool descriptions. **Drop rule 19; keep one-line "Use the tools, don't describe them" instead.** Saves ~400 tokens.

The bigger lever: **route subsets by `current_path`**.

- `/dashboard`, `/ai` → intelligence + analytics + clients (~12 tools)
- `/clients/:id/scripts`, `?view=canvas` → script + canvas + research + hooks (~14 tools)
- `/leads` → leads + outreach drafts (~6 tools)
- `/editing-queue`, `/content-calendar` → editing + scheduling (~8 tools)
- `/finances` → finance only (~4 tools)
- `/onboarding` → fill_onboarding only (~2 tools)

Implementation: keep one `ALL_TOOLS` array, build a `pickTools(path)` that returns the subset. Always include `respond_to_user`, `navigate_to_page`, `list_all_clients`, `get_client_info`. ~1h. Pays for itself in tokens within a day.

---

## Quick wins (under 1h each)

- Drop rule 19 from system prompt (`index.ts:736`).
- Strip the ⚠/🔴/🟡 emojis from `tools/intelligence.ts:89-126` — they violate rule 2 and confuse the model.
- Add `get_overdue_items()` — single SQL union over existing tables.
- Reshape `get_finances` to a markdown table.
- Add `editor_name` (optional) to `submit_to_editing_queue`.
- `auto_apply_to` parameter on `generate_caption`.
- Rename `companion_messages` history load to be filtered by `thread_id` (already flagged in the security audit; mentioning here because it directly affects answer quality).
- `bulk_update_lead_status` and `bulk_reschedule_posts` — same diff pattern, do both at once.

---

## Big bets (1 day+)

- **Proactive alert pipeline** (category 4 above). Cron + table + tool + prompt insertion. The day this ships, the user stops asking "is anything urgent?" — the AI tells them.
- **Tool-subset routing by path** (category 8). Combined with prompt slimming this is a 30-40% token reduction and a measurable accuracy bump on smaller tool surfaces.
- **`generate_week_plan`** — Haiku-driven, returns a draft batch of `schedule_content` calls ranked by content mix. The agency owner currently builds this in their head every Sunday.
- **`draft_lead_outreach`** — Haiku per lead, uses `clients.onboarding_data` voice + `leads.notes` for personalization. Single highest-leverage lead-management move.
- **`pending_confirmations` table + confirm-before-destroy flow** — turns auto-mode from scary to trustworthy.

---

## What NOT to add

- **Generic `send_email` / `send_sms` tool** — route through specific verbs (`send_contract`, lead follow-ups). Generic `send_*` invites spam.
- **`query_database` / `run_sql` escape hatch** — uncacheable, dangerous in auto mode, removes pressure to add the right named tool.
- **Per-client memory tools duplicating `save_memory`** — there is already a sound key-value store (`companion_state.workflow_context`). `pin_to_client`, `save_pillar`, `save_offer` would fragment it.
- **More navigation tools** — `navigate_to_page` covers everything; `open_client` is the only justified specialization (name→UUID resolution).
- **Meta-tools that call other tools** (e.g., `find_and_schedule_viral`). Composition is the model's job; meta-tools hide intent and break confirmations.
- **ManyChat/Stripe/Calendar integrations *as tools* before alerts ship.** Without proactive surfacing they're just more buttons; with alerts they slot into "you should…" messages naturally.

---

Files: `supabase/functions/companion-chat/index.ts` and `tools/*.ts`.
