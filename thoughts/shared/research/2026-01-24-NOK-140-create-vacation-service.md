# Research: NOK-140 - Create Vacation Service

> **Date**: 2026-01-24
> **Ticket**: NOK-140 (TICKET-083)
> **Status**: Research complete

---

## 1. VacationBalance Model (TICKET-081 / NOK-138) - IMPLEMENTED

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID          uuid.UUID       // PK
    TenantID    uuid.UUID
    EmployeeID  uuid.UUID
    Year        int

    Entitlement decimal.Decimal // decimal(5,2), default 0
    Carryover   decimal.Decimal // decimal(5,2), default 0
    Adjustments decimal.Decimal // decimal(5,2), default 0
    Taken       decimal.Decimal // decimal(5,2), default 0

    CreatedAt   time.Time
    UpdatedAt   time.Time
    Employee    *Employee       // relation
}
```

**Helper methods**:
- `Total() decimal.Decimal` - returns `Entitlement + Carryover + Adjustments`
- `Available() decimal.Decimal` - returns `Total() - Taken`

---

## 2. VacationBalance Repository (TICKET-081 / NOK-138) - IMPLEMENTED

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go`

### Available Methods

| Method | Signature | Notes |
|--------|-----------|-------|
| `Create` | `(ctx, *model.VacationBalance) error` | Standard create |
| `GetByID` | `(ctx, uuid.UUID) (*model.VacationBalance, error)` | Returns `ErrVacationBalanceNotFound` |
| `GetByEmployeeYear` | `(ctx, employeeID uuid.UUID, year int) (*model.VacationBalance, error)` | Returns `nil, nil` if not found |
| `Update` | `(ctx, *model.VacationBalance) error` | Full save |
| `Upsert` | `(ctx, *model.VacationBalance) error` | Upserts on `(employee_id, year)` unique constraint |
| `UpdateTaken` | `(ctx, employeeID uuid.UUID, year int, taken decimal.Decimal) error` | Direct column update |
| `IncrementTaken` | `(ctx, employeeID uuid.UUID, year int, amount decimal.Decimal) error` | Atomic `taken + amount` |
| `ListByEmployee` | `(ctx, employeeID uuid.UUID) ([]model.VacationBalance, error)` | Ordered by year ASC |

**Key behaviors**:
- `GetByEmployeeYear` returns `nil, nil` when not found (not an error) - useful for "create if not exists" pattern
- `Upsert` uses PostgreSQL `ON CONFLICT` on `(employee_id, year)` columns
- `IncrementTaken` uses `gorm.Expr("taken + ?", amount)` for atomic increment
- Error sentinel: `ErrVacationBalanceNotFound`

---

## 3. Vacation Calculation Logic (TICKET-082 / NOK-139) - IMPLEMENTED

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/vacation.go`

### Types

```go
type VacationBasis string
const (
    VacationBasisCalendarYear VacationBasis = "calendar_year"
    VacationBasisEntryDate    VacationBasis = "entry_date"
)

type SpecialCalcType string
const (
    SpecialCalcAge        SpecialCalcType = "age"
    SpecialCalcTenure     SpecialCalcType = "tenure"
    SpecialCalcDisability SpecialCalcType = "disability"
)

type VacationSpecialCalc struct {
    Type      SpecialCalcType
    Threshold int
    BonusDays decimal.Decimal
}

type VacationCalcInput struct {
    BirthDate           time.Time
    EntryDate           time.Time
    ExitDate            *time.Time
    WeeklyHours         decimal.Decimal
    HasDisability       bool
    BaseVacationDays    decimal.Decimal    // from tariff Jahresurlaub
    StandardWeeklyHours decimal.Decimal    // full-time hours (e.g., 40)
    Basis               VacationBasis
    SpecialCalcs        []VacationSpecialCalc
    Year                int
    ReferenceDate       time.Time
}

type VacationCalcOutput struct {
    BaseEntitlement     decimal.Decimal
    ProRatedEntitlement decimal.Decimal
    PartTimeAdjustment  decimal.Decimal
    AgeBonus            decimal.Decimal
    TenureBonus         decimal.Decimal
    DisabilityBonus     decimal.Decimal
    TotalEntitlement    decimal.Decimal
    MonthsEmployed      int
    AgeAtReference      int
    TenureYears         int
}
```

### Functions

| Function | Purpose |
|----------|---------|
| `CalculateVacation(input VacationCalcInput) VacationCalcOutput` | Full entitlement calculation with pro-rating, part-time, and bonuses |
| `CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal` | Caps carryover at maximum; 0/negative max = unlimited |
| `CalculateVacationDeduction(deductionValue, durationDays decimal.Decimal) decimal.Decimal` | Computes vacation deduction for an absence |

### Calculation Steps (CalculateVacation)
1. Calculate age and tenure at reference date
2. Calculate months employed in year (based on VacationBasis)
3. Pro-rate base vacation by months (months/12)
4. Apply part-time adjustment (weeklyHours/standardWeeklyHours)
5. Add special calc bonuses (age, tenure, disability)
6. Round to nearest 0.5 day

---

## 4. AbsenceDay Repository (TICKET-077 / NOK-135) - IMPLEMENTED

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`

