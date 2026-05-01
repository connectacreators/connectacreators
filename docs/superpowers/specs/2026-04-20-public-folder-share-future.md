# Public Folder Share — Future Planning (v2+)

**Date:** 2026-04-20
**Status:** Planning doc — not scheduled yet
**Companion:** [2026-04-20-public-folder-share-design.md](./2026-04-20-public-folder-share-design.md) (v1 spec)

This doc captures everything we **deliberately cut from v1** so we can come back to it with context intact.

---

## Phase 2: Editor Mode

**Goal:** Google Drive parity — links can grant edit access, not just view.

**What "edit" means for scripts:**
- Change title, content, formato, target, idea_ganadora
- Mark as `grabado` / unmark
- Upload a Google Drive link
- NOT: create/delete scripts (that stays owner-only for v2; maybe v3)
- NOT: restructure folders (owner-only)

**New risks vs. viewer mode:**
- Anonymous writes — need rate limiting and abuse protection
- Concurrent edit conflicts — need last-write-wins or CRDT/OT (start with last-write-wins + warning banner if remote change detected)
- Link leaks become destructive, not just a privacy issue — need audit log of who edited what from which share link (IP + timestamp is enough to start)
- Moderation — need a "revert to version X" flow for owners, powered by an edit history table

**Data model additions:**
```sql
create table script_edits (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  share_token text,                   -- which share link authored it (null = owner)
  editor_ip inet,
  editor_fingerprint text,            -- browser fingerprint for repeat-edit detection
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
```

Owners get a "Revision history" panel per script showing all anonymous edits with timestamps, IPs, and revert buttons.

**Rate limiting:** 20 writes/hour per IP on the edit endpoint. Stricter than reads.

**UI in reader:**
- Edit button only visible if share permission is `editor`
- Inline edit with autosave (debounced 2s)
- Save state indicator: "Saving..." → "Saved" → "Offline" if network fails
- Change banner if someone else edited while you were typing: "This script was edited 2 minutes ago by someone else. Reload to see changes."

**Unknown before implementation:**
- Does Supabase RLS cleanly express "anon can update if valid token"? Or do we need to go through an edge function for every write too? (Edge function is safer — rate limit hooks are easier.)

---

## Phase 3: Permission Granularity

**Today (v1):** One permission per link.
**Future:** Multiple links per folder, each with its own permission.

Example:
- Link A: `Viewer` — sent to clients for review
- Link B: `Editor` — sent to co-writers
- Link C: `Commenter` — sent to stakeholders who can leave feedback but not edit

Implement as: multiple rows in `script_folder_shares` per folder, each with its own token and permission.

UI: Share dialog shows a list of active links with "+New link" button.

---

## Phase 4: Comments & Approvals (reader engagement)

Mirror what video review has (`revisionCommentService`), applied to scripts:

- Readers can leave comments at the script level (no inline/line-level yet — keep simple)
- Owner sees comment badge on the script in the Scripts page
- Readers can "Approve" a script (green checkmark) — owner sees approval status in their Scripts list
- Optional: "Mark as filmed" — useful for creators tracking what's shot

**Data model:**
```sql
create table script_comments (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  share_token text,
  author_name text,                   -- optional, reader-entered
  body text not null,
  created_at timestamptz not null default now()
);

create table script_approvals (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts(id) on delete cascade,
  share_token text,
  approver_name text,
  approved_at timestamptz not null default now()
);
```

---

## Phase 5: Access Control Refinements

- **Expiry dates** — optional `expires_at` column, enforced by edge function
- **Password protection** — `password_hash` column; reader hits a password gate before reader loads
- **Email-gated access** — require reader to enter email before viewing; log emails for owner (marketing/CRM value). Useful for lead gen with script samples.
- **Download watermark** — "Shared by {owner} via Connecta" watermark on PDF exports (phase 6)

---

## Phase 6: Export & Print

- "Download as PDF" button in reader — generates a branded PDF of all scripts in the shared folder
- "Print view" — CSS-only print stylesheet, 1 script per page
- Branding: Connecta logo in header/footer unless owner is on a plan that removes branding

---

## Phase 7: Analytics for Owner

Owner Scripts page shows share-level analytics:
- Views: total, unique (by IP hash)
- Which scripts were opened most
- Average time on script
- Last viewed timestamp

Implement with a lightweight view-log table (avoid Google Analytics / PostHog for privacy reasons — it's a share for a client, not a marketing page).

---

## Phase 8: Real-Time Collaboration

**Only consider after Phase 2 ships and we see demand.**

- Live cursors in edit mode (Supabase Realtime + presence)
- Conflict resolution: CRDT (Yjs) instead of last-write-wins
- Typing indicators

High effort, uncertain payoff. Don't build speculatively.

---

## Decision Log

- **Why v1 is view-only:** Edit mode introduces anon writes, which require rate limiting, abuse protection, conflict resolution, and audit logging. Shipping viewer first lets us validate the sharing flow without those risks. (Decided 2026-04-20.)
- **Why folder-scoped, not script-scoped:** Individual script sharing already exists (`/s/:id`). The gap is sharing multiple scripts as a cohesive batch, and folders are already the user's mental model for batches.
- **Why opaque tokens, not UUIDs:** Folder UUIDs are also used internally; leaking them could let attackers probe. Tokens are revocable and decoupled.

---

## Not Deciding Yet

- Whether to allow sharing scripts across clients via folders (probably no — folders are client-scoped today)
- Whether to build a "requests access" flow (feels enterprise-y, probably over-engineered for this user base)
- Whether to integrate with Google Drive as a mirror (complex; skip unless explicitly requested)
