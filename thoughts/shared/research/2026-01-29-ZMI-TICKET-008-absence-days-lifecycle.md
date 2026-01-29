---
date: 2026-01-29T17:28:40+01:00
researcher: Claude
git_commit: 4350f6a9c114c0e18d82c3fd8753d0a5cc50df53
branch: master
repository: terp
topic: "ZMI-TICKET-008: Absence Days Lifecycle and Logs - Current Implementation State"
tags: [research, codebase, absence-days, lifecycle, audit-logs, holidays, vacation, daily-calculation]
status: complete
last_updated: 2026-01-29
last_updated_by: Claude
---

# Research: ZMI-TICKET-008 - Absence Days Lifecycle and Logs

**Date**: 2026-01-29T17:28:40+01:00
**Researcher**: Claude
**Git Commit**: 4350f6a9c114c0e18d82c3fd8753d0a5cc50df53
**Branch**: master
**Repository**: terp

## Research Question
Document the current implementation state of the absence days system as it relates to ZMI-TICKET-008 requirements: full absence day lifecycle (create, delete, range operations, logs) with ZMI conflict handling and integration into daily/monthly calculations.

## Summary

The absence day system is **substantially implemented** across all architectural layers. The codebase contains a complete CRUD lifecycle with range operations, an approval workflow (pending → approved/rejected/cancelled), audit logging via the `AuditLogService`, integration with daily calculations (target hours resolution using `RegularHours2` for absence days), vacation balance recalculation, and notification support. Holiday conflict handling is implemented as a **skip strategy** (absences cannot be created on holidays) rather than a priority-based override. The ticket's `Priority` and `HolidayCode` fields exist on `AbsenceType` but are not actively used for conflict resolution during absence creation.

## Detailed Findings

### 1. Data Model (`absence_days` table)

**Migration**: `db/migrations/000026_create_absence_days.up.sql`

The table stores one record per employee per absence date:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `tenant_id` | UUID FK → tenants | Multi-tenancy, CASCADE delete |
| `employee_id` | UUID FK → employees | CASCADE delete |
| `absence_date` | DATE | The date of absence |
| `absence_type_id` | UUID FK → absence_types | Links to type config |
| `duration` | DECIMAL(3,2) | 1.00=full, 0.50=half day |
| `half_day_period` | VARCHAR(10) | `morning` or `afternoon` |
| `status` | VARCHAR(20) | `pending`, `approved`, `rejected`, `cancelled` |
| `approved_by` | UUID FK → users | SET NULL on user delete |
| `approved_at` | TIMESTAMPTZ | When approved |
| `rejection_reason` | TEXT | Reason for rejection |
| `notes` | TEXT | Optional user notes |
| `created_by` | UUID FK → users | Who created the absence |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auto-managed timestamps |

**Key constraint**: Conditional unique index at line 51-52:
```sql
CREATE UNIQUE INDEX idx_absence_days_unique ON absence_days(employee_id, absence_date)
    WHERE status != 'cancelled';
```
This allows only one non-cancelled absence per employee per date.

**Domain model**: `apps/api/internal/model/absenceday.go`

The `AbsenceDay` struct (lines 41-73) mirrors the DB schema. Key methods:
- `IsFullDay()` / `IsHalfDay()` — duration checks using `shopspring/decimal`
- `IsApproved()` / `IsCancelled()` — status checks
- `CalculateCredit(regelarbeitszeit int)` (lines 99-110) — computes time credit:
  ```
  credit = regelarbeitszeit * absenceType.CreditMultiplier() * duration
  ```
  Requires `AbsenceType` relation preloaded.

### 2. Repository Layer

**File**: `apps/api/internal/repository/absenceday.go`

| Method | Description |
|--------|-------------|
| `Create(ad)` | Single insert |
| `CreateRange(days)` | Batch insert via `CreateInBatches(days, 100)` (line 38) |
| `GetByID(id)` | Preloads `AbsenceType` |
| `GetByEmployeeDate(empID, date)` | Returns `nil, nil` if not found; excludes cancelled (line 63) |
| `GetByEmployeeDateRange(empID, from, to)` | Returns all statuses, preloads `AbsenceType` |
| `ListByEmployee(empID)` | All absences for employee, ordered by date DESC |
| `ListAll(tenantID, opts)` | Filtered list with `Employee` and `AbsenceType` preloads, data scope support |
| `Update(ad)` | GORM `Save()` |
| `Delete(id)` | Hard delete, returns `ErrAbsenceDayNotFound` if no rows affected |
| `DeleteRange(empID, from, to)` | Deletes all absences in range for employee |
| `Upsert(ad)` | `Save()` for dev seeding |
| `CountByTypeInRange(empID, typeID, from, to)` | Sums `duration` of approved absences (line 194-207) |

