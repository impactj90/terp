-- =============================================================
-- Create tenant_modules table for per-tenant feature module gating
-- Tracks which feature modules (core, crm, billing, warehouse) are
-- enabled for each tenant.
-- =============================================================

CREATE TABLE tenant_modules (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module          VARCHAR(50) NOT NULL,
    enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enabled_by_id   UUID        REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_tenant_modules_tenant_module UNIQUE (tenant_id, module),
    CONSTRAINT chk_tenant_modules_module CHECK (module IN ('core', 'crm', 'billing', 'warehouse'))
);

CREATE INDEX idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);

-- Seed "core" module for all existing tenants
INSERT INTO tenant_modules (tenant_id, module)
SELECT id, 'core' FROM tenants
ON CONFLICT DO NOTHING;
