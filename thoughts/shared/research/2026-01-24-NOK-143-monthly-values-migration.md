# Research: NOK-143 - Monthly Values Migration

## Ticket Summary

Create the `monthly_values` table (migration 000028) to store monthly aggregation results per employee. Depends on employees table (TICKET-027, migration 000011).

---

## Latest Migration Number

The most recent migration in `db/migrations/` is `000027_create_vacation_balances`. The next migration number is **000028**, which matches the ticket specification.

---

## Standard Migration Patterns

### Common Column Patterns

From the existing migrations (daily_values, vacation_balances, absence_days, employee_day_plans), the standard patterns are:

```sql
-- Primary key
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- Tenant isolation
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE

-- Employee reference
employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE

-- Timestamps
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

### Updated_at Trigger

The `update_updated_at_column()` function is defined in migration 000001 (create_users). Recent migrations (000025, 000026, 000027) use it via:

```sql
CREATE TRIGGER update_<table_name>_updated_at
    BEFORE UPDATE ON <table_name>
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Down Migration Pattern

Recent down migrations (000026, 000027) drop the trigger first if present, then the table:

```sql
DROP TRIGGER IF EXISTS update_<table_name>_updated_at ON <table_name>;
DROP TABLE IF EXISTS <table_name>;
```

### Unique Constraint Pattern

- `daily_values`: `UNIQUE(employee_id, value_date)` - inline constraint
- `vacation_balances`: `CREATE UNIQUE INDEX idx_vacation_balances_employee_year ON vacation_balances(employee_id, year)` - separate unique index
- `employee_day_plans`: `UNIQUE(employee_id, plan_date)` - inline constraint

### Index Naming Pattern

```
idx_<table_name>_<column(s)>
```

Examples from daily_values:
- `idx_daily_values_tenant`
- `idx_daily_values_employee`
- `idx_daily_values_date`
- `idx_daily_values_lookup`

### Comment Pattern

```sql
COMMENT ON TABLE <table_name> IS '...';
COMMENT ON COLUMN <table_name>.<column> IS '...';
```

---

## Employees Table Structure (Migration 000011)

Location: `/home/tolga/projects/terp/db/migrations/000011_create_employees.up.sql`

