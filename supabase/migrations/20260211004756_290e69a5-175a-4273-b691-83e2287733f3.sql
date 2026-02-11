
-- Re-attach triggers to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_admin_on_signup();

-- Create a function to clean up client/profile/roles when a user is deleted
CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  DELETE FROM public.clients WHERE user_id = OLD.id;
  DELETE FROM public.user_roles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;

-- Attach cleanup trigger
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deleted();
