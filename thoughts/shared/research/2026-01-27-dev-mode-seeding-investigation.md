---
date: 2026-01-27T12:15:00+01:00
researcher: Claude
git_commit: 7467879c158132365d0762639ebd876d7cf6237b
branch: master
repository: terp
topic: "Dev mode seeding investigation - how data is seeded for admin/user dev accounts"
tags: [research, codebase, dev-mode, seeding, auth, dev-data]
status: complete
last_updated: 2026-01-27
last_updated_by: Claude
---

# Research: Dev Mode Seeding Investigation

**Date**: 2026-01-27T12:15:00+01:00
**Researcher**: Claude
**Git Commit**: 7467879c158132365d0762639ebd876d7cf6237b
**Branch**: master
**Repository**: terp

## Research Question

How does dev mode data seeding work? How is data seeded when logging in with admin or user dev mode accounts? What patterns exist for seeding realistic, relationally-consistent data?

## Summary

Dev mode seeding is triggered **on every dev login request** (`GET /api/v1/auth/dev/login?role=admin|user`). The `DevLogin()` handler in `handler/auth.go` orchestrates the creation of ~540+ records across 14 entity types in a specific order to satisfy foreign key constraints. All operations are idempotent (upsert-based). Dev data definitions live in `apps/api/internal/auth/dev*.go` files (14 files) using deterministic UUIDs for cross-entity referencing. Both admin and user roles trigger the exact same seeding — only the JWT token role differs.

## Detailed Findings

### 1. Dev Mode Detection Flow

**Environment → Config → Auth Config → Routes**

1. `ENV=development` set in `docker/docker-compose.yml`
2. `config.Load()` reads ENV, defaults to `"development"` (`config/config.go:29-31`)
3. `IsDevelopment()` returns `true` when `c.Env == "development"` (`config/config.go:53-56`)
4. `main.go:36-43` creates `auth.Config{DevMode: cfg.IsDevelopment()}`
5. `handler/routes.go:11-16` conditionally registers dev endpoints:
   ```go
   if devMode {
       r.Get("/auth/dev/login", h.DevLogin)
       r.Get("/auth/dev/users", h.DevUsers)
   }
   ```
6. On startup, logs: `"Running in dev mode - use /api/v1/auth/dev/login?role=admin|user"` (`main.go:52-54`)

### 2. Dev User Accounts

**File**: `apps/api/internal/auth/devusers.go`

Two predefined users with deterministic UUIDs:

| Role  | UUID                                   | Email             | Display Name |
|-------|----------------------------------------|-------------------|--------------|
| admin | `00000000-0000-0000-0000-000000000001` | admin@dev.local   | Dev Admin    |
| user  | `00000000-0000-0000-0000-000000000002` | user@dev.local    | Dev User     |

- `GetDevUser(role string)` returns the matching user
- Both roles trigger identical seeding — only JWT claims differ

### 3. Seeding Trigger & Orchestration

**File**: `apps/api/internal/handler/auth.go:91-421` — `DevLogin()` handler

Seeding is **not** triggered on server startup. It happens on every call to `/auth/dev/login`. All operations use upsert (safe to call repeatedly).

**Seeding order** (critical for FK dependencies):

| Order | Entity        | Source File         | Service Method            | Records |
|-------|---------------|---------------------|---------------------------|---------|
| 1     | Tenant        | `devtenant.go`      | `UpsertDevTenant()`       | 1       |
| 2     | User          | `devusers.go`       | `UpsertDevUser()`         | 1*      |
| 3     | Employees     | `devemployees.go`   | `UpsertDevEmployee()`     | 5       |
| 4     | User→Employee | `devemployees.go`   | `LinkUserToEmployee()`    | 1*      |
| 5     | Booking Types | `devbookingtypes.go`| `UpsertDevBookingType()`  | 6       |
| 6     | Holidays      | `devholidays.go`    | `UpsertDevHoliday()`      | 13      |
| 7     | Day Plans     | `devdayplans.go`    | `UpsertDevDayPlan()`      | 5       |
| 8     | Week Plans    | `devweekplans.go`   | `UpsertDevWeekPlan()`     | 4       |
| 9     | Tariffs       | `devtariffs.go`     | `UpsertDevTariff()`       | 6       |
| 10    | Departments   | `devdepartments.go` | `UpsertDevDepartment()`   | 7       |
| 11    | Teams         | `devteams.go`       | `UpsertDevTeam()`         | 5       |
| 12    | Team Members  | `devteams.go`       | `UpsertDevTeamMember()`   | 8       |
| 13    | Bookings      | `devbookings.go`    | `bookingRepo.Upsert()`    | ~340    |
| 14    | Daily Values  | `devdailyvalues.go` | `dailyValueRepo.Upsert()` | ~85     |
| 15    | Monthly Values| `devmonthlyvalues.go`| `monthlyValueRepo.Upsert()` | ~65  |

