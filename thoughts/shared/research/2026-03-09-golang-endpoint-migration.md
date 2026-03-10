# Go API to tRPC Migration Gap Analysis

**Date**: 2026-03-09
**Branch**: staging
**Source**: `apps/api/internal/handler/routes.go` (Go) vs `src/trpc/routers/_app.ts` (tRPC)

---

## Summary of Findings

The Go backend defines **~50 route groups** covering approximately **280+ individual endpoints**. The tRPC backend currently has **69 router files** registered in `_app.ts`.

**Overall migration status**: ~90% complete.

**Fully migrated** (all CRUD + special endpoints present): 55 route groups
**Partially migrated** (router exists but missing specific endpoints): 3 route groups
**Not migrated at all** (no router, no service): 4 route groups

### Critical gaps:
1. **Accounts** -- CRUD + usage endpoint (router + service needed)
2. **Account Groups** -- CRUD (router + service needed)
3. **Contact Types** -- CRUD (Prisma model + migration + router + service needed)
4. **Contact Kinds** -- CRUD (Prisma model + migration + router + service needed)
5. **Daily Values** -- missing `getById` and `recalculate` procedures
6. **Booking audit logs** -- missing `GET /bookings/{id}/logs`
7. **Vacation Balance initialize** -- missing `POST /vacation-balances/initialize`
8. **Monthly eval daily breakdown** -- missing `GET /employees/{id}/months/{year}/{month}/days`
9. **Employee teams lookup** -- missing `GET /employees/{employee_id}/teams`

---

## Already Migrated Endpoints (complete)

These Go route groups have full tRPC equivalents with all endpoints covered:

