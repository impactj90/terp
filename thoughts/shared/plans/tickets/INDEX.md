# ZMI Backend Implementation Tickets

**Total Tickets**: 131
**Completed**: 71 (54%)
**Pending**: 60 (46%)
**Last Updated**: 2026-01-22

## Progress Overview

```
PHASE 1: Foundation         ████████████████████ 100% (Tickets 001-034)
PHASE 2: Time Configuration ████████████████████ 100% (Tickets 035-051)
PHASE 3: Time Tracking      ████████████████████ 100% (Tickets 052-069)
PHASE 4: Booking Service    ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 070-073)
PHASE 5: Absences           ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 074-084)
PHASE 6: Monthly Processing ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 085-098)
PHASE 7: Support Systems    ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 099-110)
PHASE 8: Integration Tests  ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 111-116)
PHASE 9: ZMI Enhancements   ░░░░░░░░░░░░░░░░░░░░   0% (Tickets 117-131)
```

---

## Database Migration Sequence

> **IMPORTANT**: Migrations must be applied in this exact order.

| Migration | Table/Change | Ticket | Status |
|-----------|--------------|--------|--------|
| 000001-000024 | Core tables | Various | ✅ Implemented |
| **000025** | absence_types | TICKET-074 | Pending |
| **000026** | absence_days | TICKET-076 | Pending |
| **000027** | add_employee_zmi_fields | TICKET-123 | Pending |
| **000028** | add_holiday_zmi_fields | TICKET-124 | Pending |
| **000029** | add_tariff_zmi_fields | TICKET-125 | Pending |
| **000030** | add_day_plan_zmi_fields | TICKET-118 | Pending |
| **000031** | vacation_balances | TICKET-080 | Pending |
| **000032** | capping_rules | TICKET-126 | Pending |
| 000033-000040 | Monthly/Audit/Reports | Various | Pending |

---

## ZMI Reference Compliance

Based on `thoughts/shared/reference/zmi-calculataion-manual-reference.md`:

### Implemented Features

| ZMI Feature | German | Implementation | Status |
|-------------|--------|----------------|--------|
| Booking values | Original/Editiert/Berechnet | `Booking.OriginalTime/EditedTime/CalculatedTime` | ✅ |
| Fixed breaks | Pause 1-3 (fest) | `BreakTypeFixed` - always deducted | ✅ |
| Variable breaks | Pause 4 (variabel) | `BreakTypeVariable` - only if no manual | ✅ |
| Minimum breaks | Mindestpause | `BreakTypeMinimum` with threshold | ✅ |
| Minutes difference | Minuten Differenz | `BreakConfig.MinutesDifference` | ✅ |
| Tolerance | Toleranz Kommen/Gehen +/- | `ToleranceConfig` fields | ✅ |
| Rounding up/down/math | Aufrunden/Abrunden/Mathematisch | `RoundingUp/Down/Nearest` | ✅ |
| Core hours | Kernzeit | `DayPlan.CoreStart/CoreEnd` | ✅ |
| Max net time | Max. Netto-Arbeitszeit | `DayPlan.MaxNetWorkTime` | ✅ |
| Day Plans | Tagespläne | Full model with breaks/bonuses | ✅ |
| Week Plans | Wochenpläne | 7-day assignment | ✅ |
| Tariffs | Tarif | WeekPlan + validity dates | ✅ |

### Pending Features (Covered by Tickets)