*Per login (only the logged-in user is seeded/linked)

**Note**: Items 13-15 bypass the service layer and use repository `Upsert()` directly to avoid triggering recalculation side effects.

### 4. Dev Data Definition Patterns

All dev data files are in `apps/api/internal/auth/`:

```
apps/api/internal/auth/
├── devabsencetypes.go     # Absence types
├── devbookings.go         # Bookings (~340 records, generated)
├── devbookingtypes.go     # Booking types (6 records)
├── devdailyvalues.go      # Daily values (~85 records, generated)
├── devdayplans.go         # Day plans (5 records)
├── devdepartments.go      # Departments (7 records, hierarchical)
├── devemployees.go        # Employees (5 records) + user-employee map
├── devholidays.go         # Holidays (13 records, Bavaria 2026)
├── devmonthlyvalues.go    # Monthly values (~65 records, 3-phase generated)
├── devtariffs.go          # Tariffs (6 records)
├── devteams.go            # Teams (5) + members (8)
├── devtenant.go           # Tenant (1 record)
├── devusers.go            # Users (2 records)
└── devweekplans.go        # Week plans (4 records)
```

#### Pattern A: Static Predefined Data (most entities)

Used by: Employees, Departments, Day Plans, Week Plans, Tariffs, Holidays, Booking Types, Teams

```go
// Exported UUIDs for cross-referencing
var DevEmployeeAdminID = uuid.MustParse("00000000-0000-0000-0000-000000000011")

// Custom struct (not the model, for dev data definition)
type DevEmployee struct {
    ID              uuid.UUID
    PersonnelNumber string
    FirstName       string
    // ...
}

// Static slice
var DevEmployees = []DevEmployee{...}

// Getter function
func GetDevEmployees() []DevEmployee { return DevEmployees }
```

The handler maps `DevEmployee` → `model.Employee` before passing to the service layer.

#### Pattern B: Generated Data with Realistic Patterns (bookings, daily/monthly values)

Used by: Bookings, Daily Values, Monthly Values

```go
// Generated programmatically
func generateDevBookings() []DevBooking {
    // Define work patterns per employee
    // Generate clock in/out + break pairs for each workday
    // Use deterministic UUIDs from integer offsets
}

func GetDevBookings() []DevBooking { return generateDevBookings() }
```

**Bookings** (`devbookings.go:36-472`): Generates realistic time-tracking entries for 5 employees across January 2026 workdays. Each employee has different patterns:
- Admin: Standard 8-17, 30min break, one missing-break error day
- User: Standard 9-18, 30min break, one missing clock-out error day
- Maria: Part-time 9-13, no break needed
- Thomas: Early starter 7:30-16:00, 30min break
- Anna: 8-15 schedule, 30min break

**Monthly Values** (`devmonthlyvalues.go:41-482`): Three-phase generation:
1. `generate2025JanToNovValues()` — config-driven historical data with realistic vacation/sick/flextime patterns
2. `generateDecember2025Values()` — hardcoded closed month that bridges to January
3. `computeJanuary2026FromDailyValues()` — aggregated from actual daily value data for consistency

#### Pattern C: Relationship Mapping

```go
// User → Employee mapping (devemployees.go:98-112)
var DevUserEmployeeMap = map[uuid.UUID]uuid.UUID{
    DevUserAdminID: DevEmployeeAdminID,
    DevUserUserID:  DevEmployeeUserID,
}

// Department hierarchy (devdepartments.go:28-88)
{ID: DeptITID, ParentID: &DeptCompanyID, ManagerEmployeeID: &DevEmployeeAdminID}

// Team membership (devteams.go:73-88)
{TeamID: TeamBackendID, EmployeeID: DevEmployeeAdminID, Role: "lead"}
```

