
ALTER TABLE public.booking_settings
ADD COLUMN primary_color text NOT NULL DEFAULT '#C4922A',
ADD COLUMN secondary_color text NOT NULL DEFAULT '#1A1A1A';
