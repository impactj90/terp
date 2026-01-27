# TICKET-057: Create Daily Values Migration

**Type**: Migration
**Effort**: S
**Sprint**: 11 - Daily Values
**Dependencies**: TICKET-027

## Description

Create the daily_values table for storing calculated results.

## Files to Create

- `db/migrations/000024_create_daily_values.up.sql`
- `db/migrations/000024_create_daily_values.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,

    -- Core time values (all in minutes)
    gross_time INT DEFAULT 0,        -- Total work time before breaks
    net_time INT DEFAULT 0,          -- Work time after breaks
    target_time INT DEFAULT 0,       -- Expected work time from day plan
    overtime INT DEFAULT 0,          -- Positive difference
    undertime INT DEFAULT 0,         -- Negative difference
    break_time INT DEFAULT 0,        -- Total break duration

    -- Status
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],              -- Array of error codes
    warnings TEXT[],                 -- Array of warning codes

    -- Booking summary
    first_come INT,                  -- First come time
    last_go INT,                     -- Last go time
    booking_count INT DEFAULT 0,     -- Number of bookings

    -- Calculation tracking
    calculated_at TIMESTAMPTZ,
    calculation_version INT DEFAULT 1,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, value_date)
);

CREATE INDEX idx_daily_values_employee ON daily_values(employee_id);
CREATE INDEX idx_daily_values_date ON daily_values(value_date);
CREATE INDEX idx_daily_values_lookup ON daily_values(employee_id, value_date);
CREATE INDEX idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true;
```

### Down Migration

```sql
DROP TABLE IF EXISTS daily_values;
```

## Notes

All time values are stored in minutes:
- gross_time: Sum of work periods before break deduction
- net_time: gross_time minus breaks
- target_time: Expected hours from day plan (regular_hours)
- overtime: max(0, net_time - target_time)
- undertime: max(0, target_time - net_time)

Error codes examples:
- MISSING_COME
- MISSING_GO
- OVERLAPPING_BOOKINGS
- EXCEEDED_MAX_TIME
- CAME_BEFORE_ALLOWED
- LEFT_AFTER_ALLOWED

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint on employee_id + value_date
- [ ] TEXT[] columns for error codes
