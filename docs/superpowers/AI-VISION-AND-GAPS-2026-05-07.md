# Robby — Vision & Gap Audit (2026-05-07)

Captured from a triage conversation with the user. Synthesizes the vision they articulated, audits where the current implementation breaks vs. that vision, and ranks the work that closes the most distance.

---

## The vision in one paragraph

Robby is a **coach + executor + proactive partner**. He notices what's missing across the agency and tells the user unprompted. He executes when asked, end-to-end. He previews multi-step plans before doing them so the user stays in control of big moves. The chat is **one continuous experience** — drawer, /ai, canvas all feel like the same person following the user. Two workflows must be flawless:

1. **End-to-end script build** — idea → framework → script → editing queue → schedule, all in one chat.
2. **Multi-client weekly planning** — Sunday-mode batch planning across all clients, generate scripts in batch, schedule everything.

Output should sound like the client's brand, not like a generic AI.

### User answers (verbatim)

- **Role:** "I imagine it as a coach that tells me what's missing, part of it is to automate all my content strategy from top to bottom. BUT if I request to do something he'll do it. I'm looking for full continuity in all chats (AI/drawer) and for it to feel like the user is getting the work done for him and cooperating with him."
- **Top workflow:** "End to end script build BUT also multi client weekly planning"
- **Autonomy default:** Preview big actions
- **Most-broken pain points:** Picks wrong client / context · Loses chat across pages / surfaces · Output quality is mid

---

## Audit — where the logic breaks vs. the vision

### Gap 1 — No proactive layer at all (FAR from vision)

Robby is 100% reactive. He answers when asked. There is **no** mechanism to surface "Dr Calvin hasn't posted in 11 days" unprompted. Tools that exist (`get_recent_activity`, `get_weekly_priorities`) only fire when the model decides to call them, which it usually doesn't unless explicitly asked. This is the **biggest** distance from vision.

### Gap 2 — End-to-end script build stops at 60% (MEDIUM)

Build mode runs: resolve_client → canvas context → generate ideas → find framework → add to canvas → draft → save_script. **It stops there.** End-to-end requires: submit to editing queue with assignee, schedule on a date, optionally generate caption. None happens automatically. Build mode's tool catalog (8 tools) doesn't include the editing-queue tools that live in `tools/editing.ts`.

### Gap 3 — Multi-client weekly planning has no tooling (FAR from vision)

No `generate_week_plan`, no `bulk_schedule_posts`, no `batch_create_scripts`. The Sunday-planning workflow today is fully manual. To deliver:

- `generate_week_plan(client_name)` — Haiku-drafted 7-day mix sized to client_strategies targets
- `bulk_schedule_posts({client, items: [...]})` — N posts in one call
- A "weekly planning mode" that cycles through all clients with a checkpoint per client

### Gap 4 — No preview-and-approve flow (MEDIUM)

`autonomy_mode` has `auto | ask | plan` values, but `plan` is prompt-only — no structured preview UI, no approval workflow, no `pending_confirmations` table. Multi-step actions either ask per step (annoying) or just execute (scary for big moves). To deliver "preview big actions": model emits a structured `plan_proposal` action with steps + approve/reject buttons; backend queues and executes on approval.

### Gap 5 — Output quality is shallow (MEDIUM)

Scripts and captions use `onboarding_data` (industry, offer, audience) but no voice samples from past scripts, no per-client performance analysis, no anchor to a specific viral framework's actual hook/body/CTA. `generate_caption` is single-shot. Build mode's `draft_script` is closer but still doesn't pull from past performance. Result: competent but generic.

### Gap 6 — Wrong-client picking (CLOSE, mostly fixed)

Today's work landed: admin bypass, subscriber junction access, fuzzy matching (4-strategy: direct → punctuation-stripped → per-word → prefix), lockedClient enforcement, agency-view prompt. Remaining risk: ambiguous picks. When ≥2 clients fuzzy-match a query, model picks first; should disambiguate by returning all and asking.

### Gap 7 — Chat continuity (CLOSE, just shipped)

`useActiveChat` hook landed today: localStorage with 24h TTL + 60s freshness threshold for auto-open + window CustomEvent for cross-component broadcasts. Both `CommandCenter` (/ai) and `CompanionDrawer` use it. Not yet battle-tested by user. Edge cases to validate: full page reload, multi-tab, manual close mid-conversation, canvas panel divergence.

