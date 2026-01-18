# TICKET-085: Create Monthly Values Migration

**Type**: Migration
**Effort**: S
**Sprint**: 21 - Monthly Values
**Dependencies**: TICKET-027

## Description

Create the monthly_values table for monthly aggregations.

## Files to Create

- `db/migrations/000028_create_monthly_values.up.sql`
- `db/migrations/000028_create_monthly_values.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL, -- 1-12

    -- Aggregated time values (all in minutes)
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,

    -- Flextime tracking
    flextime_start INT DEFAULT 0,     -- Balance at month start
    flextime_change INT DEFAULT 0,    -- Change during month
    flextime_end INT DEFAULT 0,       -- Balance at month end
    flextime_carryover INT DEFAULT 0, -- Amount carried to next month (after caps)

    -- Absence summary
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,

    -- Work summary
    work_days INT DEFAULT 0,
    days_with_errors INT DEFAULT 0,

    -- Month closing
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id),
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, year, month)
);

CREATE INDEX idx_monthly_values_employee ON monthly_values(employee_id);
CREATE INDEX idx_monthly_values_year_month ON monthly_values(year, month);
CREATE INDEX idx_monthly_values_closed ON monthly_values(is_closed);
```

### Down Migration

```sql
DROP TABLE IF EXISTS monthly_values;
```

## Notes

- All time values in minutes
- Flextime tracks running balance across months
- is_closed prevents further modifications
- Stores summary counts for reporting

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint on employee_id + year + month
