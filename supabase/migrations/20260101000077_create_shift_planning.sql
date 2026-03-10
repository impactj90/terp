-- Shifts: shift definitions for the planning board (placeholder)
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    color VARCHAR(7),
    qualification TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX idx_shifts_day_plan ON shifts(day_plan_id);

CREATE TRIGGER update_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE shifts IS 'Shift definitions for the planning board / Plantafel (placeholder - requires separate Plantafel documentation)';

-- Shift assignments: links employees to shifts for date ranges
CREATE TABLE shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shift_assignments_tenant ON shift_assignments(tenant_id);
CREATE INDEX idx_shift_assignments_employee ON shift_assignments(employee_id);
CREATE INDEX idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX idx_shift_assignments_dates ON shift_assignments(valid_from, valid_to);

CREATE TRIGGER update_shift_assignments_updated_at
    BEFORE UPDATE ON shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE shift_assignments IS 'Employee-to-shift assignments with date ranges (placeholder - requires separate Plantafel documentation)';
