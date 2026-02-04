---
date: 2026-02-02T16:03:45+01:00
researcher: tolga
git_commit: 57b15ef5ef1145e4efedf36716593ede77b0932f
branch: master
repository: terp
topic: "Which backend endpoint use cases are NOT implemented properly in the Frontend yet?"
tags: [research, codebase, frontend, backend, api-coverage, gaps]
status: complete
last_updated: 2026-02-02
last_updated_by: tolga
---

# Research: Frontend-Backend API Coverage Gaps

**Date**: 2026-02-02T16:03:45+01:00
**Git Commit**: 57b15ef5ef1145e4efedf36716593ede77b0932f
**Branch**: master
**Repository**: terp

## Research Question
Which backend endpoint use cases are NOT implemented properly in the Frontend yet?

## Summary

The backend exposes **~350+ endpoints** across **60+ resource groups**. The frontend currently integrates with **~130 endpoints** across **~15 resource domains**. This means roughly **220+ backend endpoints (~63%)** have no frontend integration whatsoever.

The gaps fall into two categories:
1. **Entire domains with zero frontend coverage** (~45 resource groups, ~200+ endpoints)
2. **Partially covered domains** where some CRUD operations are missing (~20 endpoints across 8 domains)

---

## Detailed Findings

### A. Entire Backend Domains with ZERO Frontend Integration

#### A1. Administration & Configuration

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Tenants** | List, Create, Get, Update, Delete (5) | `handler/tenant.go` |
| **System Settings** | Get, Update + 4 cleanup ops (6) | `handler/systemsettings.go` |
| **Audit Logs** | List, GetByID (2) | `handler/auditlog.go` |
| **Locations** | List, Create, Get, Update, Delete (5) | `handler/location.go` |
| **Contact Types** | List, Create, Get, Update, Delete (5) | `handler/contacttype.go` |
| **Contact Kinds** | List, Create, Get, Update, Delete (5) | `handler/contactkind.go` |

#### A2. Grouping & Classification

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Account Groups** | List, Create, Get, Update, Delete (5) | `handler/accountgroup.go` |
| **Booking Reasons** | List, Create, Get, Update, Delete (5) | `handler/bookingreason.go` |
| **Booking Type Groups** | List, Create, Get, Update, Delete (5) | `handler/bookingtypegroup.go` |
| **Absence Type Groups** | List, Create, Get, Update, Delete (5) | `handler/absencetypegroup.go` |
| **Employee Groups** | List, Create, Get, Update, Delete (5) | `handler/group.go` |
| **Workflow Groups** | List, Create, Get, Update, Delete (5) | `handler/group.go` |
| **Activity Groups** | List, Create, Get, Update, Delete (5) | `handler/group.go` |

#### A3. Calculation Rules & Vacation Configuration

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Calculation Rules** | List, Create, Get, Update, Delete (5) | `handler/calculationrule.go` |
| **Employee Tariff Assignments** | List, Create, Get, Update, Delete + GetEffectiveTariff (6) | `handler/employeetariffassignment.go` |
| **Employee Day Plans** | List, Create, BulkCreate, DeleteRange, Get, Update, Delete (7) | `handler/employeedayplan.go` |
| **Vacation Special Calculations** | List, Create, Get, Update, Delete (5) | `handler/vacationspecialcalc.go` |
| **Vacation Calculation Groups** | List, Create, Get, Update, Delete (5) | `handler/vacationcalcgroup.go` |
| **Vacation Capping Rules** | List, Create, Get, Update, Delete (5) | `handler/vacationcappingrule.go` |
| **Vacation Capping Rule Groups** | List, Create, Get, Update, Delete (5) | `handler/vacationcappingrulegroup.go` |
| **Employee Capping Exceptions** | List, Create, Get, Update, Delete (5) | `handler/employeecappingexception.go` |
| **Vacation Entitlement Preview** | Preview (1) | `handler/vacation.go` |
| **Vacation Carryover Preview** | Preview (1) | `handler/vacationcarryover.go` |

#### A4. Corrections & Error Handling

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Corrections** | List, Create, Get, Update, Delete, Approve, Reject (7) | `handler/correction.go` |
| **Correction Assistant** | ListMessages, GetMessage, UpdateMessage, ListItems (4) | `handler/correction_assistant.go` |

