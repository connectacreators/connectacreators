-- =============================================================================
-- 2026-04-20: Finance Tracker tables (admin-only)
--
-- Two tables, RLS locked to `is_admin()`. No anon access, no per-user scoping
-- (the owner is the only admin and RLS is the real gate).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('income', 'expense')),
  amount             numeric(12, 2) NOT NULL CHECK (amount >= 0),
  deductible_amount  numeric(12, 2),
  vendor             text,
  client             text,
  category           text NOT NULL,
  description        text,
  payment_method     text,
  date               date NOT NULL DEFAULT CURRENT_DATE,
  is_ar              boolean NOT NULL DEFAULT false,
  raw_input          text,
  attachment_url     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- Auto-update updated_at on UPDATE. Reuses the existing helper if present,
-- otherwise creates one.
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_transactions_set_updated_at ON public.finance_transactions;
CREATE TRIGGER finance_transactions_set_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS finance_transactions_user_date_idx
  ON public.finance_transactions (user_id, date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_user_type_idx
  ON public.finance_transactions (user_id, type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_user_category_idx
  ON public.finance_transactions (user_id, category)
  WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS public.finance_month_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month            text NOT NULL,                          -- YYYY-MM
  salary_payout    numeric(12, 2) NOT NULL DEFAULT 0,
  tax_rate         numeric(5, 4)  NOT NULL DEFAULT 0.2500, -- 25%
  employee_salary  numeric(12, 2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

DROP TRIGGER IF EXISTS finance_month_settings_set_updated_at ON public.finance_month_settings;
CREATE TRIGGER finance_month_settings_set_updated_at
  BEFORE UPDATE ON public.finance_month_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();


-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_month_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read finance_transactions"   ON public.finance_transactions;
DROP POLICY IF EXISTS "admin insert finance_transactions" ON public.finance_transactions;
DROP POLICY IF EXISTS "admin update finance_transactions" ON public.finance_transactions;
DROP POLICY IF EXISTS "admin delete finance_transactions" ON public.finance_transactions;
DROP POLICY IF EXISTS "admin all finance_month_settings"  ON public.finance_month_settings;

CREATE POLICY "admin read finance_transactions"
  ON public.finance_transactions FOR SELECT USING (is_admin());

CREATE POLICY "admin insert finance_transactions"
  ON public.finance_transactions FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "admin update finance_transactions"
  ON public.finance_transactions FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin delete finance_transactions"
  ON public.finance_transactions FOR DELETE USING (is_admin());

CREATE POLICY "admin all finance_month_settings"
  ON public.finance_month_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
