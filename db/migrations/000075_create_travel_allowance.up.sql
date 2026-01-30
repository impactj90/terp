-- Travel allowance rule sets (configuration containers per ZMI manual 10.14)
CREATE TABLE travel_allowance_rule_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    valid_from DATE,
    valid_to DATE,
    calculation_basis VARCHAR(20) DEFAULT 'per_day',
    distance_rule VARCHAR(20) DEFAULT 'longest',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_travel_allowance_rule_sets_tenant ON travel_allowance_rule_sets(tenant_id);

CREATE TRIGGER update_travel_allowance_rule_sets_updated_at
    BEFORE UPDATE ON travel_allowance_rule_sets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE travel_allowance_rule_sets IS 'Travel allowance (Ausloese) rule set containers with validity period and calculation options (ZMI manual 10.14)';

-- Local travel rules (Nahmontage - same-day trips, ZMI manual 10.14.1)
CREATE TABLE local_travel_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_set_id UUID NOT NULL REFERENCES travel_allowance_rule_sets(id) ON DELETE CASCADE,
    min_distance_km NUMERIC(10,2) DEFAULT 0,
    max_distance_km NUMERIC(10,2),
    min_duration_minutes INTEGER DEFAULT 0,
    max_duration_minutes INTEGER,
    tax_free_amount NUMERIC(10,2) DEFAULT 0,
    taxable_amount NUMERIC(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_local_travel_rules_tenant ON local_travel_rules(tenant_id);
CREATE INDEX idx_local_travel_rules_rule_set ON local_travel_rules(rule_set_id);

CREATE TRIGGER update_local_travel_rules_updated_at
    BEFORE UPDATE ON local_travel_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE local_travel_rules IS 'Local travel (Nahmontage) rules: distance/duration ranges with tax-free and taxable amounts (ZMI manual 10.14.1)';

-- Extended travel rules (Fernmontage - multi-day trips, ZMI manual 10.14.2)
CREATE TABLE extended_travel_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_set_id UUID NOT NULL REFERENCES travel_allowance_rule_sets(id) ON DELETE CASCADE,
    arrival_day_tax_free NUMERIC(10,2) DEFAULT 0,
    arrival_day_taxable NUMERIC(10,2) DEFAULT 0,
    departure_day_tax_free NUMERIC(10,2) DEFAULT 0,
    departure_day_taxable NUMERIC(10,2) DEFAULT 0,
    intermediate_day_tax_free NUMERIC(10,2) DEFAULT 0,
    intermediate_day_taxable NUMERIC(10,2) DEFAULT 0,
    three_month_enabled BOOLEAN DEFAULT false,
    three_month_tax_free NUMERIC(10,2) DEFAULT 0,
    three_month_taxable NUMERIC(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_extended_travel_rules_tenant ON extended_travel_rules(tenant_id);
CREATE INDEX idx_extended_travel_rules_rule_set ON extended_travel_rules(rule_set_id);

CREATE TRIGGER update_extended_travel_rules_updated_at
    BEFORE UPDATE ON extended_travel_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE extended_travel_rules IS 'Extended travel (Fernmontage) rules: arrival/departure/intermediate day rates with three-month rule (ZMI manual 10.14.2)';
