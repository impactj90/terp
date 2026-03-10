-- Contact Types: define the data format for contact fields
CREATE TABLE contact_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'text',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_contact_types_tenant ON contact_types(tenant_id);
CREATE INDEX idx_contact_types_tenant_active ON contact_types(tenant_id, is_active);

CREATE TRIGGER update_contact_types_updated_at
    BEFORE UPDATE ON contact_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contact_types IS 'Contact type definitions with data format (email, phone, text, url).';
COMMENT ON COLUMN contact_types.data_type IS 'Validation format: text, email, phone, url';

-- Contact Kinds: labeled instances of a contact type for use in employee contacts
CREATE TABLE contact_kinds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_type_id UUID NOT NULL REFERENCES contact_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_contact_kinds_tenant ON contact_kinds(tenant_id);
CREATE INDEX idx_contact_kinds_type ON contact_kinds(contact_type_id);
CREATE INDEX idx_contact_kinds_tenant_active ON contact_kinds(tenant_id, is_active);

CREATE TRIGGER update_contact_kinds_updated_at
    BEFORE UPDATE ON contact_kinds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE contact_kinds IS 'Labeled contact kinds linked to a contact type for use on employee contact tab.';
