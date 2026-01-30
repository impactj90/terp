-- Access zones: physical or logical zones for access control (placeholder)
CREATE TABLE access_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_access_zones_tenant ON access_zones(tenant_id);

CREATE TRIGGER update_access_zones_updated_at
    BEFORE UPDATE ON access_zones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE access_zones IS 'Access control zones (placeholder - requires separate ZMI Zutritt documentation)';

-- Access profiles: sets of access rules/permissions (placeholder)
CREATE TABLE access_profiles (
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

CREATE INDEX idx_access_profiles_tenant ON access_profiles(tenant_id);

CREATE TRIGGER update_access_profiles_updated_at
    BEFORE UPDATE ON access_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE access_profiles IS 'Access control profiles (placeholder - requires separate ZMI Zutritt documentation)';

-- Employee access assignments: links employees to access profiles
CREATE TABLE employee_access_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    access_profile_id UUID NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_access_assignments_tenant ON employee_access_assignments(tenant_id);
CREATE INDEX idx_employee_access_assignments_employee ON employee_access_assignments(employee_id);
CREATE INDEX idx_employee_access_assignments_profile ON employee_access_assignments(access_profile_id);

CREATE TRIGGER update_employee_access_assignments_updated_at
    BEFORE UPDATE ON employee_access_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_access_assignments IS 'Employee-to-access-profile assignments (placeholder - requires separate ZMI Zutritt documentation)';
