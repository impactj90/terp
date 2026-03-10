-- =============================================================
-- Create export_interface_accounts junction table
-- ZMI manual section 11.3: Adding Accounts to an interface
-- =============================================================
CREATE TABLE export_interface_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_interface_id UUID NOT NULL REFERENCES export_interfaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(export_interface_id, account_id)
);

CREATE INDEX idx_eia_interface ON export_interface_accounts(export_interface_id);
CREATE INDEX idx_eia_account ON export_interface_accounts(account_id);

COMMENT ON TABLE export_interface_accounts IS 'Accounts selected for each export interface. Only accounts with is_payroll_relevant=true should be added.';
COMMENT ON COLUMN export_interface_accounts.sort_order IS 'Order in which accounts appear in the export output.';
