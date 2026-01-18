# TICKET-087: Create Monthly Evaluation Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 21 - Monthly Values
**Dependencies**: TICKET-001

## Description

Create the monthly_evaluations table for flextime cap rules.

## Files to Create

- `db/migrations/000029_create_monthly_evaluations.up.sql`
- `db/migrations/000029_create_monthly_evaluations.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE monthly_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Flextime caps
    flextime_cap_positive INT,  -- Max positive flextime to carry over (minutes)
    flextime_cap_negative INT,  -- Max negative flextime allowed (minutes)

    -- Overtime thresholds
    overtime_threshold INT,     -- Minutes after which overtime counts

    -- Other settings
    max_carryover_vacation DECIMAL(5,2) DEFAULT 5, -- Max vacation days to carry over

    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_monthly_evaluations_tenant ON monthly_evaluations(tenant_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS monthly_evaluations;
```

## Notes

Used to configure monthly closing rules:
- Flextime caps prevent unlimited accumulation
- Overtime threshold defines when extra time counts as overtime
- Vacation carryover limit for year-end

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
