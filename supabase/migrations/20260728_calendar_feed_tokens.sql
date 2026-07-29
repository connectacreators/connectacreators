-- ALREADY APPLIED TO PROD via Management API; never `db push` (see project
-- memory: DB migration drift — schema is applied by hand, not CLI).
--
-- Bearer tokens for the read-only iCal subscribe feed (calendar-feed edge
-- function). Google Calendar fetches a subscribed URL from its own servers
-- with no session and no way to complete an OAuth flow, so the secret in
-- the URL IS the credential — hence a dedicated high-entropy token per
-- user rather than reusing anything derived from auth.
--
-- Revocable: deleting the row (or generating a new token, which replaces
-- it) instantly dead-ends the old URL. One token per user by design —
-- "regenerate" should invalidate the previously shared link, not
-- accumulate live secrets.
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

-- Admin-only feature. The edge function reads this table with the service
-- role (the caller is Google, holding no session), so no SELECT policy for
-- anon is needed or wanted here.
CREATE POLICY "Admin manages own calendar feed token" ON public.calendar_feed_tokens
  FOR ALL USING (public.is_admin() AND user_id = auth.uid())
  WITH CHECK (public.is_admin() AND user_id = auth.uid());
