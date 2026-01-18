# TICKET-092: Create Corrections Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 23 - Corrections
**Dependencies**: TICKET-058

## Description

Create the corrections table for manual time adjustments.

## Files to Create

- `db/migrations/000030_create_corrections.up.sql`
- `db/migrations/000030_create_corrections.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,

    -- What is being corrected
    correction_type VARCHAR(20) NOT NULL CHECK (correction_type IN ('overtime', 'undertime', 'flextime', 'vacation', 'sick')),

    -- Correction amount (minutes or days depending on type)
    amount INT NOT NULL,

    -- Reason
    reason TEXT NOT NULL,

    -- Approval
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,

    -- Audit
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, employee_id, value_date, correction_type)
);

CREATE INDEX idx_corrections_employee_date ON corrections(employee_id, value_date);
CREATE INDEX idx_corrections_tenant ON corrections(tenant_id);

COMMENT ON TABLE corrections IS 'Manual time adjustments for employees';
COMMENT ON COLUMN corrections.amount IS 'Minutes for time types, centdays for vacation';
```

### Down Migration

```sql
DROP TABLE IF EXISTS corrections;
```

## Notes

Corrections are used for:
- Manual overtime/undertime adjustments
- Flextime fixes
- Vacation balance adjustments
- Sick day corrections

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
