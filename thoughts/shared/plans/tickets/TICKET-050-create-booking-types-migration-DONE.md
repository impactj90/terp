# TICKET-050: Create Booking Types Migration

**Type**: Migration
**Effort**: S
**Sprint**: 9 - Booking Types
**Dependencies**: TICKET-001

## Description

Create the booking_types table with system types seeded.

## Files to Create

- `db/migrations/000021_create_booking_types.up.sql`
- `db/migrations/000021_create_booking_types.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL, -- 'come', 'go', 'break_start', 'break_end', 'manual'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(7) DEFAULT '#808080',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_types_tenant ON booking_types(tenant_id);
CREATE UNIQUE INDEX idx_booking_types_code ON booking_types(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);

-- Seed system booking types
INSERT INTO booking_types (code, name, category, is_system, sort_order) VALUES
('A1', 'Come', 'come', true, 1),
('A2', 'Go', 'go', true, 2),
('PA', 'Break Start', 'break_start', true, 3),
('PE', 'Break End', 'break_end', true, 4);
```

### Down Migration

```sql
DROP TABLE IF EXISTS booking_types;
```

## Notes

Categories:
- `come`: Employee arrival booking
- `go`: Employee departure booking
- `break_start`: Break start (PA = Pause Anfang)
- `break_end`: Break end (PE = Pause Ende)
- `manual`: Manual correction entries

System types have NULL tenant_id and are shared across all tenants.

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] System types A1, A2, PA, PE are seeded
- [ ] `make migrate-down` succeeds
- [ ] Code unique per tenant (or globally for system types)
