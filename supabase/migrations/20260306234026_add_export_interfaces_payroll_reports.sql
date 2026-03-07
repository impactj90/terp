-- =============================================================
-- Add export_interfaces, export_interface_accounts,
-- payroll_exports, reports, and monthly_values tables
-- for ZMI-TICKET-224
-- =============================================================

-- monthly_values (from Go migration 000028)
CREATE TABLE IF NOT EXISTS monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL,
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,
    work_days INT DEFAULT 0,
    days_with_errors INT DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_values_tenant ON monthly_values(tenant_id);
CREATE INDEX IF NOT EXISTS idx_monthly_values_employee ON monthly_values(employee_id);
CREATE INDEX IF NOT EXISTS idx_monthly_values_lookup ON monthly_values(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_values_period ON monthly_values(year, month);

CREATE OR REPLACE TRIGGER update_monthly_values_updated_at
    BEFORE UPDATE ON monthly_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- export_interfaces (from Go migration 000059)
CREATE TABLE IF NOT EXISTS export_interfaces (
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

CREATE INDEX IF NOT EXISTS idx_ei_tenant ON export_interfaces(tenant_id);

CREATE OR REPLACE TRIGGER update_export_interfaces_updated_at
    BEFORE UPDATE ON export_interfaces
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- export_interface_accounts (from Go migration 000060)
CREATE TABLE IF NOT EXISTS export_interface_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_interface_id UUID NOT NULL REFERENCES export_interfaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(export_interface_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_eia_interface ON export_interface_accounts(export_interface_id);
CREATE INDEX IF NOT EXISTS idx_eia_account ON export_interface_accounts(account_id);

-- payroll_exports (from Go migration 000061)
CREATE TABLE IF NOT EXISTS payroll_exports (
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

CREATE INDEX IF NOT EXISTS idx_pe_tenant ON payroll_exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pe_interface ON payroll_exports(export_interface_id);
CREATE INDEX IF NOT EXISTS idx_pe_period ON payroll_exports(tenant_id, year, month);
CREATE INDEX IF NOT EXISTS idx_pe_status ON payroll_exports(status);

CREATE OR REPLACE TRIGGER update_payroll_exports_updated_at
    BEFORE UPDATE ON payroll_exports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- reports (from Go migration 000066)
CREATE TABLE IF NOT EXISTS reports (
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

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(tenant_id, report_type);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE OR REPLACE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
