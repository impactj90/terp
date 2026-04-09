-- Demo-Tenant-System: System-wide user group assigned to every demo admin user.
-- See thoughts/shared/plans/2026-04-09-demo-tenant-system.md
--
-- A dedicated "Demo Admin" group (tenant_id IS NULL = system-wide) is
-- referenced by a stable id from demo-tenant-service.ts. The group's
-- is_admin=true bypass grants full tenant-level permissions without
-- needing explicit permission entries.

INSERT INTO public.user_groups (
  id,
  tenant_id,
  code,
  name,
  description,
  permissions,
  is_admin,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  'dd000000-0000-0000-0000-000000000001'::uuid,  -- stable id for lookups from service code
  NULL,                                            -- system-wide
  'DEMO_ADMIN',
  'Demo Admin',
  'System group for admin users of demo tenants (plan 2026-04-09). Full tenant-level permissions via is_admin bypass. Do not assign to non-demo users.',
  '[]'::jsonb,                                     -- empty explicit permissions — is_admin bypass grants everything
  true,                                            -- is_admin
  true,                                            -- is_system — cannot be deleted by UI
  true,                                            -- is_active
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
