---
date: 2026-01-29T18:00:00+01:00
researcher: claude
git_commit: 9c7aa9ee3150516ac169876f1cd60d1ea50cb782
branch: master
repository: terp
topic: "ZMI-TICKET-007: Absence Types (Fehltage) - Current Implementation State"
tags: [research, codebase, absence-types, fehltage, zmi]
status: complete
last_updated: 2026-01-29
last_updated_by: claude
---

# Research: ZMI-TICKET-007 Absence Types (Fehltage) - Current Implementation State

**Date**: 2026-01-29T18:00:00+01:00
**Researcher**: claude
**Git Commit**: 9c7aa9ee3150516ac169876f1cd60d1ea50cb782
**Branch**: master
**Repository**: terp

## Research Question
What is the current state of absence type implementation against ZMI-TICKET-007 requirements? What exists, what ZMI-specific fields are present, and how do absence types integrate with the daily calculation pipeline?

## Summary

Absence types are **substantially implemented** across all layers (database, model, repository, service, handler, OpenAPI, frontend). The data model includes core ZMI fields (portion, holiday_code, priority) and a full CRUD API exists. System seed data provides 10 default absence types matching ZMI conventions (U/K/S prefixes). The daily calculation pipeline currently uses absence days only for target hour resolution (RegularHours vs RegularHours2) but does not yet auto-credit time for absence days. The OpenAPI schema and the Go model have a field mapping mismatch for some ZMI-specific fields that are exposed differently to the API.

## Detailed Findings

### 1. Data Model - AbsenceType

**File**: `apps/api/internal/model/absencetype.go`

The GORM model implements the following fields:

| Field | Type | ZMI Field | Description |
|-------|------|-----------|-------------|
| `ID` | `uuid.UUID` | - | Primary key |
| `TenantID` | `*uuid.UUID` | - | Nullable for system types |
| `Code` | `string(10)` | Kennung | Must start with U/K/S per convention |
| `Name` | `string(100)` | Bezeichnung | Display name |
| `Description` | `*string` | - | Optional description |
| `Category` | `AbsenceCategory` | - | vacation/illness/special/unpaid |
| `Portion` | `AbsencePortion` (int) | Anteil | 0=none, 1=full, 2=half |
| `HolidayCode` | `*string(10)` | Kürzel am Feiertag | Alternative code on holidays |
| `Priority` | `int` | Priorität | Higher wins on holiday+absence overlap |
| `DeductsVacation` | `bool` | - | Reduces vacation balance |
| `RequiresApproval` | `bool` | - | Needs manager approval |
| `RequiresDocument` | `bool` | - | Needs medical certificate |
| `Color` | `string(7)` | Farbe | Hex color for UI |
| `SortOrder` | `int` | - | Display ordering |
| `IsSystem` | `bool` | - | System types cannot be modified |
| `IsActive` | `bool` | aktiv | Active/inactive flag |

**Helper methods** on AbsenceType:
- `CreditMultiplier()` → 0.0/1.0/0.5 based on Portion (line 73-84)
- `CalculateCredit(regelarbeitszeit int) int` → minutes credited (line 88-90)
- `GetEffectiveCode(isHoliday bool) string` → returns holiday_code when applicable (line 93-98)
- `IsVacationType()` / `IsIllnessType()` → category checks (line 101-108)

### 2. Data Model - AbsenceDay

**File**: `apps/api/internal/model/absenceday.go`

Tracks individual absence records per employee per date:

| Field | Type | Description |
|-------|------|-------------|
| `EmployeeID` | `uuid.UUID` | Required FK to employees |
| `AbsenceDate` | `time.Time` (date) | The absence date |
| `AbsenceTypeID` | `uuid.UUID` | FK to absence_types |
| `Duration` | `decimal.Decimal(3,2)` | 1.00=full, 0.50=half |
| `HalfDayPeriod` | `*HalfDayPeriod` | "morning" or "afternoon" |
| `Status` | `AbsenceStatus` | pending/approved/rejected/cancelled |
| `ApprovedBy` | `*uuid.UUID` | FK to users |
| `ApprovedAt` | `*time.Time` | Approval timestamp |
| `RejectionReason` | `*string` | Optional rejection reason |
| `Notes` | `*string` | Optional notes |
| `CreatedBy` | `*uuid.UUID` | FK to users |

