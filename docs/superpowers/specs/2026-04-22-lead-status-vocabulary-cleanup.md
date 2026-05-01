# Lead Status Vocabulary Cleanup

**Date:** 2026-04-22
**Status:** Design — not yet scheduled
**Scope:** Normalize lead status vocabulary at the `fetch-leads` edge function boundary so the frontend only ever sees canonical status strings.

---

## Why

Today `leads.status` carries two parallel vocabularies depending on where the lead was created:

| Source | Canonical status written | Legacy status written |
|---|---|---|
| Supabase `leads` table (public booking, direct insert) | `"Booked"` | — |
| Notion leads DB (synced via `fetch-leads`) | — | `"Appointment Booked"` |

Both are merged into one list by [fetch-leads/index.ts:263-280](supabase/functions/fetch-leads/index.ts#L263-L280), Notion taking priority on dedup. The mismatch forced a quick-fix shim on 2026-04-22 — every counter in [LeadTracker.tsx](src/pages/LeadTracker.tsx) now has to know both strings via a `BOOKED_STATUSES` set ([line 89](src/pages/LeadTracker.tsx#L89)). This is a bandaid — any future counter, chart, filter, or workflow trigger that checks `status === "Booked"` will silently undercount Notion-sourced bookings.

Same pattern exists for the other legacy labels (`"Meta Ad (Not Booked)"`, `"Follow up #1 (Not Booked)"`, …) — they're accepted by [update-lead-status/index.ts:15](supabase/functions/update-lead-status/index.ts#L15) as allowed inputs but render as muted-gray badges because [STATUS_COLORS](src/pages/LeadTracker.tsx) doesn't know about them.

## What changes

One-way normalization applied at the edge, just before merging Notion leads with DB leads. The frontend always sees canonical strings. The original Notion status is preserved in a sidecar field so write-back still targets the exact Notion select option the user picked.

### Canonical mapping

```ts
const NOTION_TO_CANONICAL: Record<string, string> = {
  "Appointment Booked":           "Booked",
  "Meta Ad (Not Booked)":         "New Lead",
  "Follow up #1 (Not Booked)":    "Follow-up 1",
  "Follow up #2 (Not Booked)":    "Follow-up 2",
  "Follow up #3 (Not Booked)":    "Follow-up 3",
  // canonical values pass through unchanged
};
```

### Edge change — `fetch-leads/index.ts`

At the Notion parse site ([line 239](supabase/functions/fetch-leads/index.ts#L239)):

```ts
const rawNotionStatus = props["Lead Status"]?.select?.name || "";
return {
  ...
  leadStatus: NOTION_TO_CANONICAL[rawNotionStatus] ?? rawNotionStatus,
  rawNotionStatus,   // sidecar — only present on Notion-sourced leads
};
```

`statusOptions` returned to the client is also mapped through `NOTION_TO_CANONICAL` and deduped, so the status-filter dropdown stops showing both `"Booked"` and `"Appointment Booked"` as separate options.

### Frontend change — `LeadTracker.tsx`

- Drop the `BOOKED_STATUSES` shim at [line 89](src/pages/LeadTracker.tsx#L89) and the `"Appointment Booked"` entry added to `STATUS_COLORS` at [line 84](src/pages/LeadTracker.tsx#L84). All filters revert to `status === "Booked"`.
- When the user changes status on a Notion-sourced lead, the status picker sends the canonical value. `update-lead-status` needs to reverse-map it before writing to Notion (next section).

### Edge change — `update-lead-status/index.ts`

Non-`db_` leads route to Notion ([line 127-145](supabase/functions/update-lead-status/index.ts#L127-L145)). Before writing, reverse-map canonical → legacy IF the target Notion DB's select options use the legacy vocabulary. Detect by fetching the Notion DB schema (or caching it with the lead fetch) and picking whichever form the schema exposes.

```ts
// pseudocode
const notionStatus = notionDbUsesLegacy
  ? (CANONICAL_TO_NOTION[newStatus] ?? newStatus)
  : newStatus;
```

This avoids the write-back risk flagged when the shim was chosen: writing `"Booked"` to a Notion DB whose select only has `"Appointment Booked"` would create an orphan option.

## Write-back risk — how we handle it

Three possible Notion DB states for a given client:

1. **Notion DB uses canonical only** (`"Booked"`, `"New Lead"`, …) → reverse-map is a no-op, write canonical directly.
2. **Notion DB uses legacy only** (`"Appointment Booked"`, …) → reverse-map canonical → legacy before writing.
3. **Notion DB has both** (transitional) → prefer canonical; legacy still works.

The Notion DB schema is already fetched by `fetch-leads` ([line 187-200](supabase/functions/fetch-leads/index.ts#L187-L200)) to populate status options — cache it briefly or re-fetch on write to decide which vocabulary the target DB exposes.

## Out of scope

- Rewriting existing Notion records in-place to canonical (one-time migration is cheaper but risky — leave legacy Notion records alone; normalization handles them on read).
- Changing Supabase `leads.status` CHECK constraint (if any) — no schema change needed.
- Adding new statuses or changing workflow trigger semantics.

## Files touched

| File | Change |
|---|---|
| `supabase/functions/fetch-leads/index.ts` | Apply `NOTION_TO_CANONICAL` on Notion parse; dedupe statusOptions; emit `rawNotionStatus` sidecar |
| `supabase/functions/update-lead-status/index.ts` | Reverse-map canonical → legacy when target Notion DB uses legacy vocabulary |
| `src/pages/LeadTracker.tsx` | Remove the `BOOKED_STATUSES`/`CANCELED_STATUSES` shim + the `"Appointment Booked"` STATUS_COLORS entry; counters go back to exact canonical checks |

## Testing

- **Dr Calvin's client** (Notion-backed, mixed vocabularies in the wild): Booked counter should match visible "Appointment Booked" + "Booked" badges after normalization.
- Change a lead from `"Booked"` → `"Canceled"` on a Notion-backed client; confirm the Notion record updates to whichever vocabulary that DB uses, not both.
- A lead coming from the public booking widget (DB-only, no Notion DB configured) should continue to work end-to-end (canonical in, canonical out).

## Deployment

1. Deploy edge functions (`supabase functions deploy fetch-leads update-lead-status`)
2. Build + deploy frontend
3. Cloudflare purge
4. No DB migration required