**Data scope filtering** in `ListAll` (lines 159-173):
- `DataScopeDepartment`: JOINs employees table, filters by department IDs
- `DataScopeEmployee`: Filters by employee IDs directly
- `DataScopeAll`: No additional filter

### 3. Service Layer

**File**: `apps/api/internal/service/absence.go`

The `AbsenceService` struct (lines 74-81) holds dependencies:
- `absenceDayRepo`, `absenceTypeRepo`, `holidayRepo`, `empDayPlanRepo`, `recalcSvc`, `notificationSvc`

#### 3.1 Range Creation (`CreateRange`, lines 260-361)

The primary creation flow:

1. **Validate date range** — `from` must be ≤ `to` (line 265)
2. **Validate absence type** — must exist, be active, and accessible by tenant (lines 270-280)
3. **Batch-fetch holidays** — `holidayRepo.GetByDateRange()` for the whole range (line 283)
4. **Build holiday set** — O(1) lookup map normalized to UTC midnight (lines 426-433)
5. **Batch-fetch day plans** — `empDayPlanRepo.GetForEmployeeDateRange()` (line 290)
6. **Build day plan map** — date → plan mapping (lines 436-443)
7. **Iterate each date**:
   - Call `shouldSkipDate()` — skips weekends, holidays, off-days (lines 456-487)
   - Check for existing non-cancelled absence on date (lines 312-320)
   - Build `AbsenceDay` record (lines 323-333)
8. **Batch create** — `CreateRange(daysToCreate)` with batch size 100 (line 345)
9. **Trigger recalculation** — `recalcSvc.TriggerRecalcRange()` (line 350)
10. **Notify admins** — for pending absences (lines 353-355)

#### 3.2 Skip Logic (`shouldSkipDate`, lines 456-487)

| Check | Skip Reason | Description |
|-------|------------|-------------|
| Saturday/Sunday | `weekend` | Always skipped |
| Holiday in set | `holiday` | Holidays always skipped (line 472) |
| No plan record | `no_plan` | No scheduled work |
| Plan with nil `DayPlanID` | `off_day` | Explicit off-day |

**Holiday conflict handling**: Absences are **never created on holidays**. The `Priority` and `HolidayCode` fields on `AbsenceType` are not used during creation; holidays always take precedence.

#### 3.3 Approval Workflow

**Approve** (`lines 160-186`):
- Validates status is `pending` (line 166)
- Sets `Status=approved`, `ApprovedBy=approverID`, `ApprovedAt=now` (lines 170-173)
- Triggers recalculation for affected date (line 180)
- Sends notification to employee (line 183)

**Reject** (`lines 191-217`):
- Validates status is `pending`
- Sets `Status=rejected`, optionally sets `RejectionReason`
- Triggers recalculation
- Sends rejection notification

#### 3.4 Delete Operations

**Delete single** (`lines 220-241`):
- Fetches absence for recalc data before deletion
- Hard deletes the record
- Triggers recalculation

**Delete range** (`lines 244-258`):
- Deletes all absences for employee in date range
- Triggers range recalculation

#### 3.5 Notifications

**Pending absence** (`notifyPendingAbsence`, lines 363-387):
- Sends notification to tenant admins with link to `/admin/approvals`
- Uses `NotificationTypeReminders`

**Decision notification** (`notifyAbsenceDecision`, lines 389-423):
- Sends to the employee's user
- Uses `NotificationTypeApprovals`
- Includes rejection reason if provided

### 4. Handler Layer

**File**: `apps/api/internal/handler/absence.go`

`AbsenceHandler` struct (lines 22-27) wraps `AbsenceService`, `EmployeeService`, and `AuditLogService`.

#### 4.1 Endpoints

| Method | Route | Handler | Permission |
|--------|-------|---------|------------|
| GET | `/absence-types` | `ListTypes` | `absence_types.manage` |
| POST | `/absence-types` | `CreateType` | `absence_types.manage` |
| GET | `/absence-types/{id}` | `GetType` | `absence_types.manage` |
| PATCH | `/absence-types/{id}` | `UpdateType` | `absence_types.manage` |
| DELETE | `/absence-types/{id}` | `DeleteType` | `absence_types.manage` |
| GET | `/employees/{id}/absences` | `ListByEmployee` | `absences.request` or `absences.manage` |
| POST | `/employees/{id}/absences` | `CreateRange` | `absences.request` or `absences.manage` |
| GET | `/absences` | `ListAll` | `absences.manage` |
| DELETE | `/absences/{id}` | `Delete` | `absences.manage` |
| POST | `/absences/{id}/approve` | `Approve` | `absences.approve` |
| POST | `/absences/{id}/reject` | `Reject` | `absences.approve` |

