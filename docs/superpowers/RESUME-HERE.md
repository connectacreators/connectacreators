# AI Full Parity — Resume Instructions

**Date paused:** 2026-05-05
**Last working commit:** `a224742` — feat(ai): wire Wave 2+3 tool spreads and handler chain into companion-chat

---

## Status snapshot

| Wave | Status | Production |
|---|---|---|
| Wave 1 — Infrastructure (thread bug, dynamic nav, refresh_data, canvas read parity, open_client) | ✅ Done | Deployed |
| Wave 2 — Core tools (leads, finances, scripts, editing, calendar) | ✅ Done | Deployed |
| Wave 3 — Intelligence (multi-client status, contracts, create_client, memory management) | ✅ Done | Deployed |
| Wave 4 — Research + analysis (audience, deep research, scraping, vault) | ⏳ Plan written, not implemented | Not deployed |

The deployed `companion-chat` edge function has 32 new tools live. New chat threads now get meaningful names. Tested in browser — confirmed working.

---

## Resume next session

### Pending work (in priority order)

**1. Apply the Canvas AI fix** (1-line edit, ~30 sec)

File: `src/components/canvas/CanvasAIPanel.tsx`
Around line 1132, delete this orphaned line:
```typescript
setAtMentionQuery(null);
```
The variable was moved to `AssistantTextInput` in a refactor but this call wasn't cleaned up. It throws `ReferenceError: setAtMentionQuery is not defined` whenever the user sends a message in the canvas AI panel, preventing the fetch from firing.

After the fix: commit, run `npm run build` (or however the frontend deploys), and verify by sending "hello" in the canvas AI panel.

**2. Investigate the canvas_states 409 Conflict** (separate issue, lower priority)

Recurring error in browser console: `POST .../rest/v1/canvas_states?on_conflict=id 409 (Conflict)`. RLS likely denying upserts. Check `20260315_canvas_states.sql` and `20260504_canvas_states_admin_access.sql` policies. Not blocking AI work.

**3. Execute Wave 4** — Research + Analysis tools

Plan: [docs/superpowers/plans/2026-05-05-wave4-research.md](plans/2026-05-05-wave4-research.md)

5 new tools (all thin wrappers around existing edge functions):
- `run_audience_analysis` → wires `analyze-audience-alignment`
- `get_instagram_top_posts` → wires `fetch-instagram-top-posts`
- `deep_research` → wires `deep-research`
- `scrape_viral_channel` → wires `scrape-channel`
- `list_vault_files` → reads `canvas_media` table

Architecture: create `supabase/functions/companion-chat/tools/research.ts`, then add the import + spread + handler chain entry in `supabase/functions/companion-chat/index.ts` (same pattern as Wave 2/3).

Final step: update rule 19 of the system prompt in `index.ts` to include all 5 new Wave 4 tool names.

Deploy with `npx supabase functions deploy companion-chat`.

---

## Key files

### Documentation
- Spec: [docs/superpowers/specs/2026-05-05-ai-full-parity-design.md](specs/2026-05-05-ai-full-parity-design.md)
- Wave 1 plan: [docs/superpowers/plans/2026-05-05-wave1-infrastructure.md](plans/2026-05-05-wave1-infrastructure.md)
- Wave 2 plan: [docs/superpowers/plans/2026-05-05-wave2-core-tools.md](plans/2026-05-05-wave2-core-tools.md)
- Wave 3 plan: [docs/superpowers/plans/2026-05-05-wave3-intelligence.md](plans/2026-05-05-wave3-intelligence.md)
- Wave 4 plan: [docs/superpowers/plans/2026-05-05-wave4-research.md](plans/2026-05-05-wave4-research.md)

