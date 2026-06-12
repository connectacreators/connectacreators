# Assignee workflow automation + Content Strategist role

Date: 2026-06-12

## Goal
Automate two hops in the Connecta+ content pipeline, make clients assignable, and introduce a
Content Strategist role (the human who runs the pipeline today = admin, tomorrow = a strategist).

## The pipeline (manual vs automatic)
See `docs/superpowers/workflow-assignee-automation.html`. Only two steps are automated; everything
else stays manual.

1. Script created → 2. Script approved → 3. Marked filmed (hidden from editing queue) →
4. Videographer uploads raw footage → 5. **(manual)** assign editor (Axel) → 6. Editor uploads cut →
7. Strategist reviews → 8. **(manual)** Approve & schedule → **9. [AUTO] Scheduled → assignee = client,
editor remembered** → 10. Send public link → 11. Client approves (→ post) **or [AUTO] requests revision
→ Needs Revisions + assignee = remembered editor + timestamped notes** → loop → 12. Client approved → post.

The "strategist" does steps 1,2,3,5,7,8,10,12. **Today there is no strategist, so these fall back to
admin.**

## Decisions
- Auto-reassign on client revision uses a **remembered editor per row** (new columns).
- The assignee dropdown gains **only the row's own** Connecta+ client.
- Content Strategist is **per-client** (`clients.strategist_user_id`); **admin is the fallback** when null.
- Build now: role + assignment field + admin fallback + the automation. Defer strategist-scoped
  permission UI until a strategist is actually hired.

## Design

### A. Schema (one migration, applied via MCP, verified in prod)
- `ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'content_strategist';`
- `clients.strategist_user_id uuid` (FK auth.users, nullable) — the assigned strategist; null = admin.
- `video_edits.editor_user_id uuid`, `video_edits.editor_name text` — remembers who held the row
  before it was handed to the client.
- Trigger `trg_video_edits_schedule_handoff` — `BEFORE UPDATE ON video_edits`:
  when `NEW.lifecycle_status = 'Scheduled'` and `OLD.lifecycle_status IS DISTINCT FROM 'Scheduled'`,
  look up the row's client (`clients.user_id`, `clients.name`); if the client has a `user_id`,
  stash the current assignee into `editor_user_id/editor_name` (unless it already equals the client),
  then set `assignee = client.name`, `assignee_user_id = client.user_id`. Catches every scheduling path.

### B. `public-review-post` edge function (client public revision)
On `action = "revision"` it already sets Needs Revisions + inserts a `revision_comments` row. Add:
read `editor_user_id/editor_name` from the row and, if present, set `assignee/assignee_user_id` back
to the editor. (The Scheduled trigger does not fire on this transition.)

### C. Editing-queue dropdown (`EditingQueue.tsx` + `MasterEditingQueue.tsx`)
Each row's assignee `<Select>` gains the row's own client as an option (grouped under "Client"), shown
only when that client has a `user_id`. Selecting it writes `assignee = client.name`,
`assignee_user_id = client.user_id` through the existing `update-editing-status` path.

### D. Role plumbing (`AuthContext.tsx`, types)
Add `content_strategist` to `UserRole` and expose `isContentStrategist`. No new route-scoping yet —
admin remains the fallback and retains all access.

## Future automation (kept in mind, NOT built now)
The user plans to automate more of the manual steps later. Likely candidates, in rough order:
- After the editor uploads the cut (step 6) → auto-assign the client's **strategist** (admin fallback)
  for review, instead of manual.
- Script generation / approval assists.
- Auto-mark "filmed" / footage-received transitions.
Design note for later: the same "assigned person, fallback to admin" resolver used for the strategist
can drive these. Keep the strategist resolution logic in one place so future automations reuse it.

## Verification
- Migration: confirm enum value, columns, and trigger exist in prod (information_schema / pg_trigger).
- Trigger: on a test row, set lifecycle → Scheduled, confirm assignee = client + editor stashed; then
  run a public revision, confirm assignee = editor + Needs Revisions + comment; restore the row.
- `tsc --noEmit` clean, `vite build` clean.

---

## Addendum (same day) — third automation: footage → editor

User added a third automation: when a videographer uploads RAW footage (the footage tab, not the
file submission), auto-set the row to **Needs Revisions** and assign **the client's editor**.

Findings:
- Raw footage upload writes `video_edits.storage_path` (Supabase) or `video_edits.footage` (Drive);
  it does NOT touch status/assignee today. The editor's SUBMISSION writes `file_submission` (a
  different signal — correctly ignored).
- There is **no** per-client editor mapping, and there are **3** editor-role users (Shahzaib,
  Gonzalo, Axel) — so we can't infer a single editor.

Design:
- Added `clients.editor_user_id` (per-client editor). Seeded active Connecta+ clients to **Axel**
  (the working editor) so it functions immediately; change per client later.
- Folded into the same `video_edits_workflow_automation` trigger: branch (B) fires when raw footage
  first appears (`storage_path` null→set, or `footage` empty→set), sets status → Needs Revisions and
  assigns `clients.editor_user_id` (resolving the display name from `profiles`). If no editor is set,
  status still flips to Needs Revisions and the admin assigns manually.

Verified live: simulated a `storage_path` upload on the Dr Calvin test row → assignee forced to Axel
+ Needs Revisions (overriding an attempted null assignee); row restored.

## Follow-ups (noted, not built)
- A small admin UI to set each client's **strategist** and **editor** (today seeded/DB-only).
- Future automation: after the editor uploads the cut → auto-assign the client's strategist (admin
  fallback) for review. The per-client "assigned person, fallback" resolver should be centralized so
  these reuse it.
