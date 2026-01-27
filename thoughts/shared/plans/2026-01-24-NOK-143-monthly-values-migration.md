# Implementation Plan: NOK-143 - Monthly Values Migration

## Overview

Create migration `000028_create_monthly_values` to add the `monthly_values` table for storing monthly aggregation results per employee. This table stores the output of the monthly calculation logic (TICKET-089) including time totals, flextime balances, absence summaries, and month-closing state.

**Migration Number**: 000028 (confirmed: follows 000027_create_vacation_balances)
**Table Name**: `monthly_values`
**Dependencies**: tenants (000002), employees (000011), users (000001)

---

## Phase 1: Create Up Migration

**File**: `db/migrations/000028_create_monthly_values.up.sql`

```sql
-- Monthly Values table
-- Stores monthly aggregation results for employees
-- Contains time totals, flextime balance, absence summaries, and month-closing state

CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- Period identification
    year INT NOT NULL,
    month INT NOT NULL,

    -- Aggregated time totals (all in minutes)
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,

    -- Flextime balance (all in minutes)
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,

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
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per month
    UNIQUE(employee_id, year, month)
);

-- Trigger for updated_at
CREATE TRIGGER update_monthly_values_updated_at
    BEFORE UPDATE ON monthly_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for common query patterns
CREATE INDEX idx_monthly_values_tenant ON monthly_values(tenant_id);
CREATE INDEX idx_monthly_values_employee ON monthly_values(employee_id);
CREATE INDEX idx_monthly_values_lookup ON monthly_values(employee_id, year, month);
CREATE INDEX idx_monthly_values_period ON monthly_values(year, month);

COMMENT ON TABLE monthly_values IS 'Monthly aggregation results for employee time tracking';
COMMENT ON COLUMN monthly_values.total_gross_time IS 'Sum of daily gross times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_net_time IS 'Sum of daily net times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_target_time IS 'Sum of daily target times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_overtime IS 'Sum of daily overtime for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_undertime IS 'Sum of daily undertime for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_break_time IS 'Sum of daily break times for the month (minutes)';
COMMENT ON COLUMN monthly_values.flextime_start IS 'Flextime balance carried over from previous month (minutes)';
COMMENT ON COLUMN monthly_values.flextime_change IS 'Net flextime change this month: overtime - undertime (minutes)';
COMMENT ON COLUMN monthly_values.flextime_end IS 'Final flextime balance after applying credit rules (minutes)';
COMMENT ON COLUMN monthly_values.flextime_carryover IS 'Amount carried over to next month after caps (minutes)';
COMMENT ON COLUMN monthly_values.vacation_taken IS 'Vacation days taken this month (supports half-day granularity)';
COMMENT ON COLUMN monthly_values.sick_days IS 'Sick days in this month';
COMMENT ON COLUMN monthly_values.other_absence_days IS 'Other absence days in this month';
COMMENT ON COLUMN monthly_values.work_days IS 'Number of days with recorded work time';
COMMENT ON COLUMN monthly_values.days_with_errors IS 'Number of days with calculation errors';
COMMENT ON COLUMN monthly_values.is_closed IS 'Whether this month has been closed for editing';
COMMENT ON COLUMN monthly_values.closed_by IS 'User who closed the month';
COMMENT ON COLUMN monthly_values.reopened_by IS 'User who last reopened the month';
```

### Design Decisions

1. **Trigger**: Uses `update_updated_at_column()` trigger (same as vacation_balances, absence_days) since monthly values will be updated when recalculated.
2. **UNIQUE constraint**: Inline `UNIQUE(employee_id, year, month)` following daily_values pattern.
3. **User FKs**: `closed_by` and `reopened_by` use `ON DELETE SET NULL` since the user reference is optional and informational (same pattern as employees table for optional FKs).
4. **DECIMAL(5,2)**: For `vacation_taken` to support half-day granularity (matches vacation_balances pattern).
5. **INT DEFAULT 0**: All time/count columns follow daily_values pattern.
6. **Indexes**: tenant, employee, composite lookup, and period index for reports.
7. **Month column**: Stores 1-12 (validated at application level, same as vacation_balances uses year without DB-level CHECK).

