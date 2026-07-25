# AI Assistant (Robby) Backend Gaps Audit — Part 2

> Part 2 of the original two-part `/ai` Command Deck project (see `docs/superpowers/specs/2026-07-24-ai-command-deck-design.md`, "Known gaps carried into Part 2"). Part 1 was the Command Deck HUD + Action Surface + voice — shipped. This is the "find what the assistant can't do as a command, and fix or plan it" half.

## Method

A full-repo audit of `supabase/functions/companion-chat/` (index.ts + mode-router.ts + tools/*.ts), `ai-assistant`, `ai-build-script`, and their frontend call sites, verifying each of the design spec's six preliminary findings against current code plus searching for new gaps. Every claim below is evidence-based (file:line citations checked by direct reading, not inferred). Findings are ordered most severe first.

## Fixed in this pass (2026-07-25)

These were trivial-to-small, well-bounded, and safe to ship without a separate review cycle:

1. **`propose_plan` silent truncation** — `steps`/`target_item_titles` beyond 25 were silently sliced with no warning. Now refused with a clear message telling the model to split into multiple plans. (`tools/plans.ts`)
2. **Lead status had no enum validation** — `update_lead_status`/`bulk_update_lead_status` wrote whatever string the model sent, unlike every other status-setting tool in the codebase. Now validated against the documented `new | contacted | interested | booked | lost | stopped` set, matching the pattern already used for editing-queue lifecycle status. (`tools/leads.ts`)
3. **`mode-router.ts`'s per-mode tool filtering was dead code with a misleading header comment** — the comment described active filtering ("~70% fewer tool definitions shipped per turn") that hasn't been true since prompt-caching cost concerns reverted it; `MODE_TOOLS`/`COMMON_TOOLS`/`toolNamesForMode` are unused by `index.ts`, which ships the full tool array on every call. Rewrote the header to state plainly what's live (`classifyMode`'s result, used for model tiering/fast-path/logging) vs. dead, and warn against re-wiring the filtering back in (it broke prompt-cache economics before).
4. **`update_editing_status` / `bulk_update_status` removed** — see "Legacy status desync," the most consequential fix in this pass, detailed below.
5. **Two git-tracked stray sync-duplicate files removed** — `_shared/editing-resolver 2.ts` and `supabase/migrations/20260409_enable_realtime_canvas_states 2.sql` were confirmed byte-identical to their canonical counterparts and confirmed accidentally swept into commit `a28e94c` via a broad `git add`. Removed via `git rm`. (The ~320 *untracked* " N"-suffixed duplicate files elsewhere in the repo — almost certainly iCloud Drive sync-conflict copies, see `[[project_icloud_git_eviction]]` — were deliberately left alone: they're outside this project's scope, byte-identical to their canonical versions per spot-check, and touching ~320 files across the whole repo is a much bigger blast radius than this audit was asked to cover.)

### Legacy status desync — why removal, not a patch

`update_editing_status` and `bulk_update_status` wrote the legacy `status` column directly and derived `lifecycle_status` from it via `deriveFromLegacy()`. The bug: `deriveFromLegacy` is a lossy, many-to-few mapping (5 legacy-ish states collapse onto fewer lifecycle buckets — e.g. legacy `"Done"` with no `post_status` change has no distinct lifecycle bucket and falls back to `"In progress"`), so the two columns could end up **saying different things from a single tool call**. Concretely verified: calling `update_editing_status` with `status: "In progress"` on an item whose `post_status` was already `"Published"` wrote `status: "In progress"` while `lifecycle_status` stayed `"Published"` (the function prioritizes `post_status`) — two contradictory status badges shown in the same review-item dialog (`EditingQueue.tsx`'s detail modal renders a legacy `<StatusBadge status={selectedItem.status}>` a few lines above the lifecycle badge).

A "fix" that tries to reconcile the mapping runs straight into the same lossiness — there is no correct lifecycle value to derive for legacy `"Done"` without also deciding what `post_status` should become, and guessing wrong would trade one desync bug for a different one. The system prompt already tells the model these fields "no longer exist as a user-facing concept" (`index.ts`, editing-tools guidance) and that `set_lifecycle_status`/`bulk_set_lifecycle_status` are the primary tools — but it still listed the two legacy tools as "still work, prefer the others," meaning the model could and occasionally would still reach for them. Removing the tool definitions (not just discouraging them in prose) is the only fix that eliminates the bug at the root with no semantic guessing. `set_lifecycle_status`/`bulk_set_lifecycle_status` already cover everything these could express, without the lossy mapping (they dual-write all three columns atomically via `lifecycleUpdate()`). System prompt, `mode-router.ts`'s tool lists, and a stale example reference in `mark_done_and_published`'s description were all updated to match. Deployed via `supabase functions deploy companion-chat`.

**Note:** the four other tools the system prompt grouped as "legacy compat" — `mark_post_published`, `mark_done_and_published`, `reschedule_post`, `bulk_reschedule_posts` — were checked individually and are fine; all four call `lifecycleUpdate()` correctly and don't have this bug. Only the two removed tools bypassed it.

## Fixed in the follow-on pass (2026-07-25, commit 0f5399e)

### 1. `resolveClient` had no ambiguity detection — FIXED, not deferred after all

`tools/types.ts` — `resolveClient()`'s cascading match strategies (direct substring, normalized substring, per-word, first-word, typo-tolerant edit-distance) all returned the first/best match via `.find()`/`.limit(1)` with **no ambiguity check**, unlike `resolveEditingItem` (`_shared/editing-resolver.ts`) which explicitly detects 3+ candidates. Since `resolveClient` backs essentially every tool that takes `client_name`, two clients with overlapping or fuzzy-close names could cause a mutating tool to silently execute against the **wrong client's data** with zero warning.

Originally deferred here as "needs a dedicated pass" because a naive fix (mirroring `resolveEditingItem`'s `{ok:false, reason:"ambiguous"}` result shape) would require updating all ~10+ call sites. Shipped a **lower-risk equivalent** instead: kept the exact same `{id,name}|null` return contract, and made every strategy check for 2+ equally-good matches before returning — ambiguous now returns `null` (every caller already handles null as "no client found") instead of guessing. Zero call-site changes needed; exactly-one-match behavior is unchanged for the common case.

## Deferred — needs a dedicated pass, not a rushed autonomous edit

These are real, but each has a reason it shouldn't be fixed in the same breath as the trivial items above:

### 2. No code-level confirmation gate on destructive tools — FIXED (commit pending in git log, 2026-07-25)

`confirm_plan` (`tools/plans.ts`) only flipped a `pending_plans` row to `"approved"` — no mutating tool actually required a `plan_id` or checked plan-approval status before running. `permanent_delete_editing_item` — the one tool explicitly documented "UNRECOVERABLE... must be confirmed regardless of autonomy mode" — executed the instant the model called it, with enforcement living only in system-prompt wording plus a best-effort regex retry heuristic. Nothing stopped a misclassification, unusual phrasing, or future prompt regression from causing an irreversible delete with zero plan and zero approval.

Implemented exactly the recommended fix shape: `plan_id` is now a required input on `permanent_delete_editing_item`, and the handler queries `pending_plans` for that id + the caller's `user_id` + `status = 'approved'` before doing anything else — refuses with a clear message otherwise. This was judged safe to ship autonomously (not left for sign-off) because it can only block what the tool's own description already said was required — a model that was already reliably calling propose_plan→confirm_plan first sees no behavior change; a model that wasn't now gets stopped instead of silently deleting. No other tool in the registry carries an "UNRECOVERABLE" description, so no other tool needed the same gate in this pass.

### 3. Three overlapping AI backends duplicate script/canvas logic (large and risky)

`companion-chat`, `ai-assistant` (canvas AI node, user-selectable model tier with credit multipliers), and `ai-build-script` (17-step dispatcher powering the script wizard, TAM research, hook/CTA generators, etc.) each independently implement pieces of the same capabilities. Confirmed concrete divergence: `add_video_to_canvas` exists as two different implementations inside `companion-chat` alone (`index.ts` vs. `build-tool-handlers.ts`) with different node-id prefixes, different row spacing, and one eagerly transcribes server-side while the other doesn't — a video added from one flow behaves differently downstream than the same action taken from the other. Script generation is effectively triplicated across `tools/scripts.ts`, `build-mode.ts`, and `ai-build-script`, each with separately-tuned prompts.

**Why deferred:** this is real architectural debt, not a bug with a bounded patch — consolidating three backends touches every canvas node component and both script-generation flows. Needs its own scoped project (brainstorm → spec → plan), not a fold-in to this audit pass.

### 4. Long-term memory: fully built, deliberately disabled (product decision, not a bug)

`tools/memories.ts` is a complete, working memory subsystem (save/delete/list/pin, LRU cap via `enforce_assistant_memory_cap`) disabled at a single commented-out import in `index.ts`. Nothing else depends on it staying off. Re-enabling is mechanically small (uncomment the import, register the tools, wire the dispatch, restore the memory-loading prompt injection, update the one system-prompt line that tells the model to claim it has no memory).

**Why deferred:** this changes live, user-visible assistant behavior for every admin (the assistant will start claiming to remember things, storing user-provided facts) — a product decision, not a pure bug fix, and worth a quick explicit "yes, turn it on" rather than silently flipping it live. Re-verify `assistant_memories` schema/RPC still match current DB state before flipping it on (schema drift risk, same class of issue as the DB-migration-drift pattern already tracked elsewhere in this project).

### 5. Dead-end retry heuristic is regex-brittle (small, low severity)

`index.ts`'s broad phrase patterns (`/\blet's\b/i`, `/\bi will\b/i`, etc.) detect unfulfilled promises and trigger a forced retry — but they test the model's *final* reply text, so a legitimate completed answer containing common phrasing ("Let's schedule that for Tuesday — done") can false-positive and burn an extra Anthropic call. Not a correctness bug (idempotent retry, not double-execution), just wasted latency/spend on false positives. Left for a future pass since it's a prompt-heuristic tuning judgment call, not a mechanical fix.

## Corrected from the original spec's preliminary notes

**Bulk-operation caps:** the spec's preliminary note claimed bulk ops silently truncate at 14 with no warning. Current code shows every `bulk_*` editing/lead tool already refuses (not truncates) when the cap is exceeded, with a clear message the model relays to the user. The caps aren't even uniform (14 for editing-queue bulk ops, 25 for lead-status updates, 5 for outreach drafts, each for a documented-in-code reason). The one place silent truncation was still real was `propose_plan` itself — fixed above.

## Full findings reference

The subagent audit that produced this document ran with full file:line evidence for all ten findings (six preliminary + four new: `resolveClient` ambiguity, destructive-tool gating, dead-end regex brittleness, lead-status enum gap). That evidence trail is preserved in this session's transcript; this document is the durable summary. If picking up items 1–3 above as a future project, re-derive fresh file:line citations rather than trusting this doc's prose not to have drifted from the code.