| ZMI Feature | German | Ticket | Priority |
|-------------|--------|--------|----------|
| Employee birth date | Geburtsdatum | TICKET-123, 129 | CRITICAL |
| Employee disability | Schwerbehinderung | TICKET-123, 129 | CRITICAL |
| Tariff vacation days | Jahresurlaub | TICKET-125, 131 | HIGH |
| Tariff work days/week | AT pro Woche | TICKET-125, 131 | HIGH |
| Holiday absence code | Kürzel am Feiertag | TICKET-124, 130 | HIGH |
| Holiday priority | Priorität (Feiertag) | TICKET-124, 130 | HIGH |
| Alt. target hours | Regelarbeitszeit 2 | TICKET-118 | HIGH |
| Variable worktime flag | variable Arbeitszeit | TICKET-118 | MEDIUM |
| Add/subtract rounding | Wert addieren/subtrahieren | TICKET-122 | MEDIUM |
| Round all bookings | Alle Buchungen runden | TICKET-118 | MEDIUM |
| Holiday time credit | Zeitgutschrift Feiertagen | TICKET-118, 070, 127 | HIGH |
| Vacation deduction | Urlaubsbewertung | TICKET-118, 082 | HIGH |
| Days without bookings | Tage ohne Buchungen | TICKET-118, 070 | HIGH |
| Day change handling | Tageswechsel | TICKET-118, 070, 128 | HIGH |
| Capping account | Kappungskonto | TICKET-120 | MEDIUM |
| Capping rules | Kappungsregeln | TICKET-126 | MEDIUM |
| Shift detection | Schichterkennung | TICKET-118, 119 | MEDIUM |
| Surcharges | Zuschläge | TICKET-121 | MEDIUM |
| Absence portion | Anteil (0/1/2) | TICKET-074, 075 | HIGH |
| Absence holiday code | Kürzel am Feiertag | TICKET-074, 075 | MEDIUM |
| Absence priority | Priorität | TICKET-074, 075 | MEDIUM |
| Vacation special calcs | Sonderberechnung | TICKET-082 | MEDIUM |
| Monthly credit types | Art der Gutschrift | TICKET-089 | HIGH |

---

## PHASE 1: Foundation (COMPLETE)

### Sprint 1: Multi-Tenant Foundation
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 001 | [create-tenants-migration](TICKET-001-create-tenants-migration-DONE.md) | Migration | DONE |
| 002 | [create-tenant-model](TICKET-002-create-tenant-model-DONE.md) | Model | DONE |
| 003 | [create-tenant-repository](TICKET-003-create-tenant-repository-DONE.md) | Repository | DONE |
| 004 | [create-tenant-service](TICKET-004-create-tenant-service-DONE.md) | Service | DONE |
| 005 | [create-tenant-handler](TICKET-005-create-tenant-handler-DONE.md) | Handler | DONE |
| 006 | [register-tenant-routes](TICKET-006-register-tenant-routes-DONE.md) | Routes | DONE |
| 007 | [create-tenant-middleware](TICKET-007-create-tenant-middleware-DONE.md) | Middleware | DONE |

### Sprint 2: Reference Tables
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 008 | [create-holidays-migration](TICKET-008-create-holidays-migration-DONE.md) | Migration | DONE |
| 009 | [create-holiday-model-repository](TICKET-009-create-holiday-model-repository-DONE.md) | Model/Repo | DONE |
| 010 | [create-cost-centers-migration](TICKET-010-create-cost-centers-migration-DONE.md) | Migration | DONE |
| 011 | [create-cost-center-model-repository](TICKET-011-create-cost-center-model-repository-DONE.md) | Model/Repo | DONE |
| 012 | [create-employment-types-migration](TICKET-012-create-employment-types-migration-DONE.md) | Migration | DONE |
| 013 | [create-employment-type-model-repository](TICKET-013-create-employment-type-model-repository-DONE.md) | Model/Repo | DONE |
| 014 | [create-accounts-migration](TICKET-014-create-accounts-migration-DONE.md) | Migration | DONE |
| 015 | [create-account-model-repository](TICKET-015-create-account-model-repository-DONE.md) | Model/Repo | DONE |
| 016 | [create-user-groups-migration](TICKET-016-create-user-groups-migration-DONE.md) | Migration | DONE |
| 017 | [create-user-group-model-repository](TICKET-017-create-user-group-model-repository-DONE.md) | Model/Repo | DONE |

