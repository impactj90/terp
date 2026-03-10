-- =============================================================
-- Create correction_messages table (error/hint catalog)
-- =============================================================
CREATE TABLE correction_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    default_text TEXT NOT NULL,
    custom_text TEXT,
    severity VARCHAR(10) NOT NULL DEFAULT 'error',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_correction_messages_tenant ON correction_messages(tenant_id);
CREATE INDEX idx_correction_messages_code ON correction_messages(code);
CREATE INDEX idx_correction_messages_severity ON correction_messages(tenant_id, severity);

CREATE TRIGGER update_correction_messages_updated_at
    BEFORE UPDATE ON correction_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE correction_messages IS 'Catalog of error/hint messages for the correction assistant. Each tenant gets entries seeded from system defaults. Custom text overrides default text in outputs.';
COMMENT ON COLUMN correction_messages.code IS 'Error/warning code matching calculation engine constants (e.g. MISSING_COME, NO_BOOKINGS)';
COMMENT ON COLUMN correction_messages.default_text IS 'System-provided default human-readable message text';
COMMENT ON COLUMN correction_messages.custom_text IS 'Tenant-specific override text. When set, replaces default_text in outputs';
COMMENT ON COLUMN correction_messages.severity IS 'Classification: error or hint';
COMMENT ON COLUMN correction_messages.description IS 'Internal description of when this error/hint occurs';
