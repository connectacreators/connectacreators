# Finance Tracker — Design Spec
**Date:** 2026-04-20
**Status:** Ready for implementation (v2 after review)

---

## Summary

Admin-only **Finance Tracker** inside the existing `DashboardLayout`. Typed as a new sidebar item and route `/finances`, visible only when `isAdmin === true`.

Core feature: **natural language entry**. User types one line (e.g. `"Saratoga just paid us $4,000"` or `"Spent $450 on Facebook ads"`) → a Supabase edge function calls Claude → entry is categorized, auto-dated, and if ambiguous the UI asks a clarifying question. Entries land in `finance_transactions`.

---

## Access Control

- Gated to **`isAdmin === true`** from the existing `useAuth()` context ([src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)). `isAdmin` is derived from `role === "admin"` in the `user_roles` table.
- Sidebar item **hidden** (not disabled) for non-admins.
- Page-level guard is a one-liner inside `Finances.tsx`:
  ```tsx
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  ```
  No separate `AdminGuard` component — matches the ad-hoc pattern used elsewhere in the codebase.
- Server-side RLS is the **real** gate (see Data Model). The frontend check is UX only.

---

## Route

```tsx
// App.tsx — inside the existing DashboardLayout block
const Finances = lazy(() => import("./pages/Finances"));
// ...
<Route path="/finances" element={<Finances />} />
```

---

## UI Layout

Dark background, cyan accent — matches existing app styling.

```
┌─────────────────────────────────────────────────────┐
│ [← Apr 2026 →]                      [Export ↓]      │
├──────────────────────────────────┬──────────────────┤
│  AI Input Bar                    │  Summary Panel   │
│  [type entry here...]  [Log it]  │                  │
│                                  │  Total Income    │
│  AI Clarification Bubble         │  A/R Pending     │
│  (when AI needs more info)       │  Collected       │
│                                  │  Total Expenses  │
│  ── Income ──────────────────    │  ────────────    │
│  [client rows]                   │  Gross Income    │
│                                  │  Salary Payout   │
│  ── Expenses ─────────────────   │  Net Profit      │
│  [expense rows]                  │  Tax 25%         │
│                                  │  ────────────    │
│                                  │  Owner's Dist.   │
│                                  │  Take-Home Pay   │
│                                  │  [Export Excel]  │
└──────────────────────────────────┴──────────────────┘
```

Transaction rows show inline **edit** and **delete** icons on hover. Edit opens the row in-place; delete is a soft-delete (see Data Model).

---

## AI Natural Language Entry

### Flow
1. User types in the input and hits **Log it**.
2. Frontend calls the edge function `finance-parse-entry` with `{ raw: string }`.
3. Edge function invokes **Claude (`claude-sonnet-4-6`)** with a structured prompt and returns JSON.
4. If `needsClarification === true`, the clarification bubble shows the question + quick-tap chips.
5. On confirm, the row is inserted into `finance_transactions` (`raw_input` stores the original text).
6. **Fallback**: if the edge function errors or Claude can't extract an amount, the UI shows an inline manual-entry form (same fields) so entry never gets blocked.

### Edge function: `finance-parse-entry`
- Location: `supabase/functions/finance-parse-entry/index.ts`
- `verify_jwt = false` at the gateway; the function itself calls `supabase.auth.getUser()` and **refuses** if the caller is not admin (same pattern as the rest of the project).
- Inputs: `{ raw: string, today?: string }`.
- Outputs: the parsed JSON structure below or `{ error: "clarify", question, options }` or `{ error: "unparseable" }`.
- Uses the **`ANTHROPIC_API_KEY`** env var already configured for `categorize-script`.

### Parsed shape
```ts
{
  type: "income" | "expense",
  amount: number,
  vendor?: string,
  client?: string,
  category: Category,
  description?: string,
  date: string,             // ISO; default today
  payment_method?: string,
  is_ar?: boolean,
  deductible_amount?: number,  // only for Food & Meals (amount * 0.5)
  needsClarification?: boolean,
  clarificationQuestion?: string,
  clarificationOptions?: string[]
}
```

### Categories
- **Income:** `SMMA`, `Bi-Weekly Fee`, `One-Time Project`, `Other Income`
- **Expenses:** `Subscriptions`, `Ad Spend`, `Travel`, `Food & Meals`, `Contractors`, `Software`, `Payroll`, `Other`

### Food & Meals — 50% rule
- Logged at full `amount`.
- `deductible_amount = amount * 0.5` (nullable for all non-food rows).
- Summary panel shows total food spend + deductible portion separately.
- AI must ask *"Was this a team/business meal?"* to confirm the deduction qualifies.

### System prompt (sketch)
```
You are a finance assistant for Connecta Creators, an SMMA agency in Utah.
Parse the user's message → strict JSON with:
{ type, amount, vendor, client, category, description, date, payment_method,
  is_ar, deductible_amount, needsClarification, clarificationQuestion, clarificationOptions }

Rules:
- Food/meals → category "Food & Meals"; set deductible_amount = amount/2; ask to confirm business purpose.
- If client named (Saratoga, Dr Calvin, IOTA Media, Master Construction, etc.), extract it.
- date defaults to the `today` arg (caller's local date).
- If ambiguous income-vs-expense, set needsClarification true.
- clarificationOptions: array of 2–3 short answers.
- Reject garbage input by returning { error: "unparseable" }.
```

---

## Data Model (Supabase)

