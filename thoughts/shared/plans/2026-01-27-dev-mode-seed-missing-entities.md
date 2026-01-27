# Dev Mode Seed Missing Entities — Implementation Plan

## Overview

Seed four missing entity types into the DevLogin flow so that recently built frontend features (approvals dashboard, team overview, accounts management, vacation balance) display realistic data out of the box. Also fix the missing Employee→Tariff linkage and activate absence type seeding with deterministic UUIDs.

## Current State Analysis

DevLogin (`handler/auth.go:93-421`) seeds 15 entity types but is missing:
- **EmployeeDayPlan** — critical dependency for absence creation; without it, AbsenceService treats every day as an off-day (`service/absence.go:274`)
- **AbsenceDay** — approvals dashboard (`/admin/approvals`) shows empty
- **VacationBalance** — vacation balance endpoint returns 404
- **Account** — accounts admin page (`/admin/accounts`) shows only system accounts from migration

Additionally:
- `devabsencetypes.go` exists with 10 types and deterministic UUIDs but is NOT called from DevLogin (comment at `auth.go:175-176`)
- Employee records are seeded WITHOUT `TariffID` set (`auth.go:128-146`), breaking the Employee→Tariff→WeekPlan→DayPlan chain

### Key Discoveries:
- `EmployeeDayPlanRepository` already has `Upsert()` and `BulkCreate()` methods (`repository/employeedayplan.go:104-125`)
- `VacationBalanceRepository` already has `Upsert()` on `(employee_id, year)` conflict (`repository/vacationbalance.go:65-74`)
- `AbsenceDayRepository` has NO Upsert — only `Create`/`CreateRange` (`repository/absenceday.go:28-39`)
- `AccountRepository` has NO Upsert (`repository/account.go`)
- `absence_days` table has a conditional unique index: `UNIQUE(employee_id, absence_date) WHERE status != 'cancelled'` (`migrations/000026:51-52`)
- `accounts` table has `UNIQUE(tenant_id, code)` (`migrations/000006:12`)
- Booking repo Upsert uses `Save()` (primary key-based INSERT ON CONFLICT) — same pattern works for AbsenceDay

## Desired End State

After implementation:
1. `GET /auth/dev/login?role=admin` seeds ALL entities including the four new ones
2. `/admin/approvals` shows pending, approved, and rejected absences
3. `/admin/accounts` shows tenant-specific accounts alongside system accounts
4. `GET /employees/{id}/vacation-balance` returns initialized balances for all employees
5. Absence creation works correctly (EmployeeDayPlans exist to determine working days)
6. All seeding is idempotent (safe to call repeatedly)

### Verification:
- `make test` passes
- Dev login succeeds without errors
- Frontend pages display seeded data

## What We're NOT Doing

- Not creating a service layer for EmployeeDayPlan (remains repo-only)
- Not adding a background job to generate EmployeeDayPlans from tariff assignments automatically
- Not seeding EmployeeContact, EmployeeCard, CostCenter, EmploymentType, or UserGroup
- Not changing the migration-seeded absence types — we seed tenant-level ones with deterministic UUIDs alongside them
- Not extending the booking/daily value date range beyond the existing Jan 2-23 coverage

## Implementation Approach

Follow the existing dev seeding pattern: define data in `auth/dev*.go` files, add repo interfaces to `AuthHandler`, wire in `main.go`, and call from `DevLogin` in dependency order.

For AbsenceDay and Account, add `Upsert` methods to their repositories since they currently lack them.

---

## Phase 1: Add Repository Upsert Methods

### Overview
Add idempotent Upsert methods to AbsenceDayRepository and AccountRepository so dev seeding can be called repeatedly without errors.

### Changes Required:

#### 1. AbsenceDayRepository — Add Upsert
**File**: `apps/api/internal/repository/absenceday.go`
**Changes**: Add `Upsert` method using `Save()` (primary key-based, same pattern as BookingRepository)

```go
// Upsert creates or updates an absence day by primary key.
// Uses Save() which does INSERT ON CONFLICT (id) DO UPDATE.
func (r *AbsenceDayRepository) Upsert(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Save(ad).Error
}
```

