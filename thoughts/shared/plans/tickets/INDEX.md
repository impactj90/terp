# ZMI Backend Sprint Tickets Index

**Total Tickets**: 116
**Sprints**: 28

## Overview

This directory contains atomic, LLM-friendly tickets for implementing the ZMI Time Clone backend. Each ticket is self-contained with:
- Type (Migration, Model, Repository, Service, Handler, Calculation, Test)
- Effort estimate (XS, S, M, L)
- Sprint assignment
- Dependencies
- Implementation code
- Acceptance criteria

## Ticket Structure

```
TICKET-XXX-short-description.md
```

## Sprints Summary

### Sprint 1: Multi-Tenant Foundation
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-001](TICKET-001-create-tenants-migration.md) | Migration | XS | Create tenants table |
| [TICKET-002](TICKET-002-create-tenant-model-repository.md) | Model/Repo | S | Tenant model and repository |
| [TICKET-003](TICKET-003-create-tenant-service.md) | Service | S | Tenant service |
| [TICKET-004](TICKET-004-create-tenant-handler.md) | Handler | S | Tenant HTTP handler |

### Sprint 2: Reference Tables
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-005](TICKET-005-create-holidays-migration.md) | Migration | XS | Create holidays table |
| [TICKET-006](TICKET-006-create-holiday-model-repository.md) | Model/Repo | S | Holiday model and repository |
| [TICKET-007](TICKET-007-create-booking-types-migration.md) | Migration | XS | Create booking_types table |
| [TICKET-008](TICKET-008-create-booking-type-model-repository.md) | Model/Repo | S | BookingType model and repository |
| [TICKET-009](TICKET-009-create-cost-centers-migration.md) | Migration | XS | Create cost_centers table |
| [TICKET-010](TICKET-010-create-cost-center-model-repository.md) | Model/Repo | S | CostCenter model and repository |

### Sprint 3: User Groups
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-011](TICKET-011-create-user-groups-migration.md) | Migration | XS | Create user_groups table |
| [TICKET-012](TICKET-012-create-user-group-model-repository.md) | Model/Repo | S | UserGroup model and repository |
| [TICKET-013](TICKET-013-create-user-group-permissions-migration.md) | Migration | XS | Create permissions table |
| [TICKET-014](TICKET-014-create-permission-model-repository.md) | Model/Repo | S | Permission model and repository |
| [TICKET-015](TICKET-015-create-user-group-service.md) | Service | S | UserGroup service |
| [TICKET-016](TICKET-016-create-user-group-handler.md) | Handler | S | UserGroup HTTP handler |

### Sprint 4: Organization Structure
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-017](TICKET-017-create-departments-migration.md) | Migration | XS | Create departments table |
| [TICKET-018](TICKET-018-create-department-model-repository.md) | Model/Repo | S | Department model and repository |
| [TICKET-019](TICKET-019-create-locations-migration.md) | Migration | XS | Create locations table |
| [TICKET-020](TICKET-020-create-location-model-repository.md) | Model/Repo | S | Location model and repository |
| [TICKET-021](TICKET-021-create-org-structure-service.md) | Service | S | Organization structure service |
| [TICKET-022](TICKET-022-create-org-structure-handler.md) | Handler | M | Organization HTTP handlers |

### Sprint 5: Employee Management
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-023](TICKET-023-create-employees-migration.md) | Migration | S | Create employees table |
| [TICKET-024](TICKET-024-create-employee-contacts-migration.md) | Migration | XS | Create employee_contacts table |
| [TICKET-025](TICKET-025-create-employee-cards-migration.md) | Migration | XS | Create employee_cards table |
| [TICKET-026](TICKET-026-create-employee-status-history-migration.md) | Migration | XS | Create employee_status_history table |
| [TICKET-027](TICKET-027-create-users-migration.md) | Migration | XS | Create users table |
| [TICKET-028](TICKET-028-create-user-model-repository.md) | Model/Repo | S | User model and repository |
| [TICKET-029](TICKET-029-create-auth-service.md) | Service | M | Authentication service |
| [TICKET-030](TICKET-030-create-auth-handler.md) | Handler | M | Authentication HTTP handler |
| [TICKET-031](TICKET-031-create-employee-model.md) | Model | S | Employee model with related models |
| [TICKET-032](TICKET-032-create-employee-repository.md) | Repository | M | Employee repository |
| [TICKET-033](TICKET-033-create-employee-service.md) | Service | M | Employee service |
| [TICKET-034](TICKET-034-create-employee-handler.md) | Handler | M | Employee HTTP handler |