### Sprint 3: User Multi-Tenancy
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 018 | [alter-users-multitenancy-migration](TICKET-018-alter-users-multitenancy-migration-DONE.md) | Migration | DONE |
| 019 | [update-user-model-multitenancy](TICKET-019-update-user-model-multitenancy-DONE.md) | Model | DONE |
| 020 | [update-user-repository-tenant-scoping](TICKET-020-update-user-repository-tenant-scoping-DONE.md) | Repository | DONE |

### Sprint 4: Organization Structure
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 021 | [create-departments-migration](TICKET-021-create-departments-migration-DONE.md) | Migration | DONE |
| 022 | [create-department-model](TICKET-022-create-department-model-DONE.md) | Model | DONE |
| 023 | [create-department-repository](TICKET-023-create-department-repository-DONE.md) | Repository | DONE |
| 024 | [create-department-service-handler](TICKET-024-create-department-service-handler-DONE.md) | Service/Handler | DONE |
| 025 | [create-teams-migration](TICKET-025-create-teams-migration-DONE.md) | Migration | DONE |
| 026 | [create-team-model-repository](TICKET-026-create-team-model-repository-DONE.md) | Model/Repo | DONE |

### Sprint 5: Employee Management
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 027 | [create-employees-migration](TICKET-027-create-employees-migration-DONE.md) | Migration | DONE |
| 028 | [create-employee-contacts-migration](TICKET-028-create-employee-contacts-migration-DONE.md) | Migration | DONE |
| 029 | [create-employee-cards-migration](TICKET-029-create-employee-cards-migration-DONE.md) | Migration | DONE |
| 030 | [link-users-employees-migration](TICKET-030-link-users-employees-migration-DONE.md) | Migration | DONE |
| 031 | [create-employee-model](TICKET-031-create-employee-model-DONE.md) | Model | DONE |
| 032 | [create-employee-repository](TICKET-032-create-employee-repository-DONE.md) | Repository | DONE |
| 033 | [create-employee-service](TICKET-033-create-employee-service-DONE.md) | Service | DONE |
| 034 | [create-employee-handler](TICKET-034-create-employee-handler-DONE.md) | Handler | DONE |

---

## PHASE 2: Time Configuration (COMPLETE)

### Sprint 6: Day Plans
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 035 | [create-day-plans-migration](TICKET-035-create-day-plans-migration-DONE.md) | Migration | DONE |
| 036 | [create-day-plan-breaks-migration](TICKET-036-create-day-plan-breaks-migration-DONE.md) | Migration | DONE |
| 037 | [create-day-plan-bonuses-migration](TICKET-037-create-day-plan-bonuses-migration-DONE.md) | Migration | DONE |
| 038 | [create-day-plan-model](TICKET-038-create-day-plan-model-DONE.md) | Model | DONE |
| 039 | [create-day-plan-repository](TICKET-039-create-day-plan-repository-DONE.md) | Repository | DONE |
| 040 | [create-day-plan-service](TICKET-040-create-day-plan-service-DONE.md) | Service | DONE |
| 041 | [create-day-plan-handler](TICKET-041-create-day-plan-handler-DONE.md) | Handler | DONE |

### Sprint 7: Week Plans
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 042 | [create-week-plans-migration](TICKET-042-create-week-plans-migration-DONE.md) | Migration | DONE |
| 043 | [create-week-plan-model-repository](TICKET-043-create-week-plan-model-repository-DONE.md) | Model/Repo | DONE |
| 044 | [create-week-plan-service-handler](TICKET-044-create-week-plan-service-handler-DONE.md) | Service/Handler | DONE |

### Sprint 8: Tariffs
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 045 | [create-tariffs-migration](TICKET-045-create-tariffs-migration-DONE.md) | Migration | DONE |
| 046 | [create-tariff-day-plans-migration](TICKET-046-create-tariff-day-plans-migration-DONE.md) | Migration | DONE |
| 047 | [create-tariff-model-repository](TICKET-047-create-tariff-model-repository-DONE.md) | Model/Repo | DONE |
| 048 | [create-tariff-service](TICKET-048-create-tariff-service-DONE.md) | Service | DONE |
| 049 | [create-tariff-handler](TICKET-049-create-tariff-handler-DONE.md) | Handler | DONE |

