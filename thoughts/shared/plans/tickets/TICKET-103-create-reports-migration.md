# TICKET-103: Create Reports Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 26 - Reports
**Dependencies**: TICKET-058

## Description

Create the report_templates and report_runs tables.

## Files to Create

- `db/migrations/000033_create_reports.up.sql`
- `db/migrations/000033_create_reports.down.sql`

## Implementation

### Up Migration

```sql
-- Report templates
CREATE TABLE report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN (
        'daily_summary', 'monthly_summary', 'absence_overview',
        'vacation_balance', 'overtime_summary', 'employee_list',
        'booking_detail', 'error_report', 'custom'
    )),

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}',
    columns JSONB,
    filters JSONB,
    grouping JSONB,
    sorting JSONB,

    -- Output settings
    output_format VARCHAR(20) DEFAULT 'pdf' CHECK (output_format IN ('pdf', 'xlsx', 'csv')),

    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

-- Report execution history
CREATE TABLE report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
    report_type VARCHAR(50) NOT NULL,

    -- Parameters used
    parameters JSONB NOT NULL DEFAULT '{}',
    date_from DATE,
    date_to DATE,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    error_message TEXT,

    -- Output
    output_format VARCHAR(20) NOT NULL,
    file_path TEXT,
    file_size INT,
    row_count INT,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    -- Who ran it
    run_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_templates_tenant ON report_templates(tenant_id);
CREATE INDEX idx_report_runs_tenant ON report_runs(tenant_id);
CREATE INDEX idx_report_runs_status ON report_runs(status);
CREATE INDEX idx_report_runs_created ON report_runs(created_at);
```

### Down Migration

```sql
DROP TABLE IF EXISTS report_runs;
DROP TABLE IF EXISTS report_templates;
```

## Notes

Report types:
- daily_summary: Daily time summary per employee
- monthly_summary: Monthly aggregation
- absence_overview: All absences in range
- vacation_balance: Current vacation balances
- overtime_summary: Overtime accumulation
- employee_list: Employee master data
- booking_detail: Raw booking data
- error_report: Days with booking errors
- custom: User-defined reports

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