---

## Phase 2: Create Down Migration

**File**: `db/migrations/000028_create_monthly_values.down.sql`

```sql
DROP TRIGGER IF EXISTS update_monthly_values_updated_at ON monthly_values;
DROP TABLE IF EXISTS monthly_values;
```

This follows the exact pattern from 000026 (absence_days) and 000027 (vacation_balances): drop trigger first, then drop table.

---

## Phase 3: Verification

### Step 1: Apply Migration

```bash
cd /home/tolga/projects/terp && make migrate-up
```

Expected output: migration 000028 applied successfully.

### Step 2: Verify Table Structure

Connect to the database and verify:
- Table `monthly_values` exists with all columns
- UNIQUE constraint on `(employee_id, year, month)` is in place
- All indexes created (idx_monthly_values_tenant, idx_monthly_values_employee, idx_monthly_values_lookup, idx_monthly_values_period)
- Trigger `update_monthly_values_updated_at` exists
- Foreign keys reference correct tables (tenants, employees, users)

### Step 3: Test Rollback

```bash
cd /home/tolga/projects/terp && make migrate-down
```

Expected: migration 000028 rolled back, table and trigger dropped.

### Step 4: Re-apply

```bash
cd /home/tolga/projects/terp && make migrate-up
```

Expected: clean re-application with no errors.

### Step 5: Run Existing Tests

```bash
cd /home/tolga/projects/terp/apps/api && make test
```

Expected: all existing tests pass (migration should not affect existing functionality).

---

## Column-to-MonthlyCalcOutput Mapping

| DB Column | MonthlyCalcOutput Field | Notes |
|---|---|---|
| total_gross_time | TotalGrossTime | Direct mapping |
| total_net_time | TotalNetTime | Direct mapping |
| total_target_time | TotalTargetTime | Direct mapping |
| total_overtime | TotalOvertime | Direct mapping |
| total_undertime | TotalUndertime | Direct mapping |
| total_break_time | TotalBreakTime | Direct mapping |
| flextime_start | FlextimeStart | Previous month carryover |
| flextime_change | FlextimeChange | This month's net change |
| flextime_end | FlextimeEnd | Final balance after rules |
| flextime_carryover | (derived from FlextimeEnd) | Carried to next month |
| vacation_taken | VacationTaken | DECIMAL for half-days |
| sick_days | SickDays | Direct mapping |
| other_absence_days | OtherAbsenceDays | Direct mapping |
| work_days | WorkDays | Direct mapping |
| days_with_errors | DaysWithErrors | Direct mapping |

Note: `FlextimeRaw`, `FlextimeCredited`, and `FlextimeForfeited` from MonthlyCalcOutput are intermediate calculation values and are NOT persisted in the table.

---

## Files to Create

| File | Description |
|---|---|
| `db/migrations/000028_create_monthly_values.up.sql` | Create table, trigger, indexes, comments |
| `db/migrations/000028_create_monthly_values.down.sql` | Drop trigger and table |

---

## Acceptance Criteria

- [ ] Migration 000028 up file creates `monthly_values` table with all specified columns
- [ ] All time columns use INT DEFAULT 0 (minutes)
- [ ] vacation_taken uses DECIMAL(5,2) DEFAULT 0
- [ ] UNIQUE constraint on (employee_id, year, month)
- [ ] Foreign keys: tenant_id -> tenants, employee_id -> employees, closed_by/reopened_by -> users
- [ ] `update_updated_at_column()` trigger created
- [ ] Indexes created for tenant, employee, lookup, and period
- [ ] COMMENT ON statements for table and all domain columns
- [ ] Down migration drops trigger then table
- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] `make migrate-up` (re-apply) succeeds
- [ ] Existing tests still pass
