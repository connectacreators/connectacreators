-- ALREADY APPLIED TO PROD via Management API; never `db push` (see project
-- memory: DB migration drift — schema is applied by hand, not CLI).
--
-- Branding was preset-only: pick 1 of 6 palettes, 1 of 4 font pairings. That
-- made "match our brand" a question of which preset came closest, and it's
-- why a client's actual accent colour could never appear in the app.
--
-- Rather than open every token to free-form hex (which lets a client
-- render the UI unreadable — dark text on dark, no contrast anywhere), this
-- opens the two that carry brand identity: the primary accent (aqua) and
-- the warm accent (honey). Structure/foreground tokens stay preset-owned so
-- legibility is never the client's problem to get right.
--
-- Values are bare HSL triplets ("184 41% 70%") to match how every token in
-- the app is stored, so `hsl(var(--aqua) / 0.3)` keeps working.
ALTER TABLE public.user_branding
  ADD COLUMN IF NOT EXISTS accent_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_branding.accent_overrides IS
  'Optional per-token colour overrides layered on top of the chosen palette preset. Keys: aqua, honey. Values are bare HSL triplets ("184 41% 70%") so callers can append an alpha.';

-- "Tech Modern" font pairing (Inter Tight display / Inter body) — matches the
-- marketing site's type. The CHECK constraint has to know about it or the
-- picker saves a value the DB rejects.
ALTER TABLE public.user_branding DROP CONSTRAINT IF EXISTS user_branding_font_pairing_check;
ALTER TABLE public.user_branding ADD CONSTRAINT user_branding_font_pairing_check
  CHECK (font_pairing = ANY (ARRAY['editorial','modern','tech','classic','bold']));