### Sprint 6: Day Plans
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-035](TICKET-035-create-day-plans-migration.md) | Migration | XS | Create day_plans table |
| [TICKET-036](TICKET-036-create-day-plan-model-repository.md) | Model/Repo | S | DayPlan model and repository |
| [TICKET-037](TICKET-037-create-day-plan-breaks-migration.md) | Migration | XS | Create day_plan_breaks table |
| [TICKET-038](TICKET-038-create-day-plan-break-model-repository.md) | Model/Repo | S | DayPlanBreak model and repository |
| [TICKET-039](TICKET-039-create-day-plan-service.md) | Service | S | DayPlan service |
| [TICKET-040](TICKET-040-create-day-plan-handler.md) | Handler | S | DayPlan HTTP handler |

### Sprint 7: Week Plans
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-041](TICKET-041-create-week-plans-migration.md) | Migration | XS | Create week_plans table |
| [TICKET-042](TICKET-042-create-week-plan-model-repository.md) | Model/Repo | S | WeekPlan model and repository |
| [TICKET-043](TICKET-043-create-week-plan-service.md) | Service | S | WeekPlan service |
| [TICKET-044](TICKET-044-create-week-plan-handler.md) | Handler | S | WeekPlan HTTP handler |

### Sprint 8: Tariffs
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-045](TICKET-045-create-tariffs-migration.md) | Migration | XS | Create tariffs table |
| [TICKET-046](TICKET-046-create-tariff-model-repository.md) | Model/Repo | S | Tariff model and repository |
| [TICKET-047](TICKET-047-create-tariff-breaks-migration.md) | Migration | XS | Create tariff_breaks table |
| [TICKET-048](TICKET-048-create-tariff-break-model-repository.md) | Model/Repo | S | TariffBreak model and repository |
| [TICKET-049](TICKET-049-create-tariff-service.md) | Service | S | Tariff service |
| [TICKET-050](TICKET-050-create-tariff-handler.md) | Handler | S | Tariff HTTP handler |

### Sprint 9: Booking Types
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-051](TICKET-051-create-booking-types-seeder.md) | Migration | XS | Seed default booking types |
| [TICKET-052](TICKET-052-create-booking-type-service.md) | Service | S | BookingType service |
| [TICKET-053](TICKET-053-create-booking-type-handler.md) | Handler | S | BookingType HTTP handler |

### Sprint 10: Bookings
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-054](TICKET-054-create-bookings-migration.md) | Migration | XS | Create bookings table |
| [TICKET-055](TICKET-055-create-booking-model-repository.md) | Model/Repo | S | Booking model and repository |

### Sprint 11: Daily Values
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-056](TICKET-056-create-daily-values-migration.md) | Migration | XS | Create daily_values table |
| [TICKET-057](TICKET-057-create-daily-errors-migration.md) | Migration | XS | Create daily_errors table |
| [TICKET-058](TICKET-058-create-daily-value-model-repository.md) | Model/Repo | S | DailyValue model and repository |

### Sprint 12: Calculation - Pairing
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-059](TICKET-059-create-calculation-types.md) | Calculation | S | Define calculation types |
| [TICKET-060](TICKET-060-create-booking-pairing-logic.md) | Calculation | M | Booking pairing algorithm |

### Sprint 13: Calculation - Tolerance
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-061](TICKET-061-create-tolerance-logic.md) | Calculation | M | Tolerance application |
| [TICKET-062](TICKET-062-create-rounding-logic.md) | Calculation | S | Time rounding |

