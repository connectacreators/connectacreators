
-- Create bookings table to store public booking history
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  message text,
  booking_date date NOT NULL,
  booking_time text NOT NULL,
  notion_page_id text,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access bookings"
  ON public.bookings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Client can view own bookings
CREATE POLICY "Client can view own bookings"
  ON public.bookings FOR SELECT
  USING (public.is_own_client(client_id));

-- User (owner) can view owned client bookings
CREATE POLICY "User can view owned client bookings"
  ON public.bookings FOR SELECT
  USING (public.is_owned_client(client_id));

-- Allow service role inserts (edge function uses service role key)
-- No anon insert policy needed since the edge function uses service_role_key

-- Videographer can view assigned client bookings
CREATE POLICY "Videographer can view assigned bookings"
  ON public.bookings FOR SELECT
  USING (public.is_assigned_client(client_id));
