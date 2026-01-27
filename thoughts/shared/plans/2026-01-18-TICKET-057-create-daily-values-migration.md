# TICKET-057: Create Daily Values Migration - Implementation Plan

## Overview

Create the `daily_values` table migration (000024) for storing calculated daily time tracking results for employees. This table aggregates booking data into daily summaries with time calculations, error tracking, and status information.

## Current State Analysis

- **Migration count**: 23 existing migrations (000001-000023)
- **Next number**: 000024
- **Dependencies**: `tenants`, `employees` tables exist
- **Related tables**: `bookings` (raw time data), `employee_day_plans` (target hours)

### Key Discoveries:
- All tables use `idx_{table}_tenant` for tenant_id indexing (`db/migrations/000022_create_bookings.up.sql:30`)
- Employee-date uniqueness pattern: `UNIQUE(employee_id, date_column)` (`db/migrations/000023_create_employee_day_plans.up.sql:19`)
- Time values stored as INT minutes from midnight (0-1439) (`db/migrations/000022_create_bookings.up.sql:10-11`)
- Partial indexes used for filtered queries (`db/migrations/000022_create_bookings.up.sql:34`)

## Desired End State

Two migration files exist:
- `db/migrations/000024_create_daily_values.up.sql` - Creates table with indexes
- `db/migrations/000024_create_daily_values.down.sql` - Drops table

Verification: `make migrate-up` and `make migrate-down` both succeed without errors.

## What We're NOT Doing

- Creating the DailyValue model (TICKET-058)
- Creating the DailyValue repository (TICKET-058)
- Implementing calculation logic
- Adding seed data

## Implementation Approach

Single-phase implementation creating both migration files following established patterns.

## Phase 1: Create Migration Files

### Overview
Create the up and down migration files for the `daily_values` table.

### Changes Required:

#### 1. Up Migration
**File**: `db/migrations/000024_create_daily_values.up.sql`
**Changes**: Create new file with table definition

```sql
-- Daily Values table
-- Stores calculated daily time tracking results for employees
-- Aggregates booking data into daily summaries with time calculations

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

    -- Booking summary (times as minutes from midnight 0-1439)
    first_come INT,                  -- First come time
    last_go INT,                     -- Last go time
    booking_count INT DEFAULT 0,     -- Number of bookings

    -- Calculation tracking
    calculated_at TIMESTAMPTZ,
    calculation_version INT DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per date
    UNIQUE(employee_id, value_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_daily_values_tenant ON daily_values(tenant_id);
CREATE INDEX idx_daily_values_employee ON daily_values(employee_id);
CREATE INDEX idx_daily_values_date ON daily_values(value_date);
CREATE INDEX idx_daily_values_lookup ON daily_values(employee_id, value_date);
-- Partial index for error filtering (only index rows with errors)
CREATE INDEX idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true;

COMMENT ON TABLE daily_values IS 'Calculated daily time tracking results for employees';
COMMENT ON COLUMN daily_values.gross_time IS 'Total work time before breaks (minutes)';
COMMENT ON COLUMN daily_values.net_time IS 'Work time after breaks (minutes)';
COMMENT ON COLUMN daily_values.target_time IS 'Expected work time from day plan (minutes)';
COMMENT ON COLUMN daily_values.overtime IS 'Positive time difference: max(0, net_time - target_time)';
COMMENT ON COLUMN daily_values.undertime IS 'Negative time difference: max(0, target_time - net_time)';
COMMENT ON COLUMN daily_values.first_come IS 'First come booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN daily_values.last_go IS 'Last go booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN daily_values.error_codes IS 'Array of error codes: MISSING_COME, MISSING_GO, OVERLAPPING_BOOKINGS, etc.';
COMMENT ON COLUMN daily_values.calculation_version IS 'Version of calculation algorithm used';
```

#### 2. Down Migration
**File**: `db/migrations/000024_create_daily_values.down.sql`
**Changes**: Create new file with drop statement

```sql
DROP TABLE IF EXISTS daily_values;
```

### Success Criteria:

#### Automated Verification:
- [x] Migration up succeeds: `make migrate-up`
- [x] Migration down succeeds: `make migrate-down`
- [x] Migration up again succeeds: `make migrate-up`
- [x] Linting passes: `make lint` (N/A - no Go code in this task, only SQL)

#### Manual Verification:
- [x] Verify table exists in database with correct columns
- [x] Verify unique constraint prevents duplicate employee_id + value_date
- [x] Verify TEXT[] columns can store arrays

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Automated Tests:
- Migration roundtrip test via make commands

### Manual Testing Steps:
1. Run `make migrate-up` and verify success
2. Connect to database and run `\d daily_values` to verify schema
3. Insert test row and verify unique constraint
4. Run `make migrate-down` and verify table is dropped

## References

- Original ticket: `thoughts/shared/plans/tickets/TICKET-057-create-daily-values-migration.md`
- Research document: `thoughts/shared/research/2026-01-18-TICKET-057-create-daily-values-migration.md`
- Similar migration: `db/migrations/000023_create_employee_day_plans.up.sql`
- Bookings pattern: `db/migrations/000022_create_bookings.up.sql`