### Gap 8 — Build session vs free chat is muddled (LOW)

Build mode has its own router and own 8-tool catalog. Mid-build "what's my pipeline?" now correctly suspends the session (M5 fix), but the model still has no lead tools when it stays in build mode. Cleanest fix: give build mode access to a few cross-cutting reads, or merge fully into companion-chat.

---

## Distance from vision (honest scoring)

| Vision element | Current | To 10/10 |
|---|---|---|
| Coach + executor feel | 5/10 — executes well, doesn't coach | Proactive alerts + morning brief in prompt |
| Continuity across surfaces | 8/10 (just fixed) | Validate, polish edge cases |
| End-to-end script build | 6/10 — works, stops short | Add submit_to_editing + auto-schedule + caption |
| Multi-client weekly planning | 2/10 — capability gap | Build `generate_week_plan` + bulk tools + planning mode |
| Preview big actions | 3/10 — prompt-only | `pending_plans` table + structured plan_proposal action |
| Output quality | 5/10 — competent, generic | Voice extraction from past scripts + framework-anchored generation |
| Wrong client | 9/10 (today) | Disambiguation on multi-match |

---

## The four moves that close the most distance

In this order, ~5/10 → ~8/10 perceived quality.

1. **Proactive alert pipeline** — `companion_alerts` table + pg_cron job (or scheduled edge function) every 6h scanning for stuck clients (no posts in 14d), approved-not-recorded scripts >7d, edits past deadline, leads past `next_follow_up_at`, finance MTD <50% at >70% through month. New tool `get_open_alerts()` + one-line system-prompt insert: "You have N alerts the user hasn't seen — mention them when relevant." Optional: `dismiss_alert(id)`. **~4h. Single biggest "feels different" change.**

2. **End-to-end build extension** — Give build mode access to `submit_to_editing_queue`, `schedule_content`, `assign_editor`. After `save_script` succeeds, the model proposes "submit to editing for [editor]? schedule for [date]?" and completes the chain. **~2h. Closes script-build vision.**

3. **`generate_week_plan` + `bulk_schedule_posts`** — Unlocks workflow #2. Haiku per client to propose a 7-day plan; bulk tool to schedule the resulting N posts in one call. Pure-write tools, modest effort. **~3h.**

4. **`pending_plans` table + `plan_proposal` action type** — Formal preview-and-approve mechanism. Model emits `{ type: "plan_proposal", steps: [...] }` instead of executing; frontend renders a checklist; on approve, backend executes the steps. Gives the user the autonomy default they chose. **~3h.**

After those, output-quality work (voice extraction from past scripts, framework-anchored generation, multi-shot iteration) is the next big push (~1 day).

---

## Status of recent work (context for the next session)

These have all shipped today:
- Multi-round tool-use loop in companion-chat (replaces 2-turn dead-end)
- Removed "On it." hardcoded fallback
- Cross-tenant client lookup fix (user_id scoping)
- Admin bypass for client lookups (agency model)
- Subscriber junction access via `subscriber_clients`
- Fuzzy matching (4-strategy) in `resolveClient` + build-mode's resolve_client
- URL-locked client enforcement (`lockedClient` on ToolContext)
- Agency-view system prompt clarification on /ai
- Auto-navigation suppressed on /ai, navigations open in same tab
- `useActiveChat` hook for cross-page chat continuity
- Drawer auto-opens on freshly active chat after AI navigation
- `find_viral_videos` returns IG/TikTok scout hints (admin-only)
- 3 new analytics tools: `get_post_performance`, `compare_clients`, `get_recent_activity`
- Multi-message bulk patterns: M5 build-session sticky fix, M6 update_client_strategy validation, M7 deferred
- canvas_states 409 RLS conflict fix in `SuperPlanningCanvas`
- Hand-drawn user bubble that scales to content
- Streaming cursor inline at end of last block

Audit reports for reference:
- `docs/superpowers/AI-AUDIT-2026-05-07.md` — security/correctness audit
- `docs/superpowers/AI-CAPABILITY-GAPS-2026-05-07.md` — capability gap audit

---

## Next action

Start on **#1 (proactive alert pipeline)**. User confirmed.
