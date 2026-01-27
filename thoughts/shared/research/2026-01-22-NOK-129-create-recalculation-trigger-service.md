---
date: 2026-01-22T16:31:00+01:00
researcher: Claude
git_commit: d65caae00d2dcf95e794db6561be5e49c25ef21d
branch: master
repository: terp
topic: "TICKET-071: Create Recalculation Trigger Service"
tags: [research, codebase, recalculation, service, daily-calc, batch-processing, zmi]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
last_updated_note: "Added ZMI manual reference insights for calculation trigger patterns"
---

# Research: TICKET-071 Create Recalculation Trigger Service (NOK-129)

**Date**: 2026-01-22T16:31:00+01:00
**Researcher**: Claude
**Git Commit**: d65caae00d2dcf95e794db6561be5e49c25ef21d
**Branch**: master
**Repository**: terp

## Research Question

Research the codebase to understand how to implement a RecalcService that triggers recalculation when bookings, absences, or configuration change. Supports single day, date range, batch, and full recalculation.

## Summary

The codebase has well-established patterns for implementing the RecalcService:

1. **DailyCalcService already exists** at `apps/api/internal/service/daily_calc.go` with `CalculateDay()` and `RecalculateRange()` methods - RecalcService should wrap these.

2. **Service patterns are consistent** - concrete service types (not interfaces), repository interfaces defined locally, input structs for create/update operations.

3. **Batch operations exist** in repositories using `CreateInBatches(100)` with upsert patterns, but no async/background job infrastructure exists.

4. **The async requirement is new** - the codebase is entirely synchronous. Need to design async option carefully.

5. **ZMI manual validates the design** - ZMI has both on-demand "Tag berechnen" and automatic nightly batch calculation, which maps directly to our sync/async RecalcService methods.

## ZMI Reference

> **Source**: `thoughts/shared/reference/zmi-calculataion-manual-reference.md` - Section 21.2

### ZMI Calculation Trigger Model

The ZMI Time system has two calculation modes that RecalcService should mirror:

#### On-Demand Calculation ("Tag berechnen")

> 📗 **ORIGINAL** (PAGE 150):
> "Nach erfolgter Eingabe von Buchungen kann der Tag über Tag berechnen sofort berechnet werden, um sich von der Richtigkeit der Eingaben zu überzeugen."

> 📘 **TRANSLATION**:
> "After entering bookings, the day can be immediately calculated via 'Calculate day' to verify the correctness of the entries."

**Maps to**: `TriggerRecalc()`, `TriggerRecalcRange()` - synchronous, immediate verification

#### Automatic Nightly Calculation

> 📗 **ORIGINAL** (PAGE 150):
> "Hinweis: Die finale Berechnung eines Tages erfolgt immer erst am darauffolgenden Tag z.B. während der automatischen Berechnung in der Nacht. Erst dann werden die Paare endgültig zusammengefügt und berechnet."

> 📘 **TRANSLATION**:
> "Note: The final calculation of a day always occurs only on the following day, e.g., during the automatic calculation at night. Only then are the pairs finally assembled and calculated."

**Maps to**: `TriggerRecalcAllAsync()` - background batch processing for final calculations

### RecalcService to ZMI Feature Mapping

| ZMI Feature | German | RecalcService Method | Mode |
|-------------|--------|---------------------|------|
| Manual day calculation | "Tag berechnen" | `TriggerRecalc(employeeID, date)` | Sync |
| Manual range calculation | - | `TriggerRecalcRange(employeeID, from, to)` | Sync |
| Batch recalculation | - | `TriggerRecalcBatch(employeeIDs, from, to)` | Sync |
| Nightly batch job | "automatische Berechnung in der Nacht" | `TriggerRecalcAll(tenantID, from, to)` | Async |

### Day Change Implications (Section 8.4)

> 📗 **ORIGINAL** (PAGE 47):
> "Am 24.03. erfolgt bei Tag berechnen (i.d.R. automatisch als Termin im ZMI Server) das Auffüllen der Zeit vom 23.03. auf 00:00 Uhr."

> 📘 **TRANSLATION**:
> "On 24.03 when calculating the day (usually automatically as a scheduled task in ZMI Server), the time from 23.03 is filled up to 00:00."

**Implication**: Cross-midnight shifts require next-day calculation to complete. This is why range/batch recalculation is important - a single day's calculation may depend on the next day being processed.

### Design Validation

The ZMI manual confirms our RecalcService design:

1. **Sync methods for verification** - Users need immediate feedback when editing bookings
2. **Async for batch operations** - Nightly jobs process many employees without blocking
3. **Range recalculation** - Essential for handling day-change scenarios and configuration changes
4. **Independent day processing** - Each day is calculated separately (no cross-day transactions)

## Detailed Findings

