-- Booking settings per client for public Calendly-style calendar
CREATE TABLE public.booking_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  available_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Sun, 1=Mon...6=Sat
  start_hour integer NOT NULL DEFAULT 9,  -- 24h format
  end_hour integer NOT NULL DEFAULT 18,
  slot_duration_minutes integer NOT NULL DEFAULT 60,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  booking_title text NOT NULL DEFAULT 'Agenda tu cita',
  booking_description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- RLS
ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access booking_settings"
  ON public.booking_settings FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Public can read active settings (for booking page)
CREATE POLICY "Public can view active booking_settings"
  ON public.booking_settings FOR SELECT
  USING (is_active = true);

-- Client can view own
CREATE POLICY "Client can view own booking_settings"
  ON public.booking_settings FOR SELECT
  USING (is_own_client(client_id));

-- Trigger for updated_at
CREATE TRIGGER update_booking_settings_updated_at
  BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();