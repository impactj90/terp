CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL, -- 'bonus', 'tracking', 'balance'
    unit VARCHAR(20) NOT NULL DEFAULT 'minutes', -- 'minutes', 'hours', 'days'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);

-- Seed system accounts
INSERT INTO accounts (tenant_id, code, name, account_type, unit, is_system) VALUES
(NULL, 'FLEX', 'Flextime', 'balance', 'minutes', true),
(NULL, 'OT', 'Overtime', 'balance', 'minutes', true),
(NULL, 'VAC', 'Vacation', 'balance', 'days', true);