### 5. UUID Strategy

All dev data uses deterministic UUIDs in the format `00000000-0000-0000-0000-{12-digit-number}`, organized by entity type ranges:

| Entity       | Range      | Example                                    |
|-------------|------------|---------------------------------------------|
| Users        | 1-99       | `00000000-0000-0000-0000-000000000001`     |
| Employees    | 11-20      | `00000000-0000-0000-0000-000000000011`     |
| Tenant       | 100-199    | `00000000-0000-0000-0000-000000000100`     |
| Booking Types| 201-299    | `00000000-0000-0000-0000-000000000201`     |
| Holidays     | 401-499    | `00000000-0000-0000-0000-000000000401`     |
| Day Plans    | 501-599    | `00000000-0000-0000-0000-000000000501`     |
| Week Plans   | 601-699    | `00000000-0000-0000-0000-000000000601`     |
| Tariffs      | 701-799    | `00000000-0000-0000-0000-000000000701`     |
| Departments  | 801-899    | `00000000-0000-0000-0000-000000000801`     |
| Teams        | 901-999    | `00000000-0000-0000-0000-000000000901`     |
| Bookings     | 1000-8999  | Generated via `uuidFromInt()`              |
| Daily Values | 3000-8999  | Generated via `uuidFromInt()`              |
| Monthly Values| 5000-10999| Generated via `uuidFromInt()`              |

Dynamic generation helper (`devbookings.go:447-467`):
```go
func uuidFromInt(i int) string {
    return uuid.MustParse("00000000-0000-0000-0000-" + padInt(i)).String()
}
```

### 6. Service Layer Upsert Pattern

All services implement `UpsertDev{Entity}` methods that delegate to repository `Upsert`:

```go
// service/employee.go:425-428
func (s *EmployeeService) UpsertDevEmployee(ctx context.Context, emp *model.Employee) error {
    return s.employeeRepo.Upsert(ctx, emp)
}
```

Repository upsert uses GORM patterns:

```go
// Pattern 1: FirstOrCreate with Assign (user.go:130-135)
r.db.GORM.WithContext(ctx).Where("id = ?", user.ID).Assign(user).FirstOrCreate(user).Error

// Pattern 2: Save (booking.go:274-276) — INSERT ON CONFLICT UPDATE
r.db.GORM.WithContext(ctx).Save(booking).Error
```

### 7. Entity Relationships (for realistic seeding)

**Employee** is the central hub, referenced by:
- `Booking.EmployeeID`, `DailyValue.EmployeeID`, `MonthlyValue.EmployeeID`
- `AbsenceDay.EmployeeID`, `VacationBalance.EmployeeID`
- `TeamMember.EmployeeID`, `Department.ManagerEmployeeID`, `Team.LeaderEmployeeID`
- `EmployeeDayPlan.EmployeeID`

**Employee** references:
- `TenantID` → Tenant, `DepartmentID` → Department, `TariffID` → Tariff, `CostCenterID` → CostCenter

**Tariff** references: `WeekPlanID` → WeekPlan
**WeekPlan** references: `MondayDayPlanID` through `SundayDayPlanID` → DayPlan
**Department** self-references: `ParentID` → Department (hierarchy)
**Team** references: `DepartmentID` → Department
**Booking** references: `EmployeeID` → Employee, `BookingTypeID` → BookingType, `PairID` → Booking (self)

### 8. What is NOT Currently Seeded

Entities that exist in the model layer but are not seeded by `DevLogin()`:
- **AbsenceDay** — absence types are seeded but no absence day records
- **VacationBalance** — no vacation balance records
- **EmployeeDayPlan** — no employee-specific day plan overrides
- **CostCenter** — no cost centers
- **EmploymentType** — no employment types
- **Account** — system accounts created by migration `000006_create_accounts.up.sql`
- **UserGroup** — no user groups
- **EmployeeContact** — no employee contact records
- **EmployeeCard** — no employee card records

## Code References