**Key method**: `CalculateCredit(regelarbeitszeit int) int` combines portion multiplier * duration * target hours (line 103-110).

### 3. Database Migration (000025)

**File**: `db/migrations/000025_create_absence_types.up.sql`

- Creates `absence_types` table with all ZMI fields
- Uses `COALESCE` unique index on `(tenant_id, code)` to handle NULL tenant_id for system types (line 51-54)
- Seeds 10 system absence types (line 57-83):
  - Vacation: U, UH (half day)
  - Illness: K, KH, KK (child illness)
  - Special: S, SH, SB (vocational school), SD (service trip)
  - Unpaid: UU
- Idempotent INSERT using LEFT JOIN pattern

### 4. OpenAPI Schema vs Go Model Field Mapping

**File**: `api/schemas/absence-types.yaml`

The OpenAPI schema uses **different field names** than the Go model for some ZMI-specific fields:

| OpenAPI Field | Go Model Field | Notes |
|---------------|---------------|-------|
| `is_paid` | `Portion` | API boolean maps to Portion != 0 |
| `affects_vacation_balance` | `DeductsVacation` | Direct boolean mapping |
| `requires_approval` | `RequiresApproval` | Direct boolean mapping |
| `category` enum: `sick` | Category: `illness` | Different enum values |
| `category` enum: `personal` | Category: `special` | Different enum values |
| - (not exposed) | `Portion` | ZMI Anteil not directly in API |
| - (not exposed) | `HolidayCode` | Not in OpenAPI schema |
| - (not exposed) | `Priority` | Not in OpenAPI schema |
| - (not exposed) | `RequiresDocument` | Not in OpenAPI schema |
| - (not exposed) | `SortOrder` | Not in OpenAPI schema |

The handler converts between these in `absenceTypeToResponse()` at `apps/api/internal/handler/absence.go:564-591` and `mapAbsenceCategory()` at line 594-607.

**Current category mapping** (handler line 594-622):
- API `vacation` ↔ Model `vacation`
- API `sick` ↔ Model `illness`
- API `personal` ↔ Model `special`
- API `unpaid` ↔ Model `unpaid`
- API `holiday` / `other` → Model `special` (default)

### 5. Service Layer

**File**: `apps/api/internal/service/absence.go`

The AbsenceService handles both absence days and absence types:

**Absence Type Operations**:
- `ListTypes(tenantID)` → Returns all types for tenant including system types (line 123)
- `GetTypeByID(tenantID, id)` → Gets type with tenant access check (line 497)
- `CreateType(at)` → Creates tenant-specific type, checks code uniqueness (line 510)
- `UpdateType(at)` → Updates type, blocks system type modification (line 530)
- `DeleteType(tenantID, id)` → Deletes type, blocks system type deletion (line 557)

**Absence Day Operations**:
- `CreateRange(input)` → Creates absences for date range, skipping weekends/holidays/off-days (line 260)
- `Approve(id, approvedBy)` → Transitions pending→approved, triggers recalculation (line 157)
- `Reject(id, reason)` → Transitions pending→rejected, triggers recalculation (line 188)
- `Delete(id)` → Deletes absence and triggers recalculation (line 217)
- `DeleteRange(tenantID, employeeID, from, to)` → Bulk delete with recalculation (line 241)

**Service Dependencies** (line 71-78):
- `absenceDayRepo` - absence day data access
- `absenceTypeRepo` - absence type data access
- `holidayRepo` - holiday lookups for range creation
- `empDayPlanRepo` - day plan lookups for skip logic
- `recalcSvc` - triggers daily value recalculation
- `notificationSvc` - sends approval/rejection notifications

### 6. Handler Layer

**File**: `apps/api/internal/handler/absence.go`

Implements all CRUD + workflow endpoints:

| Endpoint | Handler Method | Description |
|----------|---------------|-------------|
| `GET /absence-types` | `ListTypes` | List all types for tenant |
| `GET /absence-types/{id}` | `GetType` | Get single type |
| `POST /absence-types` | `CreateType` | Create tenant type |
| `PATCH /absence-types/{id}` | `UpdateType` | Update type |
| `DELETE /absence-types/{id}` | `DeleteType` | Delete type |
| `GET /absences` | `ListAll` | List with filters + data scoping |
| `GET /employees/{id}/absences` | `ListByEmployee` | Employee absences |
| `POST /employees/{id}/absences` | `CreateRange` | Create absence range |
| `DELETE /absences/{id}` | `Delete` | Delete single absence |
| `POST /absences/{id}/approve` | `Approve` | Approve pending absence |
| `POST /absences/{id}/reject` | `Reject` | Reject pending absence |

**Data scope enforcement**: The handler uses `ensureEmployeeScope()` and `ensureAbsenceScope()` to verify the authenticated user has access to the requested employee/absence based on their data scope configuration (department, specific employees, or all).

### 7. Daily Calculation Integration

**File**: `apps/api/internal/service/daily_calc.go`

Absence days currently influence daily calculation through target hour resolution:

1. `resolveTargetHours()` (line 109-130) checks for an approved absence on the date
2. If found, sets `isAbsenceDay = true`
3. `DayPlan.GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)` selects RegularHours2 when available for absence days

**Target hour priority chain**:
1. Employee master (if `FromEmployeeMaster=true` and employee has `DailyTargetHours`)
2. `RegularHours2` (if approved absence exists and value is configured)
3. `RegularHours` (default)

**Not yet integrated**: Automatic time crediting based on absence type portion. The models have `CalculateCredit()` methods but the daily calculation does not call them to produce a time credit value.

### 8. Ticket Requirements vs Implementation Gap Analysis

| Requirement | Status | Notes |
|-------------|--------|-------|
| Code (K/S/U prefix) | ✅ Implemented | DB column exists, seed data follows convention |
| Name/description | ✅ Implemented | In model and API |
| Category (vacation/illness/special/unpaid) | ✅ Implemented | With API↔model mapping |
| Calculation rule reference | ❌ Not implemented | Ticket mentions linking to Absence Calc Rules (ZMI-TICKET-013) |
| Portion (0/1/2) | ✅ Implemented | In model with helper methods |
| Holiday code override | ✅ Implemented | In model but not in OpenAPI schema |
| Priority | ✅ Implemented | In model but not in OpenAPI schema |
| Color | ✅ Implemented | In model and API |
| Function key shortcut | ❌ Not implemented | Not in model or DB |
| Linked account | ❌ Not implemented | Depends on ZMI-TICKET-009 |
| Active/system flags | ✅ Implemented | With system type protection |
| Absence type groups | ❌ Not implemented | No group model, table, or endpoint |
| Code prefix validation | ❌ Not implemented | Convention exists but no validation enforces K/S/U prefix per category |
| Portion value validation | ❌ Not implemented | No validation rejects invalid portion integers |

### 9. System Seed Data

The migration seeds 10 system absence types:

| Code | Name | Category | Portion | Deducts Vacation | Color |
|------|------|----------|---------|-----------------|-------|
| U | Urlaub | vacation | 1 (full) | true | #4CAF50 |
| UH | Urlaub halber Tag | vacation | 2 (half) | true | #66BB6A |
| K | Krankheit | illness | 1 (full) | false | #F44336 |
| KH | Krankheit halber Tag | illness | 2 (half) | false | #EF5350 |
| KK | Krankheit Kind | illness | 1 (full) | false | #E57373 |
| S | Sonderurlaub | special | 1 (full) | false | #2196F3 |
| SH | Sonderurlaub halber Tag | special | 2 (half) | false | #42A5F5 |
| SB | Berufsschule | special | 1 (full) | false | #64B5F6 |
| SD | Dienstgang | special | 1 (full) | false | #90CAF9 |
| UU | Unbezahlter Urlaub | unpaid | 0 (none) | false | #9E9E9E |

## Code References