| Go Route Group | tRPC Router | Status |
|---|---|---|
| RegisterAuthRoutes | auth.ts | Complete |
| RegisterUserRoutes | users.ts | Complete |
| RegisterTenantRoutes | tenants.ts | Complete |
| RegisterPermissionRoutes | permissions.ts | Complete |
| RegisterHolidayRoutes | holidays.ts | Complete (incl. generate, copy) |
| RegisterCostCenterRoutes | costCenters.ts | Complete |
| RegisterEmploymentTypeRoutes | employmentTypes.ts | Complete |
| RegisterUserGroupRoutes | userGroups.ts | Complete |
| RegisterDepartmentRoutes | departments.ts | Complete (incl. getTree) |
| RegisterTeamRoutes | teams.ts | Complete (incl. members CRUD) |
| RegisterEmployeeRoutes | employees.ts | Complete (incl. contacts, cards, search, bulkAssignTariff, dayView, calculateDay) |
| RegisterDayPlanRoutes | dayPlans.ts | Complete (incl. copy, breaks, bonuses) |
| RegisterWeekPlanRoutes | weekPlans.ts | Complete |
| RegisterTariffRoutes | tariffs.ts | Complete (incl. breaks) |
| RegisterBookingTypeRoutes | bookingTypes.ts | Complete |
| RegisterBookingReasonRoutes | bookingReasons.ts | Complete |
| RegisterBookingTypeGroupRoutes | bookingTypeGroups.ts | Complete |
| RegisterAbsenceRoutes (absence types) | absenceTypes.ts | Complete |
| RegisterAbsenceRoutes (absences CRUD + workflow) | absences.ts | Complete (incl. forEmployee, approve/reject/cancel) |
| RegisterAbsenceTypeGroupRoutes | absenceTypeGroups.ts | Complete |
| RegisterCalculationRuleRoutes | calculationRules.ts | Complete |
| RegisterVacationSpecialCalcRoutes | vacationSpecialCalcs.ts | Complete |
| RegisterVacationCalcGroupRoutes | vacationCalcGroups.ts | Complete |
| RegisterVacationCappingRuleRoutes | vacationCappingRules.ts | Complete |
| RegisterVacationCappingRuleGroupRoutes | vacationCappingRuleGroups.ts | Complete |
| RegisterEmployeeCappingExceptionRoutes | employeeCappingExceptions.ts | Complete |
| RegisterVacationRoutes | vacation.ts | Complete (getBalance) |
| RegisterVacationEntitlementRoutes | vacation.ts | Complete (entitlementPreview) |
| RegisterVacationCarryoverRoutes | vacation.ts | Complete (carryoverPreview) |
| RegisterEmployeeTariffAssignmentRoutes | employeeTariffAssignments.ts | Complete (incl. effectiveTariff) |
| RegisterActivityRoutes | activities.ts | Complete |
| RegisterOrderRoutes | orders.ts | Complete |
| RegisterOrderAssignmentRoutes | orderAssignments.ts | Complete (incl. byOrder) |
| RegisterOrderBookingRoutes | orderBookings.ts | Complete |
| RegisterGroupRoutes | groups.ts | Complete (employee/workflow/activity groups) |
| RegisterEvaluationRoutes | evaluations.ts | Complete (5 query types) |
| RegisterExportInterfaceRoutes | exportInterfaces.ts | Complete (incl. accounts) |
| RegisterPayrollExportRoutes | payrollExports.ts | Complete (incl. generate, download, preview) |
| RegisterReportRoutes | reports.ts | Complete (incl. generate, download) |
| RegisterScheduleRoutes | schedules.ts | Complete (tasks, execute, executions, catalog) |
| RegisterSystemSettingsRoutes | systemSettings.ts | Complete (incl. 4 cleanup ops) |
| RegisterEmployeeMessageRoutes | employeeMessages.ts | Complete (incl. send, listForEmployee) |
| RegisterNotificationRoutes | notifications.ts | Complete (incl. preferences) |
| RegisterEmployeeDayPlanRoutes | employeeDayPlans.ts | Complete (incl. bulk, deleteRange, generateFromTariff) |
| RegisterCorrectionAssistantRoutes | correctionAssistant.ts | Complete |
| RegisterCorrectionRoutes | corrections.ts | Complete (incl. approve/reject) |
| RegisterTerminalBookingRoutes | terminalBookings.ts | Complete (list, import, batches, batch) |
| RegisterAccessZoneRoutes | accessZones.ts | Complete |
| RegisterAccessProfileRoutes | accessProfiles.ts | Complete |
| RegisterEmployeeAccessAssignmentRoutes | employeeAccessAssignments.ts | Complete |
| RegisterShiftRoutes | shifts.ts | Complete |
| RegisterMacroRoutes | macros.ts | Complete (incl. assignments, execute, executions) |
| RegisterVehicleRoutes | vehicles.ts | Complete |
| RegisterVehicleRouteRoutes | vehicleRoutes.ts | Complete |
| RegisterTripRecordRoutes | tripRecords.ts | Complete |
| RegisterTravelAllowanceRuleSetRoutes | travelAllowanceRuleSets.ts | Complete |
| RegisterLocalTravelRuleRoutes | localTravelRules.ts | Complete |
| RegisterExtendedTravelRuleRoutes | extendedTravelRules.ts | Complete |
| RegisterTravelAllowancePreviewRoutes | travelAllowancePreview.ts | Complete |
| RegisterLocationRoutes | locations.ts | Complete |
| RegisterMonthlyEvalTemplateRoutes | monthlyEvalTemplates.ts | Complete (incl. default, setDefault) |
| RegisterDailyAccountValueRoutes | dailyAccountValues.ts | Complete |
| RegisterMonthlyEvalRoutes | monthlyValues.ts | Mostly complete (see gaps below) |
| RegisterMonthlyValueRoutes | monthlyValues.ts | Complete |

---

## Endpoints Still Needing Migration

### 1. Accounts CRUD (HIGH PRIORITY)

**Go route**: `RegisterAccountRoutes` in `routes.go:131-151`
**Go handler**: `apps/api/internal/handler/account.go`
**Go service**: `apps/api/internal/service/account.go`
**Go repository**: `apps/api/internal/repository/account.go`

**Endpoints**:
- `GET /accounts` -- List accounts (supports filters: include_system, active_only, active, account_type)
- `POST /accounts` -- Create account
- `GET /accounts/{id}` -- Get account by ID
- `GET /accounts/{id}/usage` -- Get account usage (which day plans reference it)
- `PATCH /accounts/{id}` -- Update account
- `DELETE /accounts/{id}` -- Delete account

**Permission**: `accounts.manage`

**Prisma model**: `Account` exists in `prisma/schema.prisma`
**Existing hooks**: `src/hooks/use-accounts.ts` (uses legacy API)

**What's needed**:
- `src/lib/services/account-repository.ts`
- `src/lib/services/account-service.ts`
- `src/trpc/routers/accounts.ts`
- Register in `_app.ts`
- Update `src/hooks/use-accounts.ts` to use tRPC

---

### 2. Account Groups CRUD (HIGH PRIORITY)

**Go route**: `RegisterAccountGroupRoutes` in `routes.go:153-171`
**Go handler**: `apps/api/internal/handler/accountgroup.go`
**Go service**: `apps/api/internal/service/accountgroup.go`
**Go repository**: `apps/api/internal/repository/accountgroup.go`

