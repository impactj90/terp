-- =============================================================
-- Add payment_runs module + permissions to system groups
-- Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1
-- =============================================================

-- Add 'payment_runs' to tenant_modules CHECK constraint
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS chk_tenant_modules_module;
ALTER TABLE tenant_modules ADD CONSTRAINT chk_tenant_modules_module
  CHECK (module IN ('core', 'crm', 'billing', 'warehouse', 'inbound_invoices', 'payment_runs'));

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   payment_runs.view   = 12b75b07-c614-53e5-8bf2-d2bd146e47a0
--   payment_runs.create = 7488295e-3707-5256-a9cc-ba4e7fd6a6cd
--   payment_runs.export = b1428b0c-9a16-5bf9-b66a-252e26667608
--   payment_runs.book   = a1124333-f5dc-5439-a247-f929cfd971d9
--   payment_runs.cancel = 5bad900a-8f8e-5842-8ab7-636425ecc7d8

-- ADMIN: all 5 permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"12b75b07-c614-53e5-8bf2-d2bd146e47a0"'::jsonb  -- payment_runs.view
    UNION ALL SELECT '"7488295e-3707-5256-a9cc-ba4e7fd6a6cd"'::jsonb  -- payment_runs.create
    UNION ALL SELECT '"b1428b0c-9a16-5bf9-b66a-252e26667608"'::jsonb  -- payment_runs.export
    UNION ALL SELECT '"a1124333-f5dc-5439-a247-f929cfd971d9"'::jsonb  -- payment_runs.book
    UNION ALL SELECT '"5bad900a-8f8e-5842-8ab7-636425ecc7d8"'::jsonb  -- payment_runs.cancel
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- BUCHHALTUNG: all 5 permissions (accountants run payment runs end-to-end)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"12b75b07-c614-53e5-8bf2-d2bd146e47a0"'::jsonb  -- payment_runs.view
    UNION ALL SELECT '"7488295e-3707-5256-a9cc-ba4e7fd6a6cd"'::jsonb  -- payment_runs.create
    UNION ALL SELECT '"b1428b0c-9a16-5bf9-b66a-252e26667608"'::jsonb  -- payment_runs.export
    UNION ALL SELECT '"a1124333-f5dc-5439-a247-f929cfd971d9"'::jsonb  -- payment_runs.book
    UNION ALL SELECT '"5bad900a-8f8e-5842-8ab7-636425ecc7d8"'::jsonb  -- payment_runs.cancel
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: view only (read-only transparency, no state mutations)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"12b75b07-c614-53e5-8bf2-d2bd146e47a0"'::jsonb  -- payment_runs.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- PERSONAL: no permissions (feature is accounting-only)