### Sprint 9: Booking Types
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 050 | [create-booking-types-migration](TICKET-050-create-booking-types-migration-DONE.md) | Migration | DONE |
| 051 | [create-booking-type-model-repository](TICKET-051-create-booking-type-model-repository-DONE.md) | Model/Repo | DONE |

---

## PHASE 3: Time Tracking Data & Calculation (COMPLETE)

### Sprint 10: Bookings & Daily Values
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 052 | [create-bookings-migration](TICKET-052-create-bookings-migration-DONE.md) | Migration | DONE |
| 053 | [create-booking-model](TICKET-053-create-booking-model-DONE.md) | Model | DONE |
| 054 | [create-booking-repository](TICKET-054-create-booking-repository-DONE.md) | Repository | DONE |
| 055 | [create-employee-day-plans-migration](TICKET-055-create-employee-day-plans-migration-DONE.md) | Migration | DONE |
| 056 | [create-employee-day-plan-model-repository](TICKET-056-create-employee-day-plan-model-repository-DONE.md) | Model/Repo | DONE |
| 057 | [create-daily-values-migration](TICKET-057-create-daily-values-migration-DONE.md) | Migration | DONE |
| 058 | [create-daily-value-model-repository](TICKET-058-create-daily-value-model-repository-DONE.md) | Model/Repo | DONE |

### Sprint 11: Calculation Engine
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 059 | [create-calculation-package-structure](TICKET-059-create-calculation-package-structure-DONE.md) | Package | DONE |
| 060 | [create-calculation-types](TICKET-060-create-calculation-types-DONE.md) | Types | DONE |
| 061 | [create-booking-pairing-logic](TICKET-061-create-booking-pairing-logic-DONE.md) | Calculation | DONE |
| 062 | [create-tolerance-logic](TICKET-062-create-tolerance-logic-DONE.md) | Calculation | DONE |
| 063 | [create-rounding-logic](TICKET-063-create-rounding-logic-DONE.md) | Calculation | DONE |
| 064 | [create-fixed-break-deduction](TICKET-064-create-fixed-break-deduction-DONE.md) | Calculation | DONE |
| 065 | [create-variable-break-deduction](TICKET-065-create-variable-break-deduction-DONE.md) | Calculation | DONE |
| 066 | [create-minimum-break-enforcement](TICKET-066-create-minimum-break-enforcement-DONE.md) | Calculation | DONE |
| 067 | [create-gross-time-calculation](TICKET-067-create-gross-time-calculation-DONE.md) | Calculation | DONE |
| 068 | [create-daily-calculator](TICKET-068-create-daily-calculator-DONE.md) | Calculation | DONE |
| 069 | [create-error-detection](TICKET-069-create-error-detection-DONE.md) | Calculation | DONE |

---

## PHASE 4: Booking Service Layer (PENDING)

### Sprint 12: Daily Calculation & Booking Service
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 070 | [create-daily-calculation-service](TICKET-070-create-daily-calculation-service.md) | Service | TODO | Holiday credit, No-booking behavior, Day change (partial) |
| 071 | [create-recalculation-trigger-service](TICKET-071-create-recalculation-trigger-service.md) | Service | TODO | - |
| 072 | [create-booking-service](TICKET-072-create-booking-service.md) | Service | TODO | - |
| 073 | [create-booking-handler](TICKET-073-create-booking-handler.md) | Handler | TODO | - |

---

## PHASE 5: Absence & Vacation (PENDING)

