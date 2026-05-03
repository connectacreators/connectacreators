# Contracts Feature — Design Spec
Date: 2026-05-02

## Overview

A built-in contract signing system that replaces DocuSign. Admins upload PDFs (or reuse templates), sign first, then send to clients to sign. Signatures are typed names rendered in cursive and overlaid on the bottom of the last page of the PDF. The fully signed PDF is stored in Supabase Storage and downloadable by either party.

---

## Decisions Summary

| Decision | Choice |
|---|---|
| Location | Contracts tab inside each client's detail page |
| Client signing access | Email link (no login) OR in-app Connecta account — admin chooses per contract |
| Signature type | Typed name rendered in one of 3 cursive font styles |
| Signing order | Admin signs first, then client |
| Signature placement | Overlaid at bottom of last page of the PDF |
| After full signing | Stored as downloadable PDF — no auto-email |
| Templates | Yes — save a base PDF as a reusable template |
| PDF processing | Supabase Edge Function using pdf-lib (Deno) |

---

## Database Schema

### `contract_templates`

Reusable base PDFs managed by admins. Not client-specific.

```sql
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users not null,
  name text not null,
  storage_path text not null,       -- path in `contract-templates` bucket
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `contracts`

One row per contract instance tied to a specific client.

```sql
create table contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients not null,
  template_id uuid references contract_templates,   -- null if uploaded fresh
  created_by uuid references auth.users not null,
  title text not null,

  -- Status lifecycle: draft → awaiting_client → complete | voided
  status text not null default 'draft'
    check (status in ('draft','awaiting_client','complete','voided')),

  -- Storage paths in `contracts` bucket
  original_storage_path text not null,              -- the uploaded PDF, never modified
  current_storage_path text,                        -- latest version (after each signing step)

  -- Admin signature
  admin_signed_at timestamptz,
  admin_signature_name text,
  admin_signature_font text,                        -- 'dancing-script' | 'great-vibes' | 'pinyon-script'

  -- Client signature
  client_signed_at timestamptz,
  client_signature_name text,
  client_signature_font text,

  -- Delivery
  send_method text check (send_method in ('email','in_app')),
  client_email text,
  send_message text,

  -- Email-link signing token
  signing_token uuid unique,
  signing_token_expires_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Status transitions:**
- `draft` — uploaded, not yet signed by admin
- `awaiting_client` — admin signed, sent to client
- `complete` — both signed
- `voided` — cancelled by admin

---

## Storage Buckets

### `contracts` (private, RLS-controlled)
```
{client_id}/{contract_id}/original.pdf       — uploaded PDF, never modified
{client_id}/{contract_id}/admin-signed.pdf   — after admin signs
{client_id}/{contract_id}/signed.pdf         — fully signed final document
```

### `contract-templates` (private, admin-only)
```
{template_id}/template.pdf
```

Signed URLs (short-lived) are used for all PDF access — no public URLs.

---

## Edge Functions

### `sign-contract`

Handles signature compositing for both admin and client.

**Request:**
```json
{
  "contract_id": "uuid",
  "role": "admin" | "client",
  "signature_name": "Roger Jimenez",
  "signature_font": "dancing-script",
  "signing_token": "uuid"   // required when role=client via email link
}
```

**What it does:**
1. Validates auth:
   - Admin: JWT must resolve to a user with admin role
   - Client via email link: `signing_token` must match a non-expired record; no JWT required
   - Client in-app: JWT must resolve to a user whose `user_id` is linked to the contract's `client_id` via the `clients` table
2. Loads the current PDF from Storage
3. Uses `pdf-lib` + embedded TTF font file to overlay the signature block on the last page:
   - Draws a horizontal rule above the signature area
   - Left column: agency name in cursive + timestamp
   - Right column: client name in cursive + timestamp (or blank placeholder if not yet signed)
4. Saves the new PDF to `admin-signed.pdf` or `signed.pdf` depending on role
5. Updates `contracts` row: sets `{role}_signed_at`, `{role}_signature_name`, `{role}_signature_font`, `current_storage_path`, and advances `status`

**Fonts bundled with Edge Function** (TTF files committed to `supabase/functions/sign-contract/fonts/`):
- `DancingScript-Regular.ttf`
- `GreatVibes-Regular.ttf`
- `PinyonScript-Regular.ttf`

### `send-contract`

Sends the contract to the client after admin has signed.