- `apps/api/internal/handler/auth.go:91-421` — DevLogin handler orchestrating all seeding
- `apps/api/internal/handler/routes.go:11-16` — Dev route registration
- `apps/api/internal/auth/devusers.go` — Dev user definitions
- `apps/api/internal/auth/devemployees.go` — Employee definitions + user-employee map
- `apps/api/internal/auth/devbookings.go` — Generated booking data (~340 records)
- `apps/api/internal/auth/devdailyvalues.go` — Generated daily value data (~85 records)
- `apps/api/internal/auth/devmonthlyvalues.go` — 3-phase generated monthly values (~65 records)
- `apps/api/internal/auth/devdepartments.go` — Hierarchical department structure
- `apps/api/internal/auth/devteams.go` — Teams + team member mappings
- `apps/api/internal/auth/devtariffs.go` — Tariff configurations
- `apps/api/internal/auth/devdayplans.go` — Day plan schedules
- `apps/api/internal/auth/devweekplans.go` — Week plan configurations
- `apps/api/internal/auth/devholidays.go` — Bavarian holidays 2026
- `apps/api/internal/auth/devbookingtypes.go` — Booking type definitions
- `apps/api/internal/auth/devabsencetypes.go` — Absence type definitions
- `apps/api/internal/config/config.go:29-56` — Environment detection
- `apps/api/cmd/server/main.go:36-54` — Auth config setup + dev mode logging

## Architecture Documentation

### Seeding Architecture

```
┌─────────────────────────────────────────────────────────┐
│  GET /auth/dev/login?role=admin|user                    │
│  handler/auth.go:DevLogin()                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. auth/devtenant.go    → tenantService.UpsertDev...   │
│  2. auth/devusers.go     → userService.UpsertDev...     │
│  3. auth/devemployees.go → employeeService.UpsertDev... │
│  4. auth/devemployees.go → userService.LinkUser...      │
│  5. auth/devbookingtypes → bookingTypeService.Upsert... │
│  6. auth/devholidays.go  → holidayService.UpsertDev...  │
│  7. auth/devdayplans.go  → dayPlanService.UpsertDev...  │
│  8. auth/devweekplans.go → weekPlanService.UpsertDev... │
│  9. auth/devtariffs.go   → tariffService.UpsertDev...   │
│ 10. auth/devdepartments  → departmentService.Upsert...  │
│ 11. auth/devteams.go     → teamService.UpsertDev...     │
│ 12. auth/devteams.go     → teamService.UpsertDevMember  │
│ 13. auth/devbookings.go  → bookingRepo.Upsert()        │ ← Direct repo
│ 14. auth/devdailyvalues  → dailyValueRepo.Upsert()     │ ← Direct repo
│ 15. auth/devmonthlyvalues→ monthlyValueRepo.Upsert()   │ ← Direct repo
│                                                         │
│  → Generate JWT token                                   │
│  → Set cookie + return response                         │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Seeding on login, not startup**: Database can be empty at boot; seeded on first auth
- **Idempotent upserts**: Safe to call repeatedly without duplicating data
- **Deterministic UUIDs**: Cross-entity references resolved at definition time
- **Service bypass for computed data**: Bookings/daily/monthly values use repo directly to avoid recalculation triggers
- **Both roles seed the same data**: Admin and user logins produce identical datasets; only JWT role differs

## Historical Context (from thoughts/)

70+ documents reference dev mode seeding in various contexts:
- `thoughts/shared/research/2026-01-25-NOK-216-implement-authentication-flow.md` — Documents the authentication flow including dev login
- `thoughts/shared/research/2026-01-26-NOK-232-absence-type-configuration.md` — References dev absence type seeding
- `thoughts/shared/plans/2026-01-26-NOK-233-monthly-evaluation-view.md` — Monthly evaluation requiring seeded monthly values
- `thoughts/shared/plans/2026-01-26-NOK-234-year-overview.md` — Year overview requiring full year of seeded data
- Multiple ticket plans (TICKET-052 through TICKET-069) document model/migration/repository patterns used by seeding

## Open Questions

- Absence days, vacation balances, employee contacts, employee cards, cost centers, employment types, and user groups are not currently seeded — these entities exist in the model but have no `dev*.go` data definition files
- The seeding does not differentiate between admin and user login in terms of what data is created — both produce the same dataset
- No mechanism exists to seed data for a specific scenario (e.g., "employee with pending absences" or "employee with overtime")