### Sprint 13: Absence Types & ZMI Model Fields
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 074 | [create-absence-types-migration](TICKET-074-create-absence-types-migration.md) | Migration | TODO | Portion, Holiday code, Priority |
| 075 | [create-absence-type-model-repository](TICKET-075-create-absence-type-model-repository.md) | Model/Repo | TODO | CreditMultiplier, GetEffectiveCode |
| **123** | [add-employee-zmi-fields-migration](TICKET-123-add-employee-zmi-fields-migration.md) | Migration | TODO | BirthDate, HasDisability, TargetHours |
| **124** | [add-holiday-zmi-fields-migration](TICKET-124-add-holiday-zmi-fields-migration.md) | Migration | TODO | AbsenceCode, Priority |
| **125** | [add-tariff-zmi-fields-migration](TICKET-125-add-tariff-zmi-fields-migration.md) | Migration | TODO | AnnualVacationDays, WorkDaysPerWeek, VacationBasis |
| **129** | [update-employee-model-zmi-fields](TICKET-129-update-employee-model-zmi-fields.md) | Model | TODO | Age(), TenureYears(), HasDisability helpers |
| **130** | [update-holiday-model-zmi-fields](TICKET-130-update-holiday-model-zmi-fields.md) | Model | TODO | GetEffectiveCode(), ShouldOverrideAbsence() |
| **131** | [update-tariff-model-zmi-fields](TICKET-131-update-tariff-model-zmi-fields.md) | Model | TODO | GetVacationYearStart(), CalculateProRatedVacation() |

### Sprint 14: Absence Days
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 076 | [create-absence-days-migration](TICKET-076-create-absence-days-migration.md) | Migration | TODO | Credit calculation formula |
| 077 | [create-absence-day-model-repository](TICKET-077-create-absence-day-model-repository.md) | Model/Repo | TODO | - |
| 078 | [create-absence-service](TICKET-078-create-absence-service.md) | Service | TODO | - |
| 079 | [create-absence-handler](TICKET-079-create-absence-handler.md) | Handler | TODO | - |

### Sprint 15: Vacation
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 080 | [create-vacation-balances-migration](TICKET-080-create-vacation-balances-migration.md) | Migration | TODO | - |
| 081 | [create-vacation-balance-model-repository](TICKET-081-create-vacation-balance-model-repository.md) | Model/Repo | TODO | - |
| 082 | [create-vacation-calculation-logic](TICKET-082-create-vacation-calculation-logic.md) | Calculation | TODO | Sonderberechnung (Age/Tenure/Disability) |
| 083 | [create-vacation-service](TICKET-083-create-vacation-service.md) | Service | TODO | - |
| 084 | [add-vacation-balance-endpoint](TICKET-084-add-vacation-balance-endpoint.md) | Handler | TODO | - |

---

## PHASE 6: Monthly Processing (PENDING)

### Sprint 16: Daily Calculation Completion & Monthly Values
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| **127** | [complete-holiday-average-calculation](TICKET-127-complete-holiday-average-calculation.md) | Calculation | TODO | HolidayCreditAverage (13-week lookback) |
| **128** | [complete-day-change-implementation](TICKET-128-complete-day-change-implementation.md) | Calculation | TODO | All 4 DayChangeBehavior modes |
| 085 | [create-monthly-values-migration](TICKET-085-create-monthly-values-migration.md) | Migration | TODO |
| 086 | [create-monthly-value-model-repository](TICKET-086-create-monthly-value-model-repository.md) | Model/Repo | TODO |
| 087 | [create-monthly-evaluation-migration](TICKET-087-create-monthly-evaluation-migration.md) | Migration | TODO |
| 088 | [create-monthly-evaluation-model-repository](TICKET-088-create-monthly-evaluation-model-repository.md) | Model/Repo | TODO |

### Sprint 17: Monthly Calculation & Capping
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 089 | [create-monthly-aggregation-logic](TICKET-089-create-monthly-aggregation-logic.md) | Calculation | TODO | 4 Credit Types (Art der Gutschrift) |
| 090 | [create-monthly-calculation-service](TICKET-090-create-monthly-calculation-service.md) | Service | TODO | - |
| 091 | [create-month-closing-handler](TICKET-091-create-month-closing-handler.md) | Handler | TODO | - |
| **126** | [create-capping-rules-system](TICKET-126-create-capping-rules-system.md) | Migration/Model | TODO | Kappungsregeln, year-end capping |

