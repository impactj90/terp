# Research: NOK-135 - Absence Day Model + Repository

**Date**: 2026-01-24
**Ticket**: NOK-135 (TICKET-077)
**Status**: Research Complete

## Summary of Findings

This ticket creates the AbsenceDay model and AbsenceDayRepository, building on the absence_days migration (TICKET-076, migration 000026). The model tracks employee absence records per date with approval workflow, duration (full/half day), and links to AbsenceType for credit calculation.

---

## 1. Migration Schema (000026_create_absence_days.up.sql)

**File**: `/home/tolga/projects/terp/db/migrations/000026_create_absence_days.up.sql`

```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),
    duration DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    half_day_period VARCHAR(10),  -- 'morning' or 'afternoon'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key constraints**:
- Unique index on (employee_id, absence_date) WHERE status != 'cancelled' -- only one active absence per employee per date
- Indexes: tenant, employee, date, type, status, lookup (employee+date), range (employee+date+status)

---

## 2. Existing Model Patterns

### Pattern observed in all models:
- Direct UUID primary key with `gen_random_uuid()` default
- `TenantID uuid.UUID` with `not null;index` tag
- `CreatedAt` / `UpdatedAt` timestamps with `default:now()`
- `TableName()` method returning table name string
- JSON tags on all fields
- Relations declared as pointer types with `gorm:"foreignKey:..."` and `json:"...,omitempty"`
- Helper methods for business logic (e.g., `IsFullDay()`, `IsApproved()`, `CalculateCredit()`)

### Enum patterns (from Booking, AbsenceType, EmployeeDayPlan):
- Type alias: `type AbsenceStatus string`
- Constants: `const ( ... AbsenceStatus = "value" )`
- String-based enums matching DB varchar values

### Decimal fields (from Employee, DailyValue):
- Uses `github.com/shopspring/decimal`
- GORM tag: `gorm:"type:decimal(3,2);default:1.00"`

**Reference files**:
- `/home/tolga/projects/terp/apps/api/internal/model/booking.go` - enum pattern, UUID fields, relations
- `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go` - related model with CreditMultiplier
- `/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go` - date-based model with helper methods
- `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go` - simple date-based model

---

## 3. Existing Repository Patterns

### Structure:
- Concrete struct: `type AbsenceDayRepository struct { db *DB }`
- Constructor: `func NewAbsenceDayRepository(db *DB) *AbsenceDayRepository`
- Package-level error: `var ErrAbsenceDayNotFound = errors.New("absence day not found")`
- All methods take `ctx context.Context` as first param
- Uses `r.db.GORM.WithContext(ctx)` for all queries

### Error handling:
- `GetByID`: returns sentinel error on `gorm.ErrRecordNotFound`
- `GetByEmployeeDate`: returns `nil, nil` when not found (DailyValue pattern)
- `Delete`: checks `RowsAffected == 0` for not found
- Other errors wrapped with `fmt.Errorf("failed to ...: %w", err)`

### Range query patterns (from DailyValueRepository):
- `GetByEmployeeDateRange`: `WHERE employee_id = ? AND date >= ? AND date <= ?`, `ORDER BY date ASC`
- `DeleteRange`: same WHERE clause, no RowsAffected check (deleting 0 is ok)
- `SumForMonth`: `SELECT COALESCE(SUM(...), 0)` with `.Scan(&result)`

### Bulk operations (from DailyValueRepository):
- `BulkUpsert`: uses `CreateInBatches(values, 100)` with OnConflict clause
- Empty slice check at start: `if len(values) == 0 { return nil }`

**Reference files**:
- `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go` - CRUD pattern
- `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue.go` - range queries, bulk ops, DeleteRange
- `/home/tolga/projects/terp/apps/api/internal/repository/booking.go` - date-based queries, filter struct
- `/home/tolga/projects/terp/apps/api/internal/repository/db.go` - DB struct with GORM + Pool

---

## 4. Testing Patterns

### Setup:
- `db := testutil.SetupTestDB(t)` - uses shared DB with transaction rollback per test
- Test helper functions create real dependencies: `createTestTenantForXxx`, `createTestEmployeeForXxx`
- Package: `package repository_test` (external test package)

### Imports:
- `github.com/stretchr/testify/assert` and `require`
- `github.com/google/uuid`
- `github.com/shopspring/decimal` (when testing decimal fields)

### Test naming:
- `TestXxxRepository_MethodName`
- `TestXxxRepository_MethodName_EdgeCase`

### Test structure:
- Create test data using helper functions (real tenant, employee, etc.)
- Create entities with unique identifiers (uuid prefix for codes)
- Verify with assertions (assert.Equal, assert.NotEqual, require.NoError)
- Test not-found cases with sentinel errors
- Test empty/edge cases

### Important: Tests need REAL foreign key references
- The migration has FK constraints on tenant_id, employee_id, absence_type_id
- Tests must create actual Tenant, Employee, and AbsenceType records first
- The existing ticket plan (TICKET-077) uses random UUIDs without FK setup -- this will FAIL with the actual migration

**Reference files**:
- `/home/tolga/projects/terp/apps/api/internal/repository/absencetype_test.go` - absence-related test pattern
- `/home/tolga/projects/terp/apps/api/internal/repository/dailyvalue_test.go` - range query tests, bulk tests
- `/home/tolga/projects/terp/apps/api/internal/testutil/db.go` - test DB setup

---

## 5. AbsenceType Model (Related)

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Key relationship: AbsenceDay.AbsenceTypeID -> AbsenceType.ID

AbsenceType provides:
- `Portion` (0=none, 1=full, 2=half) - determines time credit
- `CreditMultiplier()` - returns 0.0, 1.0, or 0.5
- `CalculateCredit(regelarbeitszeit int) int` - computes minutes credited
- `DeductsVacation` flag - whether this absence deducts from vacation account
- `Category` (vacation, illness, special, unpaid)

---

## 6. ZMI Business Rules for Absence Days

### Credit Calculation (Page 160):
```
effectiveCredit = regelarbeitszeit * absenceType.CreditMultiplier() * absenceDay.Duration

