-- =============================================================================
-- 2026-04-20: Recurring subscriptions for Finance Tracker
--
-- Separates subscription "templates" from concrete monthly/annual instances.
-- Each recurring expense (Gusto, Claude AI, Zapier, etc.) lives in
-- `finance_recurring_subscriptions`. When the user views a month we call
-- `finance_generate_recurring(uid, 'YYYY-MM')` which materialises any missing
-- instances into `finance_transactions` with `recurring_subscription_id` set.
-- Each row points back to its template; cancelling/editing the template
-- affects future generations only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.finance_recurring_subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('income', 'expense')),
  vendor             text,
  client             text,
  category           text NOT NULL,
  description        text,
  amount             numeric(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method     text,
  deductible_ratio   numeric(4, 3),              -- e.g. 0.5 for Food & Meals; null = not deductible
  interval           text NOT NULL CHECK (interval IN ('monthly', 'annual')),
  day_of_month       int  NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  start_month        text NOT NULL,              -- 'YYYY-MM' — first month this charges
  end_month          text,                       -- null = still active
  last_generated_month text,                     -- housekeeping
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS finance_recurring_set_updated_at ON public.finance_recurring_subscriptions;
CREATE TRIGGER finance_recurring_set_updated_at
  BEFORE UPDATE ON public.finance_recurring_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS finance_recurring_user_active_idx
  ON public.finance_recurring_subscriptions (user_id)
  WHERE end_month IS NULL;

ALTER TABLE public.finance_recurring_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all finance_recurring_subscriptions" ON public.finance_recurring_subscriptions;
CREATE POLICY "admin all finance_recurring_subscriptions"
  ON public.finance_recurring_subscriptions FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Link transactions to their template (nullable — non-recurring rows don't have one).
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_subscription_id uuid
    REFERENCES public.finance_recurring_subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS finance_transactions_recurring_idx
  ON public.finance_transactions (recurring_subscription_id)
  WHERE recurring_subscription_id IS NOT NULL AND deleted_at IS NULL;


-- ── Generator function ──────────────────────────────────────────────────────
-- Called from the frontend (RPC). For each active template whose start_month
-- <= p_month <= end_month (end exclusive), insert a finance_transactions row
-- for p_month if one doesn't already exist. Annual subs only fire on their
-- month-of-year anniversary.
CREATE OR REPLACE FUNCTION public.finance_generate_recurring(p_user_id uuid, p_month text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  month_start date;
  month_last_day int;
  target_day int;
  target_date date;
  generated_count int := 0;
BEGIN
  -- Admin-only gate.
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  month_start := (p_month || '-01')::date;
  month_last_day := EXTRACT(DAY FROM (month_start + INTERVAL '1 month - 1 day'))::int;

  FOR sub IN
    SELECT * FROM public.finance_recurring_subscriptions
    WHERE user_id = p_user_id
      AND start_month <= p_month
      AND (end_month IS NULL OR end_month >= p_month)
  LOOP
    -- Annual subs only generate on their anniversary month.
    IF sub.interval = 'annual'
       AND split_part(p_month, '-', 2) <> split_part(sub.start_month, '-', 2) THEN
      CONTINUE;
    END IF;

    -- Clamp day_of_month to the actual number of days in the month (Feb 31 -> Feb 28/29).
    target_day := LEAST(sub.day_of_month, month_last_day);
    target_date := month_start + ((target_day - 1) || ' days')::interval;

    -- Skip if this template already has a (non-deleted) instance for this month.
    IF EXISTS (
      SELECT 1 FROM public.finance_transactions
      WHERE recurring_subscription_id = sub.id
        AND to_char(date, 'YYYY-MM') = p_month
        AND deleted_at IS NULL
    ) THEN
      UPDATE public.finance_recurring_subscriptions
      SET last_generated_month = GREATEST(COALESCE(last_generated_month, ''), p_month)
      WHERE id = sub.id;
      CONTINUE;
    END IF;

    INSERT INTO public.finance_transactions (
      user_id, type, amount, category, vendor, client, description,
      payment_method, date, is_ar,
      deductible_amount, recurring_subscription_id, raw_input
    ) VALUES (
      sub.user_id, sub.type, sub.amount, sub.category, sub.vendor, sub.client, sub.description,
      sub.payment_method, target_date, false,
      CASE WHEN sub.deductible_ratio IS NULL THEN NULL ELSE ROUND(sub.amount * sub.deductible_ratio, 2) END,
      sub.id,
      'Auto-generated from recurring subscription'
    );

    UPDATE public.finance_recurring_subscriptions
    SET last_generated_month = GREATEST(COALESCE(last_generated_month, ''), p_month)
    WHERE id = sub.id;

    generated_count := generated_count + 1;
  END LOOP;

  RETURN generated_count;
END $$;

GRANT EXECUTE ON FUNCTION public.finance_generate_recurring(uuid, text) TO authenticated;


-- ── Backfill existing MONTHLY / ANNUAL subscription rows ────────────────────
-- Every existing finance_transactions row whose description marks it as a
-- monthly/annual subscription becomes a template. The existing row is
-- linked back (`recurring_subscription_id`). Idempotent: skipped if already
-- linked.
DO $$
DECLARE
  r RECORD;
  tpl_id uuid;
  tpl_interval text;
  anchor_month text;
  anchor_day int;
BEGIN
  FOR r IN
    SELECT ft.*
    FROM public.finance_transactions ft
    WHERE ft.deleted_at IS NULL
      AND ft.recurring_subscription_id IS NULL
      AND (
        ft.description ILIKE '%MONTHLY SUBSCRIPTION%'
        OR ft.description ILIKE '%ANNUAL SUBSCRIPTION%'
      )
  LOOP
    IF r.description ILIKE '%ANNUAL%' THEN
      tpl_interval := 'annual';
    ELSE
      tpl_interval := 'monthly';
    END IF;

    anchor_month := to_char(r.date, 'YYYY-MM');
    anchor_day   := EXTRACT(DAY FROM r.date)::int;

    -- Look for an already-created template for this (user, vendor, amount, interval).
    SELECT id INTO tpl_id
    FROM public.finance_recurring_subscriptions
    WHERE user_id = r.user_id
      AND COALESCE(vendor, '') = COALESCE(r.vendor, '')
      AND amount = r.amount
      AND interval = tpl_interval
    LIMIT 1;

    IF tpl_id IS NULL THEN
      INSERT INTO public.finance_recurring_subscriptions (
        user_id, type, vendor, client, category, description, amount, payment_method,
        deductible_ratio, interval, day_of_month, start_month, last_generated_month
      ) VALUES (
        r.user_id, r.type, r.vendor, r.client, r.category, r.description, r.amount, r.payment_method,
        CASE WHEN r.category = 'Food & Meals' THEN 0.5 ELSE NULL END,
        tpl_interval, anchor_day, anchor_month, anchor_month
      ) RETURNING id INTO tpl_id;
    END IF;

    UPDATE public.finance_transactions
    SET recurring_subscription_id = tpl_id
    WHERE id = r.id;
  END LOOP;
END $$;