#### A5. Monthly Evaluation Configuration

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Monthly Values** | List, CloseBatch, Recalculate, Get, Close, Reopen (6) | `handler/monthly_value.go` |
| **Monthly Evaluation Templates** | List, Create, GetDefault, Get, Update, Delete, SetDefault (7) | `handler/monthly_evaluation_template.go` |

#### A6. Orders & Activities

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Activities** | List, Create, Get, Update, Delete (5) | `handler/activity.go` |
| **Orders** | List, Create, Get, Update, Delete + ListAssignments (6) | `handler/order.go` |
| **Order Assignments** | List, Create, Get, Update, Delete (5) | `handler/order_assignment.go` |
| **Order Bookings** | List, Create, Get, Update, Delete (5) | `handler/order_booking.go` |

#### A7. Evaluations, Reports & Exports

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Evaluations** | ListDailyValues, ListBookings, ListTerminalBookings, ListLogs, ListWorkflowHistory (5) | `handler/evaluation.go` |
| **Export Interfaces** | List, Create, Get, Update, Delete, SetAccounts, ListAccounts (7) | `handler/exportinterface.go` |
| **Payroll Exports** | List, Generate, Get, Delete, Download, Preview (6) | `handler/payrollexport.go` |
| **Reports** | List, Generate, Get, Delete, Download (5) | `handler/report.go` |

#### A8. Scheduling & Automation

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Schedules** | List, Create, Get, Update, Delete + tasks (AddTask, UpdateTask, RemoveTask, ListTasks) + execution (TriggerExecution, ListExecutions, GetExecution) + GetTaskCatalog (13) | `handler/schedule.go` |
| **Macros** | List, Create, Get, Update, Delete + assignments (4) + execution (3) (12) | `handler/macro.go` |
| **Employee Messages** | List, Create, Get, Send (4) | `handler/employee_message.go` |

#### A9. Terminal & Access Control

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Terminal Bookings** | ListRawBookings, TriggerImport (2) | `handler/terminal.go` |
| **Import Batches** | List, Get (2) | `handler/terminal.go` |
| **Access Zones** | List, Create, Get, Update, Delete (5) | `handler/access_zone.go` |
| **Access Profiles** | List, Create, Get, Update, Delete (5) | `handler/access_profile.go` |
| **Employee Access Assignments** | List, Create, Get, Update, Delete (5) | `handler/employee_access_assignment.go` |

#### A10. Fleet & Travel

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Vehicles** | List, Create, Get, Update, Delete (5) | `handler/vehicle.go` |
| **Vehicle Routes** | List, Create, Get, Update, Delete (5) | `handler/vehicle_route.go` |
| **Trip Records** | List, Create, Get, Update, Delete (5) | `handler/trip_record.go` |
| **Travel Allowance Rule Sets** | List, Create, Get, Update, Delete (5) | `handler/travel_allowance_rule_set.go` |
| **Local Travel Rules** | List, Create, Get, Update, Delete (5) | `handler/local_travel_rule.go` |
| **Extended Travel Rules** | List, Create, Get, Update, Delete (5) | `handler/extended_travel_rule.go` |
| **Travel Allowance Preview** | Preview (1) | `handler/travel_allowance_preview.go` |

#### A11. Shift Planning

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Shifts** | List, Create, Get, Update, Delete (5) | `handler/shift.go` |
| **Shift Assignments** | List, Create, Get, Update, Delete (5) | `handler/shift_assignment.go` |

#### A12. Other Missing

| Domain | Backend Endpoints | Handler File |
|--------|-------------------|--------------|
| **Daily Account Values** | List (1) | `handler/daily_account_value.go` |

---

### B. Partially Covered Domains (Some Operations Missing)