- `apps/api/internal/model/absencetype.go` - AbsenceType GORM model with ZMI fields and helper methods
- `apps/api/internal/model/absenceday.go` - AbsenceDay model with duration, status, and credit calculation
- `apps/api/internal/service/absence.go` - Business logic for absence types and days with workflow
- `apps/api/internal/handler/absence.go` - HTTP handlers with model↔API conversion and data scoping
- `apps/api/internal/repository/absencetype.go` - Absence type data access layer
- `apps/api/internal/repository/absenceday.go` - Absence day data access layer
- `db/migrations/000025_create_absence_types.up.sql` - Table creation with ZMI field comments and system seed data
- `db/migrations/000026_create_absence_days.up.sql` - Absence days table with unique constraint
- `api/schemas/absence-types.yaml` - OpenAPI absence type schema definitions
- `api/paths/absence-types.yaml` - OpenAPI absence type endpoint definitions
- `apps/api/internal/service/daily_calc.go:109-130` - Target hour resolution using absence day lookup
- `apps/api/internal/handler/routes.go` - Route registration for absence endpoints
- `apps/api/internal/auth/devabsencetypes.go` - Dev mode absence type seed data
- `apps/api/internal/auth/devabsencedays.go` - Dev mode absence day seed data

## Architecture Documentation

### Layer Flow
```
HTTP Request → Handler (parse, validate, scope check)
            → Service (business logic, validation, orchestration)
            → Repository (GORM queries)
            → PostgreSQL (absence_types, absence_days tables)
```

### Multi-Tenancy Pattern
- System types: `tenant_id = NULL`, `is_system = true`
- Tenant types: `tenant_id = <uuid>`, `is_system = false`
- Unique constraint: `COALESCE(tenant_id, zero-uuid) + code`
- Service validates tenant access before returning types

### Recalculation Trigger Pattern
The AbsenceService triggers daily value recalculation via `recalcSvc` whenever:
- An absence is approved (`Approve`)
- An absence is rejected (`Reject`)
- An absence is deleted (`Delete`, `DeleteRange`)
- A range of absences is created (`CreateRange`)

### Notification Pattern
The AbsenceService sends notifications via `notificationSvc` for:
- Pending absence requests → tenant admins
- Approval decisions → the employee

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-007-absence-types.md` - Ticket definition with full requirements
- `thoughts/shared/tickets/ZMI-TICKET-008-absence-days-lifecycle.md` - Related absence day lifecycle ticket
- `thoughts/shared/tickets/ZMI-TICKET-013-absence-calculation-rules.md` - Dependency for calculation rule linkage
- `thoughts/shared/research/2026-01-24-NOK-133-absence-type-model-repository.md` - Prior research on absence type model
- `thoughts/shared/research/2026-01-24-NOK-136-create-absence-service.md` - Prior research on absence service
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` - ZMI manual Section 15 (Fehltage, pages 159-161)

## Open Questions

1. **Code prefix validation**: The ticket requires validating code prefix per category (K→illness, S→special, U→vacation). This validation does not exist in the service layer. Should it be added to `CreateType`?

2. **Portion value validation**: The ticket requires rejecting invalid portion values. Currently any integer is accepted. Should a validator enforce 0/1/2 only?

3. **OpenAPI field gaps**: Several ZMI-specific fields (`portion`, `holiday_code`, `priority`, `requires_document`, `sort_order`) are in the Go model and database but NOT exposed in the OpenAPI schema. The API uses `is_paid` boolean as a proxy for portion. Should the schema be extended?

4. **Absence type groups**: The ticket requires "Absence type groups for workflow selection (WebClient)". No group model, migration, or endpoint exists. This is a net-new feature.

5. **Calculation rule reference**: The ticket lists "Calculation rule reference (links to Absence Calculation Rules)" as a field. This depends on ZMI-TICKET-013 which defines the calculation rules. No foreign key or field exists yet.

6. **Function key shortcut**: The ticket lists "Function key shortcut" as a field. This is not implemented and may relate to terminal hardware integration.

7. **Linked account**: The ticket lists "Linked account (optional)" for account integration. This depends on ZMI-TICKET-009 (Accounts module). No field exists yet.

8. **Daily calculation credit**: The `CalculateCredit()` methods exist on both models but are not called during daily calculation. Should the daily calc pipeline apply absence type credits automatically?
