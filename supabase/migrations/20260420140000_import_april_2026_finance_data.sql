-- =========================================================================
-- 2026-04-20: One-off data import — April 2026 finance data
-- Source: April CONNECTA CTRS Income Sheet 2026.xlsx
-- Idempotent-ish guard: aborts if any April 2026 rows already exist for admin.
-- =========================================================================

DO $$
DECLARE admin_uid uuid;
DECLARE existing int;
BEGIN
  SELECT user_id INTO admin_uid FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF admin_uid IS NULL THEN RAISE EXCEPTION 'No admin user found'; END IF;
  SELECT count(*) INTO existing FROM public.finance_transactions
    WHERE user_id = admin_uid AND date >= '2026-04-01' AND date < '2026-05-01' AND deleted_at IS NULL;
  IF existing > 0 THEN
    RAISE NOTICE 'April 2026 already has % rows — skipping import to avoid duplicates', existing;
    RETURN;
  END IF;

  -- Income
  INSERT INTO public.finance_transactions (user_id, type, amount, category, client, description, date, is_ar, raw_input)
    VALUES (admin_uid, 'income', 4000.00, 'SMMA', 'Saratoga Chiropractic', 'SMMA', '2026-04-08', false, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, client, description, date, is_ar, raw_input)
    VALUES (admin_uid, 'income', 1500.00, 'SMMA', 'Master Construction', 'SMMA', '2026-04-08', false, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, client, description, date, is_ar, raw_input)
    VALUES (admin_uid, 'income', 3000.00, 'SMMA', 'Dr Calvin''s Clinic', 'SMMA', '2026-04-08', true, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, client, description, date, is_ar, raw_input)
    VALUES (admin_uid, 'income', 4900.00, 'Bi-Weekly Fee', 'IOTA Media', 'Bi Weekly Fees for SMMA', '2026-04-08', false, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, client, description, date, is_ar, raw_input)
    VALUES (admin_uid, 'income', 4900.00, 'Bi-Weekly Fee', 'IOTA Media', 'Bi Weekly Fees for SMMA', '2026-04-08', true, 'Imported from April CONNECTA CTRS Income Sheet 2026');

  -- Expenses
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 22.00, 'Subscriptions', 'Metricool', 'IOTA', NULL, 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 10.00, 'Subscriptions', 'Google Drive', 'IOTA', NULL, 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 12.00, 'Software', 'Capcut', 'IOTA', NULL, 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 21.49, 'Software', 'Claude AI', 'IOTA', NULL, 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 92.11, 'Payroll', 'Gusto', 'IOTA', NULL, 'Payroll MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 32.24, 'Software', 'Supabase', NULL, 'Chase Ink Credit Card', 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 32.22, 'Subscriptions', 'Zapier', NULL, 'Chase ink credit card', 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 16.12, 'Subscriptions', 'Manychat', NULL, 'Chase ink credit card', 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 16.13, 'Subscriptions', 'Docusign', NULL, NULL, 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 26.86, 'Software', 'Claude AI', NULL, 'Chase Business Debit Card', 'Aplications Extra Credit Usage', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 32.24, 'Software', 'Supabase', NULL, 'Chase Ink Credit Card', 'Aplications MONTHLY SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 651.00, 'Ad Spend', 'Meta Business Suite', NULL, 'Chase Ink Credit Card', 'Saratoga Chiropractic Ad Spent', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 422.46, 'Travel', 'Chase Travel', NULL, 'Chase Ink Credit Card', 'Shooting Trip for Social Media Campaign', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 904.75, 'Travel', 'Airbnb', NULL, 'Chase Ink Credit Card', 'Shooting Trip for Social Media Campaign', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 20.32, 'Food & Meals', 'Mc Donalds', NULL, 'Chase Ink Credit Card', 'Food with the team', '2026-04-01', false, 10.16, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 64.47, 'Software', 'Eleven Labs', NULL, 'Chase Ink Credit Card', 'Aplications ANNUAL SUBSCRIPTION', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 192.34, 'Software', 'Fl Studio', NULL, 'Chase Ink Credit Card', 'Aplication for Editing software', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 12.96, 'Software', 'Waves', NULL, 'Chase Ink Credit Card', 'Aplication for Editing software', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 10.87, 'Software', 'Claude AI', NULL, 'Chase Ink Credit Card', 'Aplications Extra Credit Usage', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 570.00, 'Contractors', 'Rodrigo Gauna', NULL, 'Chase Business Debit Card', 'Scripting', '2026-04-01', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');
  INSERT INTO public.finance_transactions (user_id, type, amount, category, vendor, client, payment_method, description, date, is_ar, deductible_amount, raw_input)
    VALUES (admin_uid, 'expense', 1050.00, 'Contractors', 'Joshua Barrera', NULL, 'Chase Business Debit Card', 'Dr Calvin''s clinic filming (2 sessions) + Master Construction Cut', '2026-04-15', false, NULL, 'Imported from April CONNECTA CTRS Income Sheet 2026');

  -- Month settings (upsert)
  INSERT INTO public.finance_month_settings (user_id, month, salary_payout, tax_rate, employee_salary)
    VALUES (admin_uid, '2026-04', 4934.25, 0.2500, 5345.33)
    ON CONFLICT (user_id, month) DO UPDATE
      SET salary_payout = EXCLUDED.salary_payout, employee_salary = EXCLUDED.employee_salary;

  RAISE NOTICE 'April 2026 finance import complete.';
END $$;
