# TICKET-096: Create Account Values Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 24 - Account Values
**Dependencies**: TICKET-058

## Description

Create the account_values table for tracking accumulated time accounts.

## Files to Create

- `db/migrations/000031_create_account_values.up.sql`
- `db/migrations/000031_create_account_values.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE account_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('flextime', 'overtime', 'vacation', 'sick', 'special_leave')),
    year INT NOT NULL,

    -- Balance tracking
    opening_balance INT NOT NULL DEFAULT 0,
    current_balance INT NOT NULL DEFAULT 0,
    closing_balance INT,

    -- Yearly entitlement (for vacation)
    yearly_entitlement INT DEFAULT 0,

    -- Status
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, employee_id, account_type, year)
);

CREATE INDEX idx_account_values_employee ON account_values(employee_id, year);
CREATE INDEX idx_account_values_tenant ON account_values(tenant_id);

COMMENT ON TABLE account_values IS 'Yearly account balances for employees';
COMMENT ON COLUMN account_values.opening_balance IS 'Balance at start of year (carryover)';
COMMENT ON COLUMN account_values.current_balance IS 'Current calculated balance';
COMMENT ON COLUMN account_values.closing_balance IS 'Final balance after year close';
```

### Down Migration

```sql
DROP TABLE IF EXISTS account_values;
```

## Notes

Account types:
- flextime: Overtime/undertime balance
- overtime: Separate overtime accumulation
- vacation: Vacation days balance
- sick: Sick days used
- special_leave: Special leave balance

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