Example:
- Regelarbeitszeit: 480 minutes (8 hours)
- Absence type: Full (portion = 1, multiplier = 1.0)
- Duration: 0.5 (half day)
- Credit: 480 * 1.0 * 0.5 = 240 minutes
```

### CalculateCredit method for AbsenceDay:
The AbsenceDay model should have a `CalculateCredit` method that:
1. Takes `regelarbeitszeit int` (target minutes from day plan)
2. Uses the linked AbsenceType's CreditMultiplier
3. Multiplies by the Duration field
4. Returns credited minutes as int

### Holiday + Absence Priority (Page 160):
When a holiday and absence overlap, the Priority field on AbsenceType determines which calculation wins. This is handled elsewhere but affects which absence is "effective".

### Vacation Tracking:
`CountByTypeInRange` is critical for vacation calculation - it sums `duration` for approved absences of a specific type within a date range. Only `status = 'approved'` should be counted.

---

## 7. Key Decisions and Considerations

### Model Fields (differences from existing ticket plan):

The ticket plan (TICKET-077) is MISSING these migration fields:
1. `half_day_period VARCHAR(10)` - "morning" or "afternoon" for half days
2. `rejection_reason TEXT` - reason when status = rejected
3. `created_by UUID` - audit field for who created the record

The model must include these fields to match the migration schema.

### Status enum:
The migration supports 4 statuses (from unique constraint `WHERE status != 'cancelled'`):
- `pending` (default)
- `approved`
- `rejected`
- `cancelled`

The existing ticket plan only shows 3 (missing `cancelled`). Must add `AbsenceStatusCancelled`.

### HalfDayPeriod enum:
Should create a `HalfDayPeriod` type with constants:
- `HalfDayPeriodMorning = "morning"`
- `HalfDayPeriodAfternoon = "afternoon"`

### Repository pattern:
The ticket plan uses an interface pattern (`AbsenceRepository interface`), but the actual codebase uses concrete structs (e.g., `AbsenceTypeRepository struct`). Follow the concrete struct pattern.

### CalculateCredit method:
The model should have a `CalculateCredit(regelarbeitszeit int) int` method that:
- Requires the `AbsenceType` relation to be loaded (via Preload)
- Returns `int(float64(regelarbeitszeit) * absenceType.CreditMultiplier() * duration.InexactFloat64())`
- Returns 0 if AbsenceType is nil (guard against unloaded relation)

### GetByEmployeeDate behavior:
Following DailyValueRepository pattern: returns `nil, nil` when not found (not an error). This is because checking "is there an absence today?" is a normal query, not an exceptional case.

### CountByTypeInRange:
- Only counts `status = 'approved'`
- Returns `decimal.Decimal` (sum of durations, e.g., 1.5 for a full day + half day)
- Uses `COALESCE(SUM(duration), 0)` to handle empty results

### Status filter in range queries:
The `GetByEmployeeDateRange` should optionally filter by status. Consider:
- Default: include all statuses (for UI display)
- For calculation: filter to approved only (a separate method or parameter)

### Preloading:
- `GetByID`: Preload AbsenceType (for credit calculation)
- `GetByEmployeeDate`: Preload AbsenceType
- `GetByEmployeeDateRange`: Preload AbsenceType
- `CreateRange`: No preload needed

---

## 8. Files to Create

1. **`/home/tolga/projects/terp/apps/api/internal/model/absenceday.go`**
   - `AbsenceStatus` enum (Pending, Approved, Rejected, Cancelled)
   - `HalfDayPeriod` enum (Morning, Afternoon)
   - `AbsenceDay` struct with all migration fields
   - `TableName()` method
   - `IsFullDay()` bool helper
   - `IsHalfDay()` bool helper
   - `IsApproved()` bool helper
   - `IsCancelled()` bool helper
   - `CalculateCredit(regelarbeitszeit int) int` method

2. **`/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`**
   - `ErrAbsenceDayNotFound` sentinel error
   - `AbsenceDayRepository` struct
   - `NewAbsenceDayRepository(db *DB)` constructor
   - `Create(ctx, *model.AbsenceDay) error`
   - `CreateRange(ctx, []model.AbsenceDay) error`
   - `GetByID(ctx, uuid.UUID) (*model.AbsenceDay, error)`
   - `GetByEmployeeDate(ctx, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)` - returns nil,nil if not found
   - `GetByEmployeeDateRange(ctx, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)`
   - `Update(ctx, *model.AbsenceDay) error`
   - `Delete(ctx, uuid.UUID) error`
   - `DeleteRange(ctx, employeeID uuid.UUID, from, to time.Time) error`
   - `CountByTypeInRange(ctx, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)`

3. **`/home/tolga/projects/terp/apps/api/internal/repository/absenceday_test.go`**
   - Test helpers: `createTestTenantForAbsenceDay`, `createTestEmployeeForAbsenceDay`, `createTestAbsenceTypeForAbsenceDay`
   - Integration tests for all repository methods
   - Model unit tests (IsFullDay, IsApproved, CalculateCredit)
   - Edge cases: not found, empty ranges, FK constraints respected

---

## 9. Implementation Notes

### Duration field type:
- Use `decimal.Decimal` from `github.com/shopspring/decimal`
- GORM tag: `gorm:"type:decimal(3,2);not null;default:1.00"`
- Supports values: 1.00 (full day), 0.50 (half day)

### Test considerations:
- Tests MUST create real Tenant, Employee, AbsenceType records first (FK constraints)
- Use unique identifiers (uuid prefix) to avoid test data collision
- Test the unique constraint: only one non-cancelled absence per employee per date
- Test that cancelled absences can coexist with active ones on same date

### Package imports needed:
```go
// Model
"github.com/google/uuid"
"github.com/shopspring/decimal"
"time"

// Repository
"context"
"errors"
"fmt"
"time"
"github.com/google/uuid"
"github.com/shopspring/decimal"
"gorm.io/gorm"
"github.com/tolga/terp/internal/model"

// Tests
"context"
"testing"
"time"
"github.com/google/uuid"
"github.com/shopspring/decimal"
"github.com/stretchr/testify/assert"
"github.com/stretchr/testify/require"
"github.com/tolga/terp/internal/model"
"github.com/tolga/terp/internal/repository"
"github.com/tolga/terp/internal/testutil"
```
