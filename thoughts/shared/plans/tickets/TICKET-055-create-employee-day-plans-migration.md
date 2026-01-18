# TICKET-055: Create Employee Day Plans Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 10 - Bookings
**Dependencies**: TICKET-035, TICKET-027

## Description

Create the employee_day_plans table for tracking assigned plans per employee/date.

## Files to Create

- `db/migrations/000023_create_employee_day_plans.up.sql`
- `db/migrations/000023_create_employee_day_plans.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL, -- NULL = off day
    source VARCHAR(20) DEFAULT 'tariff', -- 'tariff', 'manual', 'holiday'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, plan_date)
);

CREATE INDEX idx_employee_day_plans_employee ON employee_day_plans(employee_id);
CREATE INDEX idx_employee_day_plans_date ON employee_day_plans(plan_date);
CREATE INDEX idx_employee_day_plans_lookup ON employee_day_plans(employee_id, plan_date);
```

### Down Migration

```sql
DROP TABLE IF EXISTS employee_day_plans;
```

## Notes

This table stores the resolved day plan for each employee on each date.

Sources:
- `tariff`: Generated from tariff application
- `manual`: Manually assigned by supervisor
- `holiday`: Set as off-day due to holiday

Benefits:
- Enables querying assigned plan for any date
- Separates plan resolution from calculation
- Allows manual overrides
- Tracks source of assignment

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint on employee_id + plan_date
