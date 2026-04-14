-- =============================================================
-- CAMT.053 Phase 2: bank_statements Modul + bank_transactions Permissions
-- Plan: thoughts/shared/plans/2026-04-14-camt053-import.md
-- =============================================================

-- Add 'bank_statements' to tenant_modules CHECK constraint
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS chk_tenant_modules_module;
ALTER TABLE tenant_modules ADD CONSTRAINT chk_tenant_modules_module
  CHECK (module IN (
    'core', 'crm', 'billing', 'warehouse',
    'inbound_invoices', 'payment_runs', 'bank_statements'
  ));

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   bank_transactions.view    = 286aeb01-a9d0-56b4-837c-a58a6e2e8c35
--   bank_transactions.import  = 57b1241b-3463-579c-b771-32fd69b5878d
--   bank_transactions.match   = 8e61ece1-d486-5faa-bb48-22e70f04cc9b
--   bank_transactions.unmatch = cf07915b-528a-5f0b-813d-1486bf4064e9
--   bank_transactions.ignore  = 9ac11560-24f3-5033-a776-825fa80de6f9

-- ADMIN: all 5 permissions (is_admin bypass already grants everything,
-- seed for symmetry with other permission-seed migrations)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"286aeb01-a9d0-56b4-837c-a58a6e2e8c35"'::jsonb  -- bank_transactions.view
    UNION ALL SELECT '"57b1241b-3463-579c-b771-32fd69b5878d"'::jsonb  -- bank_transactions.import
    UNION ALL SELECT '"8e61ece1-d486-5faa-bb48-22e70f04cc9b"'::jsonb  -- bank_transactions.match
    UNION ALL SELECT '"cf07915b-528a-5f0b-813d-1486bf4064e9"'::jsonb  -- bank_transactions.unmatch
    UNION ALL SELECT '"9ac11560-24f3-5033-a776-825fa80de6f9"'::jsonb  -- bank_transactions.ignore
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- BUCHHALTUNG: all 5 permissions (accountants own the bank inbox end-to-end)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"286aeb01-a9d0-56b4-837c-a58a6e2e8c35"'::jsonb  -- bank_transactions.view
    UNION ALL SELECT '"57b1241b-3463-579c-b771-32fd69b5878d"'::jsonb  -- bank_transactions.import
    UNION ALL SELECT '"8e61ece1-d486-5faa-bb48-22e70f04cc9b"'::jsonb  -- bank_transactions.match
    UNION ALL SELECT '"cf07915b-528a-5f0b-813d-1486bf4064e9"'::jsonb  -- bank_transactions.unmatch
    UNION ALL SELECT '"9ac11560-24f3-5033-a776-825fa80de6f9"'::jsonb  -- bank_transactions.ignore
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: view only (read-only transparency, no state mutations)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"286aeb01-a9d0-56b4-837c-a58a6e2e8c35"'::jsonb  -- bank_transactions.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- PERSONAL, MITARBEITER, LAGER, VERTRIEB: no permissions (accounting-only feature)
