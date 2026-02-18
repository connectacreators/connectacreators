ALTER TABLE public.booking_settings
ADD COLUMN break_times jsonb NOT NULL DEFAULT '[]'::jsonb;