#### B1. Users

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/users` | Yes | Yes (`useUsers`) |
| POST `/users` | Yes | **NO** |
| GET `/users/{id}` | Yes | Yes (`useUser`) |
| PATCH `/users/{id}` | Yes | Yes (`useUpdateUser`) |
| DELETE `/users/{id}` | Yes | **NO** |
| POST `/users/{id}/password` | Yes | **NO** |

**Missing in frontend**: Create user, Delete user, Change password

#### B2. Absences

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/absences` | Yes | Yes (`useAbsences`) |
| GET `/absences/{id}` | Yes | Yes (`useAbsence`) |
| **PATCH** `/absences/{id}` | Yes | **NO** |
| DELETE `/absences/{id}` | Yes | Yes (`useDeleteAbsence`) |
| POST `/absences/{id}/approve` | Yes | Yes (`useApproveAbsence`) |
| POST `/absences/{id}/reject` | Yes | Yes (`useRejectAbsence`) |
| **POST** `/absences/{id}/cancel` | Yes | **NO** |
| POST `/employees/{id}/absences` | Yes | Yes (`useCreateAbsenceRange`) |
| GET `/employees/{id}/absences` | Yes | Yes (`useEmployeeAbsences`) |

**Missing in frontend**: Update absence (PATCH), Cancel absence

#### B3. Vacation Balances

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/vacation-balances` | Yes | Yes (`useVacationBalances`) |
| **POST** `/vacation-balances` | Yes | **NO** |
| **POST** `/vacation-balances/initialize` | Yes | **NO** |
| GET `/vacation-balances/{id}` | Yes | Yes (`useVacationBalance`) |
| **PATCH** `/vacation-balances/{id}` | Yes | **NO** |
| GET `/employees/{id}/vacation-balance` | Yes | Yes (`useEmployeeVacationBalance`) |

**Missing in frontend**: Create balance, Initialize balances, Update balance

#### B4. Cost Centers

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/cost-centers` | Yes | Yes (`useCostCenters`) |
| **POST** `/cost-centers` | Yes | **NO** |
| GET `/cost-centers/{id}` | Yes | Yes (`useCostCenter`) |
| **PATCH** `/cost-centers/{id}` | Yes | **NO** |
| **DELETE** `/cost-centers/{id}` | Yes | **NO** |

**Missing in frontend**: Create, Update, Delete

#### B5. Employment Types

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/employment-types` | Yes | Yes (`useEmploymentTypes`) |
| **POST** `/employment-types` | Yes | **NO** |
| GET `/employment-types/{id}` | Yes | Yes (`useEmploymentType`) |
| **PATCH** `/employment-types/{id}` | Yes | **NO** |
| **DELETE** `/employment-types/{id}` | Yes | **NO** |

**Missing in frontend**: Create, Update, Delete

#### B6. Daily Values

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/daily-values` | Yes | Yes (`useAllDailyValues`) |
| **POST** `/daily-values/recalculate` | Yes | **NO** |
| **GET** `/daily-values/{id}` | Yes | **NO** |
| POST `/daily-values/{id}/approve` | Yes | Yes (`useApproveDailyValue`) |

**Missing in frontend**: Recalculate, Get by ID

