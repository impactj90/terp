---
date: 2026-01-18T12:00:00+00:00
researcher: tolga
git_commit: 96962c2c4d9b1940712dc7e5746874a7efe0db00
branch: master
repository: terp
topic: "TICKET-055: Create Employee Day Plans Migration"
tags: [research, codebase, migration, employee_day_plans, database]
status: complete
last_updated: 2026-01-18
last_updated_by: tolga
---

# Research: TICKET-055 Create Employee Day Plans Migration

**Date**: 2026-01-18T12:00:00+00:00
**Researcher**: tolga
**Git Commit**: 96962c2c4d9b1940712dc7e5746874a7efe0db00
**Branch**: master
**Repository**: terp

## Research Question

Document the codebase patterns relevant to implementing the `employee_day_plans` migration (TICKET-055) which will track assigned plans per employee/date with references to tenants, employees, and day_plans tables.

## Summary

The codebase follows consistent patterns for migrations, multi-tenant tables, and GORM models. The `employee_day_plans` table will be migration 000023 and follows established patterns for:
- Per-employee/date tracking (similar to `bookings` table)
- Nullable foreign keys to `day_plans` (similar to `week_plans` table)
- Source tracking via enum-like string field (similar to `bookings.source`)

## Detailed Findings

### Dependent Table Schemas

#### tenants Table (`db/migrations/000002_create_tenants.up.sql`)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | NOT NULL, UNIQUE |
| settings | JSONB | DEFAULT '{}' |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

#### employees Table (`db/migrations/000011_create_employees.up.sql`)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | NOT NULL, FK to tenants(id) ON DELETE CASCADE |
| personnel_number | VARCHAR(50) | NOT NULL, UNIQUE per tenant |
| pin | VARCHAR(20) | NOT NULL, UNIQUE per tenant |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | nullable |
| phone | VARCHAR(50) | nullable |
| entry_date | DATE | NOT NULL |
| exit_date | DATE | nullable |
| department_id | UUID | FK to departments(id) ON DELETE SET NULL |
| cost_center_id | UUID | FK to cost_centers(id) ON DELETE SET NULL |
| employment_type_id | UUID | FK to employment_types(id) ON DELETE SET NULL |
| weekly_hours | DECIMAL(5,2) | DEFAULT 40.00 |
| vacation_days_per_year | DECIMAL(5,2) | DEFAULT 30.00 |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable |

#### day_plans Table (`db/migrations/000015_create_day_plans.up.sql`)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | NOT NULL, FK to tenants(id) ON DELETE CASCADE |
| code | VARCHAR(20) | NOT NULL, UNIQUE per tenant |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | nullable |
| plan_type | VARCHAR(20) | NOT NULL, DEFAULT 'fixed' |
| come_from | INT | nullable (minutes from midnight) |
| come_to | INT | nullable |
| go_from | INT | nullable |
| go_to | INT | nullable |
| core_start | INT | nullable |
| core_end | INT | nullable |
| regular_hours | INT | NOT NULL, DEFAULT 480 |
| tolerance_* | INT | 4 tolerance columns |
| rounding_* | VARCHAR/INT | 4 rounding columns |
| min_work_time | INT | nullable |
| max_net_work_time | INT | nullable |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

### Migration Patterns

#### File Naming Convention
- Format: `{6-digit-number}_{action}_{entity}.{up|down}.sql`
- Next migration: `000023_create_employee_day_plans.up.sql`
- Table names: plural snake_case (`employee_day_plans`)

#### Standard CREATE TABLE Structure