### 1. DailyCalcService Implementation (The Dependency)

The existing `DailyCalcService` at `apps/api/internal/service/daily_calc.go` provides the core functionality RecalcService will wrap.

**Key Methods:**

- `CalculateDay(ctx, tenantID, employeeID, date)` - Single day calculation (line 122)
- `RecalculateRange(ctx, tenantID, employeeID, from, to)` - Date range for single employee (line 454)

**RecalculateRange Implementation** (lines 454-465):
```go
func (s *DailyCalcService) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
    count := 0
    for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
        _, err := s.CalculateDay(ctx, tenantID, employeeID, date)
        if err != nil {
            return count, err
        }
        count++
    }
    return count, nil
}
```

**Key observations:**
- Iterates day-by-day calling CalculateDay
- Returns count of processed days
- Early return on first error
- No transaction wrapping (each day is independent)

### 2. Service Pattern Analysis

**Standard Service Structure** (found in tenant.go, holiday.go, daily_calc.go):

```go
// Repository interfaces defined locally (lowercase)
type someRepository interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.Something, error)
    // ...
}

// Service struct with repository dependencies
type SomeService struct {
    someRepo someRepository
    otherRepo otherRepository
}

// Constructor accepts interfaces, returns pointer to struct
func NewSomeService(someRepo someRepository, otherRepo otherRepository) *SomeService {
    return &SomeService{
        someRepo: someRepo,
        otherRepo: otherRepo,
    }
}
```

**Error Handling Pattern:**
```go
var (
    ErrSomethingNotFound = errors.New("something not found")
    ErrSomethingRequired = errors.New("something is required")
)
```

**No Service Interfaces** - Services are concrete types, not interfaces (except DailyCalcService interface exists in the ticket plan but not in implementation).

### 3. Repository Batch Patterns

**Tenant-Scoped Multi-Employee Queries** (dailyvalue.go:143-157):
```go
// GetWithErrors retrieves daily values with errors for a tenant within a date range.
func (r *DailyValueRepository) GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
```

**Bulk Upsert Pattern** (dailyvalue.go:125-141):
```go
func (r *DailyValueRepository) BulkUpsert(ctx context.Context, values []model.DailyValue) error {
    if len(values) == 0 {
        return nil
    }
    return r.db.GORM.WithContext(ctx).
        Clauses(clause.OnConflict{
            Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
            DoUpdates: clause.AssignmentColumns([]string{...}),
        }).
        CreateInBatches(values, 100).Error
}
```

**Employee Repository - List Method** (employee.go:275-283):
```go
func (s *EmployeeService) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
    return s.employeeRepo.List(ctx, filter)
}
```

### 4. Async/Background Processing

**Finding: NO async patterns exist in the codebase.**

The only goroutine usage is in `cmd/server/main.go:190-196` for HTTP server startup (graceful shutdown pattern).

All service operations are synchronous. The ticket's "Async execution option" requirement would be **new functionality**.

**Options for async implementation:**

1. **Simple goroutine** - Fire and forget, no tracking
2. **Goroutine with channel** - Track completion/errors
3. **Job queue** - More complex, requires infrastructure
4. **Return immediately with job ID** - Polling for status

Given the codebase's simplicity, recommend Option 2 or a simple callback mechanism.

## Code References

- `apps/api/internal/service/daily_calc.go:122` - CalculateDay method
- `apps/api/internal/service/daily_calc.go:454` - RecalculateRange method
- `apps/api/internal/service/daily_calc.go:98-104` - DailyCalcService struct
- `apps/api/internal/repository/dailyvalue.go:125-141` - BulkUpsert pattern
- `apps/api/internal/repository/dailyvalue.go:143-157` - GetWithErrors (tenant-wide query)
- `apps/api/internal/repository/employee.go` - Employee list/filter patterns

## Architecture Insights

### Proposed RecalcService Design

Based on the ticket requirements and codebase patterns:

```go
// File: apps/api/internal/service/recalc.go

// Repository interfaces needed
type dailyCalcServiceForRecalc interface {
    CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
    RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error)
}

type employeeRepositoryForRecalc interface {
    List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

// RecalcResult tracks recalculation progress
type RecalcResult struct {
    TotalDays      int
    ProcessedDays  int
    FailedDays     int
    Errors         []RecalcError
    StartTime      time.Time
    EndTime        *time.Time
    Status         RecalcStatus
}

type RecalcError struct {
    EmployeeID uuid.UUID
    Date       time.Time
    Error      string
}

type RecalcStatus string
const (
    RecalcStatusPending    RecalcStatus = "pending"
    RecalcStatusInProgress RecalcStatus = "in_progress"
    RecalcStatusCompleted  RecalcStatus = "completed"
    RecalcStatusFailed     RecalcStatus = "failed"
)

// RecalcService interface
type RecalcService struct {
    dailyCalc    dailyCalcServiceForRecalc
    employeeRepo employeeRepositoryForRecalc
}

// Methods to implement:
// 1. TriggerRecalc(ctx, employeeID, date) - single day
// 2. TriggerRecalcRange(ctx, employeeID, from, to) - date range
// 3. TriggerRecalcBatch(ctx, employeeIDs, from, to) - multiple employees
// 4. TriggerRecalcAll(ctx, tenantID, from, to) - full tenant
// 5. TriggerRecalcAsync(...) - async variants
```

