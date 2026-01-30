-- =============================================================
-- Create vacation_capping_rules table
-- ZMI manual section 20: Kappungsregeln
-- Types: year_end (Kappung zum Jahresende), mid_year (Kappung wahrend des Jahres)
-- =============================================================
CREATE TABLE vacation_capping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('year_end', 'mid_year')),
    cutoff_month INT NOT NULL DEFAULT 12 CHECK (cutoff_month BETWEEN 1 AND 12),
    cutoff_day INT NOT NULL DEFAULT 31 CHECK (cutoff_day BETWEEN 1 AND 31),
    cap_value DECIMAL(5,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcr_tenant ON vacation_capping_rules(tenant_id);
CREATE INDEX idx_vcr_tenant_active ON vacation_capping_rules(tenant_id, is_active);
CREATE INDEX idx_vcr_type ON vacation_capping_rules(tenant_id, rule_type);

CREATE TRIGGER update_vacation_capping_rules_updated_at
    BEFORE UPDATE ON vacation_capping_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_capping_rules IS 'Vacation capping rules (Kappungsregeln) for year-end and mid-year carryover limits.';
COMMENT ON COLUMN vacation_capping_rules.rule_type IS 'year_end: limits carryover at year boundary; mid_year: forfeits prior-year carryover after cutoff date.';
COMMENT ON COLUMN vacation_capping_rules.cutoff_month IS 'Month of the cutoff date (1-12). For year_end typically 12; for mid_year e.g. 3 for March.';
COMMENT ON COLUMN vacation_capping_rules.cutoff_day IS 'Day of the cutoff date (1-31). For year_end typically 31; for mid_year e.g. 31 for March 31.';
COMMENT ON COLUMN vacation_capping_rules.cap_value IS 'Maximum days to carry over. 0 means forfeit all remaining; positive value caps at that amount.';
