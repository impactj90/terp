-- Demo-Tenant-System: Add is_demo flag + expiration + template + audit fields to tenants.
-- See thoughts/shared/plans/2026-04-09-demo-tenant-system.md

ALTER TABLE public.tenants
  ADD COLUMN is_demo          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN demo_expires_at  TIMESTAMPTZ NULL,
  ADD COLUMN demo_template    VARCHAR(100) NULL,
  ADD COLUMN demo_created_by  UUID        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN demo_notes       TEXT        NULL;

-- Partial index: only demo rows are indexed, keeps the index small and the
-- expiration cron scan fast.
CREATE INDEX idx_tenant_demo_expiration
  ON public.tenants (demo_expires_at)
  WHERE is_demo = true;

-- Data-integrity guard: demo_expires_at must be set iff is_demo = true.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_demo_expiration_consistency
  CHECK (
    (is_demo = false AND demo_expires_at IS NULL AND demo_template IS NULL)
    OR
    (is_demo = true  AND demo_expires_at IS NOT NULL)
  );

COMMENT ON COLUMN public.tenants.is_demo IS 'True if this tenant is a sales-enablement demo sandbox (plan 2026-04-09-demo-tenant-system.md).';
COMMENT ON COLUMN public.tenants.demo_expires_at IS 'When is_demo=true: point in time after which the cron flips isActive=false.';
COMMENT ON COLUMN public.tenants.demo_template IS 'Template key used for seeding; e.g. "industriedienstleister_150".';
COMMENT ON COLUMN public.tenants.demo_created_by IS 'User id of the admin who created this demo; FK to users.id.';
COMMENT ON COLUMN public.tenants.demo_notes IS 'Free-text notes from the creating admin (prospect, deal context, etc).';