Registered in `apps/api/internal/handler/routes.go:477-521`.

#### 4.2 Access Control

- **Employee scope** (`ensureEmployeeScope`, lines 636-655): Checks tenant scope → employee scope using `access.Scope`
- **Absence scope** (`ensureAbsenceScope`, lines 657-666): Fetches absence, then checks employee scope
- `RequireEmployeePermission` middleware for employee-nested routes (lines 505-506)

#### 4.3 Audit Logging

The handler logs audit entries for create and delete operations:

**Create** (lines 230-241): Logs each created absence day individually
```go
h.auditService.Log(r.Context(), r, service.LogEntry{
    TenantID:   tenantID,
    Action:     model.AuditActionCreate,
    EntityType: "absence",
    EntityID:   result.CreatedDays[i].ID,
})
```

**Delete** (lines 283-292): Logs single deletion
```go
h.auditService.Log(r.Context(), r, service.LogEntry{
    TenantID:   tenantID,
    Action:     model.AuditActionDelete,
    EntityType: "absence",
    EntityID:   id,
})
```

The `AuditLogService` (at `apps/api/internal/service/auditlog.go`) automatically extracts `UserID` from context, plus `IPAddress` and `UserAgent` from the HTTP request.

### 5. OpenAPI Specification

**Schemas**: `api/schemas/absences.yaml`
- `Absence` (lines 2-73): Full response with nested `EmployeeSummary` and `AbsenceTypeSummary`
- `AbsenceSummary` (lines 75-95): Lightweight summary
- `CreateAbsenceRangeRequest` (lines 97-122): Required `absence_type_id`, `from`, `to`, `duration`
- `UpdateAbsenceRequest` (lines 124-138): Optional `duration`, `notes`, `status`
- `AbsenceList` (lines 140-148): Standard list wrapper

**Paths**: `api/paths/absences.yaml`
- `GET /absences` with filters: `employee_id`, `absence_type_id`, `from`, `to`, `status`
- `GET/PATCH/DELETE /absences/{id}`
- `POST /absences/{id}/approve` — returns 400 if not pending
- `POST /absences/{id}/reject` — accepts optional `reason` body

### 6. Integration with Daily Calculation

**File**: `apps/api/internal/service/daily_calc.go`

#### 6.1 Target Hours Resolution (`resolveTargetHours`, lines 109-130)

The calculation checks for approved absences on the date:
```go
absence, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
if err == nil && absence != nil && absence.IsApproved() {
    isAbsenceDay = true
}
return dp.GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)
```

Priority chain:
1. Employee master `DailyTargetHours` if `FromEmployeeMaster=true`
2. `RegularHours2` if `isAbsenceDay=true`
3. `RegularHours` (default)

#### 6.2 Absence Credit in Daily Values

The `AbsenceDay.CalculateCredit()` method computes:
```
credit = regelarbeitszeit * CreditMultiplier * duration
```
Where `CreditMultiplier` is derived from `AbsenceType.Portion`:
- 0 (none) → 0.0 multiplier
- 1 (full) → 1.0 multiplier
- 2 (half) → 0.5 multiplier

### 7. Integration with Vacation Balance

**File**: `apps/api/internal/service/vacation.go`

`RecalculateTaken` (lines 178-220):
1. Lists all absence types where `DeductsVacation=true`
2. For each, sums approved absence `duration` via `CountByTypeInRange`
3. Updates `vacation_balances.taken` for the year

This is called from `RecalcService.TriggerRecalc()` which runs after absence create/approve/delete.

### 8. Integration with Monthly Evaluation

**File**: `apps/api/internal/service/monthlyeval.go`

The `MonthSummary` struct (lines 56-78) tracks:
- `VacationTaken` (decimal) — vacation-category absence days
- `SickDays` (int) — illness-category absence days
- `OtherAbsenceDays` (int) — all other categories

The monthly evaluation uses `absenceDayRepo.GetByEmployeeDateRange()` (defined at line 42-43) to fetch absences for the month and aggregate them.

### 9. Holiday Conflict Handling (Current State)

Per the ticket requirement: "If holiday and absence overlap, apply absence type priority and holiday code rules."

**Current implementation**:
- During **absence creation** (`shouldSkipDate`): holidays always win — absences are **skipped** on holiday dates
- The `AbsenceType` model has `Priority` (int) and `HolidayCode` (*string) fields
- The `GetEffectiveCode(isHoliday bool)` method returns `HolidayCode` on holidays
- These fields exist in the database, model, API spec, and handler mapping
- **They are not used for conflict resolution during absence range creation** — the skip logic always prevents overlap

