
-- Update handle_new_user to also create a client record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  -- Auto-link existing client record if email matches
  UPDATE public.clients SET user_id = NEW.id WHERE email = NEW.email AND user_id IS NULL;

  -- If no client was linked, create one for non-admin users
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = NEW.id) THEN
    INSERT INTO public.clients (user_id, name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Allow clients to INSERT scripts for their own client record
CREATE POLICY "Client can insert own scripts"
ON public.scripts
FOR INSERT
WITH CHECK (is_own_client(client_id));

-- Allow clients to INSERT script_lines for scripts they own
CREATE POLICY "Client can insert own script_lines"
ON public.script_lines
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM scripts s
    WHERE s.id = script_lines.script_id AND is_own_client(s.client_id)
  )
);
