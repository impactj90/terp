# TICKET-107: Create Payroll Export Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 27 - Payroll Export
**Dependencies**: TICKET-086

## Description

Create the payroll_exports table for tracking export batches.

## Files to Create

- `db/migrations/000034_create_payroll_exports.up.sql`
- `db/migrations/000034_create_payroll_exports.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE payroll_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Period
    year INT NOT NULL,
    month INT NOT NULL,

    -- Export details
    export_format VARCHAR(30) NOT NULL CHECK (export_format IN ('datev', 'lexware', 'sage', 'csv', 'custom')),
    config JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,

    -- Output
    file_path TEXT,
    file_size INT,
    record_count INT,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, year, month, export_format)
);

-- Export line items
CREATE TABLE payroll_export_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_id UUID NOT NULL REFERENCES payroll_exports(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id),

    -- Exported values
    personnel_number VARCHAR(50),
    cost_center VARCHAR(50),

    -- Time values (minutes)
    total_hours INT NOT NULL DEFAULT 0,
    overtime_hours INT NOT NULL DEFAULT 0,
    night_hours INT NOT NULL DEFAULT 0,
    sunday_hours INT NOT NULL DEFAULT 0,
    holiday_hours INT NOT NULL DEFAULT 0,

    -- Absence values (days)
    vacation_days DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,

    -- Raw data for reference
    raw_data JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payroll_exports_tenant ON payroll_exports(tenant_id);
CREATE INDEX idx_payroll_exports_period ON payroll_exports(year, month);
CREATE INDEX idx_payroll_export_items_export ON payroll_export_items(export_id);
CREATE INDEX idx_payroll_export_items_employee ON payroll_export_items(employee_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS payroll_export_items;
DROP TABLE IF EXISTS payroll_exports;
```

## Notes

Export formats:
- datev: German accounting standard
- lexware: Lexware payroll format
- sage: Sage accounting format
- csv: Generic CSV
- custom: Tenant-specific format

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
