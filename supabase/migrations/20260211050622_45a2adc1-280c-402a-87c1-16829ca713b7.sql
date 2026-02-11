
-- Update handle_new_user to NOT create client records for videographer users
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
  
  -- Check if this user will be a videographer (skip client creation)
  -- Videographers are created via the create-videographer edge function which assigns the role after signup
  -- So at signup time we can't know yet. Instead, we'll just auto-link OR create client for non-admin.
  -- The create-videographer function will clean up the client record.
  
  -- Auto-link existing client record if email matches
  UPDATE public.clients SET user_id = NEW.id WHERE email = NEW.email AND user_id IS NULL;

  -- If no client was linked, create one for non-admin users
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = NEW.id) THEN
    -- Only create client if user is not being set up as videographer
    -- We check if a videographer role already exists (it won't at trigger time, but just in case)
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'videographer') THEN
      INSERT INTO public.clients (user_id, name, email)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
