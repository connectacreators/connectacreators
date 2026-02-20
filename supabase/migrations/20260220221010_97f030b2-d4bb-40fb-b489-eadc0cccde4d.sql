
-- Create is_user() function
CREATE OR REPLACE FUNCTION public.is_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'user')
$$;

-- Create is_owned_client() function
CREATE OR REPLACE FUNCTION public.is_owned_client(_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id 
    AND owner_user_id = auth.uid()
  )
$$;

-- RLS policies for clients table: User role can manage owned clients
CREATE POLICY "User can view owned clients"
ON public.clients FOR SELECT TO authenticated
USING (is_owned_client(id));

CREATE POLICY "User can insert owned clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid() AND is_user());

CREATE POLICY "User can update owned clients"
ON public.clients FOR UPDATE TO authenticated
USING (is_owned_client(id))
WITH CHECK (is_owned_client(id));

CREATE POLICY "User can delete owned clients"
ON public.clients FOR DELETE TO authenticated
USING (is_owned_client(id));

-- RLS policies for scripts: User can manage scripts for owned clients
CREATE POLICY "User can view owned client scripts"
ON public.scripts FOR SELECT TO authenticated
USING (is_owned_client(client_id));

CREATE POLICY "User can insert owned client scripts"
ON public.scripts FOR INSERT TO authenticated
WITH CHECK (is_owned_client(client_id));

CREATE POLICY "User can update owned client scripts"
ON public.scripts FOR UPDATE TO authenticated
USING (is_owned_client(client_id));

CREATE POLICY "User can delete owned client scripts"
ON public.scripts FOR DELETE TO authenticated
USING (is_owned_client(client_id));

-- RLS policies for script_lines: User can manage via owned client
CREATE POLICY "User can view owned client script_lines"
ON public.script_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_owned_client(s.client_id)));

CREATE POLICY "User can insert owned client script_lines"
ON public.script_lines FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_owned_client(s.client_id)));

CREATE POLICY "User can update owned client script_lines"
ON public.script_lines FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_owned_client(s.client_id)));

CREATE POLICY "User can delete owned client script_lines"
ON public.script_lines FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM scripts s WHERE s.id = script_lines.script_id AND is_owned_client(s.client_id)));

-- RLS policies for vault_templates: User can manage via owned client
CREATE POLICY "User can manage owned client vault_templates"
ON public.vault_templates FOR ALL TO authenticated
USING (is_owned_client(client_id))
WITH CHECK (is_owned_client(client_id));

-- RLS policies for booking_settings: User can manage via owned client
CREATE POLICY "User can manage owned client booking_settings"
ON public.booking_settings FOR ALL TO authenticated
USING (is_owned_client(client_id))
WITH CHECK (is_owned_client(client_id));

-- RLS policies for scheduled_posts: User can manage via owned client
CREATE POLICY "User can manage owned client scheduled_posts"
ON public.scheduled_posts FOR ALL TO authenticated
USING (is_owned_client(client_id))
WITH CHECK (is_owned_client(client_id));

-- RLS policies for social_accounts: User can manage via owned client
CREATE POLICY "User can manage owned client social_accounts"
ON public.social_accounts FOR ALL TO authenticated
USING (is_owned_client(client_id))
WITH CHECK (is_owned_client(client_id));
