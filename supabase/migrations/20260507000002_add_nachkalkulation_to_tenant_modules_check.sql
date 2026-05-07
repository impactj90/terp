-- =============================================================
-- NK-1 Follow-up: nachkalkulation Modul zum tenant_modules CHECK-Constraint
-- Plan: thoughts/shared/plans/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
--
-- Reason: 20260507000001_nk1_schema_foundation.sql added "nachkalkulation"
-- to AVAILABLE_MODULES and module-pricing.ts but forgot to extend the
-- tenant_modules CHECK constraint. Without this fix, demo-tenant creation
-- (which auto-enables the nachkalkulation module per Decision 32) throws
-- "new row for relation tenant_modules violates check constraint
-- chk_tenant_modules_module" and rolls the entire tenant-create
-- transaction back.
-- =============================================================

ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS chk_tenant_modules_module;
ALTER TABLE tenant_modules ADD CONSTRAINT chk_tenant_modules_module
  CHECK (module IN (
    'core', 'crm', 'billing', 'warehouse',
    'inbound_invoices', 'payment_runs', 'bank_statements',
    'nachkalkulation'
  ));
