-- =============================================================
-- Create vacation_special_calculations table
-- ZMI manual section 19.2-19.4: Sonderberechnungen
-- Types: age (Alter), tenure (Betriebszugehoerigkeit), disability (Behinderung)
-- =============================================================
CREATE TABLE vacation_special_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('age', 'tenure', 'disability')),
    threshold INT NOT NULL DEFAULT 0,
    bonus_days DECIMAL(5,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, type, threshold)
);

CREATE INDEX idx_vsc_tenant ON vacation_special_calculations(tenant_id);
CREATE INDEX idx_vsc_tenant_active ON vacation_special_calculations(tenant_id, is_active);
CREATE INDEX idx_vsc_type ON vacation_special_calculations(tenant_id, type);

CREATE TRIGGER update_vacation_special_calculations_updated_at
    BEFORE UPDATE ON vacation_special_calculations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_special_calculations IS 'Vacation special calculation rules (Sonderberechnungen) for age, tenure, and disability bonuses.';
COMMENT ON COLUMN vacation_special_calculations.type IS 'Type of special calculation: age, tenure, or disability.';
COMMENT ON COLUMN vacation_special_calculations.threshold IS 'Age in years (age type), tenure in years (tenure type), ignored for disability (always 0).';
COMMENT ON COLUMN vacation_special_calculations.bonus_days IS 'Additional vacation days to add when threshold is met.';
