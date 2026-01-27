---
date: 2026-01-18T10:59:05+01:00
researcher: tolga
git_commit: b6e1b95fcaf82595517f43a77374b19ac9051226
branch: hotfix/empl-tests
repository: terp
topic: "TICKET-052: Create Bookings Migration - Codebase Context"
tags: [research, codebase, migrations, bookings, time-tracking]
status: complete
last_updated: 2026-01-18
last_updated_by: tolga
---

# Research: TICKET-052 - Create Bookings Migration

**Date**: 2026-01-18T10:59:05+01:00
**Researcher**: tolga
**Git Commit**: b6e1b95fcaf82595517f43a77374b19ac9051226
**Branch**: hotfix/empl-tests
**Repository**: terp

## Research Question

Document the existing codebase context for implementing TICKET-052: Create Bookings Migration. This includes understanding the migration conventions, referenced tables, and existing booking-related code.

## Summary

The codebase uses golang-migrate with 21 existing migrations (000001-000021). The next migration number is **000022**, which aligns with the ticket specification. The bookings table will reference three existing tables:
- `tenants` (000002) - for multi-tenancy
- `employees` (000011) - for employee assignments
- `booking_types` (000021) - for categorizing bookings

The OpenAPI spec and generated models for Bookings already exist, but no implementation code (handlers, services, repositories, models) or database migration exists yet. The BookingType entity is fully implemented and serves as a reference pattern.

## Detailed Findings

### Migration Infrastructure

#### Naming Convention
Migrations follow the golang-migrate standard: `{6-digit-number}_{descriptive_name}.{direction}.sql`
- `db/migrations/000022_create_bookings.up.sql`
- `db/migrations/000022_create_bookings.down.sql`

#### Current Migration Count
- **Total**: 42 files (21 up + 21 down migrations)
- **Range**: 000001 to 000021
- **Next Available**: 000022

#### Migration Pairs
Each migration consists of paired `.up.sql` and `.down.sql` files.

### Referenced Tables

#### tenants (Migration 000002)
**File**: `db/migrations/000002_create_tenants.up.sql`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | NOT NULL, UNIQUE |
| settings | JSONB | DEFAULT '{}' |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

The bookings table should use:
```sql
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
```

#### employees (Migration 000011)
**File**: `db/migrations/000011_create_employees.up.sql`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | NOT NULL, FK to tenants(id) CASCADE |
| personnel_number | VARCHAR(50) | NOT NULL, unique per tenant |
| pin | VARCHAR(20) | NOT NULL, unique per tenant |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | nullable |
| phone | VARCHAR(50) | nullable |
| entry_date | DATE | NOT NULL |
| exit_date | DATE | nullable |
| department_id | UUID | FK to departments(id) SET NULL |
| cost_center_id | UUID | FK to cost_centers(id) SET NULL |
| employment_type_id | UUID | FK to employment_types(id) SET NULL |
| weekly_hours | DECIMAL(5,2) | DEFAULT 40.00 |
| vacation_days_per_year | DECIMAL(5,2) | DEFAULT 30.00 |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable (soft delete) |

The bookings table should use:
```sql
employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE
```

#### booking_types (Migration 000021)
**File**: `db/migrations/000021_create_booking_types.up.sql`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() |
| tenant_id | UUID | FK to tenants(id) CASCADE (nullable for system types) |
| code | VARCHAR(20) | NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| description | TEXT | nullable |
| direction | VARCHAR(10) | NOT NULL ('in' or 'out') |
| is_system | BOOLEAN | DEFAULT false |
| is_active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

**Seeded System Types**:
- COME (Clock In, direction: 'in')
- GO (Clock Out, direction: 'out')
- BREAK_START (Break Start, direction: 'out')
- BREAK_END (Break End, direction: 'in')

The bookings table should use:
```sql
booking_type_id UUID NOT NULL REFERENCES booking_types(id)
```
Note: No ON DELETE clause, meaning the booking_type cannot be deleted if referenced.

### Existing Booking-Related Code

