-- =============================================================
-- Rename "orders" module to "billing" in tenant_modules
-- =============================================================

-- Update existing rows
UPDATE tenant_modules SET module = 'billing' WHERE module = 'orders';

-- Replace the CHECK constraint with the new allowed values
ALTER TABLE tenant_modules
    DROP CONSTRAINT chk_tenant_modules_module;

ALTER TABLE tenant_modules
    ADD CONSTRAINT chk_tenant_modules_module
    CHECK (module IN ('core', 'crm', 'billing', 'warehouse'));