### Sprint 14: Calculation - Breaks
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-063](TICKET-063-create-break-calculation-types.md) | Calculation | S | Break calculation types |
| [TICKET-064](TICKET-064-create-fixed-break-logic.md) | Calculation | S | Fixed break deduction |
| [TICKET-065](TICKET-065-create-variable-break-logic.md) | Calculation | M | Variable break deduction |
| [TICKET-066](TICKET-066-create-minimum-break-logic.md) | Calculation | S | Minimum break enforcement |

### Sprint 15: Calculation - Daily
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-067](TICKET-067-create-gross-net-calculator.md) | Calculation | M | Gross/net time calculation |
| [TICKET-068](TICKET-068-create-daily-calculator.md) | Calculation | L | Daily value orchestrator |

### Sprint 16: Calculation - Errors
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-069](TICKET-069-create-error-detection.md) | Calculation | M | Error detection logic |

### Sprint 17: Booking Service & Handler
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-070](TICKET-070-create-daily-calc-service.md) | Service | M | Daily calculation service |
| [TICKET-071](TICKET-071-create-recalc-triggers.md) | Service | S | Recalculation triggers |
| [TICKET-072](TICKET-072-create-booking-service.md) | Service | M | Booking service |
| [TICKET-073](TICKET-073-create-booking-handler.md) | Handler | M | Booking HTTP handler |
| [TICKET-074](TICKET-074-create-daily-value-handler.md) | Handler | S | DailyValue HTTP handler |

### Sprint 18: Absence Types
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-075](TICKET-075-create-absence-types-migration.md) | Migration | XS | Create absence_types table |
| [TICKET-076](TICKET-076-create-absence-type-model-repository.md) | Model/Repo | S | AbsenceType model and repository |

### Sprint 19: Absence Days
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-077](TICKET-077-create-absences-migration.md) | Migration | XS | Create absences table |
| [TICKET-078](TICKET-078-create-absence-model-repository.md) | Model/Repo | S | Absence model and repository |
| [TICKET-079](TICKET-079-create-absence-service.md) | Service | M | Absence service |
| [TICKET-080](TICKET-080-create-absence-handler.md) | Handler | M | Absence HTTP handler |

### Sprint 20: Vacation Balance
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-081](TICKET-081-create-vacation-balance-migration.md) | Migration | XS | Create vacation_balances table |
| [TICKET-082](TICKET-082-create-vacation-balance-model-repository.md) | Model/Repo | S | VacationBalance model and repository |
| [TICKET-083](TICKET-083-create-vacation-calculation.md) | Calculation | M | Vacation calculation logic |
| [TICKET-084](TICKET-084-create-vacation-service.md) | Service | M | Vacation service |
| [TICKET-085](TICKET-085-create-vacation-balance-endpoint.md) | Handler | S | Vacation balance endpoint |

### Sprint 21: Monthly Values
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-086](TICKET-086-create-monthly-value-model-repository.md) | Model/Repo | S | MonthlyValue model and repository |
| [TICKET-087](TICKET-087-create-monthly-evaluation-migration.md) | Migration | XS | Create monthly_evaluations table |
| [TICKET-088](TICKET-088-create-monthly-evaluation-model-repository.md) | Model/Repo | S | MonthlyEvaluation model and repository |

### Sprint 22: Monthly Calculation
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-089](TICKET-089-create-monthly-aggregation-logic.md) | Calculation | M | Monthly aggregation logic |
| [TICKET-090](TICKET-090-create-monthly-calculation-service.md) | Service | L | Monthly calculation service |
| [TICKET-091](TICKET-091-create-month-closing-handler.md) | Handler | M | Month closing handler |

### Sprint 23: Corrections
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-092](TICKET-092-create-corrections-migration.md) | Migration | XS | Create corrections table |
| [TICKET-093](TICKET-093-create-correction-model-repository.md) | Model/Repo | S | Correction model and repository |
| [TICKET-094](TICKET-094-create-correction-service.md) | Service | S | Correction service |
| [TICKET-095](TICKET-095-create-correction-handler.md) | Handler | S | Correction HTTP handler |