### Sprint 18: Corrections
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 092 | [create-corrections-migration](TICKET-092-create-corrections-migration.md) | Migration | TODO |
| 093 | [create-correction-model-repository](TICKET-093-create-correction-model-repository.md) | Model/Repo | TODO |
| 094 | [create-correction-service](TICKET-094-create-correction-service.md) | Service | TODO |
| 095 | [create-correction-handler](TICKET-095-create-correction-handler.md) | Handler | TODO |

### Sprint 19: Account Values
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 096 | [create-account-values-migration](TICKET-096-create-account-values-migration.md) | Migration | TODO |
| 097 | [create-account-value-model-repository](TICKET-097-create-account-value-model-repository.md) | Model/Repo | TODO |
| 098 | [create-account-value-service](TICKET-098-create-account-value-service.md) | Service | TODO |

---

## PHASE 7: Support Systems (PENDING)

### Sprint 20: Audit Log
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 099 | [create-audit-log-migration](TICKET-099-create-audit-log-migration.md) | Migration | TODO |
| 100 | [create-audit-log-model-repository](TICKET-100-create-audit-log-model-repository.md) | Model/Repo | TODO |
| 101 | [create-audit-service](TICKET-101-create-audit-service.md) | Service | TODO |
| 102 | [create-audit-handler](TICKET-102-create-audit-handler.md) | Handler | TODO |

### Sprint 21: Reports
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 103 | [create-reports-migration](TICKET-103-create-reports-migration.md) | Migration | TODO |
| 104 | [create-report-models](TICKET-104-create-report-models.md) | Model/Repo | TODO |
| 105 | [create-report-service](TICKET-105-create-report-service.md) | Service | TODO |
| 106 | [create-report-handler](TICKET-106-create-report-handler.md) | Handler | TODO |

### Sprint 22: Payroll Export
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 107 | [create-payroll-export-migration](TICKET-107-create-payroll-export-migration.md) | Migration | TODO |
| 108 | [create-payroll-export-models](TICKET-108-create-payroll-export-models.md) | Model/Repo | TODO |
| 109 | [create-payroll-export-service](TICKET-109-create-payroll-export-service.md) | Service | TODO |
| 110 | [create-payroll-export-handler](TICKET-110-create-payroll-export-handler.md) | Handler | TODO |

---

## PHASE 8: Integration Tests (PENDING)

### Sprint 23: Integration Tests
| # | Ticket | Type | Status |
|---|--------|------|--------|
| 111 | [create-booking-integration-test](TICKET-111-create-booking-integration-test.md) | Test | TODO |
| 112 | [create-calculation-integration-test](TICKET-112-create-calculation-integration-test.md) | Test | TODO |
| 113 | [create-absence-integration-test](TICKET-113-create-absence-integration-test.md) | Test | TODO |
| 114 | [create-monthly-closing-integration-test](TICKET-114-create-monthly-closing-integration-test.md) | Test | TODO |
| 115 | [create-payroll-export-integration-test](TICKET-115-create-payroll-export-integration-test.md) | Test | TODO |
| 116 | [create-end-to-end-integration-test](TICKET-116-create-end-to-end-integration-test.md) | Test | TODO |

---

## PHASE 9: ZMI Enhancements (PENDING)

### Sprint 24: Day Plan ZMI Features
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 117 | [align-handlers-with-openapi-spec](TICKET-117-align-handlers-with-openapi-spec-DONE.md) | Refactor | DONE | - |
| 118 | [add-missing-day-plan-zmi-fields](TICKET-118-add-missing-day-plan-zmi-fields.md) | Migration/Model | TODO | Regelarbeitszeit 2, FromEmployeeMaster, VariableWorkTime, RoundAllBookings, HolidayCredit, VacationDeduction, NoBookingBehavior, DayChangeBehavior, ShiftDetection |

