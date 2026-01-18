# TICKET-074: Create Absence Types Migration

**Type**: Migration
**Effort**: S
**Sprint**: 18 - Absence Types
**Dependencies**: TICKET-001

## Description

Create the absence_types table with system types seeded.

## Files to Create

- `db/migrations/000025_create_absence_types.up.sql`
- `db/migrations/000025_create_absence_types.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL, -- 'vacation', 'illness', 'special', 'unpaid'
    credits_hours BOOLEAN DEFAULT true,
    deducts_vacation BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(7) DEFAULT '#808080',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_absence_types_tenant ON absence_types(tenant_id);
CREATE UNIQUE INDEX idx_absence_types_code ON absence_types(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);

-- Seed system absence types
INSERT INTO absence_types (code, name, category, credits_hours, deducts_vacation, is_system, color, sort_order) VALUES
('U', 'Vacation', 'vacation', true, true, true, '#4CAF50', 1),
('K', 'Illness', 'illness', true, false, true, '#F44336', 2),
('S', 'Special Leave', 'special', true, false, true, '#2196F3', 3),
('UU', 'Unpaid Leave', 'unpaid', false, false, true, '#9E9E9E', 4);
```

### Down Migration

```sql
DROP TABLE IF EXISTS absence_types;
```

## Notes

Categories:
- `vacation`: Paid vacation (deducts from vacation balance)
- `illness`: Sick leave (documented illness)
- `special`: Special paid leave (wedding, birth, etc.)
- `unpaid`: Unpaid leave (no hour credit)

Fields:
- `credits_hours`: If true, employee gets credited target hours
- `deducts_vacation`: If true, reduces vacation balance

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] System types U, K, S, UU are seeded
- [ ] `make migrate-down` succeeds
- [ ] Code unique per tenant