### Sprint 24: Account Values
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-096](TICKET-096-create-account-values-migration.md) | Migration | XS | Create account_values table |
| [TICKET-097](TICKET-097-create-account-value-model-repository.md) | Model/Repo | S | AccountValue model and repository |
| [TICKET-098](TICKET-098-create-account-value-service.md) | Service | M | AccountValue service |

### Sprint 25: Audit Log
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-099](TICKET-099-create-audit-log-migration.md) | Migration | XS | Create audit_logs table |
| [TICKET-100](TICKET-100-create-audit-log-model-repository.md) | Model/Repo | S | AuditLog model and repository |
| [TICKET-101](TICKET-101-create-audit-service.md) | Service | S | Audit service |
| [TICKET-102](TICKET-102-create-audit-handler.md) | Handler | S | Audit HTTP handler |

### Sprint 26: Reports
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-103](TICKET-103-create-reports-migration.md) | Migration | XS | Create reports tables |
| [TICKET-104](TICKET-104-create-report-models.md) | Model/Repo | S | Report models and repositories |
| [TICKET-105](TICKET-105-create-report-service.md) | Service | L | Report service |
| [TICKET-106](TICKET-106-create-report-handler.md) | Handler | M | Report HTTP handler |

### Sprint 27: Payroll Export
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-107](TICKET-107-create-payroll-export-migration.md) | Migration | XS | Create payroll_exports tables |
| [TICKET-108](TICKET-108-create-payroll-export-models.md) | Model/Repo | S | PayrollExport models and repositories |
| [TICKET-109](TICKET-109-create-payroll-export-service.md) | Service | L | PayrollExport service |
| [TICKET-110](TICKET-110-create-payroll-export-handler.md) | Handler | S | PayrollExport HTTP handler |

### Sprint 28: Integration Tests
| Ticket | Type | Effort | Description |
|--------|------|--------|-------------|
| [TICKET-111](TICKET-111-create-booking-integration-test.md) | Test | M | Booking integration tests |
| [TICKET-112](TICKET-112-create-calculation-integration-test.md) | Test | M | Calculation integration tests |
| [TICKET-113](TICKET-113-create-absence-integration-test.md) | Test | M | Absence integration tests |
| [TICKET-114](TICKET-114-create-monthly-closing-integration-test.md) | Test | M | Monthly closing integration tests |
| [TICKET-115](TICKET-115-create-payroll-export-integration-test.md) | Test | S | Payroll export integration tests |
| [TICKET-116](TICKET-116-create-end-to-end-integration-test.md) | Test | L | End-to-end integration tests |

## Effort Summary

| Effort | Count | Description |
|--------|-------|-------------|
| XS | ~35 | 1-2 hours (migrations, simple models) |
| S | ~50 | 2-4 hours (model+repo, simple services) |
| M | ~25 | 4-8 hours (complex services, handlers) |
| L | ~6 | 1-2 days (orchestration services, e2e tests) |

## Dependency Graph

```
Foundation (1-4)
    └── Employee (5)
        ├── Day Plans (6) → Week Plans (7) → Tariffs (8)
        ├── Booking Types (9) → Bookings (10) → Daily Values (11)
        └── Absences (18-19) → Vacation (20)

Calculation Engine (12-16)
    └── Daily Calc Service (17)
        └── Monthly Calc (21-22)
            ├── Corrections (23)
            ├── Account Values (24)
            └── Payroll Export (27)

Support Systems
    ├── Audit Log (25)
    └── Reports (26)

Integration Tests (28) - depends on all above
```

## Recommended Execution Order

1. **Parallel Track A**: Migrations (can be done ahead of code)
   - Run TICKET-001, 005, 007, 009, etc. in sequence

2. **Parallel Track B**: Calculation Engine (pure functions, no DB)
   - TICKET-059 through TICKET-069

3. **Sequential Track**: Foundation → Features
   - Follow sprint order for model/service/handler

4. **Final**: Integration Tests
   - After all features complete
