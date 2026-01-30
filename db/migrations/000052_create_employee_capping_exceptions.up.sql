-- =============================================================
-- Create employee_capping_exceptions table
-- ZMI manual section 20.3: Individual exceptions from capping rules
-- =============================================================
CREATE TABLE employee_capping_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    capping_rule_id UUID NOT NULL REFERENCES vacation_capping_rules(id) ON DELETE CASCADE,
    exemption_type VARCHAR(20) NOT NULL CHECK (exemption_type IN ('full', 'partial')),
    retain_days DECIMAL(5,2),
    year INT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, capping_rule_id, year)
);

CREATE INDEX idx_ece_tenant ON employee_capping_exceptions(tenant_id);
CREATE INDEX idx_ece_employee ON employee_capping_exceptions(employee_id);
CREATE INDEX idx_ece_rule ON employee_capping_exceptions(capping_rule_id);
CREATE INDEX idx_ece_employee_year ON employee_capping_exceptions(employee_id, year);

CREATE TRIGGER update_employee_capping_exceptions_updated_at
    BEFORE UPDATE ON employee_capping_exceptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_capping_exceptions IS 'Individual employee exceptions from vacation capping rules.';
COMMENT ON COLUMN employee_capping_exceptions.exemption_type IS 'full: employee keeps all vacation; partial: employee keeps up to retain_days.';
COMMENT ON COLUMN employee_capping_exceptions.retain_days IS 'For partial exemption: max days the employee can retain despite capping. NULL for full exemption.';
COMMENT ON COLUMN employee_capping_exceptions.year IS 'Year this exception applies to. NULL means applies to all years.';

-- =============================================================
-- Add carryover_expires_at to vacation_balances
-- Tracks when mid-year capping should forfeit the carryover
-- =============================================================
ALTER TABLE vacation_balances
    ADD COLUMN carryover_expires_at DATE;

COMMENT ON COLUMN vacation_balances.carryover_expires_at IS 'Date after which carryover from previous year is forfeited (mid-year capping).';
