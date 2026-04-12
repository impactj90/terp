-- =============================================================
-- Platform System sentinel user
--
-- Sentinel "Platform System" user in public.users for impersonation-
-- originated writes. When a platform operator writes into a tenant via an
-- active SupportSession, the synthesized tRPC context uses this row so that
-- nullable-but-NOT-NULL-capable FK columns (AuditLog.user_id,
-- {service}.created_by_id, etc.) can reference a real user.
--
-- Locked and inactive — cannot log in via Supabase Auth (no matching
-- auth.users row exists, and is_active=false + is_locked=true would block
-- login even if one were created).
--
-- UIs that render creator names can special-case the sentinel UUID to
-- display "Platform Support (via support session)" by joining against
-- platform_audit_logs on the same tenant_id/entity_id/performed_at window.
--
-- Plan: thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 7.1)
-- =============================================================

-- The sentinel uses role='system', which is not permitted by the existing
-- valid_role CHECK (users.role IN ('user','admin')). Widen the constraint to
-- allow 'system' so the sentinel row can be inserted without violating it.
ALTER TABLE users DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE users ADD CONSTRAINT valid_role
  CHECK (role IN ('user', 'admin', 'system'));

INSERT INTO users (
  id,
  email,
  username,
  display_name,
  role,
  is_active,
  is_locked,
  tenant_id,
  user_group_id,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-00000000beef',
  'platform-system@internal.terp',
  'platform-system',
  'Platform System',
  'system',
  false, -- is_active
  true,  -- is_locked
  NULL,
  NULL,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

COMMENT ON CONSTRAINT valid_role ON users IS
  'role must be user, admin, or system (system is reserved for the Platform System sentinel)';
