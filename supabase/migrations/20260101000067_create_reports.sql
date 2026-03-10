-- =============================================================
-- Create reports table
-- Stores generated report records and file content
-- =============================================================
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    report_type VARCHAR(30) NOT NULL
        CHECK (report_type IN (
            'daily_overview', 'weekly_overview', 'monthly_overview',
            'employee_timesheet', 'department_summary',
            'absence_report', 'vacation_report', 'overtime_report',
            'account_balances', 'custom'
        )),
    name VARCHAR(255),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    format VARCHAR(10) NOT NULL DEFAULT 'xlsx'
        CHECK (format IN ('json', 'csv', 'xlsx', 'pdf')),
    parameters JSONB DEFAULT '{}',
    file_content BYTEA,
    file_size INT,
    row_count INT,
    error_message TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_tenant ON reports(tenant_id);
CREATE INDEX idx_reports_type ON reports(tenant_id, report_type);
CREATE INDEX idx_reports_status ON reports(status);

CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE reports IS 'Generated report records with file content.';
COMMENT ON COLUMN reports.file_content IS 'Binary file content (PDF/XLSX). Stored as BYTEA for binary formats.';
COMMENT ON COLUMN reports.parameters IS 'JSON with from_date, to_date, employee_ids, department_ids, cost_center_ids, team_ids.';
