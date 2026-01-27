# TICKET-052: Create Bookings Migration

**Type**: Migration
**Effort**: S
**Sprint**: 10 - Bookings
**Dependencies**: TICKET-050, TICKET-027

## Description

Create the bookings table for time tracking entries.

## Files to Create

- `db/migrations/000022_create_bookings.up.sql`
- `db/migrations/000022_create_bookings.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),

    -- Time values (minutes from midnight)
    original_time INT NOT NULL,  -- Original booking time (immutable)
    edited_time INT NOT NULL,    -- Possibly modified time
    calculated_time INT,         -- After tolerance/rounding applied

    -- Pairing
    pair_id UUID,                -- Links come/go or break_start/break_end

    -- Metadata
    source VARCHAR(20) DEFAULT 'web', -- 'web', 'terminal', 'api', 'import', 'correction'
    terminal_id UUID,            -- If booked via terminal
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
CREATE INDEX idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL;
CREATE INDEX idx_bookings_date ON bookings(booking_date);
```

### Down Migration

```sql
DROP TABLE IF EXISTS bookings;
```

## Notes

Time storage:
- All times stored as minutes from midnight (0-1439)
- Example: 08:30 = 510, 17:00 = 1020
- Avoids timezone/DST issues within a day

Booking flow:
1. Employee books (original_time set)
2. Supervisor may edit (edited_time updated)
3. Calculation applies rules (calculated_time set)

Pairing:
- A1 (come) paired with A2 (go) via pair_id
- PA (break start) paired with PE (break end)
- Calculation uses pairs to compute durations

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Index on employee_id + booking_date for efficient queries
