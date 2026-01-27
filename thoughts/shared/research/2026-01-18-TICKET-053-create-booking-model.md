---
date: 2026-01-18T11:25:34+01:00
researcher: impactj90
git_commit: aac3ce37c0f03a5a1de7538176529c43be3c2558
branch: master
repository: terp
topic: "TICKET-053: Create Booking Model - Codebase Research"
tags: [research, codebase, booking, model, gorm]
status: complete
last_updated: 2026-01-18
last_updated_by: impactj90
---

# Research: TICKET-053 Create Booking Model

**Date**: 2026-01-18T11:25:34+01:00
**Researcher**: impactj90
**Git Commit**: aac3ce37c0f03a5a1de7538176529c43be3c2558
**Branch**: master
**Repository**: terp

## Research Question

What patterns and structures exist in the codebase to inform the implementation of the Booking model as specified in TICKET-053?

## Summary

The codebase follows consistent GORM model patterns. The Booking model will need to:
1. Match the database schema defined in migration 000022
2. Follow existing model patterns (inline fields, GORM/JSON tags, TableName method, helper methods)
3. Define a `BookingSource` enum similar to `BookingDirection` in BookingType
4. Include relationships to Employee, BookingType, and self-referential Pair
5. Include helper methods as specified in the ticket

## Detailed Findings

### Database Schema (TICKET-052 Dependency)

The bookings migration exists at `db/migrations/000022_create_bookings.up.sql`:

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

**Indexes:**
- `idx_bookings_tenant` on `tenant_id`
- `idx_bookings_employee_date` on `employee_id, booking_date`
- `idx_bookings_date` on `booking_date`
- `idx_bookings_pair` partial index on `pair_id WHERE pair_id IS NOT NULL`

### Model Pattern Analysis

#### Standard Field Patterns

From `apps/api/internal/model/employee.go:12-30`:

```go
ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
TenantID  uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
```

**Key patterns:**
- UUID primary key with `gen_random_uuid()` default
- Required foreign keys as `uuid.UUID` (not pointer)
- Optional foreign keys as `*uuid.UUID` with `omitempty`
- Timestamps with `default:now()`

#### Enum Pattern

From `apps/api/internal/model/bookingtype.go:9-14`:

```go
type BookingDirection string

const (
    BookingDirectionIn  BookingDirection = "in"
    BookingDirectionOut BookingDirection = "out"
)
```

The Booking model needs a similar `BookingSource` enum:
```go
type BookingSource string

const (
    BookingSourceWeb        BookingSource = "web"
    BookingSourceTerminal   BookingSource = "terminal"
    BookingSourceAPI        BookingSource = "api"
    BookingSourceImport     BookingSource = "import"
    BookingSourceCorrection BookingSource = "correction"
)
```

#### TableName Pattern

From `apps/api/internal/model/bookingtype.go:29-31`:

```go
func (BookingType) TableName() string {
    return "booking_types"
}
```

**Pattern:** Value receiver (not pointer), returns lowercase plural snake_case table name.

#### Relationship Patterns

From `apps/api/internal/model/employee.go:33-39`:

```go
// Belongs-to relationships (pointer types)
Tenant     *Tenant     `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
Department *Department `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`

// Has-many relationships (slice types)
Contacts []EmployeeContact `gorm:"foreignKey:EmployeeID" json:"contacts,omitempty"`
```

For Booking:
- `Employee *Employee` - belongs-to via EmployeeID
- `BookingType *BookingType` - belongs-to via BookingTypeID
- `Pair *Booking` - self-referential belongs-to via PairID

#### Helper Method Patterns

From `apps/api/internal/model/employee.go:46-57`:

```go
func (e *Employee) FullName() string {
    return e.FirstName + " " + e.LastName
}