### Key Method for Vacation Service

```go
func (r *AbsenceDayRepository) CountByTypeInRange(
    ctx context.Context,
    employeeID, typeID uuid.UUID,
    from, to time.Time,
) (decimal.Decimal, error)
```

- Sums `duration` of absence days where `status = 'approved'` for a specific employee and absence type
- Returns `decimal.Decimal` (e.g., 1.5 for full + half day)
- Uses `COALESCE(SUM(duration), 0)` - returns zero if no records

### Note on Vacation Taken Calculation
The `CountByTypeInRange` method takes a single `typeID`. To sum all vacation-related absences, the service will need to:
1. Get all vacation-category absence types using `AbsenceTypeRepository.ListByCategory(ctx, tenantID, AbsenceCategoryVacation)` or filter by `DeductsVacation: true`
2. Loop through each type and call `CountByTypeInRange` for the year date range
3. Sum the results

---

## 5. AbsenceType Repository - IMPLEMENTED

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go`

### Key Method for Vacation Service

```go
func (r *AbsenceTypeRepository) ListByCategory(
    ctx context.Context,
    tenantID uuid.UUID,
    category model.AbsenceCategory,
) ([]model.AbsenceType, error)
```

- Returns active types matching category for tenant (includes system types with `tenant_id IS NULL`)
- Available categories: `AbsenceCategoryVacation`, `AbsenceCategoryIllness`, `AbsenceCategorySpecial`, `AbsenceCategoryUnpaid`

### AbsenceType Model Fields Relevant to Vacation

```go
type AbsenceType struct {
    Category        AbsenceCategory  // "vacation", "illness", "special", "unpaid"
    DeductsVacation bool             // true if this absence type deducts from vacation balance
}
```

- `DeductsVacation` flag: alternative to category for identifying types that reduce vacation balance
- `IsVacationType() bool` helper: checks `Category == AbsenceCategoryVacation`

---

## 6. Employee Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

### Fields Relevant to Vacation Calculation

| Field | Type | Notes |
|-------|------|-------|
| `EntryDate` | `time.Time` | Used for pro-rating and tenure |
| `ExitDate` | `*time.Time` | Used for pro-rating (mid-year exit) |
| `WeeklyHours` | `decimal.Decimal` | Used for part-time adjustment |
| `VacationDaysPerYear` | `decimal.Decimal` | Base vacation entitlement (default 30.00) |
| `TenantID` | `uuid.UUID` | For absence type lookups |

### Fields NOT Yet Present (likely pending ZMI migrations)
- `BirthDate` - needed for `VacationCalcInput.BirthDate` and age bonus
- `HasDisability` - needed for `VacationCalcInput.HasDisability` and disability bonus
- `StandardWeeklyHours` - typically from tariff, not employee

These may come from TICKET-123 (add-employee-zmi-fields-migration) or TICKET-129 (update-employee-model-zmi-fields), which are untracked/unmerged.

---

## 7. Tariff Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

### Current State
The Tariff model currently only has:
- `ID`, `TenantID`, `Code`, `Name`, `Description`
- `WeekPlanID`, `ValidFrom`, `ValidTo`, `IsActive`
- `Breaks []TariffBreak` relation

### Fields NOT Yet Present (needed for VacationCalcInput)
- `StandardWeeklyHours` - full-time reference hours
- `VacationBasis` - calendar_year or entry_date
- `SpecialCalcs` - bonus rules (age/tenure/disability)

These may come from TICKET-125 (add-tariff-zmi-fields-migration) or TICKET-131 (update-tariff-model-zmi-fields).

---

## 8. Service Architecture Pattern

Based on AbsenceService and BookingService, the established pattern is:

### 1. Private Interfaces for Dependencies
```go
type vacationBalanceRepoForService interface {
    GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
    // ... only methods needed
}
```

### 2. Struct with Interface Fields
```go
type VacationService struct {
    vacationBalanceRepo vacationBalanceRepoForService
    absenceDayRepo      absenceDayRepoForVacation
    // ...
}
```

### 3. Constructor
```go
func NewVacationService(deps...) *VacationService {
    return &VacationService{...}
}
```

### 4. Package-level Error Sentinels
```go
var (
    ErrVacationBalanceNotFound = errors.New("vacation balance not found")
    ErrInvalidYear             = errors.New("invalid year")
)
```

### 5. Input/Output Types
Services define their own input/result types (e.g., `CreateBookingInput`, `CreateAbsenceRangeResult`).

---

## 9. Service Test Pattern

Based on `absence_test.go` and `booking_test.go`:

### Mock Structs
```go
type mockVacationBalanceRepoForService struct {
    mock.Mock
}
func (m *mockVacationBalanceRepoForService) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    args := m.Called(ctx, employeeID, year)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.VacationBalance), args.Error(1)
}
```

### Test Helper
```go
func newTestVacationService() (*VacationService, *mockRepo1, *mockRepo2, ...) {
    repo1 := new(mockRepo1)
    repo2 := new(mockRepo2)
    svc := NewVacationService(repo1, repo2, ...)
    return svc, repo1, repo2, ...
}
```

### Test Style
- Uses `testify/assert`, `testify/mock`, `testify/require`
- Named tests: `TestServiceName_MethodName_Scenario`
- Setup mocks with `.On("Method", args...).Return(results...)`
- Assert with `require.NoError` for critical checks, `assert.Equal`/`assert.ErrorIs` for assertions
- End with `mockRepo.AssertExpectations(t)`

---

## 10. Reference Manual: Vacation Rules

**File**: `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculataion-manual-reference.md`

### Section 14.1 - Vacation Values (Tariff)
- `Jahresurlaub` (Annual vacation): yearly vacation entitlement (e.g., 30 days)
- At year change, ZMI takes this value and adds it for the new year
- Must always contain the full year's entitlement

### Section 19 - Vacation Calculation
- Basis: calendar year or entry date
- Special calculations: age, tenure, disability (bonus days)
- Pro-rating for partial years

### Section 20 - Capping Rules (Kappungsregeln)
- Year-end capping: remaining vacation is forfeited
- Mid-year capping: e.g., previous year's vacation capped at March 31
- Individual exceptions: employees can be exempt from capping
- Max carryover: limits how much vacation carries to next year

### Section 8.2 - Vacation Valuation (Urlaubsbewertung)
- Day plan field: deduction value per vacation day (typically 1)
- Can be hours if vacation is tracked in hours

### OpenAPI/Generated Models
The generated models reference `max_carryover_vacation` as a field on `MonthlyEvaluation` / `CreateMonthlyEvaluationRequest`, suggesting the max carryover value will come from monthly evaluation configuration.

---

## 11. Dependencies for VacationService

### Available Now (implemented)
1. **VacationBalanceRepository** - full CRUD + upsert + taken management
2. **Vacation Calculation** (`calculation.CalculateVacation`, `CalculateCarryover`)
3. **AbsenceDayRepository** (`CountByTypeInRange` for summing vacation days)
4. **AbsenceTypeRepository** (`ListByCategory` to find vacation types)
5. **EmployeeRepository** (`GetByID` to get employee data)

### Not Yet Available (pending migrations)
- Employee `BirthDate`, `HasDisability` fields (needed for full `VacationCalcInput`)
- Tariff `StandardWeeklyHours`, `VacationBasis`, `SpecialCalcs` (needed for full entitlement calc)
- Max carryover configuration (may come from tariff or monthly evaluation)

### Practical Implication for Implementation
The service can be implemented with the available fields from the Employee model:
- `EntryDate` / `ExitDate` for pro-rating
- `WeeklyHours` for part-time adjustment
- `VacationDaysPerYear` as `BaseVacationDays`

For fields not yet available (BirthDate, HasDisability, StandardWeeklyHours, Basis, SpecialCalcs), the service should either:
- Use sensible defaults (e.g., `VacationBasisCalendarYear`, no special calcs, standard 40h week)
- Accept them as optional parameters that can be populated later when tariff/employee ZMI fields are added

---

## 12. Planned vs. Taken Distinction

The ticket's response type includes a `Planned` field for "future approved vacation." This requires distinguishing between:
- **Taken**: approved vacation days in the past (before today) - or all approved in the year
- **Planned**: approved vacation days in the future (after today)

The `AbsenceDayRepository.CountByTypeInRange` can support this by using different date ranges:
- Taken: `from = Jan 1, to = today` (or entire year, depending on interpretation)
- Planned: `from = tomorrow, to = Dec 31`

Alternatively, `Taken` in the `vacation_balances` table stores the total taken (past + future approved), while `Planned` is a derived value for display only. The reference manual treats all approved vacation equally regardless of date.

---

## 13. Summary of Required Repository Interfaces

For the VacationService implementation, the following interface methods are needed:

```go
// Vacation balance storage
type vacationBalanceRepoForVacation interface {
    GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
    Upsert(ctx context.Context, balance *model.VacationBalance) error
    UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
}

// Absence day counting
type absenceDayRepoForVacation interface {
    CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)
}

// Absence type lookups
type absenceTypeRepoForVacation interface {
    ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error)
}

// Employee data
type employeeRepoForVacation interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}
```
