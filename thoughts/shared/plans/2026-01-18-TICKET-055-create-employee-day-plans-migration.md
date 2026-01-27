# TICKET-055: Create Employee Day Plans Migration

## Overview

Create the `employee_day_plans` database table (migration 000023) to track assigned day plans per employee per date. This table enables the scheduling system to override weekly plan defaults with specific day plans on a per-employee basis.

## Current State Analysis

- 22 migrations exist (000001-000022)
- Next migration number: **000023**
- No `employee_day_plans` table exists

### Key Discoveries:

- Recent migrations (000019+) don't use database triggers for `updated_at` - GORM handles this
- `bookings` table (000022) provides the closest pattern: per-employee/date tracking with source field
- `week_plans` table (000018) shows nullable `day_plan_id` with `ON DELETE SET NULL`
- Source enum values from ticket: `tariff`, `manual`, `holiday`

## Desired End State

A `employee_day_plans` table that:
1. Tracks one day plan assignment per employee per date
2. Supports NULL `day_plan_id` to represent off days
3. Records the source of the assignment (tariff generation, manual override, holiday)
4. Follows established migration patterns

### Verification:
- Migration applies cleanly: `make migrate-up`
- Migration rolls back cleanly: `make migrate-down`
- Table schema matches specification

## What We're NOT Doing

- Creating the EmployeeDayPlan GORM model (separate ticket)
- Creating the EmployeeDayPlanRepository (separate ticket)
- Creating API endpoints or handlers
- Seeding any data

## Implementation Approach

Single-phase migration creation following established patterns from `bookings` (per-employee/date) and `week_plans` (nullable day_plan_id) migrations.

## Phase 1: Create Migration Files

### Overview
Create the up and down migration files for the `employee_day_plans` table.

### Changes Required:

#### 1. Up Migration
**File**: `db/migrations/000023_create_employee_day_plans.up.sql`

```sql
-- Employee Day Plans table
-- Stores assigned day plans per employee per date
-- day_plan_id NULL represents an off day (no work scheduled)

CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    -- Source of the assignment
    source VARCHAR(20) DEFAULT 'tariff',
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One plan per employee per date
    UNIQUE(employee_id, plan_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_employee_day_plans_tenant ON employee_day_plans(tenant_id);
CREATE INDEX idx_employee_day_plans_employee_date ON employee_day_plans(employee_id, plan_date);
CREATE INDEX idx_employee_day_plans_date ON employee_day_plans(plan_date);

COMMENT ON TABLE employee_day_plans IS 'Assigned day plans per employee per date';
COMMENT ON COLUMN employee_day_plans.day_plan_id IS 'Assigned day plan, NULL represents an off day';
COMMENT ON COLUMN employee_day_plans.source IS 'Origin of assignment: tariff, manual, holiday';
```

#### 2. Down Migration
**File**: `db/migrations/000023_create_employee_day_plans.down.sql`

```sql
DROP TABLE IF EXISTS employee_day_plans;
```

### Success Criteria:

#### Automated Verification:
- [x] Migration file exists: `ls db/migrations/000023_create_employee_day_plans.up.sql`
- [x] Down migration file exists: `ls db/migrations/000023_create_employee_day_plans.down.sql`
- [x] Migration applies cleanly: `make migrate-up`
- [x] Migration rolls back cleanly: `make migrate-down && make migrate-up`
- [x] All existing tests pass: `make test`

#### Manual Verification:
- [x] Table schema matches specification when inspected in database

## Table Schema Summary

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | NOT NULL, FK to tenants(id) ON DELETE CASCADE |
| employee_id | UUID | NOT NULL, FK to employees(id) ON DELETE CASCADE |
| plan_date | DATE | NOT NULL |
| day_plan_id | UUID | nullable, FK to day_plans(id) ON DELETE SET NULL |
| source | VARCHAR(20) | DEFAULT 'tariff' |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |
| | | UNIQUE(employee_id, plan_date) |

### Indexes:
- `idx_employee_day_plans_tenant` on `tenant_id`
- `idx_employee_day_plans_employee_date` on `(employee_id, plan_date)`
- `idx_employee_day_plans_date` on `plan_date`

## Source Values

| Value | Description |
|-------|-------------|
| `tariff` | Generated from tariff application (default) |
| `manual` | Manually assigned by supervisor |
| `holiday` | Set as off-day due to holiday |

## References

- Research: `thoughts/shared/research/2026-01-18-TICKET-055-create-employee-day-plans-migration.md`
- Similar migration: `db/migrations/000022_create_bookings.up.sql`
- Nullable FK pattern: `db/migrations/000018_create_week_plans.up.sql`