### Code
- Edge function: [supabase/functions/companion-chat/index.ts](../../supabase/functions/companion-chat/index.ts) — has Wave 1+2+3 wiring
- Tool modules (Waves 2+3 done):
  - [supabase/functions/companion-chat/tools/types.ts](../../supabase/functions/companion-chat/tools/types.ts) — shared `ToolContext`, `ToolDef`, `resolveClient`
  - [supabase/functions/companion-chat/tools/leads.ts](../../supabase/functions/companion-chat/tools/leads.ts)
  - [supabase/functions/companion-chat/tools/finances.ts](../../supabase/functions/companion-chat/tools/finances.ts)
  - [supabase/functions/companion-chat/tools/scripts.ts](../../supabase/functions/companion-chat/tools/scripts.ts)
  - [supabase/functions/companion-chat/tools/editing.ts](../../supabase/functions/companion-chat/tools/editing.ts)
  - [supabase/functions/companion-chat/tools/intelligence.ts](../../supabase/functions/companion-chat/tools/intelligence.ts)
  - [supabase/functions/companion-chat/tools/client.ts](../../supabase/functions/companion-chat/tools/client.ts)
- Canvas reader helper: [supabase/functions/companion-chat/canvasReader.ts](../../supabase/functions/companion-chat/canvasReader.ts)
- Frontend: [src/components/CompanionDrawer.tsx](../../src/components/CompanionDrawer.tsx), [src/pages/CommandCenter.tsx](../../src/pages/CommandCenter.tsx) — both pass `thread_id` and handle 5 action types
- Frontend listeners: 6 data pages (`LeadTracker`, `EditingQueue`, `ContentCalendar`, `Scripts`, `Finances`, `ContractsPage`) — all have `ai:data-changed` listeners

### Pattern for adding a new tool module (used by Waves 2-4)

1. Create `supabase/functions/companion-chat/tools/<name>.ts` exporting `<NAME>_TOOLS: ToolDef[]` and `handle<Name>Tool(block, ctx): Promise<ToolResult | null>`
2. In `index.ts`:
   - Add `import { <NAME>_TOOLS, handle<Name>Tool } from "./tools/<name>.ts";`
   - Spread `...<NAME>_TOOLS,` into the `TOOLS` array
   - Add `?? await handle<Name>Tool(block, moduleCtx)` to the module handler chain
3. Update rule 19 in the system prompt with the new tool names
4. Deploy: `npx supabase functions deploy companion-chat`

### Frontend action types (response shape from edge function)

```ts
{
  reply: string,
  thread_id: string,
  actions: Array<
    | { type: "navigate", path: string }
    | { type: "fill_onboarding", fields: object }
    | { type: "open_client", client_id: string }
    | { type: "refresh_data", scope: "leads" | "editing_queue" | "calendar" | "scripts" | "finances" | "contracts" | "all" }
    | { type: "show_notification", message: string }
  >
}
```

### `ToolContext` shape (passed to every Wave 2-4 handler)

```ts
{
  adminClient: SupabaseClient,    // service role — can bypass RLS
  userId: string,                  // current authenticated user
  client: { id, name, onboarding_data? },  // active client (URL-locked or primary)
  actions: Array<...>              // mutable — push action objects to be returned to frontend
}
```

---

## Environment notes from the paused session

- The local working environment had filesystem instability (130 source files were truncated to 0 bytes mid-session). Recovery procedure: restore `.git/HEAD` (`ref: refs/heads/main`), restore `.git/refs/heads/main` to commit SHA, `touch .git/packed-refs`, run `git reset --hard HEAD`. Git objects were intact throughout — only refs and working tree got hit.
- If files truncate again in the new environment, that's the same recovery.
- A backup of `.git/objects/` from the paused session is at `/tmp/connecta-git-objects-backup-1778015816.tar.gz` (840K).

---

## Ground truth from production behavior (verified by user)

When testing the deployed edge function:
- "How many leads does Dr Calvin have?" only returned `"On it."` — at the time, the Wave 2 tools were imported but NOT spread into the TOOLS array yet, so Claude couldn't see them. **This is now fixed** in the deployed function (commit `a224742`).
- New chat thread naming works correctly — threads get titled from the first 6 words of the user message.
- Old "Active companion chat" sentinel threads still exist for historical conversations — this is fine, only new threads use the new naming.
