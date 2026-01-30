-- =============================================================
-- Create export_interfaces table
-- ZMI manual section 11.2: Interface Configuration
-- =============================================================
CREATE TABLE export_interfaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    interface_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    mandant_number VARCHAR(50),
    export_script VARCHAR(255),
    export_path VARCHAR(500),
    output_filename VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, interface_number)
);

CREATE INDEX idx_ei_tenant ON export_interfaces(tenant_id);

CREATE TRIGGER update_export_interfaces_updated_at
    BEFORE UPDATE ON export_interfaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE export_interfaces IS 'Export interface definitions for payroll system integration (ZMI manual section 11.2).';
COMMENT ON COLUMN export_interfaces.interface_number IS 'Unique interface number within the tenant (Nummer).';
COMMENT ON COLUMN export_interfaces.name IS 'Interface name/label (Bezeichnung).';
COMMENT ON COLUMN export_interfaces.mandant_number IS 'Mandant number in the external payroll system (Mandantennummer).';
COMMENT ON COLUMN export_interfaces.export_script IS 'Export script name from Export folder (Skript).';
COMMENT ON COLUMN export_interfaces.export_path IS 'Destination folder for exported file (Exportpfad).';
COMMENT ON COLUMN export_interfaces.output_filename IS 'Output file name with extension (Dateiname).';
