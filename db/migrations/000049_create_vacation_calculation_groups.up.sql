-- =============================================================
-- Create vacation_calculation_groups table
-- ZMI manual section 19.1: Berechnungsgruppen with basis selection
-- =============================================================
CREATE TABLE vacation_calculation_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    basis VARCHAR(20) NOT NULL DEFAULT 'calendar_year' CHECK (basis IN ('calendar_year', 'entry_date')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcg_tenant ON vacation_calculation_groups(tenant_id);
CREATE INDEX idx_vcg_tenant_active ON vacation_calculation_groups(tenant_id, is_active);

CREATE TRIGGER update_vacation_calculation_groups_updated_at
    BEFORE UPDATE ON vacation_calculation_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_calculation_groups IS 'Vacation calculation groups (Berechnungsgruppen) combining basis and special calculations.';
COMMENT ON COLUMN vacation_calculation_groups.basis IS 'Vacation year basis: calendar_year (Jan-Dec) or entry_date (hire anniversary).';

-- =============================================================
-- Junction table: links groups to their special calculations
-- =============================================================
CREATE TABLE vacation_calc_group_special_calcs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES vacation_calculation_groups(id) ON DELETE CASCADE,
    special_calculation_id UUID NOT NULL REFERENCES vacation_special_calculations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, special_calculation_id)
);

CREATE INDEX idx_vcgsc_group ON vacation_calc_group_special_calcs(group_id);
CREATE INDEX idx_vcgsc_special_calc ON vacation_calc_group_special_calcs(special_calculation_id);

COMMENT ON TABLE vacation_calc_group_special_calcs IS 'Junction table linking vacation calculation groups to their special calculations.';

-- =============================================================
-- Add vacation_calc_group_id FK to employment_types
-- Employment type selects which vacation calculation group applies
-- =============================================================
ALTER TABLE employment_types
    ADD COLUMN vacation_calc_group_id UUID REFERENCES vacation_calculation_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_employment_types_vacation_calc_group ON employment_types(vacation_calc_group_id);

COMMENT ON COLUMN employment_types.vacation_calc_group_id IS 'Links employment type to its vacation calculation group.';
