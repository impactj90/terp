-- Account groups for organizing accounts in display/reporting
CREATE TABLE account_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_account_groups_tenant ON account_groups(tenant_id);

CREATE TRIGGER update_account_groups_updated_at
    BEFORE UPDATE ON account_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE account_groups IS 'Groups of accounts for display and reporting organization';

-- Add new fields to accounts
ALTER TABLE accounts
    ADD COLUMN account_group_id UUID REFERENCES account_groups(id) ON DELETE SET NULL,
    ADD COLUMN display_format VARCHAR(20) NOT NULL DEFAULT 'decimal',
    ADD COLUMN bonus_factor NUMERIC(5,2);

CREATE INDEX idx_accounts_group ON accounts(account_group_id);

-- Migrate account_type enum values: tracking -> day, balance -> month
UPDATE accounts SET account_type = 'day' WHERE account_type = 'tracking';
UPDATE accounts SET account_type = 'month' WHERE account_type = 'balance';

-- Update comment on accounts table for new enum values
COMMENT ON COLUMN accounts.account_type IS 'Account type: bonus, day, or month';
COMMENT ON COLUMN accounts.display_format IS 'Display format: decimal or hh_mm';
COMMENT ON COLUMN accounts.bonus_factor IS 'Multiplier for bonus calculations (e.g. 1.50 for 150%)';
