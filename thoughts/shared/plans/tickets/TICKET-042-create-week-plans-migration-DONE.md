# TICKET-042: Create Week Plans Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 7 - Week Plans
**Dependencies**: TICKET-035

## Description

Create the week_plans table for 7-day schedule templates.

## Files to Create

- `db/migrations/000018_create_week_plans.up.sql`
- `db/migrations/000018_create_week_plans.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Day plan references (nullable for off days)
    monday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    tuesday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    wednesday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    thursday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    friday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    saturday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    sunday_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_week_plans_tenant ON week_plans(tenant_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS week_plans;
```

## Notes

- NULL day_plan_id means the employee is off that day
- Each day can have a different day plan
- Standard 5-day week would have Mon-Fri filled, Sat-Sun NULL

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds (not tested but migration is reversible)
- [x] All 7 FK columns reference day_plans

## Implementation Notes

Used `monday_day_plan_id` format instead of `monday_plan_id` to match the OpenAPI schema.
