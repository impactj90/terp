# TICKET-045: Create Tariffs Migration

**Type**: Migration
**Effort**: S
**Sprint**: 8 - Tariffs
**Dependencies**: TICKET-042, TICKET-027

## Description

Create the tariffs table for employee work schedule assignments.

## Files to Create

- `db/migrations/000019_create_tariffs.up.sql`
- `db/migrations/000019_create_tariffs.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- Validity period
    valid_from DATE NOT NULL,
    valid_to DATE,

    -- Tariff type determines schedule pattern
    tariff_type VARCHAR(20) NOT NULL, -- 'week', 'rolling', 'rhythm'

    -- For 'week' type: reference to week plan
    week_plan_id UUID REFERENCES week_plans(id) ON DELETE SET NULL,

    -- For 'rhythm' type: X-day cycle length
    rhythm_days INT,

    -- Mark current/active tariff
    is_current BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tariffs_tenant ON tariffs(tenant_id);
CREATE INDEX idx_tariffs_employee ON tariffs(employee_id);
CREATE INDEX idx_tariffs_current ON tariffs(employee_id, is_current);
CREATE INDEX idx_tariffs_validity ON tariffs(employee_id, valid_from, valid_to);

-- Ensure only one current tariff per employee
CREATE UNIQUE INDEX idx_tariffs_one_current ON tariffs(employee_id) WHERE is_current = true;
```

### Down Migration

```sql
DROP TABLE IF EXISTS tariffs;
```

## Notes

Tariff types:
- `week`: Uses a week_plan that repeats every week
- `rolling`: Uses tariff_week_plans for multi-week rotation
- `rhythm`: Uses tariff_day_plans for X-day cycle (e.g., 3 on, 2 off)

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint ensures one current tariff per employee
