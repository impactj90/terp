# TICKET-046: Create Tariff Day Plans Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 8 - Tariffs
**Dependencies**: TICKET-045

## Description

Create the tariff_day_plans table for rhythm-based schedules.

## Files to Create

- `db/migrations/000020_create_tariff_day_plans.up.sql`
- `db/migrations/000020_create_tariff_day_plans.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE tariff_day_plans (
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    day_index INT NOT NULL, -- 0-based index in the rhythm
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    PRIMARY KEY (tariff_id, day_index)
);

CREATE INDEX idx_tariff_day_plans_tariff ON tariff_day_plans(tariff_id);
```

### Down Migration

```sql
DROP TABLE IF EXISTS tariff_day_plans;
```

## Notes

For a rhythm tariff with rhythm_days=5:
- day_index 0: day_plan_id = X (work)
- day_index 1: day_plan_id = X (work)
- day_index 2: day_plan_id = X (work)
- day_index 3: day_plan_id = NULL (off)
- day_index 4: day_plan_id = NULL (off)

The schedule repeats after rhythm_days.

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Composite PK on tariff_id + day_index
