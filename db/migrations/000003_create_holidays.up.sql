-- Holidays table
-- Stores tenant-specific public holidays

CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_half_day BOOLEAN DEFAULT false,
    applies_to_all BOOLEAN DEFAULT true,
    department_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, holiday_date)
);

-- Indexes
CREATE INDEX idx_holidays_tenant_date ON holidays(tenant_id, holiday_date);
CREATE INDEX idx_holidays_date_range ON holidays(holiday_date);

-- Updated at trigger (reuses function from 000001)
CREATE TRIGGER update_holidays_updated_at
    BEFORE UPDATE ON holidays
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE holidays IS 'Tenant-specific public holidays';
COMMENT ON COLUMN holidays.tenant_id IS 'Reference to the tenant that owns this holiday';
COMMENT ON COLUMN holidays.holiday_date IS 'The date of the holiday';
COMMENT ON COLUMN holidays.is_half_day IS 'Whether the holiday is a half day';
COMMENT ON COLUMN holidays.applies_to_all IS 'Whether the holiday applies to all employees or just a department';
COMMENT ON COLUMN holidays.department_id IS 'Optional department restriction for this holiday';
