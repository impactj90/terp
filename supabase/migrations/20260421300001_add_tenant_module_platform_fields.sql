-- Phase 9: add platform-origin tracking + operator note to tenant_modules.
-- See thoughts/shared/plans/2026-04-09-platform-admin-system.md (Phase 9.2).
--
-- The new enabled_by_platform_user_id column mirrors the existing
-- enabled_by_id (which points at public.users); the two columns are mutually
-- exclusive in practice — a row is either operator-enabled or (legacy)
-- tenant-user-enabled. There is deliberately no FK to platform_users so that
-- a deleted operator's history survives in platform_audit_logs even after
-- row-level cleanup.
--
-- operator_note is a free-text breadcrumb the operator can leave on each
-- booking. It is deliberately NOT called "contract_reference" or similar —
-- the platform has no billing integration and nothing in the system reads
-- this field programmatically. It exists so an operator can later grep
-- Postgres ("which tenant booked CRM under which manual invoice?") without
-- trawling email archives.

ALTER TABLE public.tenant_modules
  ADD COLUMN enabled_by_platform_user_id UUID,
  ADD COLUMN operator_note                VARCHAR(255);

-- Helpful partial index for operator lookups by note content.
CREATE INDEX idx_tenant_modules_operator_note
  ON public.tenant_modules(operator_note)
  WHERE operator_note IS NOT NULL;

COMMENT ON COLUMN public.tenant_modules.enabled_by_platform_user_id IS 'Platform operator who booked this module. Null if legacy tenant-side enable or seeded.';
COMMENT ON COLUMN public.tenant_modules.operator_note IS 'Free-text operator note on this module booking. Not wired to any billing system — purely a searchable breadcrumb for manual invoice correlation.';