### 10. Audit Logging System

**Table**: `audit_logs` (migration 000040)
- `user_id`, `action`, `entity_type`, `entity_id`, `changes` (JSONB), `metadata` (JSONB)
- `ip_address`, `user_agent`, `performed_at`

**Current absence audit actions**:
- `AuditActionCreate` logged per absence day on range creation
- `AuditActionDelete` logged on single deletion
- Approval/rejection do **not** currently log audit entries (handled via status field changes)

**Note**: The ticket mentions "absence log records for create/update/delete with user identity and timestamps." The existing `audit_logs` table covers this requirement. The `created_by` and `approved_by` fields on `absence_days` provide direct user attribution.

## Code References

### Core Absence Day Implementation
- `db/migrations/000026_create_absence_days.up.sql` — Table schema
- `apps/api/internal/model/absenceday.go` — Domain model (111 lines)
- `apps/api/internal/repository/absenceday.go` — Data access (207 lines)
- `apps/api/internal/service/absence.go` — Business logic (622 lines)
- `apps/api/internal/handler/absence.go` — HTTP handlers (902 lines)
- `apps/api/internal/handler/routes.go:477-521` — Route registration

### Absence Type Support
- `db/migrations/000025_create_absence_types.up.sql` — Absence types table
- `db/migrations/000042_create_absence_type_groups.up.sql` — Type groups
- `apps/api/internal/model/absencetype.go` — Type model with ZMI fields
- `apps/api/internal/repository/absencetype.go` — Type data access
- `apps/api/internal/service/absence.go:499-622` — Type CRUD in service

### Integration Points
- `apps/api/internal/service/daily_calc.go:109-130` — Target hours resolution using absence status
- `apps/api/internal/service/vacation.go:178-220` — Vacation taken recalculation
- `apps/api/internal/service/monthlyeval.go:40-78` — Monthly absence aggregation
- `apps/api/internal/service/auditlog.go` — Audit logging service

### OpenAPI Spec
- `api/schemas/absences.yaml` — Absence schemas
- `api/paths/absences.yaml` — Absence endpoints
- `api/schemas/absence-types.yaml` — Absence type schemas
- `api/paths/absence-types.yaml` — Absence type endpoints

### Holiday Integration
- `apps/api/internal/service/absence.go:282-287` — Holiday fetch for range creation
- `apps/api/internal/service/absence.go:471-474` — Holiday skip logic
- `apps/api/internal/service/daily_calc.go:136-141` — Holiday check in daily calc
- `apps/api/internal/model/absencetype.go:96-102` — `GetEffectiveCode(isHoliday)`

### Dev Seed Data
- `apps/api/internal/auth/devabsencetypes.go` — Dev absence type fixtures
- `apps/api/internal/auth/devabsencedays.go` — Dev absence day fixtures

### Frontend
- `apps/web/src/app/[locale]/(dashboard)/absences/page.tsx` — Employee absence page
- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` — Admin absence types
- `apps/web/src/components/absences/` — 6 absence components
- `apps/web/src/hooks/api/use-absences.ts` — React hooks for API

## Architecture Documentation

### Request Flow: Create Absence Range
```
POST /employees/{id}/absences
    → AuthMiddleware (JWT → auth.User in context)
    → TenantMiddleware (X-Tenant-ID → tenant in context)
    → AuthorizationMiddleware (RequireEmployeePermission)
    → AbsenceHandler.CreateRange
        → Decode CreateAbsenceRangeRequest (gen/models)
        → AbsenceService.CreateRange
            → Validate absence type (active, accessible)
            → Batch-fetch holidays + day plans
            → Iterate dates, skip weekends/holidays/off-days/existing
            → CreateRange in batches of 100
            → TriggerRecalcRange (daily calc + vacation balance)
            → NotifyPendingAbsence (to admins)
        → AuditLogService.Log (per created day)
        → Return AbsenceList response
```

### Request Flow: Approve Absence
```
POST /absences/{id}/approve
    → Auth + Tenant + Authorization (RequirePermission absences.approve)
    → AbsenceHandler.Approve
        → ensureAbsenceScope (verify access to employee)
        → auth.UserFromContext → approverID
        → AbsenceService.Approve(id, approverID)
            → Validate status == pending
            → Set approved_by, approved_at
            → Update record
            → TriggerRecalc (daily calc for date)
            → NotifyAbsenceDecision (to employee)
        → Return Absence response
