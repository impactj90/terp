---
date: 2026-01-22T00:00:00+01:00
researcher: Claude
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "ZMI Clone Progress Assessment and Ticket Quality Review"
tags: [research, codebase, progress-assessment, zmi-clone, tickets]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: ZMI Clone Progress Assessment and Ticket Quality Review

**Date**: 2026-01-22
**Researcher**: Claude
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

How far along is the ZMI Time clone project, and are the tickets in `thoughts/shared/plans/tickets/` accurately reflecting the project state?

## Summary

The project is approximately **50-55% complete** based on ZMI manual feature coverage. The core foundation is solid, but significant discrepancies exist between:
1. What's actually implemented in code vs what tickets say
2. The ticket INDEX.md structure vs actual ticket files
3. Ticket completion status markers

**Key Findings:**
- **24 database migrations** completed (all core tables through daily_values)
- **18 domain models** fully implemented
- **Complete calculation engine** (pairing, tolerance, rounding, breaks)
- **12+ tickets completed but not marked as DONE**
- INDEX.md ticket numbering is **completely misaligned** with actual ticket files

---

## Detailed Findings

### 1. Implementation Progress by Layer

#### 1.1 Database Migrations (24/24 Core Complete)

| Migration | Table | Status |
|-----------|-------|--------|
| 000001 | users | Done |
| 000002 | tenants | Done |
| 000003 | holidays | Done |
| 000004 | cost_centers | Done |
| 000005 | employment_types | Done |
| 000006 | accounts | Done |
| 000007 | user_groups | Done |
| 000008 | users (multitenancy) | Done |
| 000009 | departments | Done |
| 000010 | teams, team_members | Done |
| 000011 | employees | Done |
| 000012 | employee_contacts | Done |
| 000013 | employee_cards | Done |
| 000014 | FK links | Done |
| 000015 | day_plans | Done |
| 000016 | day_plan_breaks | Done |
| 000017 | day_plan_bonuses | Done |
| 000018 | week_plans | Done |
| 000019 | tariffs | Done |
| 000020 | tariff_breaks | Done |
| 000021 | booking_types | Done |
| 000022 | bookings | Done |
| 000023 | employee_day_plans | Done |
| 000024 | daily_values | Done |

**Missing Migrations (from ZMI manual):**
- absence_types (TICKET-074)
- absences (TICKET-076)
- vacation_balances (TICKET-080)
- monthly_values (not in tickets)
- monthly_evaluations (TICKET-087)
- corrections (TICKET-092)
- account_values (TICKET-096)
- audit_logs (TICKET-099)
- reports (TICKET-103)
- payroll_exports (TICKET-107)

#### 1.2 Models Implemented (18)

| Model | File | Relationships |
|-------|------|---------------|
| Tenant | tenant.go | Root entity |
| User | user.go | → Tenant, UserGroup, Employee |
| UserGroup | usergroup.go | → Tenant |
| Employee | employee.go | → Department, CostCenter, EmploymentType |
| EmployeeContact | employee.go | → Employee |
| EmployeeCard | employee.go | → Employee |
| Department | department.go | Self-referential hierarchy |
| Team | team.go | → Department |
| TeamMember | team.go | → Team, Employee |
| CostCenter | costcenter.go | → Tenant |
| EmploymentType | employmenttype.go | → Tenant |
| Holiday | holiday.go | → Tenant, Department |
| Account | account.go | → Tenant (optional) |
| DayPlan | dayplan.go | → DayPlanBreak[], DayPlanBonus[] |
| DayPlanBreak | dayplan.go | → DayPlan |
| DayPlanBonus | dayplan.go | → DayPlan, Account |
| WeekPlan | weekplan.go | → DayPlan (7x) |
| Tariff | tariff.go | → WeekPlan, TariffBreak[] |
| TariffBreak | tariff.go | → Tariff |
| BookingType | bookingtype.go | → Tenant (optional) |
| Booking | booking.go | → Employee, BookingType |
| EmployeeDayPlan | employeedayplan.go | → Employee, DayPlan |
| DailyValue | dailyvalue.go | → Employee |

