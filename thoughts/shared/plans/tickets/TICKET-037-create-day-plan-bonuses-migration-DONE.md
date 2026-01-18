# TICKET-037: Create Day Plan Bonuses Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-035, TICKET-014

## Description

Create the day_plan_bonuses table for time-based bonus rules.

## Files to Create

- `db/migrations/000017_create_day_plan_bonuses.up.sql`
- `db/migrations/000017_create_day_plan_bonuses.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE day_plan_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    -- Time window for bonus (minutes from midnight)
    time_from INT NOT NULL,
    time_to INT NOT NULL,

    -- Bonus calculation
    calculation_type VARCHAR(20) NOT NULL, -- 'fixed', 'per_minute', 'percentage'
    value_minutes INT NOT NULL,            -- fixed minutes or rate

    -- Conditions
    min_work_minutes INT,   -- minimum work required to earn bonus
    applies_on_holiday BOOLEAN DEFAULT false,

    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_day_plan_bonuses_plan ON day_plan_bonuses(day_plan_id);
CREATE INDEX idx_day_plan_bonuses_account ON day_plan_bonuses(account_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS day_plan_bonuses;
```

## Notes

Calculation types:
- `fixed`: Add fixed minutes to account
- `per_minute`: Add X minutes per minute worked in window
- `percentage`: Add percentage of time worked in window

## Example Configurations

```
Night shift bonus (22:00-06:00):
- time_from: 1320 (22:00)
- time_to: 360 (06:00, next day handled by calculation)
- calculation_type: 'per_minute'
- value_minutes: 15 (15% bonus - 15 min per 100 min worked)

Early bird bonus:
- time_from: 360 (06:00)
- time_to: 420 (07:00)
- calculation_type: 'fixed'
- value_minutes: 30
```

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] FK to accounts table works
