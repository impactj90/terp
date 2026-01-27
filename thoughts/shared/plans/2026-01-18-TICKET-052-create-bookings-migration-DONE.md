# TICKET-052: Create Bookings Migration - Implementation Plan

## Overview

Create the database migration (000022) for the `bookings` table, which stores time-tracking events (clock-in/out, breaks) for employees. This is the foundational table for the time tracking system.

## Current State Analysis

### Existing Infrastructure
- **Migration system**: golang-migrate with 21 existing migrations (000001-000021)
- **Next migration number**: 000022
- **OpenAPI spec**: Already defined in `api/schemas/bookings.yaml` and `api/paths/bookings.yaml`
- **Generated models**: Already exist in `apps/api/gen/models/booking.go`

### Referenced Tables (All Exist)
| Table | Migration | FK Behavior |
|-------|-----------|-------------|
| `tenants` | 000002 | `ON DELETE CASCADE` |
| `employees` | 000011 | `ON DELETE CASCADE` |
| `booking_types` | 000021 | No ON DELETE (prevent deletion if referenced) |

### Pattern Analysis
- Most recent similar migration: `000021_create_booking_types` - simple pattern, no `updated_at` trigger
- Earlier migrations (000001-000003) use `update_updated_at_column()` trigger
- No existing tables use `created_by`/`updated_by` columns with FK constraints

## Desired End State

After this migration:
1. The `bookings` table exists with all columns as specified
2. All foreign key constraints are properly configured
3. All performance indexes are in place
4. The migration can be rolled back cleanly

### Verification Commands
```bash
make migrate-up      # Migration applies successfully
make migrate-down    # Rollback works (drops table)
make migrate-up      # Re-apply works
```

## What We're NOT Doing

1. **NOT adding FK for `terminal_id`** - No terminals table exists yet; will be added when terminals are implemented
2. **NOT adding FK for `created_by`/`updated_by`** - Following existing patterns; these are audit fields without constraints
3. **NOT adding `updated_at` trigger** - Following the booking_types (000021) pattern; GORM handles this
4. **NOT implementing handler/service/repository** - This is migration only; implementation is a separate ticket

## Implementation Approach

Single-phase migration following the established patterns from `000021_create_booking_types`.

---

## Phase 1: Create Migration Files

### Overview
Create the up and down migration files for the bookings table.

### Changes Required:

#### 1. Up Migration
**File**: `db/migrations/000022_create_bookings.up.sql`

```sql
-- Bookings table
-- Stores time tracking events (clock-in/out, breaks) for employees

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    -- Time values stored as minutes from midnight (0-1439)
    -- Example: 08:30 = 510, 17:00 = 1020
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    -- Pairing: links COME/GO or BREAK_START/BREAK_END pairs
    pair_id UUID,
    -- Source of the booking
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Audit fields (no FK constraints)
    created_by UUID,
    updated_by UUID
);

-- Indexes for common query patterns
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
-- Partial index for pair lookups (only index non-null pair_ids)
CREATE INDEX idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL;

COMMENT ON TABLE bookings IS 'Time tracking events (clock-in/out, breaks) for employees';
COMMENT ON COLUMN bookings.original_time IS 'Original booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN bookings.edited_time IS 'Edited/corrected time as minutes from midnight';
COMMENT ON COLUMN bookings.calculated_time IS 'Time after tolerance/rounding rules applied';
COMMENT ON COLUMN bookings.pair_id IS 'Links paired bookings (COME/GO, BREAK_START/BREAK_END)';
COMMENT ON COLUMN bookings.source IS 'Origin of booking: web, terminal, api, import, correction';
```

#### 2. Down Migration
**File**: `db/migrations/000022_create_bookings.down.sql`

```sql
DROP TABLE IF EXISTS bookings;
```

### Success Criteria:

#### Automated Verification:
- [x] Migration files exist at correct paths
- [x] Up migration applies: `make migrate-up`
- [x] Down migration rolls back: `make migrate-down`
- [x] Re-apply works after rollback: `make migrate-up`
- [x] Indexes are created (verify with `\d bookings` in psql)

#### Manual Verification:
- [x] Table structure matches OpenAPI schema fields
- [x] Foreign key constraints work correctly (try inserting with invalid IDs)
- [x] Partial index on pair_id only indexes non-null values

---

## Testing Strategy

### Automated Tests
After migration is applied, these should pass:
```bash
make migrate-up
make test  # Existing tests still pass
```

### Manual Testing Steps
1. Apply migration: `make migrate-up`
2. Connect to database: `docker exec -it terp-db psql -U terp -d terp`
3. Verify table structure: `\d bookings`
4. Verify indexes: `\di` (list all indexes)
5. Verify foreign keys work:
   ```sql
   -- This should fail (invalid tenant_id)
   INSERT INTO bookings (tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time)
   VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '2026-01-18', '00000000-0000-0000-0000-000000000000', 480, 480);
   ```
6. Rollback and re-apply:
   ```bash
   make migrate-down
   make migrate-up
   ```

## Design Decisions

### Time Storage
Using **minutes from midnight (INT)** rather than TIME type:
- Simpler arithmetic for duration calculations
- Avoids timezone/DST complications within a single day
- Range: 0 (00:00) to 1439 (23:59)

### Pairing Strategy
The `pair_id` column links related bookings:
- COME paired with GO
- BREAK_START paired with BREAK_END
- Self-referencing (booking A's pair_id = B's id and vice versa)

### No FK on terminal_id
The terminals table doesn't exist yet. Adding the FK constraint will be part of the terminals implementation ticket.

### No FK on created_by/updated_by
Following existing codebase patterns - these are audit fields that store UUIDs but don't enforce referential integrity.

## References

- Research document: `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md`
- Reference migration: `db/migrations/000021_create_booking_types.up.sql`
- OpenAPI spec: `api/schemas/bookings.yaml`
- Generated model: `apps/api/gen/models/booking.go`
