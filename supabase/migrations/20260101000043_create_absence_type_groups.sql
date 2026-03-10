-- Absence type groups for workflow selection (WebClient)
CREATE TABLE absence_type_groups (
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

CREATE INDEX idx_absence_type_groups_tenant ON absence_type_groups(tenant_id);

CREATE TRIGGER update_absence_type_groups_updated_at
    BEFORE UPDATE ON absence_type_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add group FK to absence_types
ALTER TABLE absence_types
    ADD COLUMN absence_type_group_id UUID REFERENCES absence_type_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_absence_types_group ON absence_types(absence_type_group_id);

COMMENT ON TABLE absence_type_groups IS 'Groups of absence types for workflow selection in WebClient';