**Request:**
```json
{
  "contract_id": "uuid",
  "send_method": "email" | "in_app",
  "client_email": "maria@example.com",
  "message": "Please review and sign..."
}
```

**What it does:**
1. Generates a `signing_token` (UUID) + sets `signing_token_expires_at` to 30 days from now
2. Updates `contracts` row with delivery info
3. If `email`: sends email via Resend with a link to `/contract/{signing_token}`
4. If `in_app`: sets `send_method = 'in_app'`; contract becomes visible in client's dashboard
5. Sets `status = 'awaiting_client'`

---

## Frontend

### Routes

| Route | Auth | Purpose |
|---|---|---|
| `/clients/:clientId` (Contracts tab) | Admin/team | Manage contracts for a client |
| `/contract/:token` | None | Public signing page for email-link clients |

### Components

**`ContractsTab`** — rendered inside `ClientDetail` as a new tab

- Lists all contracts for the client with status badges: `Draft`, `Sign Now`, `Awaiting Client`, `Fully Signed`, `Voided`
- "Sign Now" badge + button on contracts awaiting admin signature
- "Resend" button on `awaiting_client` contracts
- "Download" button on `complete` contracts (generates short-lived signed URL)
- "Upload PDF" button → `ContractUploadModal`
- "From Template" button → template picker → `ContractUploadModal` pre-filled
- Templates section at bottom: saved templates with "Use" buttons + "Save as template" from any existing contract

**`ContractUploadModal`**

- Title field
- PDF file upload (accept: `.pdf` only, max 10MB)
- If from template: PDF pre-selected, shows template name
- On confirm: uploads PDF to `contracts/{clientId}/{contractId}/original.pdf`, creates `contracts` row with `status='draft'`

**`SigningModal`** (admin, in-app only)

- Split layout: PDF viewer (left) + signature panel (right)
- PDF viewer uses an `<iframe>` with a short-lived signed URL
- Signature panel:
  - Full name field (pre-filled from admin profile)
  - Font style picker: 3 options shown as live cursive previews
  - Preview box showing typed name in selected font (web font in browser, same font embedded in Edge Function)
  - Legal consent line
  - "Sign Document" button → calls `sign-contract` Edge Function → on success opens `SendContractModal`

**`SendContractModal`**

- Shows contract title + "Your signature done" confirmation
- Delivery method selector: Email link (default) or In-app
- If email: email field pre-filled from `clients.email`, editable
- Optional message textarea
- "Send to Client" button → calls `send-contract` Edge Function

**`PublicContractPage`** (`/contract/:token`)

- No auth required
- Fetches contract by `signing_token` — shows error if expired or already signed
- Same split layout as `SigningModal` (PDF left, signature panel right)
- On sign: calls `sign-contract` Edge Function with token
- On success: shows confirmation screen ("Contract signed. You can close this page.")

**Client in-app view** (existing client dashboard)

- Contracts with `send_method = 'in_app'` and `status = 'awaiting_client'` appear in the client's sidebar/section
- Client sees the same `PublicContractPage` layout but authenticated via their session (no token needed)

---

## Signature Block — PDF Overlay Spec

Placed at the bottom of the last page, with a `40pt` bottom margin and `50pt` left/right margin.

```
─────────────────────────────────────────────────────
Agency                          Client
[cursive name]                  [cursive name / blank]
[date · time]                   [date · time / "Awaiting signature"]
```

- Horizontal rule: 0.5pt, full width between margins
- Font size: 14pt cursive for name, 8pt regular for label and timestamp
- Two equal columns with 20pt gutter

---

## RLS Policies

**`contract_templates`:**
- Admins: full CRUD
- All others: no access

**`contracts`:**
- Admins: full CRUD on all contracts
- Client users: `SELECT` where `client_id` matches their associated client record AND `send_method = 'in_app'` AND `status = 'awaiting_client'` or `status = 'complete'`
- Public (no auth): no direct table access — Edge Function validates token server-side

---

## Contract Statuses & UI Treatment

| Status | Badge color | Admin action | Client action |
|---|---|---|---|
| `draft` | Gray | Open / Sign | — |
| `awaiting_client` | Gold | Resend / Void | Sign |
| `complete` | Green | Download | Download |
| `voided` | Red/muted | — | — |

---

## Out of Scope (v1)

- Signature field drag-and-drop placement (always bottom of last page)
- Automatic email to both parties on completion
- Audit log page (timestamps stored in DB but no dedicated UI)
- Expiry notifications / reminders
- Multiple signers beyond admin + one client
