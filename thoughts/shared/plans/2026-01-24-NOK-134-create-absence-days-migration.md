# NOK-134: Create Absence Days Migration - Implementation Plan

## Overview

Create migration 000026 to add the `absence_days` table, which tracks employee absences per day linked to absence types for credit calculation.

## Current State Analysis

- Highest existing migration: **000025** (`create_absence_types`)
- Next migration number: **000026**
- All dependencies satisfied:
  - `tenants` table (migration 000002)
  - `employees` table (migration 000011)
  - `users` table (migration 000001)
  - `absence_types` table (migration 000025)
  - `update_updated_at_column()` function (migration 000001)

## Desired End State

Two migration files exist at `db/migrations/000026_create_absence_days.{up,down}.sql`. The up migration creates the `absence_days` table with proper indexes, constraints, and trigger. The down migration cleanly removes everything.

Verification: `make migrate-up` and `make migrate-down` both succeed.

## What We're NOT Doing

- Creating the Go model or repository (separate ticket)
- Adding API endpoints for absence days
- Implementing business logic for absence credit calculation

## Implementation

### Phase 1: Create Migration Files

#### 1. Up Migration
**File**: `db/migrations/000026_create_absence_days.up.sql`

```sql
-- Absence days track employee absences per date
-- Links to absence_types for credit calculation
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- The date and type of absence
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),

    -- Duration: 1.0 = full day, 0.5 = half day
    -- Used with absence_type.portion to calculate final credit
    duration DECIMAL(3,2) NOT NULL DEFAULT 1.00,

    -- Half day specification (when duration = 0.5)
    half_day_period VARCHAR(10), -- 'morning' or 'afternoon'

    -- Approval workflow
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Optional notes
    notes TEXT,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_absence_days_updated_at
    BEFORE UPDATE ON absence_days
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_absence_days_tenant ON absence_days(tenant_id);
CREATE INDEX idx_absence_days_employee ON absence_days(employee_id);
CREATE INDEX idx_absence_days_date ON absence_days(absence_date);
CREATE INDEX idx_absence_days_type ON absence_days(absence_type_id);
CREATE INDEX idx_absence_days_status ON absence_days(status);

-- Primary lookup: employee + date
CREATE INDEX idx_absence_days_lookup ON absence_days(employee_id, absence_date);

-- Only one non-cancelled absence per employee per date
CREATE UNIQUE INDEX idx_absence_days_unique ON absence_days(employee_id, absence_date)
    WHERE status != 'cancelled';

-- Date range queries
CREATE INDEX idx_absence_days_range ON absence_days(employee_id, absence_date, status);

COMMENT ON TABLE absence_days IS 'Employee absence records linked to absence_types for credit calculation';
COMMENT ON COLUMN absence_days.duration IS 'Day portion: 1.0=full, 0.5=half';
COMMENT ON COLUMN absence_days.half_day_period IS 'For half days: morning or afternoon';
```

#### 2. Down Migration
**File**: `db/migrations/000026_create_absence_days.down.sql`

```sql
DROP TRIGGER IF EXISTS update_absence_days_updated_at ON absence_days;
DROP TABLE IF EXISTS absence_days;
```

### Success Criteria

#### Automated Verification:
- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Re-running `make migrate-up` after down succeeds (round-trip)

#### Manual Verification:
- [ ] Unique constraint prevents duplicate non-cancelled absences per employee per date
- [ ] Duration field correctly stores decimals (0.5, 1.0)
- [ ] Status defaults to 'pending'

## References

- Research: `thoughts/shared/research/2026-01-24-NOK-134-create-absence-days-migration.md`
- Ticket: `thoughts/shared/plans/tickets/TICKET-076-create-absence-days-migration.md`
- Pattern reference: `db/migrations/000025_create_absence_types.up.sql`