**Endpoints**:
- `GET /account-groups` -- List account groups
- `POST /account-groups` -- Create account group
- `GET /account-groups/{id}` -- Get by ID
- `PATCH /account-groups/{id}` -- Update
- `DELETE /account-groups/{id}` -- Delete

**Permission**: `accounts.manage`

**Prisma model**: `AccountGroup` exists in `prisma/schema.prisma`
**Existing hooks**: `src/hooks/use-account-groups.ts` (uses legacy API)

**What's needed**:
- `src/lib/services/account-group-repository.ts`
- `src/lib/services/account-group-service.ts`
- `src/trpc/routers/accountGroups.ts`
- Register in `_app.ts`
- Update `src/hooks/use-account-groups.ts` to use tRPC

---

### 3. Contact Types CRUD (MEDIUM PRIORITY)

**Go route**: `RegisterContactTypeRoutes` in `routes.go:1249-1267`
**Go handler**: `apps/api/internal/handler/contacttype.go`
**Go service**: `apps/api/internal/service/contacttype.go`
**Go model**: `apps/api/internal/model/contacttype.go` -- `ContactType` struct with fields: id, tenant_id, code, name, data_type, description, is_active, sort_order

**Endpoints**:
- `GET /contact-types` -- List contact types (filter: active)
- `POST /contact-types` -- Create
- `GET /contact-types/{id}` -- Get by ID
- `PATCH /contact-types/{id}` -- Update
- `DELETE /contact-types/{id}` -- Delete

**Permission**: `contact_management.manage`

**Schema gap**: `ContactType` model does NOT exist in Prisma schema. The table (`contact_types`) was created by Go GORM automigration.
**Existing hooks**: `src/hooks/use-contact-types.ts` (uses legacy API)

**What's needed**:
- Supabase migration to create `contact_types` table (or confirm it already exists from Go GORM)
- Add `ContactType` model to `prisma/schema.prisma`
- `src/lib/services/contact-type-repository.ts`
- `src/lib/services/contact-type-service.ts`
- `src/trpc/routers/contactTypes.ts`
- Register in `_app.ts`
- Update `src/hooks/use-contact-types.ts` to use tRPC

---

### 4. Contact Kinds CRUD (MEDIUM PRIORITY)

**Go route**: `RegisterContactKindRoutes` in `routes.go:1356-1374`
**Go handler**: `apps/api/internal/handler/contactkind.go`
**Go service**: `apps/api/internal/service/contactkind.go`
**Go model**: `apps/api/internal/model/contacttype.go` -- `ContactKind` struct with fields: id, tenant_id, contact_type_id, code, label, is_active, sort_order

**Endpoints**:
- `GET /contact-kinds` -- List (filter: contact_type_id, active)
- `POST /contact-kinds` -- Create
- `GET /contact-kinds/{id}` -- Get by ID
- `PATCH /contact-kinds/{id}` -- Update
- `DELETE /contact-kinds/{id}` -- Delete

**Permission**: `contact_management.manage`

**Schema gap**: `ContactKind` model does NOT exist in Prisma schema. Referenced by `EmployeeContact.contactKindId` FK but the model itself is missing (noted in schema comment on line 673).
**Existing hooks**: `src/hooks/use-contact-kinds.ts` (uses legacy API)

**What's needed**:
- Supabase migration (or confirm GORM-created table exists)
- Add `ContactKind` model to `prisma/schema.prisma` + relation to `EmployeeContact`
- `src/lib/services/contact-kind-repository.ts`
- `src/lib/services/contact-kind-service.ts`
- `src/trpc/routers/contactKinds.ts`
- Register in `_app.ts`
- Update `src/hooks/use-contact-kinds.ts` to use tRPC

---

### 5. Daily Values -- Missing Procedures (MEDIUM PRIORITY)

**Go handler**: `apps/api/internal/handler/dailyvalue.go`

**Missing from `src/trpc/routers/dailyValues.ts`**:

| Go Endpoint | Description | Status |
|---|---|---|
| `GET /daily-values/{id}` | Get single daily value by ID | MISSING |
| `POST /daily-values/recalculate` | Recalculate daily values for a date range + employee(s) | MISSING |

**Existing procedures**: `list`, `listAll`, `approve`

**What's needed**:
- Add `getById` query to `dailyValues.ts` (and repository method if needed)
- Add `recalculate` mutation to `dailyValues.ts` (calls `RecalcService`)
- Both require `time_tracking.view_all` / `booking_overview.calculate_day` permissions

---

