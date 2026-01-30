-- =============================================================
-- Create vacation_capping_rule_groups table
-- Groups combine multiple capping rules for assignment to tariffs
-- =============================================================
CREATE TABLE vacation_capping_rule_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_vcrg_tenant ON vacation_capping_rule_groups(tenant_id);
CREATE INDEX idx_vcrg_tenant_active ON vacation_capping_rule_groups(tenant_id, is_active);

CREATE TRIGGER update_vacation_capping_rule_groups_updated_at
    BEFORE UPDATE ON vacation_capping_rule_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vacation_capping_rule_groups IS 'Groups of vacation capping rules for assignment to tariffs.';

-- =============================================================
-- Junction table: links groups to their capping rules
-- =============================================================
CREATE TABLE vacation_capping_rule_group_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES vacation_capping_rule_groups(id) ON DELETE CASCADE,
    capping_rule_id UUID NOT NULL REFERENCES vacation_capping_rules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, capping_rule_id)
);

CREATE INDEX idx_vcrgr_group ON vacation_capping_rule_group_rules(group_id);
CREATE INDEX idx_vcrgr_rule ON vacation_capping_rule_group_rules(capping_rule_id);

COMMENT ON TABLE vacation_capping_rule_group_rules IS 'Junction table linking capping rule groups to their capping rules.';

-- =============================================================
-- Add vacation_capping_rule_group_id FK to tariffs
-- Tariff selects which capping rule group applies to its employees
-- =============================================================
ALTER TABLE tariffs
    ADD COLUMN vacation_capping_rule_group_id UUID REFERENCES vacation_capping_rule_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_tariffs_vacation_capping_rule_group ON tariffs(vacation_capping_rule_group_id);

COMMENT ON COLUMN tariffs.vacation_capping_rule_group_id IS 'Links tariff to its vacation capping rule group.';