### Table: `finance_transactions`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK `auth.users(id)` — always the admin. RLS handles gating. |
| `type` | text | `income` / `expense` |
| `amount` | numeric(12,2) | full amount |
| `deductible_amount` | numeric(12,2) | null unless Food & Meals |
| `vendor` | text | nullable |
| `client` | text | nullable |
| `category` | text | one of the category lists |
| `description` | text | nullable |
| `payment_method` | text | nullable |
| `date` | date | the transaction date (month is derived via `date_trunc`, not stored) |
| `is_ar` | boolean | income not yet collected |
| `raw_input` | text | original user-typed line |
| `attachment_url` | text | optional receipt photo (Supabase Storage) |
| `created_at` | timestamptz default `now()` | |
| `updated_at` | timestamptz default `now()` | trigger updates on UPDATE |
| `deleted_at` | timestamptz | soft delete, matches existing `scripts.deleted_at` pattern |

Indexes: `(user_id, date DESC)`, `(user_id, type)`, `(user_id, category)`; partial index `WHERE deleted_at IS NULL` on common queries.

### Table: `finance_month_settings`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK |
| `month` | text | `YYYY-MM` format (this one *does* need a key since it's the identity of the row) |
| `salary_payout` | numeric(12,2) | |
| `tax_rate` | numeric(5,4) | default `0.25` |
| `employee_salary` | numeric(12,2) | |
| `created_at` / `updated_at` | timestamptz | |

Unique constraint on `(user_id, month)`.

### RLS
```sql
alter table finance_transactions enable row level security;
alter table finance_month_settings enable row level security;

-- Admin only. Uses the existing is_admin() helper (same pattern as the rest of the project).
create policy "admin read finance_transactions"   on finance_transactions for select using (is_admin());
create policy "admin insert finance_transactions" on finance_transactions for insert with check (is_admin());
create policy "admin update finance_transactions" on finance_transactions for update using (is_admin()) with check (is_admin());
create policy "admin delete finance_transactions" on finance_transactions for delete using (is_admin());

create policy "admin all finance_month_settings"  on finance_month_settings for all using (is_admin()) with check (is_admin());
```

No anon access; no per-user scoping is needed because only admins touch this data.

---

## Monthly Summary (frontend computation)

```
Total Income         = Σ amount where type='income'
A/R Pending          = Σ amount where type='income' AND is_ar=true
Collected Income     = Total Income − A/R Pending    (renamed from "Net Income" for clarity)
Total Expenses       = Σ amount where type='expense'
Gross Income         = Collected Income − Total Expenses
Net Profit           = Gross Income − salary_payout
Tax Withholding      = Net Profit * tax_rate
Owner's Distribution = Net Profit − Tax Withholding
Take-Home Pay        = employee_salary + Owner's Distribution
Food Deductible      = Σ deductible_amount where category='Food & Meals'  (shown as footnote)
```

All scoped to the selected month via `date >= first_day AND date < first_day_next_month AND deleted_at IS NULL`.

---

## Month Navigation

- Default: current calendar month (user's local TZ).
- `←` / `→` cycle months. No month is pre-created; an empty month shows a "Log your first entry" prompt.

---

## Edit / Delete

- **Edit**: pencil icon → row becomes editable in place (amount, category, vendor/client, description, date, is_ar). Saving updates the row, writes `updated_at`, leaves `raw_input` untouched.
- **Delete**: trash icon → confirmation → set `deleted_at = now()`. Soft-delete preserves audit trail and lets us add "restore" later without a migration.

---

## Export

- **Excel/CSV**: extend `src/utils/csvExport.ts` to support finance rows.
- **PDF**: `window.print()` with a print-only CSS class that shows only the summary panel.

---

## Files to Create

| file | purpose |
|---|---|
| `src/pages/Finances.tsx` | main page (includes the admin redirect guard) |
| `src/components/finances/AIEntryBar.tsx` | input + call to edge function |
| `src/components/finances/TransactionList.tsx` | income + expense rows with inline edit/delete |
| `src/components/finances/MonthlySummary.tsx` | right-panel breakdown |
| `src/components/finances/AIClarificationBubble.tsx` | follow-up question UI |
| `src/components/finances/ManualEntryForm.tsx` | fallback form when AI can't parse |
| `src/hooks/useFinanceTransactions.ts` | Supabase queries + soft-delete helpers |
| `src/hooks/useFinanceMonthSettings.ts` | month-level salary/tax settings |
| `src/hooks/useFinanceAI.ts` | edge-function invoke + response handling |
| `supabase/functions/finance-parse-entry/index.ts` | Claude-powered parser |
| `supabase/migrations/20260420130000_finance_tables.sql` | both tables + RLS |

---

## Files to Modify

| file | change |
|---|---|
| `src/App.tsx` | lazy import + route for `/finances` |
| `src/components/DashboardSidebar.tsx` | admin-gated "Finances" item |
| `supabase/config.toml` | register `finance-parse-entry` with `verify_jwt = false` |

---

## Deployment Order

1. Apply migration (new tables are additive; nothing breaks if frontend isn't shipped yet).
2. Deploy edge function.
3. Build + scp frontend to VPS.
4. Purge Cloudflare.

---

## Utah Tax Context

- Utah flat state income tax: 4.85%.
- The default 25% withholding covers federal + Utah + self-employment roughly; `tax_rate` is per-month adjustable once there's data.

---

## Out of Scope (deferred)

- Bank integration (Plaid).
- Multi-admin access (single-admin semantics today).
- Historical Excel import (manual entry going forward).
- Recurring-entry automation.
- Receipt OCR (attachment_url field exists but no OCR yet).
