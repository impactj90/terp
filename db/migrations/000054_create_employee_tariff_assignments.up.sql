-- =============================================================
-- Create employee_tariff_assignments table
-- ZMI-TICKET-018: Tariff assignment with date ranges
-- Supports assigning tariffs to employees for specific periods
-- =============================================================
CREATE TABLE employee_tariff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    overwrite_behavior VARCHAR(20) NOT NULL DEFAULT 'preserve_manual'
        CHECK (overwrite_behavior IN ('overwrite', 'preserve_manual')),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_eta_tenant ON employee_tariff_assignments(tenant_id);
CREATE INDEX idx_eta_employee ON employee_tariff_assignments(employee_id);
CREATE INDEX idx_eta_tariff ON employee_tariff_assignments(tariff_id);
CREATE INDEX idx_eta_employee_dates ON employee_tariff_assignments(employee_id, effective_from, effective_to);
CREATE INDEX idx_eta_effective_lookup ON employee_tariff_assignments(employee_id, effective_from, effective_to, is_active);

CREATE TRIGGER update_employee_tariff_assignments_updated_at
    BEFORE UPDATE ON employee_tariff_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_tariff_assignments IS 'Date-ranged tariff assignments for employees. Allows specifying which tariff applies to an employee for a given period.';
COMMENT ON COLUMN employee_tariff_assignments.effective_from IS 'Start date (inclusive) when this tariff assignment takes effect.';
COMMENT ON COLUMN employee_tariff_assignments.effective_to IS 'End date (inclusive) when this tariff assignment ends. NULL means open-ended.';
COMMENT ON COLUMN employee_tariff_assignments.overwrite_behavior IS 'Whether to overwrite manual day plan edits when syncing tariff plans. Default: preserve_manual.';
COMMENT ON COLUMN employee_tariff_assignments.notes IS 'Optional notes about why this assignment was made.';