### Implementation Strategy

1. **Single Day** - Direct delegation to `DailyCalcService.CalculateDay()`
2. **Date Range** - Direct delegation to `DailyCalcService.RecalculateRange()`
3. **Batch (multiple employees)** - Loop over employees, call RecalculateRange for each
4. **Full Tenant** - Get all active employees, then batch process
5. **Async** - Wrap synchronous operations in goroutine with result channel

### Async Option Design (Simple Approach)

```go
// AsyncRecalcResult is returned immediately for async operations
type AsyncRecalcResult struct {
    JobID     uuid.UUID
    ResultCh  <-chan RecalcResult  // Client reads final result
    DoneCh    <-chan struct{}      // Signals completion
}

func (s *RecalcService) TriggerRecalcAllAsync(ctx context.Context, tenantID uuid.UUID, from, to time.Time) *AsyncRecalcResult {
    jobID := uuid.New()
    resultCh := make(chan RecalcResult, 1)
    doneCh := make(chan struct{})

    go func() {
        defer close(doneCh)
        result := s.triggerRecalcAllInternal(ctx, tenantID, from, to)
        resultCh <- result
        close(resultCh)
    }()

    return &AsyncRecalcResult{
        JobID:    jobID,
        ResultCh: resultCh,
        DoneCh:   doneCh,
    }
}
```

## Dependencies

Based on research, RecalcService needs:

1. **DailyCalcService** - For actual calculation (already implemented)
2. **EmployeeRepository** - To get list of employees for batch/full recalc
3. **Context handling** - For cancellation support in async operations

## Implementation Checklist

From ticket acceptance criteria:

- [ ] Single day recalculation - Delegate to DailyCalcService.CalculateDay
- [ ] Date range recalculation - Delegate to DailyCalcService.RecalculateRange
- [ ] Batch recalculation for multiple employees - Loop + RecalculateRange
- [ ] Full tenant recalculation - Get employees + batch
- [ ] Async execution option - Goroutine with channels
- [ ] `make test` passes - Mock-based tests following daily_calc_test.go patterns

## Open Questions (Resolved)

Based on ZMI manual reference and existing codebase patterns:

### 1. Error handling in batch - **RESOLVED: Fail Fast**

The existing `DailyCalcService.RecalculateRange()` uses fail-fast pattern (returns immediately on first error with count of processed days). RecalcService should follow this established pattern.

```go
// Existing pattern in daily_calc.go:454-465
for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
    _, err := s.CalculateDay(ctx, tenantID, employeeID, date)
    if err != nil {
        return count, err  // Fail fast
    }
    count++
}
```

### 2. Transaction scope - **RESOLVED: Independent Processing**

ZMI calculates each day independently ("finale Berechnung eines Tages"). The existing codebase processes each day without transaction wrapping. RecalcService should:
- Process each employee independently
- Process each day independently
- No cross-entity transactions

### 3. Progress tracking - **RESOLVED: Return Count**

The existing pattern returns `(count int, error)` where count indicates processed items. This provides basic progress visibility. For async operations, the `RecalcResult` struct tracks:
- `ProcessedDays` / `TotalDays` for progress
- `FailedDays` and `Errors` for error tracking

### 4. Async notification - **RESOLVED: Channel-based**

Given the codebase's simplicity (no job queue infrastructure), use Go channels:
- `ResultCh` for final result
- `DoneCh` for completion signal
- Caller can select on channels or poll

### 5. Rate limiting - **DEFERRED**

Not needed for MVP. Each day's calculation is already independent and uses separate DB transactions. Can add rate limiting later if needed for very large tenants.

## Remaining Open Questions

1. **Scheduled job integration** - ZMI has "automatische Berechnung in der Nacht". Should RecalcService integrate with a scheduler, or is that a separate concern?
   - **Recommendation**: Separate concern. RecalcService provides the methods; a scheduler (cron job, external service) calls them.

2. **Recalculation triggers** - When should recalculation be triggered automatically?
   - Booking created/updated/deleted
   - Absence created/updated/deleted
   - Day plan configuration changed
   - **Recommendation**: Document these triggers but implement event handling in a future ticket.