```

### Recalculation Cascade
When an absence is created/approved/deleted:
1. `RecalcService.TriggerRecalc` runs
2. → `DailyCalcService.CalculateDay` re-runs for affected dates
3. → `VacationService.RecalculateTaken` updates vacation balance
4. → Monthly values may need recomputation (triggered separately)

## Historical Context (from thoughts/)

### Related Tickets
- `thoughts/shared/tickets/ZMI-TICKET-007-absence-types.md` — Absence type groups and ZMI fields (implemented)
- `thoughts/shared/tickets/ZMI-TICKET-008-absence-days-lifecycle.md` — This ticket
- `thoughts/shared/tickets/ZMI-TICKET-013-absence-calculation-rules.md` — Calculation integration rules
- `thoughts/shared/tickets/ZMI-TICKET-014-vacation-entitlement-calculation.md` — Vacation entitlement
- `thoughts/shared/tickets/ZMI-TICKET-015-vacation-carryover-capping.md` — Vacation carryover

### Implementation Plans (NOK series)
- `thoughts/shared/plans/2026-01-24-NOK-133-absence-type-model-repository.md` — AbsenceType model plan
- `thoughts/shared/plans/2026-01-24-NOK-134-create-absence-days-migration.md` — Migration plan
- `thoughts/shared/plans/2026-01-24-NOK-135-absence-day-model-repository.md` — AbsenceDay model plan
- `thoughts/shared/plans/2026-01-24-NOK-136-create-absence-service.md` — Service plan
- `thoughts/shared/plans/2026-01-24-NOK-137-create-absence-handler.md` — Handler plan

### Research Documents
- `thoughts/shared/research/2026-01-24-NOK-133-absence-type-model-repository.md`
- `thoughts/shared/research/2026-01-24-NOK-134-create-absence-days-migration.md`
- `thoughts/shared/research/2026-01-24-NOK-135-absence-day-model-repository.md`
- `thoughts/shared/research/2026-01-24-NOK-136-create-absence-service.md`
- `thoughts/shared/research/2026-01-24-NOK-137-create-absence-handler.md`
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-007-absence-types.md`

### Reference
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — ZMI calculation manual
- `impl_plan/zmi-docs/05-absences-teams-reports.md` — ZMI reference docs

## Ticket Requirements vs Current Implementation

| Requirement | Status | Details |
|-------------|--------|---------|
| Absence day CRUD | **Implemented** | Create, Read, Delete via service/handler/repo |
| Range operations (expand to individual records) | **Implemented** | `CreateRange` iterates dates, `DeleteRange` for bulk |
| Single date creation | **Implemented** | Range with `from == to` creates single record |
| Duration (full/half day) | **Implemented** | `duration` decimal field (1.0/0.5), `half_day_period` |
| Status workflow (pending/approved/cancelled) | **Implemented** | pending → approved/rejected, cancelled status exists |
| Created by, approved by tracking | **Implemented** | `created_by`, `approved_by`, `approved_at` fields |
| Audit log for create/update/delete | **Partially** | Create and Delete logged; Update/Approve/Reject not explicitly logged to audit_logs |
| Holiday conflict: skip during creation | **Implemented** | `shouldSkipDate()` always skips holidays |
| Holiday conflict: priority-based resolution | **Not implemented** | `Priority` field exists but not used in conflict logic |
| Holiday conflict: effective code on overlap | **Not implemented** | `GetEffectiveCode()` method exists but not called during creation |
| Vacation-deducting types update balance | **Implemented** | `RecalculateTaken` sums approved vacation-deducting absences |
| Multiple entry points | **Implemented** | Employee-nested route + global `/absences` route |
| List by employee/date range | **Implemented** | Query filters on `/absences` endpoint |

## Open Questions

1. **Holiday conflict resolution**: The ticket requires "If holiday and absence overlap, apply absence type priority and holiday code rules." Currently holidays always prevent absence creation. Should the system allow absences on holidays when the absence type has higher priority?

2. **Audit log coverage**: Approval and rejection are not logged to `audit_logs` table (they update `approved_by`/`approved_at` on the record itself). Should they also create `audit_logs` entries?

3. **Vacation deduction value**: The ticket mentions "day plan deduction=1.0" for vacation deduction scaling. The `DayPlan.VacationDeduction` field exists (migration 000030) but the `TODO(ZMI-TICKET-006)` comment at `daily_calc.go:100-103` notes this integration needs verification.

4. **Update endpoint**: The OpenAPI spec defines `PATCH /absences/{id}` with `UpdateAbsenceRequest` but no handler method currently implements single-absence update (only status transitions via approve/reject).
