# TICKET-029: Create Employee Cards Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 5 - Employees
**Dependencies**: TICKET-027

## Description

Create the employee_cards table for RFID/badge management.

## Files to Create

- `db/migrations/000013_create_employee_cards.up.sql`
- `db/migrations/000013_create_employee_cards.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE employee_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    card_number VARCHAR(100) NOT NULL,
    card_type VARCHAR(50) DEFAULT 'rfid', -- 'rfid', 'barcode', 'qr'
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, card_number)
);

CREATE INDEX idx_employee_cards_employee ON employee_cards(employee_id);
CREATE INDEX idx_employee_cards_card ON employee_cards(tenant_id, card_number);
CREATE INDEX idx_employee_cards_active ON employee_cards(tenant_id, is_active);
```

### Down Migration

```sql
DROP TABLE IF EXISTS employee_cards;
```

## Notes

- Card number is unique per tenant (same card can't be assigned twice)
- Valid date range for temporary cards
- Deactivation tracking for lost/stolen cards

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Card number unique per tenant