#### BookingType (Fully Implemented)
| Layer | File |
|-------|------|
| Handler | `apps/api/internal/handler/bookingtype.go` |
| Service | `apps/api/internal/service/bookingtype.go` |
| Repository | `apps/api/internal/repository/bookingtype.go` |
| Model | `apps/api/internal/model/bookingtype.go` |
| Tests | `*_test.go` files for each layer |

#### Booking (OpenAPI Only - No Implementation)
**Generated Models** (from OpenAPI spec):
- `apps/api/gen/models/booking.go`
- `apps/api/gen/models/booking_list.go`
- `apps/api/gen/models/create_booking_request.go`
- `apps/api/gen/models/update_booking_request.go`
- `apps/api/gen/models/day_view.go`

**OpenAPI Spec**:
- `api/paths/bookings.yaml` - API endpoints
- `api/schemas/bookings.yaml` - Schema definitions

**Missing Implementation**:
- No handler at `apps/api/internal/handler/booking.go`
- No service at `apps/api/internal/service/booking.go`
- No repository at `apps/api/internal/repository/booking.go`
- No model at `apps/api/internal/model/booking.go`
- No database migration
- No route registration

### Migration Patterns

#### Standard Columns
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### Foreign Key Behaviors
- **ON DELETE CASCADE**: For tenant_id and parent-child relationships
- **ON DELETE SET NULL**: For optional relationships
- **No ON DELETE clause**: For required references that should prevent deletion

#### Index Naming
- `idx_<table>_<column>` - Single column
- `idx_<table>_<col1>_<col2>` - Composite
- `idx_<table>_tenant` - Tenant filtering

#### Partial Indexes
```sql
CREATE INDEX idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL;
```

### Ticket Specification vs. Codebase Patterns

The ticket specifies:

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    pair_id UUID,
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);
```

**Alignment with patterns**:
- UUID primary key with gen_random_uuid() - matches pattern
- tenant_id with CASCADE - matches pattern
- TIMESTAMPTZ for timestamps - matches pattern
- Foreign keys with appropriate ON DELETE behaviors - matches pattern

**Indexes specified**:
- `idx_bookings_tenant` on (tenant_id)
- `idx_bookings_employee_date` on (employee_id, booking_date)
- `idx_bookings_pair` partial index on (pair_id) WHERE pair_id IS NOT NULL
- `idx_bookings_date` on (booking_date)

## Code References

- `db/migrations/000002_create_tenants.up.sql` - Tenants table structure
- `db/migrations/000011_create_employees.up.sql` - Employees table structure
- `db/migrations/000021_create_booking_types.up.sql` - Booking types table structure
- `apps/api/internal/handler/bookingtype.go` - Reference implementation for booking handler
- `apps/api/internal/service/bookingtype.go` - Reference implementation for booking service
- `apps/api/internal/repository/bookingtype.go` - Reference implementation for booking repository
- `apps/api/internal/model/bookingtype.go` - Reference implementation for booking model
- `api/paths/bookings.yaml` - Existing OpenAPI spec for bookings
- `api/schemas/bookings.yaml` - Existing schema definitions for bookings

## Architecture Documentation

### Multi-Tenancy Pattern
All tenant-scoped tables follow the pattern:
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- Index on `tenant_id` for filtering
- Routes require `X-Tenant-ID` header

### Time Storage Pattern (from ticket)
The bookings table uses minutes from midnight (0-1439) for time storage:
- 08:30 = 510 minutes
- 17:00 = 1020 minutes
- Avoids timezone/DST issues within a day

### Pairing Pattern (from ticket)
Bookings are paired via `pair_id`:
- A1 (COME) paired with A2 (GO)
- PA (BREAK_START) paired with PE (BREAK_END)

## Related Research

None found in `thoughts/shared/research/`.

## Open Questions

1. Should `terminal_id` reference a terminals table (not yet created)?
2. Should `created_by` and `updated_by` reference users table with foreign keys?
3. Is there a need for an update trigger on `updated_at` like other tables?
