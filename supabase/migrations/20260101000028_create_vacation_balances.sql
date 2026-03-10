-- Vacation balances track annual vacation entitlement, carryover, adjustments, and usage per employee per year
CREATE TABLE vacation_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- The year this balance applies to
    year INT NOT NULL,

    -- Vacation day values (decimal for half-day support)
    entitlement DECIMAL(5,2) NOT NULL DEFAULT 0,
    carryover DECIMAL(5,2) NOT NULL DEFAULT 0,
    adjustments DECIMAL(5,2) NOT NULL DEFAULT 0,
    taken DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_vacation_balances_updated_at
    BEFORE UPDATE ON vacation_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_vacation_balances_tenant ON vacation_balances(tenant_id);
CREATE INDEX idx_vacation_balances_employee ON vacation_balances(employee_id);

-- One balance per employee per year (natural key for upsert)
CREATE UNIQUE INDEX idx_vacation_balances_employee_year ON vacation_balances(employee_id, year);

COMMENT ON TABLE vacation_balances IS 'Annual vacation balance tracking per employee per year';
COMMENT ON COLUMN vacation_balances.entitlement IS 'Annual vacation entitlement in days';
COMMENT ON COLUMN vacation_balances.carryover IS 'Remaining vacation carried over from previous year';
COMMENT ON COLUMN vacation_balances.adjustments IS 'Manual adjustments (positive or negative)';
COMMENT ON COLUMN vacation_balances.taken IS 'Vacation days used so far this year';