func (e *Employee) IsEmployed() bool {
    if e.ExitDate == nil {
        return true
    }
    return e.ExitDate.After(time.Now())
}
```

**Pattern:** Pointer receiver, simple business logic methods.

### Related Models

#### Employee Model Structure

Location: `apps/api/internal/model/employee.go:11-40`

Key fields relevant to Booking:
- `ID uuid.UUID` - referenced by Booking.EmployeeID
- `TenantID uuid.UUID` - same tenant scoping pattern

#### BookingType Model Structure

Location: `apps/api/internal/model/bookingtype.go:16-27`

```go
type BookingType struct {
    ID          uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    *uuid.UUID       `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
    Code        string           `gorm:"type:varchar(20);not null" json:"code"`
    Name        string           `gorm:"type:varchar(255);not null" json:"name"`
    Description *string          `gorm:"type:text" json:"description,omitempty"`
    Direction   BookingDirection `gorm:"type:varchar(10);not null" json:"direction"`
    IsSystem    bool             `gorm:"default:false" json:"is_system"`
    IsActive    bool             `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time        `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time        `gorm:"default:now()" json:"updated_at"`
}
```

Note: `TenantID` is `*uuid.UUID` because BookingType allows NULL for system-wide types.

### Import Requirements

Based on existing models:

```go
package model

import (
    "fmt"
    "time"

    "github.com/google/uuid"
)
```

The `fmt` package is needed for the `TimeString()` helper method.

### Field Mapping: Migration to Model

| Migration Column | Go Type | GORM Tag | JSON Tag |
|-----------------|---------|----------|----------|
| id | uuid.UUID | type:uuid;primaryKey;default:gen_random_uuid() | id |
| tenant_id | uuid.UUID | type:uuid;not null;index | tenant_id |
| employee_id | uuid.UUID | type:uuid;not null;index | employee_id |
| booking_date | time.Time | type:date;not null | booking_date |
| booking_type_id | uuid.UUID | type:uuid;not null | booking_type_id |
| original_time | int | type:int;not null | original_time |
| edited_time | int | type:int;not null | edited_time |
| calculated_time | *int | type:int | calculated_time,omitempty |
| pair_id | *uuid.UUID | type:uuid;index | pair_id,omitempty |
| source | BookingSource | type:varchar(20);default:'web' | source |
| terminal_id | *uuid.UUID | type:uuid | terminal_id,omitempty |
| notes | string | type:text | notes,omitempty |
| created_at | time.Time | default:now() | created_at |
| updated_at | time.Time | default:now() | updated_at |
| created_by | *uuid.UUID | type:uuid | created_by,omitempty |
| updated_by | *uuid.UUID | type:uuid | updated_by,omitempty |

## Code References

- `db/migrations/000022_create_bookings.up.sql` - Database schema
- `apps/api/internal/model/employee.go:11-57` - Employee model patterns
- `apps/api/internal/model/bookingtype.go:9-41` - BookingType enum and model patterns
- `apps/api/internal/model/base.go:10-14` - BaseModel (not used, for reference)

## Architecture Documentation

### Model Layer Patterns

1. **No BaseModel embedding** - Each model defines its own ID, CreatedAt, UpdatedAt fields inline
2. **GORM tags** - Combined with semicolons: `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
3. **JSON tags** - snake_case, `omitempty` for nullable/optional fields, `-` to hide fields
4. **TableName method** - Value receiver returning lowercase plural snake_case
5. **Helper methods** - Pointer receiver for business logic

### Type Conventions

- Required UUIDs: `uuid.UUID`
- Optional UUIDs: `*uuid.UUID`
- Required ints: `int`
- Optional ints: `*int`
- Date fields: `time.Time` with `gorm:"type:date"`
- Enums: Custom string type with constants

## Related Research

- `thoughts/shared/plans/tickets/TICKET-052-create-bookings-migration-DONE.md` - Migration ticket
- `thoughts/shared/plans/tickets/TICKET-050-create-booking-types-migration-DONE.md` - BookingType migration
- `thoughts/shared/plans/tickets/TICKET-051-create-booking-type-model-repository-DONE.md` - BookingType model

## Open Questions

None - the ticket provides complete implementation details and the codebase patterns are clear.