#### 1.3 Repositories (16)

All models have corresponding repositories with standard CRUD plus specialized queries (e.g., `GetByEmployeeDate`, `Upsert`, `BulkCreate`).

#### 1.4 Services & Handlers (Complete for Core Entities)

| Entity | Service | Handler | Endpoints |
|--------|---------|---------|-----------|
| Auth | (UserService) | auth.go | /auth/* |
| User | user.go | user.go | /users/* |
| Tenant | tenant.go | tenant.go | /tenants/* |
| Department | department.go | department.go | /departments/* |
| Team | team.go | team.go | /teams/* |
| Employee | employee.go | employee.go | /employees/* |
| CostCenter | costcenter.go | costcenter.go | /cost-centers/* |
| EmploymentType | employmenttype.go | employmenttype.go | /employment-types/* |
| Holiday | holiday.go | holiday.go | /holidays/* |
| Account | account.go | account.go | /accounts/* |
| UserGroup | usergroup.go | usergroup.go | /user-groups/* |
| DayPlan | dayplan.go | dayplan.go | /day-plans/* |
| WeekPlan | weekplan.go | weekplan.go | /week-plans/* |
| Tariff | tariff.go | tariff.go | /tariffs/* |
| BookingType | bookingtype.go | bookingtype.go | /booking-types/* |

**Missing Services/Handlers:**
- BookingService/Handler (TICKET-072, 073)
- DailyValueHandler (TICKET-074 in original index)
- AbsenceService/Handler (TICKET-078-080)
- VacationService/Handler (TICKET-083-085)
- MonthlyService/Handler (TICKET-089-091)
- CorrectionService/Handler (TICKET-094-095)
- AuditService/Handler (TICKET-101-102)
- ReportService/Handler (TICKET-105-106)
- PayrollExportService/Handler (TICKET-109-110)

#### 1.5 Calculation Package (Complete)

Located at `apps/api/internal/calculation/`:

| File | Purpose | Status |
|------|---------|--------|
| doc.go | Package documentation | Done |
| types.go | Input/output structs, enums | Done |
| errors.go | Error/warning codes | Done |
| pairing.go | Booking pairing algorithm | Done + tests |
| tolerance.go | Time tolerance logic | Done + tests |
| rounding.go | Time rounding (up/down/nearest) | Done + tests |
| breaks.go | Fixed/variable/minimum breaks | Done + tests |
| calculator.go | Main orchestrator | Done + tests |

---

### 2. ZMI Manual Feature Coverage

#### 2.1 Implemented Features (from manual)

| ZMI Feature | German | Implementation |
|-------------|--------|----------------|
| System Architecture | Zeitpläne | day_plans, week_plans, tariffs |
| Personal Calendar | Persönlicher Kalender | employee_day_plans |
| Day Plan Types | Tagespläne | Fixed (FAZ) & Flex (GLZ) supported |
| Fixed Working Time | Festarbeitszeit | DayPlan.PlanType = "fixed" |
| Flexible Working Time | Gleitzeit | DayPlan.PlanType = "flextime" |
| Fixed Breaks | Pause 1-3 (fest) | DayPlanBreak.BreakType = "fixed" |
| Variable Breaks | Pause 4 (variabel) | DayPlanBreak.BreakType = "variable" |
| Minimum Breaks | Mindestpause | DayPlanBreak.BreakType = "minimum" |
| Minutes Difference | Minuten Differenz | BreakConfig.MinutesDifference |
| Tolerance | Toleranz | tolerance.go, DayPlan fields |
| Rounding | Abgleich | rounding.go, DayPlan fields |
| Week Plans | Wochenpläne | week_plans table/model |
| Tariffs | Tarif | tariffs table/model |
| Employee Data | Personalstamm | employees table/model |
| Booking Types | Buchungsarten | booking_types table/model |
| Booking Values | Original/Edited/Calculated | Booking model fields |
| Holidays | Feiertage | holidays table/model |
| Accounts | Konten | accounts table/model |
| Core Time | Kernzeit | DayPlan.CoreStart/CoreEnd |
| Day Plan Bonuses | Zuschläge | day_plan_bonuses table |
| Time Caps | Max. Netto-Arbeitszeit | DayPlan.MaxNetWorkTime |

#### 2.2 Not Yet Implemented Features

| ZMI Feature | German | Tickets |
|-------------|--------|---------|
| Absence Types | Fehltage-Arten | TICKET-074-075 |
| Absence Days | Fehltage | TICKET-076-080 |
| Vacation Balance | Resturlaub | TICKET-081-085 |
| Vacation Calculation | Urlaubsberechnung | TICKET-083 |
| Special Calculations | Sonderberechnung | (not in tickets) |
| Monthly Evaluation | Monatsbewertung | TICKET-086-091 |
| Month Closing | Monatsabschluss | TICKET-091 |
| Corrections | Korrekturen | TICKET-092-095 |
| Account Values | Kontenwerte | TICKET-096-098 |
| Capping Rules | Kappungsregeln | (not in tickets) |
| Shift Detection | Schichterkennung | (not in tickets) |
| Day Change Handling | Tageswechsel | (partial in pairing.go) |
| Holiday Time Credit | Zeitgutschrift Feiertagen | (not in tickets) |
| Days Without Bookings | Tage ohne Buchungen | (not in tickets) |
| Payroll Export | Lohnexport | TICKET-107-110 |
| Audit Logging | Protokoll | TICKET-099-102 |
| Reports | Berichte | TICKET-103-106 |

---

### 3. Ticket Quality Issues

#### 3.1 INDEX.md Discrepancies

The INDEX.md lists 116 tickets with a specific numbering scheme, but the actual ticket files use a different numbering:

**INDEX.md Claims:**
- TICKET-001-004: Multi-Tenant Foundation
- TICKET-005-010: Reference Tables
- ...and so on

**Actual Ticket Files (TICKET-001 through TICKET-118):**
- TICKET-001: tenants migration (matches)
- TICKET-008-017: Holidays, CostCenters, etc. (different from INDEX)
- TICKET-050-051: Booking types (INDEX says Sprint 9)
- TICKET-052-058: Bookings, Employee Day Plans, Daily Values
- TICKET-059-069: Calculation package
- TICKET-070-073: Services/Handlers (not yet done)

**The INDEX.md is essentially a DIFFERENT ticket breakdown than what exists in the files.**

#### 3.2 Tickets Completed But Not Marked DONE

| Ticket | Description | Evidence |
|--------|-------------|----------|
| TICKET-054 | Booking Repository | `repository/booking.go` exists with tests |
| TICKET-055 | Employee Day Plans Migration | `000023_create_employee_day_plans.sql` exists |
| TICKET-056 | Employee Day Plan Model/Repo | Model + repo + tests exist |
| TICKET-057 | Daily Values Migration | `000024_create_daily_values.sql` exists |
| TICKET-058 | Daily Value Model/Repo | Model + repo + tests exist |
| TICKET-059 | Calculation Package Structure | `calculation/` dir with 13 files |
| TICKET-060 | Calculation Types | `calculation/types.go` exists |
| TICKET-061 | Booking Pairing Logic | `calculation/pairing.go` + tests |
| TICKET-062 | Tolerance Logic | `calculation/tolerance.go` + tests |
| TICKET-063 | Rounding Logic | `calculation/rounding.go` + tests |
| TICKET-068 | Daily Calculator | `calculation/calculator.go` + tests |
| TICKET-069 | Error Detection | `calculation/errors.go` exists |

#### 3.3 Dual Location Issue

Tickets exist in two places with different statuses:
1. `thoughts/shared/plans/tickets/TICKET-XXX.md` - Master specs
2. `thoughts/shared/plans/2026-XX-XX-TICKET-XXX.md` - Implementation plans

Only the dated plans have `-DONE` suffix for some tickets, creating confusion.

---

### 4. Recommendations

#### 4.1 Immediate Actions (Ticket Housekeeping)

1. **Rename completed tickets** in `tickets/` directory to add `-DONE` suffix:
   - TICKET-052-058 (bookings, employee day plans, daily values)
   - TICKET-059-064, 068-069 (calculation package)

2. **Git add untracked files**:
   - `db/migrations/000023_*.sql`
   - `db/migrations/000024_*.sql` (if not tracked)
   - `apps/api/internal/calculation/`

3. **Consider consolidating** dated plans into master tickets or vice versa

#### 4.2 INDEX.md Rewrite

The INDEX.md needs a complete rewrite to reflect actual ticket structure:

**Current Sprint Progress (Estimated):**
- Sprints 1-9 (Foundation through Booking Types): ~95% Complete
- Sprint 10 (Bookings): Model/Repo done, Service/Handler pending
- Sprint 11 (Daily Values): Model/Repo done
- Sprints 12-16 (Calculation Engine): ~90% Complete
- Sprint 17 (Booking Service/Handler): 0% - NOT STARTED
- Sprints 18-28: 0% - NOT STARTED

#### 4.3 Missing Features to Add Tickets For

From ZMI manual analysis, these features need tickets:
1. Shift Detection (Schichterkennung)
2. Capping Rules (Kappungsregeln)
3. Days Without Bookings handling
4. Holiday Time Credit configuration
5. Vacation Special Calculations (age, tenure, disability)
6. Day Change handling (currently partial)

---

## Code References

### Implemented Components
- `db/migrations/000001_create_users.up.sql` through `000024_create_daily_values.up.sql`
- `apps/api/internal/model/` - 18 model files
- `apps/api/internal/repository/` - 16 repository files
- `apps/api/internal/service/` - 15 service files
- `apps/api/internal/handler/` - 16 handler files
- `apps/api/internal/calculation/` - 13 files (core + tests)
- `apps/api/internal/timeutil/` - Time utilities

### Pending Implementation
- `apps/api/internal/service/booking.go` - TICKET-072
- `apps/api/internal/handler/booking.go` - TICKET-073
- `apps/api/internal/service/dailycalc.go` - TICKET-070
- Absence, Vacation, Monthly, Correction, Audit, Report, Payroll services

---

## Architecture Insights

### Patterns Used
1. **Clean Architecture**: Handler → Service → Repository → Model
2. **Multi-tenancy**: All tenant-scoped queries via tenant_id FK
3. **Soft Delete**: User, Employee tables
4. **Time Representation**: Minutes from midnight (0-1439)
5. **Pure Calculation Package**: No DB/HTTP dependencies
6. **Interface-based repositories**: Enables testing

### Design Decisions
- UUID primary keys throughout
- GORM ORM with pgx pool for raw queries
- OpenAPI-first with generated request/response models
- Middleware chain for auth and tenant injection

---

## Open Questions

1. **Should INDEX.md be rewritten or abandoned?** It doesn't match reality.
2. **Which features from ZMI manual are MVP vs nice-to-have?**
3. **Test coverage for calculation package** - appears comprehensive but needs verification
4. **Integration test strategy** - TICKET-111-116 exist but are far from implementation

---

## Progress Summary

| Category | Completed | Remaining | % Done |
|----------|-----------|-----------|--------|
| Database Migrations | 24 | ~10 | 70% |
| Domain Models | 18 | ~8 | 69% |
| Repositories | 16 | ~8 | 67% |
| Services | 15 | ~10 | 60% |
| Handlers | 15 | ~8 | 65% |
| Calculation Engine | 7 core files | 0 | 100% |
| **Overall Estimate** | | | **~55%** |

**Bottom Line:** The project has a solid foundation with all core entities, a complete calculation engine, and proper architecture. The main gaps are:
1. Booking service/handler (bridge between bookings and calculations)
2. Absences and vacation system
3. Monthly evaluation and closing
4. Reports and payroll export
5. Audit logging

The ticket tracking is in disarray and needs cleanup to accurately reflect project status.
