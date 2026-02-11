
-- Allow admin to view all profiles (needed to fetch videographer names)
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Allow admin to view all user_roles (needed to find videographers)
CREATE POLICY "Admin can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin());
