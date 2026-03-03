-- Trigger function: sync auth.users -> public.users
--
-- When a new user is created in Supabase Auth (auth.users),
-- this trigger automatically creates a corresponding row in public.users.
-- Uses ON CONFLICT to handle re-inserts gracefully.
--
-- NOTE: This migration runs in the Supabase environment (via supabase db push
-- or Supabase dashboard SQL editor). It does NOT go in db/migrations/ since
-- it operates on the auth schema which is managed by Supabase.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username, display_name, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'user',
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire on INSERT into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
