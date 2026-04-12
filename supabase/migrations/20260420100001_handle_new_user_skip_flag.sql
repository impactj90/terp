-- Phase 0 (login-gap fix) — opt-out flag for handle_new_user trigger.
--
-- Problem: the existing on_auth_user_created trigger syncs every auth.users
-- INSERT into public.users with default-value fields. Our users-service flow
-- now creates the Supabase Auth user itself and then writes public.users with
-- the real fields (tenant_id, user_group_id, etc.). Without an opt-out, the
-- trigger either collides on id or overwrites the service's values.
--
-- Solution: react to a flag set by the service via auth.admin.createUser's
-- user_metadata: { skip_public_sync: 'true' }. When the flag is present the
-- trigger returns without doing the insert — the caller owns atomicity.
-- External inserts (Supabase dashboard, etc.) that don't set the flag keep
-- the legacy behavior.
--
-- See thoughts/shared/plans/2026-04-09-demo-tenant-system.md (Phase 0).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Skip sync when the caller (e.g. users-service.ts) will create the
  -- public.users row itself with the correct fields.
  IF NEW.raw_user_meta_data->>'skip_public_sync' = 'true' THEN
    RETURN NEW;
  END IF;

  -- Existing behavior for external inserts (Supabase Dashboard, etc.)
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
$$;
