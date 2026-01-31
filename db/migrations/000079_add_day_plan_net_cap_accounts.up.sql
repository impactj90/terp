-- Add net/cap account references to day_plans
ALTER TABLE day_plans
    ADD COLUMN IF NOT EXISTS net_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cap_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Create daily account values table
CREATE TABLE daily_account_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,
    value_minutes INT NOT NULL DEFAULT 0,
    source VARCHAR(20) NOT NULL,  -- 'net_time' or 'capped_time'
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per date per account per source
    UNIQUE(employee_id, value_date, account_id, source)
);

-- Indexes for common query patterns
CREATE INDEX idx_daily_account_values_tenant ON daily_account_values(tenant_id);
CREATE INDEX idx_daily_account_values_employee ON daily_account_values(employee_id);
CREATE INDEX idx_daily_account_values_account ON daily_account_values(account_id);
CREATE INDEX idx_daily_account_values_date ON daily_account_values(value_date);
CREATE INDEX idx_daily_account_values_lookup ON daily_account_values(employee_id, value_date);

COMMENT ON TABLE daily_account_values IS 'Daily account postings from calculation (net time, capped time)';
COMMENT ON COLUMN daily_account_values.source IS 'Source of posting: net_time or capped_time';
COMMENT ON COLUMN daily_account_values.value_minutes IS 'Posted value in minutes';