### Sprint 25: Additional ZMI Calculations
| # | Ticket | Type | Status | ZMI Features |
|---|--------|------|--------|--------------|
| 119 | [create-shift-detection-logic](TICKET-119-create-shift-detection-logic.md) | Calculation | TODO | Schichterkennung (arrival/departure windows, 6 alternatives) |
| 120 | [create-capping-account-logic](TICKET-120-create-capping-account-logic.md) | Calculation | TODO | Kappungskonto (early arrival, max net time) |
| 121 | [create-surcharge-calculation-logic](TICKET-121-create-surcharge-calculation-logic.md) | Calculation | TODO | Zuschläge (time windows, holiday/workday) |
| 122 | [add-rounding-add-subtract-modes](TICKET-122-add-rounding-add-subtract-modes.md) | Calculation | TODO | Wert addieren/subtrahieren |

---

## Summary Statistics

| Category | Done | Todo | Total |
|----------|------|------|-------|
| Migrations | 24 | 15 | 39 |
| Models | 18 | 12 | 30 |
| Repositories | 16 | 8 | 24 |
| Services | 15 | 10 | 25 |
| Handlers | 15 | 8 | 23 |
| Calculation | 11 | 10 | 21 |
| Tests | 0 | 6 | 6 |
| **Total** | **71** | **60** | **131** |

---

## Recommended Implementation Order (Dependency-Safe)

### Week 1: Foundation Migrations
1. TICKET-123: Employee ZMI fields migration (000027)
2. TICKET-124: Holiday ZMI fields migration (000028)
3. TICKET-125: Tariff ZMI fields migration (000029)
4. TICKET-118: Day plan ZMI fields migration (000030)

### Week 2: Model Updates
5. TICKET-129: Employee model update
6. TICKET-130: Holiday model update
7. TICKET-131: Tariff model update
8. TICKET-122: Rounding add/subtract modes

### Week 3: Absence System
9. TICKET-074: Absence types migration (000025)
10. TICKET-075: Absence type model/repo
11. TICKET-076: Absence days migration (000026)
12. TICKET-077-079: Absence day model/repo/service/handler

### Week 4: Daily Calculation Completion
13. TICKET-127: Holiday average calculation
14. TICKET-128: Day change implementation
15. TICKET-070: Daily calculation service (now complete)
16. TICKET-119: Shift detection logic

### Week 5: Advanced Features
17. TICKET-120: Capping account logic
18. TICKET-121: Surcharge calculation
19. TICKET-126: Capping rules system

### Week 6: Vacation & Monthly
20. TICKET-082: Vacation calculation (now has dependencies)
21. TICKET-089: Monthly aggregation

---

## Dependency Graph (Critical Paths)

```
TICKET-123 (Employee ZMI) ──┬── TICKET-129 (Employee Model) ──┬── TICKET-082 (Vacation Calc)
                           │                                 │
TICKET-124 (Holiday ZMI) ──┼── TICKET-130 (Holiday Model) ───┼── TICKET-070 (Daily Calc Service)
                           │                                 │
TICKET-125 (Tariff ZMI) ───┼── TICKET-131 (Tariff Model) ────┤
                           │                                 │
TICKET-118 (DayPlan ZMI) ──┴── TICKET-119 (Shift Detection)  │
                               TICKET-122 (Rounding)         │
                               TICKET-127 (Holiday Avg) ─────┤
                               TICKET-128 (Day Change) ──────┘

TICKET-074 (Absence Types) ── TICKET-075 (Absence Model) ── TICKET-076 (Absence Days)

TICKET-126 (Capping Rules) ── TICKET-120 (Capping Logic) ── TICKET-089 (Monthly Agg)
```

---

## Testing Requirements

**All tickets include comprehensive unit tests as Definition of Done.**

Each ticket specifies:
- Table-driven tests for all ZMI edge cases
- Mock-based service tests
- Integration test requirements (Phase 8)
