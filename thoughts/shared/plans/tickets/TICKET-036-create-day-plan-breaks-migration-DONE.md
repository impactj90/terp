# TICKET-036: Create Day Plan Breaks Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-035

## Description

Create the day_plan_breaks table for break configuration.

## Files to Create

- `db/migrations/000016_create_day_plan_breaks.up.sql`
- `db/migrations/000016_create_day_plan_breaks.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE day_plan_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,

    -- Break type
    break_type VARCHAR(20) NOT NULL, -- 'fixed', 'variable', 'minimum'

    -- For fixed breaks: specific time window
    start_time INT,  -- minutes from midnight
    end_time INT,    -- minutes from midnight

    -- Duration in minutes
    duration INT NOT NULL,

    -- For minimum breaks: deduct after X minutes of work
    after_work_minutes INT,

    -- For variable: whether to auto-deduct if no break booked
    auto_deduct BOOLEAN DEFAULT true,

    -- Paid or unpaid break
    is_paid BOOLEAN DEFAULT false,

    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_day_plan_breaks_plan ON day_plan_breaks(day_plan_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS day_plan_breaks;
```

## Notes

Break types:
- `fixed`: Always deducted if work spans break window (e.g., 12:00-12:30)
- `variable`: Deducted based on actual break bookings, or auto-deducted if enabled
- `minimum`: Legal minimum break requirement (e.g., 30 min break after 6h work)

## Example Configurations

```
Fixed lunch break:
- break_type: 'fixed'
- start_time: 720 (12:00)
- end_time: 750 (12:30)
- duration: 30

Minimum break requirement:
- break_type: 'minimum'
- duration: 30
- after_work_minutes: 360 (6 hours)
```

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Cascades on day_plan delete
