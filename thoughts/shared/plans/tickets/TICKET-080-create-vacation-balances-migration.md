# TICKET-080: Create Vacation Balances Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 20 - Vacation Balance
**Dependencies**: TICKET-027

## Description

Create the vacation_balances table for tracking annual vacation entitlement.

## Files to Create

- `db/migrations/000027_create_vacation_balances.up.sql`
- `db/migrations/000027_create_vacation_balances.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE vacation_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    entitlement DECIMAL(5,2) NOT NULL DEFAULT 0,   -- Days entitled
    carryover DECIMAL(5,2) DEFAULT 0,              -- Days carried from previous year
    adjustments DECIMAL(5,2) DEFAULT 0,            -- Manual adjustments (+/-)
    taken DECIMAL(5,2) DEFAULT 0,                  -- Days taken
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, year)
);

CREATE INDEX idx_vacation_balances_employee ON vacation_balances(employee_id);
CREATE INDEX idx_vacation_balances_year ON vacation_balances(year);
```

### Down Migration

```sql
DROP TABLE IF EXISTS vacation_balances;
```

## Notes

Available vacation = entitlement + carryover + adjustments - taken

Typical workflow:
1. At year start, create record with entitlement based on contract
2. Add carryover from previous year (may have limit)
3. As vacation absences are created, increment `taken`
4. Adjustments for special circumstances

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint on employee_id + year
