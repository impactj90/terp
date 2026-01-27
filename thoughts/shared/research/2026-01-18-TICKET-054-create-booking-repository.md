---
date: 2026-01-18T12:41:49+01:00
researcher: tolga
git_commit: aac3ce37c0f03a5a1de7538176529c43be3c2558
branch: master
repository: terp
topic: "Create Booking Repository - TICKET-054"
tags: [research, codebase, repository, booking, gorm]
status: complete
last_updated: 2026-01-18
last_updated_by: tolga
---

# Research: Create Booking Repository - TICKET-054

**Date**: 2026-01-18T12:41:49+01:00
**Researcher**: tolga
**Git Commit**: aac3ce37c0f03a5a1de7538176529c43be3c2558
**Branch**: master
**Repository**: terp

## Research Question

Document the existing patterns and dependencies needed to implement TICKET-054: Create Booking Repository with date-based queries.

## Summary

The ticket specifies creating a Booking repository at `apps/api/internal/repository/booking.go` with CRUD operations, date-based queries, pairing functionality, and bulk updates. The codebase contains 14 existing repositories that follow consistent patterns using GORM. The Booking model is already defined with all necessary fields including time values stored as minutes from midnight, pairing support via `PairID`, and relationships to Employee and BookingType.

## Detailed Findings

### 1. Existing Repository Structure

**Location**: `apps/api/internal/repository/`

**Files**:
- 14 implementation files (account.go, bookingtype.go, costcenter.go, dayplan.go, department.go, employee.go, employmenttype.go, holiday.go, tariff.go, team.go, tenant.go, user.go, usergroup.go, weekplan.go)
- 14 corresponding test files
- 1 database wrapper (db.go)

**Common Patterns**:
1. **No Interfaces**: All repositories are concrete struct implementations (no interface definitions)
2. **DB Wrapper**: All repositories use `*DB` struct from `db.go`:
   ```go
   type DB struct {
       GORM *gorm.DB
       Pool *pgxpool.Pool
   }
   ```
3. **Constructor Pattern**: `New*Repository(db *DB) **Repository`
4. **Standard Methods**: Create, GetByID, Update, Delete, List

### 2. Repository Implementation Pattern (from employee.go)

**Error Variables** (lines 15-19):
```go
var (
    ErrEmployeeNotFound = errors.New("employee not found")
    ErrCardNotFound     = errors.New("card not found")
    ErrContactNotFound  = errors.New("contact not found")
)
```

**Filter Struct Pattern**:
```go
type EmployeeFilter struct {
    TenantID     uuid.UUID
    DepartmentID *uuid.UUID
    IsActive     *bool
    SearchQuery  string
    Offset       int
    Limit        int
}
```

**GORM Patterns Used**:
- `WithContext(ctx)` - context propagation on all methods
- `First(&model, "id = ?", id)` - single record lookup
- `Where("field = ?", value).First(&model)` - filtered lookup
- `Preload("Relation")` - eager loading
- `Preload("Cards", "is_active = ?", true)` - conditional preload
- `Joins("JOIN table ON...")` - SQL joins
- `Model(&Type{}).Where(...).Count(&total)` - counting before pagination
- `Limit(n).Offset(m)` - pagination
- `Order("field ASC")` - ordering
- `Save(model)` - update
- `Delete(&Model{}, "id = ?", id)` - delete
- `result.RowsAffected` - checking affected rows

**Error Handling Pattern**:
```go
if errors.Is(err, gorm.ErrRecordNotFound) {
    return nil, ErrEmployeeNotFound
}
return nil, fmt.Errorf("failed to get employee: %w", err)
```

### 3. Booking Model (apps/api/internal/model/booking.go)

**Enums**:
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

Note: `BookingCategory` is defined in `model/bookingtype.go` (values: "come", "go", "break_start", "break_end", "absence", "bonus").

