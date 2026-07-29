-- ALREADY APPLIED TO PROD via Management API; never `db push` (see project
-- memory: DB migration drift — schema is applied by hand, not CLI).
--
-- Two fixes to recurring subscriptions.
--
-- 1. Deleting a generated instance no longer resurrects it.
--    finance_generate_recurring skipped a month only when a NON-deleted
--    instance existed, so soft-deleting one and revisiting the month
--    re-inserted it. Confirmed in prod: two July 2026 subscriptions each
--    held one deleted row plus one live row for the same month. Deliberate
--    deletions must stick, so the guard now counts ANY instance for that
--    month, deleted or not.
--
-- 2. skipped_months lets "delete just this month" mean exactly that,
--    without ending the subscription. The generator honours it, so a
--    one-off skip and a permanent cancel (end_month) stay distinct
--    operations instead of being conflated.

ALTER TABLE public.finance_recurring_subscriptions
  ADD COLUMN IF NOT EXISTS skipped_months text[] NOT NULL DEFAULT '{}';

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
    IF sub.interval = 'annual'
       AND split_part(p_month, '-', 2) <> split_part(sub.start_month, '-', 2) THEN
      CONTINUE;
    END IF;

    -- Explicitly skipped by the user for this month only.
    IF p_month = ANY(sub.skipped_months) THEN
      CONTINUE;
    END IF;

    target_day := LEAST(sub.day_of_month, month_last_day);
    target_date := month_start + ((target_day - 1) || ' days')::interval;

    -- NOTE: no `deleted_at IS NULL` here, unlike the original. An instance
    -- the user deleted still counts as "this month is handled" — otherwise
    -- the delete silently undoes itself on the next page view.
    IF EXISTS (
      SELECT 1 FROM public.finance_transactions
      WHERE recurring_subscription_id = sub.id
        AND to_char(date, 'YYYY-MM') = p_month
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

-- Clean up rows already resurrected by the old behaviour: where a month has
-- both a deleted and a live instance of the same subscription, the live one
-- is the resurrection of a delete the user meant to stick.
WITH resurrected AS (
  SELECT live.id
  FROM public.finance_transactions live
  JOIN public.finance_transactions dead
    ON dead.recurring_subscription_id = live.recurring_subscription_id
   AND to_char(dead.date, 'YYYY-MM') = to_char(live.date, 'YYYY-MM')
   AND dead.deleted_at IS NOT NULL
   AND dead.created_at < live.created_at
  WHERE live.recurring_subscription_id IS NOT NULL
    AND live.deleted_at IS NULL
    AND live.raw_input = 'Auto-generated from recurring subscription'
)
UPDATE public.finance_transactions
SET deleted_at = now()
WHERE id IN (SELECT id FROM resurrected);