#### B7. Bookings

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/bookings` | Yes | Yes |
| POST `/bookings` | Yes | Yes |
| GET `/bookings/{id}` | Yes | Yes |
| PUT `/bookings/{id}` | Yes | Yes |
| DELETE `/bookings/{id}` | Yes | Yes |
| **GET** `/bookings/{id}/logs` | Yes | **NO** |

**Missing in frontend**: Booking audit logs

#### B8. Employees (minor gaps)

| Endpoint | Backend | Frontend |
|----------|---------|----------|
| GET `/employees/search` | Yes | **NO** (uses list with search param instead) |
| GET `/employees/{employee_id}/teams` | Yes | **NO** |
| GET `/employees/{id}/messages` | Yes | **NO** |

**Missing in frontend**: Dedicated search endpoint, employee teams, employee messages

---

## Quantitative Summary

| Category | Backend Endpoints | Frontend Endpoints | Gap |
|----------|------------------:|-------------------:|----:|
| Auth | 7 | 6 | 1 |
| Users | 6 | 3 | 3 |
| Tenants | 5 | 0 | 5 |
| Employees | 16 | 13 | 3 |
| Bookings | 6 | 5 | 1 |
| Booking Types | 5 | 5 | 0 |
| Booking Reasons | 5 | 0 | 5 |
| Booking Type Groups | 5 | 0 | 5 |
| Day Plans | 10 | 10 | 0 |
| Week Plans | 5 | 5 | 0 |
| Employee Day Plans | 7 | 0 | 7 |
| Tariffs | 7 | 7 | 0 |
| Employee Tariff Assignments | 6 | 0 | 6 |
| Departments | 6 | 6 | 0 |
| Teams | 10 | 10 | 0 |
| Holidays | 7 | 7 | 0 |
| Cost Centers | 5 | 2 | 3 |
| Employment Types | 5 | 2 | 3 |
| Accounts | 6 | 6 | 0 |
| Account Groups | 5 | 0 | 5 |
| Absences | 9 | 7 | 2 |
| Absence Types | 5 | 5 | 0 |
| Absence Type Groups | 5 | 0 | 5 |
| Daily Values | 4 | 2 | 2 |
| Daily Account Values | 1 | 0 | 1 |
| Monthly Values | 6 | 0 | 6 |
| Monthly Eval Templates | 7 | 0 | 7 |
| Employee Monthly | 6 | 6 | 0 |
| Vacation Balances | 5 | 2 | 3 |
| Vacation Special Calcs | 5 | 0 | 5 |
| Vacation Calc Groups | 5 | 0 | 5 |
| Vacation Capping Rules | 5 | 0 | 5 |
| Vacation Capping Groups | 5 | 0 | 5 |
| Employee Capping Exceptions | 5 | 0 | 5 |
| Vacation Entitlement Preview | 1 | 0 | 1 |
| Vacation Carryover Preview | 1 | 0 | 1 |
| Calculation Rules | 5 | 0 | 5 |
| Corrections | 7 | 0 | 7 |
| Correction Assistant | 4 | 0 | 4 |
| Notifications | 6 | 6 | 0 |
| Permissions | 1 | 1 | 0 |
| User Groups | 5 | 5 | 0 |
| Locations | 5 | 0 | 5 |
| Audit Logs | 2 | 0 | 2 |
| Groups (Emp/Wkflw/Act) | 15 | 0 | 15 |
| Activities | 5 | 0 | 5 |
| Orders | 6 | 0 | 6 |
| Order Assignments | 5 | 0 | 5 |
| Order Bookings | 5 | 0 | 5 |
| Evaluations | 5 | 0 | 5 |
| Export Interfaces | 7 | 0 | 7 |
| Payroll Exports | 6 | 0 | 6 |
| Reports | 5 | 0 | 5 |
| Schedules | 13 | 0 | 13 |
| Macros | 12 | 0 | 12 |
| System Settings | 6 | 0 | 6 |
| Employee Messages | 4 | 0 | 4 |
| Contact Types | 5 | 0 | 5 |
| Contact Kinds | 5 | 0 | 5 |
| Terminal Bookings | 4 | 0 | 4 |
| Access Zones | 5 | 0 | 5 |
| Access Profiles | 5 | 0 | 5 |
| Employee Access Assign | 5 | 0 | 5 |
| Vehicles | 5 | 0 | 5 |
| Vehicle Routes | 5 | 0 | 5 |
| Trip Records | 5 | 0 | 5 |
| Travel Allowance Rules | 5 | 0 | 5 |
| Local Travel Rules | 5 | 0 | 5 |
| Extended Travel Rules | 5 | 0 | 5 |
| Travel Allowance Preview | 1 | 0 | 1 |
| Shifts | 5 | 0 | 5 |
| Shift Assignments | 5 | 0 | 5 |
| **TOTAL** | **~350** | **~130** | **~220** |

## Code References

### Backend route registration
- `apps/api/internal/handler/routes.go` - All Register*Routes functions
- `apps/api/cmd/server/main.go:489-571` - Route mounting

### Frontend API infrastructure
- `apps/web/src/lib/api/client.ts` - openapi-fetch client setup
- `apps/web/src/hooks/use-api-query.ts` - Generic GET hook
- `apps/web/src/hooks/use-api-mutation.ts` - Generic mutation hook
- `apps/web/src/hooks/api/` - All domain-specific API hooks

## Open Questions

1. Are there planned phases/sprints for implementing the missing frontend domains?
2. Which of the missing domains are highest priority for the frontend? (e.g., corrections, reports, payroll exports seem business-critical)
3. Are some backend domains intentionally backend-only (e.g., terminal bookings import, macros/schedules might be admin-only)?