Note: We use `Save()` (primary key-based) rather than `ON CONFLICT (employee_id, absence_date)` because the unique index on absence_days is conditional (`WHERE status != 'cancelled'`), which GORM's `clause.OnConflict` doesn't support.

#### 2. AccountRepository — Add Upsert
**File**: `apps/api/internal/repository/account.go`
**Changes**: Add `Upsert` method using `clause.OnConflict` on `(tenant_id, code)`

```go
// Upsert creates or updates an account based on tenant_id + code.
func (r *AccountRepository) Upsert(ctx context.Context, account *model.Account) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "code"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "account_type", "unit", "is_active", "updated_at"}),
		}).
		Create(account).Error
}
```

Add `"gorm.io/gorm/clause"` to imports.

### Success Criteria:

#### Automated Verification:
- [x] Build compiles: `cd apps/api && go build ./...`
- [x] Existing tests pass: `cd apps/api && go test ./internal/repository/...`

---

## Phase 2: Create Dev Data Definition Files

### Overview
Create four new files in `apps/api/internal/auth/` defining the seed data for EmployeeDayPlans, AbsenceDays, VacationBalances, and Accounts. Also add the Employee→Tariff mapping.

### Changes Required:

#### 1. Employee→Tariff Mapping
**File**: `apps/api/internal/auth/devemployees.go`
**Changes**: Add `DevEmployeeTariffMap` mapping each employee to their tariff, and a `TariffID` field to `DevEmployee`

```go
// Tariff IDs from devtariffs.go
var DevEmployeeTariffMap = map[uuid.UUID]uuid.UUID{
	DevEmployeeAdminID:  uuid.MustParse("00000000-0000-0000-0000-000000000701"), // TAR-40H
	DevEmployeeUserID:   uuid.MustParse("00000000-0000-0000-0000-000000000703"), // TAR-FLEX
	DevEmployeeMariaID:  uuid.MustParse("00000000-0000-0000-0000-000000000704"), // TAR-20H
	DevEmployeeThomasID: uuid.MustParse("00000000-0000-0000-0000-000000000701"), // TAR-40H
	DevEmployeeAnnaID:   uuid.MustParse("00000000-0000-0000-0000-000000000702"), // TAR-38H
}
```

Rationale:
- Admin (40h) → TAR-40H: Standard full-time
- User (40h) → TAR-FLEX: Flextime — adds variety
- Maria (20h) → TAR-20H: Part-time
- Thomas (40h) → TAR-40H: Standard full-time
- Anna (35h) → TAR-38H: Short Friday — closest match to 35h

#### 2. EmployeeDayPlan Data
**File**: `apps/api/internal/auth/devemployeedayplans.go` (NEW)
**Changes**: Generate EmployeeDayPlans for all 5 employees for the full month of January 2026 (Jan 1-31)

Structure:
```go
package auth

type DevEmployeeDayPlan struct {
	ID         uuid.UUID
	EmployeeID uuid.UUID
	PlanDate   time.Time
	DayPlanID  *uuid.UUID // nil = off day (holiday/weekend)
	Source     string     // "tariff" or "holiday"
}

func generateDevEmployeeDayPlans() []DevEmployeeDayPlan { ... }
func GetDevEmployeeDayPlans() []DevEmployeeDayPlan { return generateDevEmployeeDayPlans() }
```

Generation logic for each day in January 2026:
1. Check if weekend (Saturday/Sunday) → DayPlanID = nil (Free), Source = "tariff"
2. Check if holiday (Jan 1 Neujahr, Jan 6 Heilige Drei Könige) → DayPlanID = nil, Source = "holiday"
3. Otherwise, look up employee's tariff → week plan → day plan for that weekday

**Employee → WeekPlan → DayPlan per weekday:**

| Employee | WeekPlan | Mon-Thu | Fri | Sat-Sun |
|----------|----------|---------|-----|---------|
| Admin | WEEK-40H | STD-8H (502) | STD-8H (502) | FREE (501) |
| User | WEEK-FLEX | FLEX-8H (504) | FLEX-8H (504) | FREE (501) |
| Maria | WEEK-20H | PART-4H (503) | PART-4H (503) | FREE (501) |
| Thomas | WEEK-40H | STD-8H (502) | STD-8H (502) | FREE (501) |
| Anna | WEEK-38H | STD-8H (502) | FRI-6H (505) | FREE (501) |

