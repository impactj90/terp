-- =============================================================
-- Add platform-operator creator pointer to tenants.demo_*.
--
-- Parallel column to the existing demo_created_by (which points at
-- public.users.id and stays untouched). Required so Platform-admin-
-- initiated demo creates can attribute the creator to the acting
-- platform operator without losing the legacy tenant-side column.
--
-- No backfill, no data migration. Existing rows get NULL.
--
-- Mirrors the pattern from migration
-- 20260421300001_add_tenant_module_platform_fields.sql which added
-- tenant_modules.enabled_by_platform_user_id.
-- =============================================================

ALTER TABLE public.tenants
  ADD COLUMN demo_created_by_platform_user_id UUID NULL
    REFERENCES public.platform_users(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.demo_created_by_platform_user_id IS
  'Platform operator who created this demo tenant. NULL for legacy rows and for tenant-side creates (which use demo_created_by instead).';

-- No index — findDemos joins via a second query batched by id.