### 6. Booking Audit Logs (LOW PRIORITY)

**Go route**: `GET /bookings/{id}/logs` in `routes.go:443`
**Go handler**: `booking.go` `GetLogs` method

Returns audit log entries for a specific booking (fetches from `audit_logs` where entity_type='booking' and entity_id=bookingId).

**What's needed**:
- Add `getLogs` query to `src/trpc/routers/bookings.ts`
- Query `AuditLog` where `entityType='booking'` and `entityId=input.id`
- Requires employee-scoped permission (`time_tracking.view_own` / `time_tracking.view_all`)

---

### 7. Vacation Balance Initialize (MEDIUM PRIORITY)

**Go route**: `POST /vacation-balances/initialize` in `routes.go:1582`
**Go handler**: `vacation_balance.go` `Initialize` method

Initializes vacation balances for ALL active employees for a given year. Optionally carries over balances from previous year.

**Input**: `{ year: number, carryover?: boolean }`
**Permission**: `absences.manage`

**What's needed**:
- Add `initialize` mutation to `src/trpc/routers/vacationBalances.ts`
- Add corresponding method in `src/lib/services/vacation-balances-service.ts`

---

### 8. Monthly Eval Daily Breakdown (LOW PRIORITY)

**Go route**: `GET /employees/{id}/months/{year}/{month}/days` in `routes.go:580`
**Go handler**: `monthlyeval.go` `GetDailyBreakdown` method

Returns daily value breakdown for a specific employee/year/month. Lists all daily values for that month with detail fields.

**What's needed**:
- Add `dailyBreakdown` query to `src/trpc/routers/monthlyValues.ts`
- Input: `{ employeeId, year, month }`
- Returns array of daily value items for that month
- Requires `reports.view` permission

---

### 9. Employee Teams Lookup (LOW PRIORITY)

**Go route**: `GET /employees/{employee_id}/teams` in `routes.go:256-259`
**Go handler**: `team.go` `GetEmployeeTeams` method

Returns all teams that a specific employee belongs to.

**What's needed**:
- Add `getEmployeeTeams` query to `src/trpc/routers/teams.ts`
- Input: `{ employeeId: string }`
- Query `TeamMember` where `employeeId` matches, include `Team`
- Requires `teams.manage` permission

---

## Services/Repositories That Need to Be Created

| Service/Repository | For | Prisma Model Exists |
|---|---|---|
| `account-repository.ts` + `account-service.ts` | Accounts CRUD + usage | Yes (`Account`) |
| `account-group-repository.ts` + `account-group-service.ts` | Account groups CRUD | Yes (`AccountGroup`) |
| `contact-type-repository.ts` + `contact-type-service.ts` | Contact types CRUD | **No** (needs Prisma model) |
| `contact-kind-repository.ts` + `contact-kind-service.ts` | Contact kinds CRUD | **No** (needs Prisma model) |

---

## Schema Gaps (Go Models Not in Prisma)

| Go Model | Go File | In Prisma? | Notes |
|---|---|---|---|
| `ContactType` | `model/contacttype.go` | **No** | Table: `contact_types`. Fields: id, tenant_id, code, name, data_type, description, is_active, sort_order |
| `ContactKind` | `model/contacttype.go` | **No** | Table: `contact_kinds`. Fields: id, tenant_id, contact_type_id, code, label, is_active, sort_order. FK to ContactType. Referenced by EmployeeContact.contactKindId |

All other Go models have corresponding Prisma models.

Note: The `contact_types` and `contact_kinds` tables were created by Go's GORM automigration and may already exist in the database. However, they are NOT in any Supabase migration file. A migration will be needed to either:
1. Create the tables if they don't exist (for fresh deployments), OR
2. Simply add the Prisma models pointing at existing tables (if table already exists from GORM)

---

## Priority Ordering for Implementation

1. **Accounts + Account Groups** -- HIGH: Used by day plans, calculation rules, export interfaces. Frontend hooks already exist but point to legacy API.
2. **Daily Values getById + recalculate** -- MEDIUM: Used by the booking overview / admin daily value views.
3. **Vacation Balance initialize** -- MEDIUM: Used by admin workflow to set up vacation year.
4. **Contact Types + Contact Kinds** -- MEDIUM: Requires Prisma schema changes + migration. Used by employee contact management.
5. **Monthly eval daily breakdown** -- LOW: Supplementary data view for monthly evaluations.
6. **Booking audit logs** -- LOW: Audit trail for individual bookings.
7. **Employee teams lookup** -- LOW: Convenience endpoint, teams data is also available via teams.list.