UUID range: 12000-12999 (baseID per employee: Admin=12000, User=12100, Maria=12200, Thomas=12300, Anna=12400)

Expected output: ~155 records (5 employees × 31 days)

For weekends and holidays, use `DayPlanID = nil` to indicate off-day. For weekday FREE day plans (like DayPlanFreeID), also use `DayPlanID = nil` since Free days are off-days.

Wait — correction: weekends should get `DayPlanID = &DayPlanFreeID` with Source "tariff" to match the week plan assignment. However, looking at the `EmployeeDayPlan.IsOffDay()` method, it returns `true` when `DayPlanID == nil`. And looking at how `AbsenceService` uses it at `absence.go:373-401`, it checks `IsOffDay()` to skip dates. So for weekends, we should set `DayPlanID = nil` to mark them as off-days.

Actually, let me reconsider. The FREE day plan (`DayPlanFreeID`, UUID 501) has `RegularHours: 0`. Setting `DayPlanID = &DayPlanFreeID` means the day has a plan (not nil), but the plan has 0 target hours. The `IsOffDay()` method checks for nil. The AbsenceService at `absence.go:373-401` probably checks `IsOffDay()` to skip off-days during absence range creation. If weekends have `DayPlanID = &DayPlanFreeID`, they won't be considered off-days by `IsOffDay()`, which is wrong.

So the correct approach: for weekends and holidays, set `DayPlanID = nil`. For workdays, set `DayPlanID` to the appropriate day plan from the week plan.

#### 3. AbsenceDay Data
**File**: `apps/api/internal/auth/devabsencedays.go` (NEW)
**Changes**: Define realistic absence scenarios

Structure:
```go
package auth

type DevAbsenceDay struct {
	ID              uuid.UUID
	EmployeeID      uuid.UUID
	AbsenceDate     time.Time
	AbsenceTypeID   uuid.UUID
	Duration        float64 // 1.0 or 0.5
	HalfDayPeriod   *string // "morning" or "afternoon"
	Status          string  // "pending", "approved", "rejected"
	ApprovedBy      *uuid.UUID
	ApprovedAt      *time.Time
	RejectionReason *string
	Notes           *string
	CreatedBy       *uuid.UUID
}

var DevAbsenceDays = []DevAbsenceDay{...}
func GetDevAbsenceDays() []DevAbsenceDay { return DevAbsenceDays }
```

**Scenarios** (all in January 2026, last week — days without existing bookings):

| # | Employee | Date(s) | Type | Status | Notes |
|---|----------|---------|------|--------|-------|
| 1 | Admin | Jan 26 (Mon) | U - Urlaub | approved | 3-day vacation block |
| 2 | Admin | Jan 27 (Tue) | U - Urlaub | approved | |
| 3 | Admin | Jan 28 (Wed) | U - Urlaub | approved | |
| 4 | User | Jan 29 (Thu) | K - Krankheit | pending | Pending sick day |
| 5 | Maria | Jan 29 (Thu) | U - Urlaub | pending | 2-day pending vacation |
| 6 | Maria | Jan 30 (Fri) | U - Urlaub | pending | |
| 7 | Thomas | Jan 26 (Mon) | KK - Kind krank | approved | Child sick care |
| 8 | Thomas | Jan 30 (Fri) | U - Urlaub | pending | Pending vacation |
| 9 | Anna | Jan 27 (Tue) | UH - Urlaub halb | approved | Half-day afternoon |
| 10 | Anna | Jan 28 (Wed) | K - Krankheit | rejected | Rejected sick day |

Absence type UUIDs (from `devabsencetypes.go`):
- U (Urlaub): `00000000-0000-0000-0000-000000000301`
- UH (Urlaub halb): `00000000-0000-0000-0000-000000000302`
- K (Krankheit): `00000000-0000-0000-0000-000000000303`
- KK (Kind krank): `00000000-0000-0000-0000-000000000305`

