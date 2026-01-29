-- =============================================================
-- Create calculation_rules table
-- ZMI manual section 15.3: Account value = Value * Factor
-- Exception: Value = 0 -> Daily target time (time plan) * Factor
-- =============================================================
CREATE TABLE calculation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    value INT NOT NULL DEFAULT 0,
    factor NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_calculation_rules_tenant ON calculation_rules(tenant_id);
CREATE INDEX idx_calculation_rules_account ON calculation_rules(account_id);
CREATE INDEX idx_calculation_rules_active ON calculation_rules(tenant_id, is_active);

CREATE TRIGGER update_calculation_rules_updated_at
    BEFORE UPDATE ON calculation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE calculation_rules IS 'Absence calculation rules defining how absence days affect accounts. Formula: account_value = value * factor (if value=0, use daily target time * factor)';
COMMENT ON COLUMN calculation_rules.code IS 'Unique code per tenant for rule identification';
COMMENT ON COLUMN calculation_rules.account_id IS 'Optional linked account. If set, calculation writes to this account';
COMMENT ON COLUMN calculation_rules.value IS 'Value in minutes. 0 means use daily target time from time plan';
COMMENT ON COLUMN calculation_rules.factor IS 'Multiplier applied to value or target time (e.g. 1.00 = full, 0.50 = half)';