Key fields relevant to monthly_values:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` - referenced by `employee_id` FK
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- Uses `ON DELETE CASCADE` for tenant, `ON DELETE SET NULL` for optional references

---

## Daily Values Table Structure (Migration 000024)

Location: `/home/tolga/projects/terp/db/migrations/000024_create_daily_values.up.sql`

This is the closest analog to monthly_values. Key structural elements:

```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,

    -- Core time values (all in minutes)
    gross_time INT DEFAULT 0,
    net_time INT DEFAULT 0,
    target_time INT DEFAULT 0,
    overtime INT DEFAULT 0,
    undertime INT DEFAULT 0,
    break_time INT DEFAULT 0,

    -- Status
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],
    warnings TEXT[],

    -- Booking summary
    first_come INT,
    last_go INT,
    booking_count INT DEFAULT 0,

    -- Calculation tracking
    calculated_at TIMESTAMPTZ,
    calculation_version INT DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(employee_id, value_date)
);
```

Notes:
- Time values stored as INT in minutes with DEFAULT 0
- No `update_updated_at_column` trigger on daily_values (unlike vacation_balances and absence tables)
- Uses inline UNIQUE constraint
- Has COMMENT ON statements for documentation

---

## Vacation Balances Table Structure (Migration 000027)

Location: `/home/tolga/projects/terp/db/migrations/000027_create_vacation_balances.up.sql`

Uses `year INT NOT NULL` column for yearly aggregation (similar to monthly_values needing year + month). Uses `update_updated_at_column()` trigger. Uses DECIMAL for day counts.

---

## Monthly Aggregation Logic (TICKET-089)

Location: `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-089-create-monthly-aggregation-logic.md`

The `MonthlyCalcOutput` struct defines the data model for monthly values:

```go
type MonthlyCalcOutput struct {
    // Aggregated totals (all in minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime calculation
    FlextimeStart     int
    FlextimeChange    int
    FlextimeRaw       int  // intermediate - likely not persisted
    FlextimeCredited  int  // intermediate - likely not persisted
    FlextimeForfeited int  // intermediate - likely not persisted
    FlextimeEnd       int

    // Summary
    WorkDays       int
    DaysWithErrors int

    // Absence copy
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    // Warnings
    Warnings []string
}
```

---

## Users Table (for closed_by/reopened_by References)

Location: `/home/tolga/projects/terp/db/migrations/000001_create_users.up.sql`

Users have `id UUID PRIMARY KEY`. The `closed_by` and `reopened_by` columns in monthly_values should reference `users(id)`.

---

## Ticket-Specified Columns Mapped to Patterns

Based on the ticket description and existing patterns:

| Ticket Column | SQL Type | Default | Notes |
|---|---|---|---|
| id | UUID PRIMARY KEY | gen_random_uuid() | Standard |
| tenant_id | UUID NOT NULL | - | FK to tenants(id) |
| employee_id | UUID NOT NULL | - | FK to employees(id) |
| year | INT NOT NULL | - | Same pattern as vacation_balances |
| month | INT NOT NULL | - | 1-12 |
| total_gross_time | INT | 0 | Minutes, same as daily_values |
| total_net_time | INT | 0 | Minutes |
| total_target_time | INT | 0 | Minutes |
| total_overtime | INT | 0 | Minutes |
| total_undertime | INT | 0 | Minutes |
| total_break_time | INT | 0 | Minutes |
| flextime_start | INT | 0 | Minutes, carryover from previous month |
| flextime_change | INT | 0 | Minutes, this month's change |
| flextime_end | INT | 0 | Minutes, final balance |
| flextime_carryover | INT | 0 | Minutes |
| vacation_taken | DECIMAL(5,2) | 0 | Days, matches VacationTaken decimal type |
| sick_days | INT | 0 | Days |
| other_absence_days | INT | 0 | Days |
| work_days | INT | 0 | Count |
| days_with_errors | INT | 0 | Count |
| is_closed | BOOLEAN | false | Month closing state |
| closed_at | TIMESTAMPTZ | NULL | When closed |
| closed_by | UUID | NULL | FK to users(id) |
| reopened_at | TIMESTAMPTZ | NULL | When reopened |
| reopened_by | UUID | NULL | FK to users(id) |
| created_at | TIMESTAMPTZ | NOW() | Standard |
| updated_at | TIMESTAMPTZ | NOW() | Standard |

Unique constraint: `UNIQUE(employee_id, year, month)`

---

## DailyValue Go Model Structure

Location: `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go`

The GORM model uses:
- `uuid.UUID` for ID, TenantID, EmployeeID
- `int` for time values in minutes
- `time.Time` for timestamps
- `*time.Time` for nullable timestamps
- `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"` tag pattern
- `gorm:"type:uuid;not null;index"` for FK fields
- `gorm:"default:0"` for int fields with defaults
- `*Employee` relation with `gorm:"foreignKey:EmployeeID"`
- `TableName()` method returning the SQL table name

---

## VacationBalance Go Model Structure

Location: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

Uses `decimal.Decimal` with `gorm:"type:decimal(5,2);not null;default:0"` for day-count fields.

---

## Summary of Key Findings

1. **Migration number 000028** is correct (follows 000027_create_vacation_balances)
2. **Time values** stored as INT in minutes with DEFAULT 0 (same as daily_values)
3. **Year/month columns** follow vacation_balances pattern (INT NOT NULL)
4. **Vacation days** use DECIMAL(5,2) to support half-day granularity
5. **User references** (closed_by, reopened_by) should be nullable UUIDs referencing users(id)
6. **Trigger pattern**: Recent migrations use `update_updated_at_column()` trigger
7. **Down migration**: Drop trigger first, then drop table
8. **Unique constraint**: Can be inline `UNIQUE(employee_id, year, month)` following daily_values pattern
9. **Indexes needed**: tenant_id, employee_id, and a composite lookup index