For approved absences:
- `ApprovedBy` = `DevUserAdminID` (`00000000-0000-0000-0000-000000000001`)
- `ApprovedAt` = `time.Date(2026, 1, 24, 10, 0, 0, 0, time.UTC)` (approved on Jan 24)

For rejected absence (Anna Jan 28):
- `RejectionReason` = `"Insufficient staffing on this date"`

UUID range: 15000-15099 (static, 10 records)

This gives the approvals dashboard:
- **Pending tab**: User sick (1), Maria vacation (2), Thomas vacation (1) = 4 entries
- **Approved tab**: Admin vacation (3), Thomas child sick (1), Anna half-vacation (1) = 5 entries
- **Rejected tab**: Anna sick (1) = 1 entry

#### 4. VacationBalance Data
**File**: `apps/api/internal/auth/devvacationbalances.go` (NEW)
**Changes**: Define 2026 vacation balances for all 5 employees

Structure:
```go
package auth

type DevVacationBalance struct {
	ID          uuid.UUID
	EmployeeID  uuid.UUID
	Year        int
	Entitlement float64
	Carryover   float64
	Adjustments float64
	Taken       float64
}

var DevVacationBalances = []DevVacationBalance{...}
func GetDevVacationBalances() []DevVacationBalance { return DevVacationBalances }
```

**Balance Data** (year 2026):

| Employee | Entitlement | Carryover | Adjustments | Taken | Available |
|----------|-------------|-----------|-------------|-------|-----------|
| Admin | 30.0 | 3.0 | 0.0 | 3.0 | 30.0 |
| User | 28.0 | 5.0 | 0.0 | 0.0 | 33.0 |
| Maria | 15.0 | 2.0 | 0.0 | 0.0 | 17.0 |
| Thomas | 30.0 | 0.0 | 0.0 | 0.0 | 30.0 |
| Anna | 32.0 | 4.0 | 0.0 | 0.5 | 35.5 |

