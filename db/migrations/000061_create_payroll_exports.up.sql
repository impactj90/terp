-- =============================================================
-- Create payroll_exports table
-- Stores generated export records and file content
-- =============================================================
CREATE TABLE payroll_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    export_interface_id UUID REFERENCES export_interfaces(id) ON DELETE SET NULL,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    export_type VARCHAR(20) DEFAULT 'standard'
        CHECK (export_type IN ('standard', 'datev', 'sage', 'custom')),
    format VARCHAR(10) DEFAULT 'csv'
        CHECK (format IN ('csv', 'xlsx', 'xml', 'json')),
    parameters JSONB DEFAULT '{}',
    file_content TEXT,
    file_size INT,
    row_count INT,
    employee_count INT,
    total_hours DECIMAL(12,2),
    total_overtime DECIMAL(12,2),
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pe_tenant ON payroll_exports(tenant_id);
CREATE INDEX idx_pe_interface ON payroll_exports(export_interface_id);
CREATE INDEX idx_pe_period ON payroll_exports(tenant_id, year, month);
CREATE INDEX idx_pe_status ON payroll_exports(status);

CREATE TRIGGER update_payroll_exports_updated_at
    BEFORE UPDATE ON payroll_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE payroll_exports IS 'Payroll export records with generated file content.';
COMMENT ON COLUMN payroll_exports.file_content IS 'Generated export file content (CSV text). Stored in DB for simplicity; future: write to filesystem using export_path.';
COMMENT ON COLUMN payroll_exports.parameters IS 'JSON with employee_ids, department_ids, include_accounts filter arrays.';
