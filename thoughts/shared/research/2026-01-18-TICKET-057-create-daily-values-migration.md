---
date: 2026-01-18T13:58:36+01:00
researcher: Claude
git_commit: c4133ca6fcdbb7662c7d858de25b8f74f644028e
branch: master
repository: terp
topic: "TICKET-057: Create Daily Values Migration"
tags: [research, codebase, migrations, daily-values, time-tracking]
status: complete
last_updated: 2026-01-18
last_updated_by: Claude
---

# Research: TICKET-057 - Create Daily Values Migration

**Date**: 2026-01-18T13:58:36+01:00
**Researcher**: Claude
**Git Commit**: c4133ca6fcdbb7662c7d858de25b8f74f644028e
**Branch**: master
**Repository**: terp

## Research Question

What existing patterns, related tables, and dependencies are relevant for implementing the `daily_values` table migration (TICKET-057)?

## Summary

The codebase has 23 existing migrations following consistent patterns. The `daily_values` table will be migration `000024` and will store calculated daily time tracking results for employees. It references the `employees` table and follows similar patterns to `bookings` and `employee_day_plans` tables - all of which have `employee_id`, date fields, and `UNIQUE(employee_id, date)` constraints.

## Detailed Findings

### Current Migration State

The codebase contains 23 migrations in `db/migrations/`:

| Number | Name | Description |
|--------|------|-------------|
| 000001 | create_users | User accounts table |
| 000002 | create_tenants | Tenant/organization accounts |
| 000003 | create_holidays | Holiday definitions |
| 000004 | create_cost_centers | Cost center management |
| 000005 | create_employment_types | Employment type classifications |
| 000006 | create_accounts | Account records (TICKET-027 dependency) |
| 000007 | create_user_groups | User group definitions |
| 000008 | alter_users_multitenancy | Multi-tenancy support for users |
| 000009 | create_departments | Department structure |
| 000010 | create_teams | Team management |
| 000011 | create_employees | Employee records |
| 000012 | create_employee_contacts | Employee contact information |
| 000013 | create_employee_cards | Employee card/badge tracking |
| 000014 | link_users_employees | Cross-table foreign key constraints |
| 000015 | create_day_plans | Daily work schedule templates |
| 000016 | create_day_plan_breaks | Break rules for day plans |
| 000017 | create_day_plan_bonuses | Bonus rules for day plans |
| 000018 | create_week_plans | Weekly schedule templates |
| 000019 | create_tariffs | Tariff/contract definitions |
| 000020 | create_tariff_breaks | Break rules for tariffs |
| 000021 | create_booking_types | Time tracking event types |
| 000022 | create_bookings | Time tracking events |
| 000023 | create_employee_day_plans | Employee-specific daily plan assignments |

**Next migration number**: `000024`

### Related Tables

#### Employees Table (`db/migrations/000011_create_employees.up.sql`)

The `employees` table is the primary reference for `daily_values`:

```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    entry_date DATE NOT NULL,
    exit_date DATE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    employment_type_id UUID REFERENCES employment_types(id) ON DELETE SET NULL,
    weekly_hours DECIMAL(5,2) DEFAULT 40.00,
    vacation_days_per_year DECIMAL(5,2) DEFAULT 30.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);
```

#### Bookings Table (`db/migrations/000022_create_bookings.up.sql`)

The `bookings` table stores raw time tracking data that `daily_values` will aggregate:

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL,      -- Minutes from midnight (0-1439)
    edited_time INT NOT NULL,        -- Minutes from midnight
    calculated_time INT,             -- After tolerance/rounding
    pair_id UUID,
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);
```

**Time storage convention**: All time-of-day values are stored as INT representing minutes from midnight (0-1439). Example: 08:30 = 510, 17:00 = 1020.

#### Employee Day Plans Table (`db/migrations/000023_create_employee_day_plans.up.sql`)

The `employee_day_plans` table provides the target/expected hours for each day:

```sql
CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    source VARCHAR(20) DEFAULT 'tariff',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, plan_date)
);
```

**Pattern to follow**: `UNIQUE(employee_id, plan_date)` - same pattern needed for `daily_values`.

### Dependency: Accounts Table (TICKET-027)

**File**: `db/migrations/000006_create_accounts.up.sql`

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,  -- 'bonus', 'tracking', 'balance'
    unit VARCHAR(20) NOT NULL DEFAULT 'minutes',  -- 'minutes', 'hours', 'days'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

Seeded system accounts: FLEX (flextime), OT (overtime), VAC (vacation).

### Established Patterns for Migration

#### Naming Conventions

- **File format**: `{6-digit-number}_{description}.{up|down}.sql`
- **Table names**: Plural, snake_case (e.g., `daily_values`)
- **Index names**: `idx_{table}_{column(s)}`
- **Foreign key names**: `fk_{table}_{reference}`

#### Standard Table Structure

```sql
CREATE TABLE {table_name} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    -- ... columns ...
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Index Patterns

- Always index `tenant_id`: `CREATE INDEX idx_{table}_tenant ON {table}(tenant_id)`
- Composite indexes for common queries: `CREATE INDEX idx_{table}_employee_date ON {table}(employee_id, {date_column})`
- Partial indexes for nullable or boolean columns: `WHERE {condition}`

#### Array Column Pattern

The ticket specifies `TEXT[]` for error_codes and warnings. This is a PostgreSQL array type:
```sql
error_codes TEXT[],
warnings TEXT[],
```

#### Partial Index for Error Filtering

The ticket specifies:
```sql
CREATE INDEX idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true;
```

This follows the existing partial index pattern seen in `bookings`:
```sql
CREATE INDEX idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL;
```

## Code References

- `db/migrations/000011_create_employees.up.sql` - Employee table structure
- `db/migrations/000022_create_bookings.up.sql` - Bookings table with time storage pattern
- `db/migrations/000023_create_employee_day_plans.up.sql` - Similar employee+date unique constraint
- `db/migrations/000006_create_accounts.up.sql` - Accounts table (dependency)

## Architecture Documentation

### Time Value Storage

All time-of-day values in the codebase are stored as INT representing minutes from midnight:
- Range: 0-1439 (midnight to 23:59)
- Example conversions: 08:30 = 510, 17:00 = 1020

The `daily_values.first_come` and `daily_values.last_go` columns follow this convention.

### Duration Storage

Duration values (gross_time, net_time, target_time, overtime, undertime, break_time) are stored as INT representing total minutes.

### Employee-Date Uniqueness

Tables that store per-employee, per-date records use `UNIQUE(employee_id, {date_column})`:
- `employee_day_plans`: `UNIQUE(employee_id, plan_date)`
- `daily_values` (proposed): `UNIQUE(employee_id, value_date)`

### Multi-tenancy Pattern

All tables include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` with an index.

## Related Research

No previous research documents exist for this topic.

## Open Questions

*Resolved*: All tables in the codebase include `idx_{table}_tenant` on `tenant_id` for consistency. The migration should add `CREATE INDEX idx_daily_values_tenant ON daily_values(tenant_id)` to follow this established pattern.
