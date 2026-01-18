# TICKET-035: Create Day Plans Migration

**Type**: Migration
**Effort**: S
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-001

## Description

Create the day_plans table for work schedule definitions.

## Files to Create

- `db/migrations/000015_create_day_plans.up.sql`
- `db/migrations/000015_create_day_plans.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'fixed', -- 'fixed', 'flextime'

    -- Time windows (all in minutes from midnight)
    come_from INT,      -- earliest allowed arrival
    come_to INT,        -- latest allowed arrival
    go_from INT,        -- earliest allowed departure
    go_to INT,          -- latest allowed departure

    -- Core hours for flextime
    core_start INT,     -- core time start
    core_end INT,       -- core time end

    -- Target hours
    regular_hours INT NOT NULL DEFAULT 480, -- 8 hours in minutes

    -- Tolerance settings
    tolerance_come_plus INT DEFAULT 0,   -- late arrival tolerance
    tolerance_come_minus INT DEFAULT 0,  -- early arrival tolerance
    tolerance_go_plus INT DEFAULT 0,     -- late departure tolerance
    tolerance_go_minus INT DEFAULT 0,    -- early departure tolerance

    -- Rounding settings
    rounding_come_type VARCHAR(20),      -- 'none', 'up', 'down', 'nearest'
    rounding_come_interval INT,          -- rounding interval in minutes
    rounding_go_type VARCHAR(20),
    rounding_go_interval INT,

    -- Caps
    min_work_time INT,                   -- minimum work time required
    max_net_work_time INT,               -- maximum creditable work time

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_day_plans_tenant ON day_plans(tenant_id);
CREATE INDEX idx_day_plans_active ON day_plans(tenant_id, is_active);
```

### Down Migration

```sql
DROP TABLE IF EXISTS day_plans;
```

## Notes

- All time values stored as minutes from midnight (0 = 00:00, 480 = 08:00, 1020 = 17:00)
- `fixed` plan type: strict come/go times
- `flextime` plan type: flexible within windows, core hours required

## Example Values

```
Standard 8h day:
- come_from: 420 (07:00)
- come_to: 540 (09:00)
- go_from: 960 (16:00)
- go_to: 1140 (19:00)
- regular_hours: 480 (8 hours)
- core_start: 540 (09:00)
- core_end: 960 (16:00)
```

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] All time fields accept minute values