Notes:
- Admin: 3 days taken (3 approved vacation days Jan 26-28)
- User: 0 taken (sick day is pending, doesn't deduct vacation; K doesn't deduct anyway)
- Maria: 0 taken (vacation is pending)
- Thomas: 0 taken (KK doesn't deduct vacation)
- Anna: 0.5 taken (half-day approved vacation)

UUID range: 16000-16004 (static, 5 records)

#### 5. Account Data
**File**: `apps/api/internal/auth/devaccounts.go` (NEW)
**Changes**: Define 6 tenant-specific accounts

Structure:
```go
package auth

type DevAccount struct {
	ID          uuid.UUID
	Code        string
	Name        string
	AccountType string // "bonus", "tracking", "balance"
	Unit        string // "minutes", "hours", "days"
}

var DevAccounts = []DevAccount{...}
func GetDevAccounts() []DevAccount { return DevAccounts }
```

**Account Data** (tenant-specific, not system):

| UUID | Code | Name | Type | Unit |
|------|------|------|------|------|
| ...1101 | NIGHT | Night Shift Bonus | bonus | minutes |
| ...1102 | SAT | Saturday Bonus | bonus | minutes |
| ...1103 | SUN | Sunday/Holiday Bonus | bonus | minutes |
| ...1104 | ONCALL | On-Call Duty | tracking | minutes |
| ...1105 | TRAVEL | Travel Time | tracking | minutes |
| ...1106 | SICK | Sick Leave Balance | balance | days |

UUID range: 1101-1106 (static, 6 records)

### Success Criteria:

#### Automated Verification:
- [x] Build compiles: `cd apps/api && go build ./...`
- [x] All new files parse correctly (no syntax errors)

---

## Phase 3: Wire Dependencies into AuthHandler

### Overview
Add new repository interfaces to `auth.go`, extend `AuthHandler` struct and constructor, and update `main.go` wiring.

### Changes Required:

#### 1. Add Repo Interfaces
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add 3 new interfaces after the existing ones (line 30)

```go
// empDayPlanRepoForAuth defines the interface for employee day plan data access in auth handler.
type empDayPlanRepoForAuth interface {
	BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
}

// absenceDayRepoForAuth defines the interface for absence day data access in auth handler.
type absenceDayRepoForAuth interface {
	Upsert(ctx context.Context, ad *model.AbsenceDay) error
}

// vacationBalanceRepoForAuth defines the interface for vacation balance data access in auth handler.
type vacationBalanceRepoForAuth interface {
	Upsert(ctx context.Context, balance *model.VacationBalance) error
}

// accountRepoForAuth defines the interface for account data access in auth handler.
type accountRepoForAuth interface {
	Upsert(ctx context.Context, account *model.Account) error
}
```

#### 2. Extend AuthHandler Struct
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add 4 new fields to `AuthHandler` struct (after line 49)

```go
empDayPlanRepo      empDayPlanRepoForAuth
absenceDayRepo      absenceDayRepoForAuth
vacationBalanceRepo vacationBalanceRepoForAuth
accountRepo         accountRepoForAuth
```

#### 3. Update Constructor
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add 4 new parameters to `NewAuthHandler` and assign them

Parameters (after `monthlyValueRepo` at line 69):
```go
empDayPlanRepo empDayPlanRepoForAuth,
absenceDayRepo absenceDayRepoForAuth,
vacationBalanceRepo vacationBalanceRepoForAuth,
accountRepo accountRepoForAuth,
```

Assignments (after `monthlyValueRepo` at line 87):
```go
empDayPlanRepo:      empDayPlanRepo,
absenceDayRepo:      absenceDayRepo,
vacationBalanceRepo: vacationBalanceRepo,
accountRepo:         accountRepo,
```

#### 4. Update main.go Wiring
**File**: `apps/api/cmd/server/main.go`
**Changes**: Pass the 4 new repos to `NewAuthHandler` call (after line 147)

```go
authHandler := handler.NewAuthHandler(
	authConfig,
	jwtManager,
	userService,
	tenantService,
	employeeService,
	bookingTypeService,
	absenceService,
	holidayService,
	dayPlanService,
	weekPlanService,
	tariffService,
	departmentService,
	teamService,
	bookingRepo,
	dailyValueRepo,
	monthlyValueRepo,
	empDayPlanRepo,      // NEW
	absenceDayRepo,      // NEW
	vacationBalanceRepo, // NEW
	accountRepo,         // NEW
)
```

All 4 repos are already initialized earlier in `main.go`:
- `empDayPlanRepo` at line 102
- `absenceDayRepo` at line 111
- `vacationBalanceRepo` at line 117
- `accountRepo` at line 71

### Success Criteria:

#### Automated Verification:
- [x] Build compiles: `cd apps/api && go build ./...`
- [x] Existing tests pass: `cd apps/api && go test ./...`

---

## Phase 4: Integrate Seeding into DevLogin

### Overview
Add seeding calls to `DevLogin` handler for all new entities in the correct dependency order.

### Changes Required:

#### 1. Set Employee TariffID
**File**: `apps/api/internal/handler/auth.go`
**Changes**: In the employee seeding loop (lines 128-146), set TariffID from `DevEmployeeTariffMap`

```go
for _, devEmp := range auth.GetDevEmployees() {
	emp := &model.Employee{
		TenantID:            devTenant.ID,
		PersonnelNumber:     devEmp.PersonnelNumber,
		PIN:                 devEmp.PIN,
		FirstName:           devEmp.FirstName,
		LastName:            devEmp.LastName,
		Email:               devEmp.Email,
		EntryDate:           devEmp.EntryDate,
		WeeklyHours:         decimal.NewFromFloat(devEmp.WeeklyHours),
		VacationDaysPerYear: decimal.NewFromFloat(devEmp.VacationDays),
		IsActive:            true,
	}
	emp.ID = devEmp.ID
	// Set tariff assignment
	if tariffID, ok := auth.DevEmployeeTariffMap[devEmp.ID]; ok {
		emp.TariffID = &tariffID
	}
	if err := h.employeeService.UpsertDevEmployee(r.Context(), emp); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev employees to database")
		return
	}
}
```

#### 2. Activate Absence Type Seeding
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Replace the comment at lines 175-176 with actual seeding

```go
// Create all dev absence types (tenant-level, idempotent)
for _, devAT := range auth.GetDevAbsenceTypes() {
	desc := devAT.Description
	at := &model.AbsenceType{
		ID:              devAT.ID,
		TenantID:        &devTenant.ID,
		Code:            devAT.Code,
		Name:            devAT.Name,
		Description:     &desc,
		Category:        model.AbsenceCategory(devAT.Category),
		Portion:         model.AbsencePortion(devAT.Portion),
		DeductsVacation: devAT.DeductsVacation,
		Color:           devAT.Color,
		SortOrder:       devAT.SortOrder,
		IsSystem:        false,
		IsActive:        true,
	}
	if err := h.absenceService.UpsertDevAbsenceType(r.Context(), at); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev absence types to database")
		return
	}
}
```

Note: These are seeded as tenant-level types (`TenantID = &devTenant.ID`) alongside the system-level types from migration. This gives us deterministic UUIDs we can reference in AbsenceDay records.

#### 3. Seed EmployeeDayPlans (after tariffs, line ~270)
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add after tariff seeding, before department seeding

Insert after the tariff seeding block (after line 269):

```go
// Create all dev employee day plans (idempotent via BulkCreate with ON CONFLICT)
devDayPlans := auth.GetDevEmployeeDayPlans()
if len(devDayPlans) > 0 {
	plans := make([]model.EmployeeDayPlan, 0, len(devDayPlans))
	for _, devEDP := range devDayPlans {
		plans = append(plans, model.EmployeeDayPlan{
			ID:         devEDP.ID,
			TenantID:   devTenant.ID,
			EmployeeID: devEDP.EmployeeID,
			PlanDate:   devEDP.PlanDate,
			DayPlanID:  devEDP.DayPlanID,
			Source:     model.EmployeeDayPlanSource(devEDP.Source),
		})
	}
	if err := h.empDayPlanRepo.BulkCreate(r.Context(), plans); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev employee day plans to database")
		return
	}
}
```

#### 4. Seed Accounts (after team members, line ~320)
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add after team member seeding

Insert after the team members seeding block:

```go
// Create all dev accounts (tenant-level, idempotent)
for _, devAcct := range auth.GetDevAccounts() {
	acct := &model.Account{
		ID:          devAcct.ID,
		TenantID:    &devTenant.ID,
		Code:        devAcct.Code,
		Name:        devAcct.Name,
		AccountType: model.AccountType(devAcct.AccountType),
		Unit:        model.AccountUnit(devAcct.Unit),
		IsSystem:    false,
		IsActive:    true,
	}
	if err := h.accountRepo.Upsert(r.Context(), acct); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev accounts to database")
		return
	}
}
```

#### 5. Seed AbsenceDays (after monthly values, line ~398)
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add after monthly values seeding

Insert after the monthly values seeding block:

```go
// Create all dev absence days (idempotent)
for _, devAD := range auth.GetDevAbsenceDays() {
	ad := &model.AbsenceDay{
		ID:            devAD.ID,
		TenantID:      devTenant.ID,
		EmployeeID:    devAD.EmployeeID,
		AbsenceDate:   devAD.AbsenceDate,
		AbsenceTypeID: devAD.AbsenceTypeID,
		Duration:      decimal.NewFromFloat(devAD.Duration),
		HalfDayPeriod: (*model.HalfDayPeriod)(devAD.HalfDayPeriod),
		Status:        model.AbsenceStatus(devAD.Status),
		ApprovedBy:    devAD.ApprovedBy,
		ApprovedAt:    devAD.ApprovedAt,
		RejectionReason: devAD.RejectionReason,
		Notes:         devAD.Notes,
		CreatedBy:     devAD.CreatedBy,
	}
	if err := h.absenceDayRepo.Upsert(r.Context(), ad); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev absence days to database")
		return
	}
}
```

#### 6. Seed VacationBalances (after absence days)
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add after absence day seeding

```go
// Create all dev vacation balances (idempotent)
for _, devVB := range auth.GetDevVacationBalances() {
	vb := &model.VacationBalance{
		ID:          devVB.ID,
		TenantID:    devTenant.ID,
		EmployeeID:  devVB.EmployeeID,
		Year:        devVB.Year,
		Entitlement: decimal.NewFromFloat(devVB.Entitlement),
		Carryover:   decimal.NewFromFloat(devVB.Carryover),
		Adjustments: decimal.NewFromFloat(devVB.Adjustments),
		Taken:       decimal.NewFromFloat(devVB.Taken),
	}
	if err := h.vacationBalanceRepo.Upsert(r.Context(), vb); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev vacation balances to database")
		return
	}
}
```

### Final Seeding Order in DevLogin:

| # | Entity | Method | Records |
|---|--------|--------|---------|
| 1 | Tenant | tenantService.UpsertDevTenant() | 1 |
| 2 | User | userService.UpsertDevUser() | 1 |
| 3 | Employees (+ TariffID) | employeeService.UpsertDevEmployee() | 5 |
| 4 | User→Employee link | userService.LinkUserToEmployee() | 1 |
| 5 | Booking Types | bookingTypeService.UpsertDevBookingType() | 6 |
| 6 | **Absence Types** | **absenceService.UpsertDevAbsenceType()** | **10** |
| 7 | Holidays | holidayService.UpsertDevHoliday() | 13 |
| 8 | Day Plans | dayPlanService.UpsertDevDayPlan() | 5 |
| 9 | Week Plans | weekPlanService.UpsertDevWeekPlan() | 4 |
| 10 | Tariffs | tariffService.UpsertDevTariff() | 6 |
| 11 | **Employee Day Plans** | **empDayPlanRepo.BulkCreate()** | **~155** |
| 12 | Departments | departmentService.UpsertDevDepartment() | 7 |
| 13 | Teams | teamService.UpsertDevTeam() | 5 |
| 14 | Team Members | teamService.UpsertDevTeamMember() | 8 |
| 15 | **Accounts** | **accountRepo.Upsert()** | **6** |
| 16 | Bookings | bookingRepo.Upsert() | ~340 |
| 17 | Daily Values | dailyValueRepo.Upsert() | ~85 |
| 18 | Monthly Values | monthlyValueRepo.Upsert() | ~65 |
| 19 | **Absence Days** | **absenceDayRepo.Upsert()** | **10** |
| 20 | **Vacation Balances** | **vacationBalanceRepo.Upsert()** | **5** |

**Bold** = new additions

### Success Criteria:

#### Automated Verification:
- [x] Build compiles: `cd apps/api && go build ./...`
- [x] All tests pass: `cd apps/api && go test ./...`

#### Manual Verification:
- [ ] Dev login succeeds: `curl http://localhost:8080/api/v1/auth/dev/login?role=admin`
- [ ] Calling dev login a second time succeeds (idempotent)
- [ ] `/admin/approvals` shows pending, approved, and rejected absence entries
- [ ] `/admin/accounts` shows 6 tenant accounts + 3 system accounts
- [ ] `GET /employees/{admin-id}/vacation-balance` returns balance with 30.0 entitlement, 3.0 taken
- [ ] Absence creation via API works (EmployeeDayPlans allow it to determine working days)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
- No new unit tests required for this change — the Upsert methods follow established patterns that are implicitly tested by dev login
- Existing tests must continue to pass

### Manual Testing Steps:
1. `make dev` to start services
2. Login via `curl http://localhost:8080/api/v1/auth/dev/login?role=admin` — should succeed
3. Login again — should succeed (idempotent)
4. Check approvals page shows data
5. Check accounts page shows tenant + system accounts
6. Check vacation balance endpoint returns data
7. Try creating an absence via the UI — should work now that EmployeeDayPlans exist

## References

- Research: `thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md`
- DevLogin handler: `apps/api/internal/handler/auth.go:93-421`
- Main wiring: `apps/api/cmd/server/main.go:131-148`
- Employee data: `apps/api/internal/auth/devemployees.go`
- Absence type data: `apps/api/internal/auth/devabsencetypes.go`
- EmployeeDayPlan repo: `apps/api/internal/repository/employeedayplan.go:104-125`
- VacationBalance repo: `apps/api/internal/repository/vacationbalance.go:65-74`
- AbsenceDay migration: `db/migrations/000026_create_absence_days.up.sql`
- Account migration: `db/migrations/000006_create_accounts.up.sql`