```sql
-- Table comment line 1
-- Table comment line 2

CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- other columns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_table_column ON table_name(column);

CREATE TRIGGER update_table_updated_at
    BEFORE UPDATE ON table_name
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

#### Foreign Key Patterns

**ON DELETE CASCADE** - For mandatory relationships:
- `tenant_id` always cascades
- `employee_id` cascades when record belongs to employee

**ON DELETE SET NULL** - For optional relationships:
- Optional foreign keys like `day_plan_id` when NULL represents "off day"

Example from `db/migrations/000011_create_employees.up.sql:12`:
```sql
department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
```

#### Unique Constraint Pattern

Composite uniqueness per tenant at `db/migrations/000011_create_employees.up.sql:21`:
```sql
UNIQUE(tenant_id, personnel_number),
```

For employee_day_plans, the ticket specifies:
```sql
UNIQUE(employee_id, plan_date)
```

### Similar Table Patterns

#### bookings Table - Per Employee/Date Pattern

The `bookings` table (`db/migrations/000022_create_bookings.up.sql`) follows a similar per-employee/date tracking pattern:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, CASCADE |
| employee_id | UUID | NOT NULL, CASCADE |
| booking_date | DATE | NOT NULL |
| source | VARCHAR(20) | DEFAULT 'web' |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

Indexes (lines 30-34):
```sql
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
```

#### week_plans Table - Nullable Day Plan References

The `week_plans` table (`db/migrations/000018_create_week_plans.up.sql`) demonstrates nullable day_plan foreign keys:

```sql
monday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
tuesday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
-- ... etc
```

NULL represents a non-working day, identical to `employee_day_plans.day_plan_id = NULL` for off days.

### Model Patterns

#### Nullable Day Plan Foreign Key

From `apps/api/internal/model/weekplan.go:16-23`:
```go
MondayDayPlanID    *uuid.UUID `gorm:"type:uuid" json:"monday_day_plan_id,omitempty"`
TuesdayDayPlanID   *uuid.UUID `gorm:"type:uuid" json:"tuesday_day_plan_id,omitempty"`
// ...
```

With relation definition at line 30:
```go
MondayDayPlan    *DayPlan `gorm:"foreignKey:MondayDayPlanID" json:"monday_day_plan,omitempty"`
```

#### Date Field Handling

From `apps/api/internal/model/booking.go:27`:
```go
BookingDate time.Time `gorm:"type:date;not null" json:"booking_date"`
```

From `apps/api/internal/model/employee.go:20-21`:
```go
EntryDate time.Time  `gorm:"type:date;not null" json:"entry_date"`
ExitDate  *time.Time `gorm:"type:date" json:"exit_date,omitempty"`
```

#### Source Enum Pattern

From `apps/api/internal/model/booking.go:13-21`:
```go
type BookingSource string

const (
    BookingSourceWeb        BookingSource = "web"
    BookingSourceTerminal   BookingSource = "terminal"
    BookingSourceAPI        BookingSource = "api"
    BookingSourceImport     BookingSource = "import"
    BookingSourceCorrection BookingSource = "correction"
)
```

Usage at line 39:
```go
Source BookingSource `gorm:"type:varchar(20);default:'web'" json:"source"`
```

For employee_day_plans, the source values from the ticket are:
- `tariff` - Generated from tariff application
- `manual` - Manually assigned by supervisor
- `holiday` - Set as off-day due to holiday

#### Employee ID Relationship Pattern

From `apps/api/internal/model/booking.go:26`:
```go
EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
```

With relation at line 49:
```go
Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
```

#### Notes Field Pattern

From `apps/api/internal/model/booking.go:43`:
```go
Notes *string `gorm:"type:text" json:"notes,omitempty"`
```

### Down Migration Pattern

From `db/migrations/000022_create_bookings.down.sql`:
```sql
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
DROP TABLE IF EXISTS bookings;
```

Order:
1. Drop triggers first
2. Drop table second
3. Always use `IF EXISTS`

## Code References

- `db/migrations/000002_create_tenants.up.sql` - Tenant table schema
- `db/migrations/000011_create_employees.up.sql` - Employee table schema
- `db/migrations/000015_create_day_plans.up.sql` - Day plan table schema
- `db/migrations/000018_create_week_plans.up.sql` - Nullable day_plan_id foreign key pattern
- `db/migrations/000022_create_bookings.up.sql` - Per employee/date tracking pattern with source field
- `apps/api/internal/model/booking.go` - BookingSource enum and employee relationship patterns
- `apps/api/internal/model/weekplan.go` - Nullable day plan FK in GORM model

## Architecture Documentation

### Migration Sequence
Current migrations: 000001 through 000022
Next migration number: 000023

### Trigger Reuse
The `update_updated_at_column()` function was created in migration 000001 and is reused by all subsequent tables. New migrations only need to create the trigger, not the function.

### Multi-Tenant Pattern
All domain tables include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` as the second column after `id`.

### Composite Unique Constraints
Employee-scoped uniqueness uses `UNIQUE(employee_id, column)` pattern rather than `UNIQUE(tenant_id, column)` since employee_id already implies the tenant.

## Related Research

- `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md` - Bookings table migration
- `thoughts/shared/research/2026-01-18-TICKET-053-create-booking-model.md` - Booking model patterns

## Open Questions

None - all patterns required for implementation are documented.