**Booking Struct Fields**:
| Field | Type | Description |
|-------|------|-------------|
| ID | uuid.UUID | Primary key, auto-generated |
| TenantID | uuid.UUID | Multi-tenancy, indexed |
| EmployeeID | uuid.UUID | FK to Employee, indexed |
| BookingDate | time.Time | Date only (type:date) |
| BookingTypeID | uuid.UUID | FK to BookingType |
| OriginalTime | int | Initial time (minutes from midnight) |
| EditedTime | int | Current time after edits |
| CalculatedTime | *int | System-calculated override |
| PairID | *uuid.UUID | Links paired bookings, indexed |
| Source | BookingSource | Origin of booking |
| TerminalID | *uuid.UUID | Terminal that created booking |
| Notes | string | Free-text notes |
| CreatedAt/UpdatedAt | time.Time | Audit timestamps |
| CreatedBy/UpdatedBy | *uuid.UUID | Audit user IDs |

**Relationships**:
- `Employee *Employee` - FK: EmployeeID
- `BookingType *BookingType` - FK: BookingTypeID
- `Pair *Booking` - Self-referential via PairID

**Helper Methods**:
- `TimeString()` - converts EditedTime to "HH:MM"
- `EffectiveTime()` - returns CalculatedTime or EditedTime
- `IsEdited()` - checks if EditedTime != OriginalTime

### 4. testutil Package (apps/api/internal/testutil/)

**SetupTestDB Function** (`db.go:44-66`):
```go
func SetupTestDB(t *testing.T) *repository.DB
```

**Behavior**:
1. Gets shared singleton database connection
2. Starts a new transaction for test isolation
3. Wraps transaction in `repository.DB` struct
4. Registers cleanup to rollback transaction when test completes

**Configuration**:
- Environment variable: `TEST_DATABASE_URL`
- Default: `postgres://dev:dev@localhost:5432/terp?sslmode=disable`

**Usage in Tests**:
```go
func TestSomething(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewBookingRepository(db)
    // ... test code
    // Transaction auto-rolled back on test completion
}
```

### 5. BookingType Model Reference

**BookingCategory Enum** (from model/bookingtype.go):
```go
type BookingCategory string
const (
    BookingCategoryCome       BookingCategory = "come"
    BookingCategoryGo         BookingCategory = "go"
    BookingCategoryBreakStart BookingCategory = "break_start"
    BookingCategoryBreakEnd   BookingCategory = "break_end"
    BookingCategoryAbsence    BookingCategory = "absence"
    BookingCategoryBonus      BookingCategory = "bonus"
)
```

This is used in:
- `GetUnpaired()` - filters by category
- `List()` - filters by category via JOIN

## Code References

- `apps/api/internal/repository/db.go` - DB wrapper struct
- `apps/api/internal/repository/employee.go` - Reference implementation with filter pattern
- `apps/api/internal/model/booking.go` - Booking model definition
- `apps/api/internal/model/bookingtype.go` - BookingCategory enum
- `apps/api/internal/testutil/db.go` - Test database setup

## Architecture Documentation

### Repository Pattern in This Codebase

1. **Concrete Structs Only**: No interface definitions; repositories are concrete implementations
2. **Single DB Wrapper**: All repositories receive `*DB` containing GORM and pgxpool
3. **Context-First**: All methods take `context.Context` as first parameter
4. **Tenant Scoping**: Filter structs include TenantID for multi-tenancy
5. **Error Wrapping**: Domain-specific errors (e.g., `ErrNotFound`) returned instead of raw GORM errors
6. **Transaction Support**: GORM transactions used for bulk operations

### Key Differences from Ticket Spec

The ticket spec defines an interface-based design:
```go
type BookingRepository interface { ... }
type bookingRepository struct { db *gorm.DB }
```

However, existing repositories in the codebase use:
```go
type BookingRepository struct { db *DB }  // No interface, concrete struct
```

The implementation should follow the existing pattern in the codebase rather than the interface pattern shown in the ticket.

Additionally, the ticket spec uses `*gorm.DB` directly, but existing repositories use `*DB` wrapper.

## Related Research

- `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md` - Migration research
- `thoughts/shared/research/2026-01-18-TICKET-053-create-booking-model.md` - Model research

## Open Questions

1. **Interface vs Concrete**: Should the implementation follow the ticket's interface-based design or the codebase's concrete struct pattern?
2. **Transaction Handling**: The ticket's `UpdateCalculatedTimes` uses explicit transaction. This is consistent with existing patterns (e.g., `dayplan.go` uses transactions for multi-table updates).
