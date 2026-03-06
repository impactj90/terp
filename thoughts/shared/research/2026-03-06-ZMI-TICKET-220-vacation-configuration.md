# Research: ZMI-TICKET-220 - Vacation Configuration

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-220
**Status:** Research Complete

## Overview

This ticket requires implementing tRPC routers for 5 vacation configuration entities (VacationSpecialCalc, VacationCalcGroup, VacationCappingRule, VacationCappingRuleGroup, EmployeeCappingException), plus 2 preview endpoints (entitlement preview and carryover preview), and migrating 27 frontend hooks.

---

## 1. Go Source Files (Business Logic to Port)

### 1.1 VacationSpecialCalc

**Service:** `apps/api/internal/service/vacationspecialcalc.go` (199 lines)
- **Errors:** NotFound, TypeRequired, TypeInvalid, BonusRequired, Duplicate, InUse, InvalidThreshold
- **Create validation:**
  - Type must be "age", "tenure", or "disability" (validated via `model.IsValidVacationSpecialCalcType`)
  - Threshold: must be 0 for disability, positive for age/tenure
  - BonusDays: must be positive
  - Uniqueness check: `ExistsByTypeAndThreshold(tenantID, type, threshold)`
  - BonusDays stored as `decimal.NewFromFloat(input.BonusDays)`
- **Update validation:**
  - Threshold validated against existing type (disability requires 0)
  - BonusDays must be positive
  - Partial update (nil = skip)
- **Delete validation:**
  - Check `CountGroupUsages` -- blocked if assigned to calc groups

**Handler:** `apps/api/internal/handler/vacationspecialcalc.go` (260 lines)
- List supports `active_only=true` query param and `type` filter query param
- Response model: `models.VacationSpecialCalculation` with ID, TenantID, Type, Threshold, BonusDays, Description, IsActive, CreatedAt, UpdatedAt

**Repository:** `apps/api/internal/repository/vacationspecialcalc.go` (149 lines)
- List ordered by: `type ASC, threshold ASC`
- ListActive: `tenant_id = ? AND is_active = ?`
- ListByType: `tenant_id = ? AND type = ?`
- ListByIDs: `id IN ?`
- CountGroupUsages: counts `VacationCalcGroupSpecialCalc` junction table
- ExistsByTypeAndThreshold: `tenant_id = ? AND type = ? AND threshold = ?`

**Model:** `apps/api/internal/model/vacationspecialcalc.go`
- Table: `vacation_special_calculations`
- Types: `VacationSpecialCalcType` = "age" | "tenure" | "disability"
- Fields: ID (uuid), TenantID (uuid), Type (varchar(20)), Threshold (int), BonusDays (decimal(5,2)), Description (text, nullable), IsActive (bool), CreatedAt, UpdatedAt

### 1.2 VacationCalcGroup

**Service:** `apps/api/internal/service/vacationcalcgroup.go` (228 lines)
- **Errors:** NotFound, CodeRequired, NameRequired, CodeExists, InUse, InvalidBasis, SpecialCalcNotFound
- **Create validation:**
  - Code: trimmed, required, unique per tenant (`GetByCode`)
  - Name: trimmed, required
  - Basis: defaults to "calendar_year", must be "calendar_year" or "entry_date"
  - SpecialCalculationIDs: validated via `specialCalcRepo.ListByIDs` (count must match)
  - After create, calls `ReplaceSpecialCalculations` to link junction records
  - Returns reloaded entity with preloaded relations
- **Update validation:**
  - Name: trimmed, required if provided
  - Basis: validated if provided
  - SpecialCalculationIDs: nil = don't change, non-nil = replace all links
  - Returns reloaded entity with preloaded relations
- **Delete validation:**
  - Check `CountEmploymentTypeUsages` -- blocked if assigned to employment types
- **Dependencies:** Uses both `vacationCalcGroupRepository` and `vacationSpecialCalcRepository`

**Handler:** `apps/api/internal/handler/vacationcalcgroup.go` (295 lines)
- List supports `active_only=true` query param
- Response includes nested `SpecialCalculations` as `VacationSpecialCalculationSummary[]` (ID, Type, Threshold, BonusDays)
- Special calculation IDs parsed from `strfmt.UUID` to `uuid.UUID`

**Repository:** `apps/api/internal/repository/vacationcalcgroup.go` (149 lines)
- GetByID/GetByCode/List/ListActive all `Preload("SpecialCalculations")`
- List ordered by: `code ASC`
- `ReplaceSpecialCalculations`: transaction that deletes all existing junction entries for group, then inserts new ones
- Junction table: `vacation_calc_group_special_calcs` (GroupID, SpecialCalculationID)
- `CountEmploymentTypeUsages`: counts `EmploymentType` where `vacation_calc_group_id = ?`

**Model:** `apps/api/internal/model/vacationcalcgroup.go`
- Table: `vacation_calculation_groups`
- Fields: ID, TenantID, Code (varchar(50)), Name (varchar(255)), Description (text, nullable), Basis (VacationBasis varchar(20), default "calendar_year"), IsActive, CreatedAt, UpdatedAt
- Many2Many: `SpecialCalculations` via `vacation_calc_group_special_calcs`
- Junction model: `VacationCalcGroupSpecialCalc` (ID, GroupID, SpecialCalculationID, CreatedAt)

### 1.3 VacationCappingRule

**Service:** `apps/api/internal/service/vacationcappingrule.go` (238 lines)
- **Errors:** NotFound, CodeRequired, NameRequired, TypeRequired, TypeInvalid, CodeExists, InUse, InvalidMonth, InvalidDay, InvalidCap
- **Create validation:**
  - Code: trimmed, required, unique per tenant
  - Name: trimmed, required
  - RuleType: "year_end" or "mid_year" (validated via `model.IsValidCappingRuleType`)
  - CutoffMonth: defaults to 12, must be 1-12
  - CutoffDay: defaults to 31, must be 1-31
  - CapValue: must not be negative (stored as `decimal.NewFromFloat`)
- **Update validation:** partial updates, same field validations
- **Delete validation:** `CountGroupUsages` -- blocked if assigned to capping rule groups

**Handler:** `apps/api/internal/handler/vacationcappingrule.go` (283 lines)
- List supports `active_only=true` and `rule_type` filter query params
- Response model includes all fields

**Repository:** `apps/api/internal/repository/vacationcappingrule.go` (149 lines)
- List ordered by: `code ASC`
- `CountGroupUsages`: counts `VacationCappingRuleGroupRule` junction table
- ListByIDs: `id IN ?`

**Model:** `apps/api/internal/model/vacationcappingrule.go`
- Table: `vacation_capping_rules`
- Types: `CappingRuleType` = "year_end" | "mid_year"
- Fields: ID, TenantID, Code (varchar(50)), Name (varchar(255)), Description (text, nullable), RuleType (varchar(20)), CutoffMonth (int, default 12), CutoffDay (int, default 31), CapValue (decimal(5,2), default 0), IsActive, CreatedAt, UpdatedAt
- Helper: `CutoffDate(year int) time.Time`

### 1.4 VacationCappingRuleGroup

**Service:** `apps/api/internal/service/vacationcappingrulegroup.go` (205 lines)
- **Errors:** NotFound, CodeRequired, NameRequired, CodeExists, InUse, CappingRuleNotFound
- **Create validation:**
  - Code: trimmed, required, unique per tenant
  - Name: trimmed, required
  - CappingRuleIDs: validated via `cappingRepo.ListByIDs` (count must match)
  - After create, `ReplaceCappingRules` links junction records
  - Returns reloaded entity with preloaded relations
- **Update validation:**
  - CappingRuleIDs: nil = don't change, non-nil = replace all links
  - Returns reloaded entity with preloaded relations
- **Delete validation:** `CountTariffUsages` -- blocked if assigned to tariffs
- **Dependencies:** Uses both `vacationCappingRuleGroupRepository` and `vacationCappingRuleRepository`

**Handler:** `apps/api/internal/handler/vacationcappingrulegroup.go` (285 lines)
- List supports `active_only=true` query param
- Response includes nested `CappingRules` as `VacationCappingRuleSummary[]` (ID, Code, Name, RuleType, CapValue)

**Repository:** `apps/api/internal/repository/vacationcappingrulegroup.go` (149 lines)
- GetByID/GetByCode/List/ListActive all `Preload("CappingRules")`
- List ordered by: `code ASC`
- `ReplaceCappingRules`: transaction that deletes/recreates junction entries
- Junction table: `vacation_capping_rule_group_rules` (GroupID, CappingRuleID)
- `CountTariffUsages`: counts `Tariff` where `vacation_capping_rule_group_id = ?`

**Model:** `apps/api/internal/model/vacationcappingrulegroup.go`
- Table: `vacation_capping_rule_groups`
- Fields: ID, TenantID, Code (varchar(50)), Name (varchar(255)), Description (text, nullable), IsActive, CreatedAt, UpdatedAt
- Many2Many: `CappingRules` via `vacation_capping_rule_group_rules`
- Junction model: `VacationCappingRuleGroupRule` (ID, GroupID, CappingRuleID, CreatedAt)

### 1.5 EmployeeCappingException

**Service:** `apps/api/internal/service/employeecappingexception.go` (200 lines)
- **Errors:** NotFound, Duplicate, TypeReq, TypeInv, RetainReq, RetainNeg, EmployeeReq, RuleReq
- **Create validation:**
  - EmployeeID: required (non-nil UUID)
  - CappingRuleID: required (non-nil UUID), validated by `cappingRepo.GetByID`
  - ExemptionType: "full" or "partial"
  - RetainDays: required for partial (must not be negative), stored as `decimal.NewFromFloat`
  - Year: optional (nil = applies to all years)
  - Uniqueness: `ExistsByEmployeeRuleYear(employeeID, cappingRuleID, year)`
- **Update validation:**
  - Partial update; validates retain_days required for partial exemptions after all updates applied
- **Delete:** simple existence check + delete
- **Dependencies:** Uses both `employeeCappingExceptionRepository` and `vacationCappingRuleRepository`

**Handler:** `apps/api/internal/handler/employeecappingexception.go` (312 lines)
- List supports filters: `employee_id`, `capping_rule_id`, `year` (all optional query params)
- Response includes RetainDays (nullable float), Year (nullable int), Notes (nullable string)

**Repository:** `apps/api/internal/repository/employeecappingexception.go` (132 lines)
- List with filters: `EmployeeCappingExceptionFilters { EmployeeID, CappingRuleID, Year }`
- Year filter: `year = ? OR year IS NULL`
- `ListActiveByEmployee`: `employee_id = ? AND is_active = ?`, optional year filter
- `ExistsByEmployeeRuleYear`: unique check (year=nil checks `year IS NULL`)
- List ordered by: `created_at DESC`

**Model:** `apps/api/internal/model/employeecappingexception.go`
- Table: `employee_capping_exceptions`
- Types: `ExemptionType` = "full" | "partial"
- Fields: ID, TenantID, EmployeeID, CappingRuleID, ExemptionType (varchar(20)), RetainDays (decimal(5,2) nullable), Year (int nullable), Notes (text nullable), IsActive, CreatedAt, UpdatedAt
- Relations: Employee, CappingRule

### 1.6 Vacation Carryover Preview

**Service:** `apps/api/internal/service/vacationcarryover.go` (193 lines)
- **Errors:** EmployeeNotFound, TariffNotFound, NoCappingGroup, YearRequired
- **PreviewCarryover(employeeID, year):**
  1. Get employee
  2. Get tariff via `employee.TariffID`
  3. Get capping rule group via `tariff.VacationCappingRuleGroupID`
  4. Get vacation balance for employee/year
  5. Calculate available = entitlement + carryover + adjustments - taken (or 0 if no balance)
  6. Get active employee exceptions for employee + year
  7. Build `calculation.CarryoverInput` with rules and exceptions
  8. Call `calculation.CalculateCarryoverWithCapping(input)`
  9. Return `CarryoverPreviewResult` with available, capped carryover, forfeited days, rules applied, has exception
- **Dependencies:** employeeRepo, tariffRepo, balanceRepo, cappingGroupRepo, exceptionRepo

**Handler:** `apps/api/internal/handler/vacationcarryover.go` (96 lines)
- POST `/vacation-carryover/preview` with `{ employee_id, year }`
- Response: `VacationCarryoverPreview` with employee_id, year, available_days, capped_carryover, forfeited_days, has_exception, rules_applied[]

### 1.7 Vacation Entitlement Preview

**Service:** `apps/api/internal/service/vacation.go` (lines 237-291)
- **PreviewEntitlement(employeeID, year, calcGroupIDOverride?):**
  1. Validate year (1900-2200)
  2. Load employee
  3. Resolve calc group: override if provided, else from employment type chain
  4. Build `calculation.VacationCalcInput` from employee, tariff, calc group
  5. Run `calculation.CalculateVacation(input)`
  6. Return preview with all calc details (base, pro-rated, part-time, bonuses, total)
- **Dependencies:** employeeRepo, tariffRepo, employmentTypeRepo, vacationCalcGroupRepo, tenantRepo, tariffAssignmentRepo

**Handler:** `apps/api/internal/handler/vacation.go` (lines 77-127)
- POST `/vacation-entitlement/preview` with `{ employee_id, year, calculation_group_id? }`
- Response: `VacationEntitlementPreview` with employee details, all calc breakdown fields

### 1.8 Calculation Modules

**`apps/api/internal/calculation/carryover.go`** (164 lines)
- `CalculateCarryoverWithCapping(input CarryoverInput) CarryoverOutput`
- Applies year_end rules first, then mid_year rules
- Exception handling: "full" = exempt, "partial" = use RetainDays as effective cap if greater than rule cap

**`apps/api/internal/calculation/vacation.go`** (233 lines)
- `CalculateVacation(input VacationCalcInput) VacationCalcOutput`
- Steps: reference metrics -> months employed -> pro-rate -> part-time adjust -> special calc bonuses -> total -> round to half-day

---

## 2. Database Schema (Migrations)

### Migration 000048: `vacation_special_calculations`
- `UNIQUE(tenant_id, type, threshold)`
- CHECK: `type IN ('age', 'tenure', 'disability')`
- Indexes: tenant, tenant+active, tenant+type

### Migration 000049: `vacation_calculation_groups` + junction
- `UNIQUE(tenant_id, code)`
- CHECK: `basis IN ('calendar_year', 'entry_date')`
- Junction: `vacation_calc_group_special_calcs` with `UNIQUE(group_id, special_calculation_id)`, CASCADE deletes
- Also adds `vacation_calc_group_id UUID` FK to `employment_types`

### Migration 000050: `vacation_capping_rules`
- `UNIQUE(tenant_id, code)`
- CHECK: `rule_type IN ('year_end', 'mid_year')`, `cutoff_month BETWEEN 1 AND 12`, `cutoff_day BETWEEN 1 AND 31`

### Migration 000051: `vacation_capping_rule_groups` + junction
- `UNIQUE(tenant_id, code)`
- Junction: `vacation_capping_rule_group_rules` with `UNIQUE(group_id, capping_rule_id)`, CASCADE deletes
- Also adds `vacation_capping_rule_group_id UUID` FK to `tariffs`

### Migration 000052: `employee_capping_exceptions`
- `UNIQUE(employee_id, capping_rule_id, year)` -- allows null year (database treats NULLs as distinct in UNIQUE)
- CHECK: `exemption_type IN ('full', 'partial')`
- Also adds `carryover_expires_at DATE` to `vacation_balances`

### Migration 000027: `vacation_balances`
- Fields: id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken
- `UNIQUE(employee_id, year)`

---

## 3. Prisma Schema Status

**NOT YET in Prisma (need to be added):**
- `VacationSpecialCalculation` (table: `vacation_special_calculations`)
- `VacationCalculationGroup` (table: `vacation_calculation_groups`)
- `VacationCalcGroupSpecialCalc` (table: `vacation_calc_group_special_calcs`) -- junction
- `VacationCappingRule` (table: `vacation_capping_rules`)
- `VacationCappingRuleGroup` (table: `vacation_capping_rule_groups`)
- `VacationCappingRuleGroupRule` (table: `vacation_capping_rule_group_rules`) -- junction
- `EmployeeCappingException` (table: `employee_capping_exceptions`)
- `VacationBalance` (table: `vacation_balances`) -- needed for preview endpoints

**Already in Prisma but needs relations added:**
- `EmploymentType` -- has `vacationCalcGroupId` FK field (line 261) but no relation (comment says "Relation will be added when VacationCalculationGroup model is added")
- `Tariff` -- has `vacationCappingRuleGroupId` FK field (line 1357) but no relation to the group model
- `Employee` -- has `tariffId` field (already in schema)

---

## 4. Existing tRPC Router Patterns

### Pattern from `absenceTypes.ts` (simpler CRUD):
```
1. Permission constant via `permissionIdByKey("absence_types.manage")`
2. Output schema (z.object with all fields)
3. Input schemas (create + update, with z.string().min(1) validations)
4. Helper mapToOutput function
5. Router with list/getById/create/update/delete procedures
6. Each procedure: tenantProcedure.use(requirePermission(...)).input(...).output(...).query/mutation(...)
7. Tenant-scoped queries: { tenantId, ...filters }
8. TRPCError for business errors (NOT_FOUND, BAD_REQUEST, CONFLICT)
9. Delete returns { success: boolean }
```

### Pattern from `tariffs.ts` (complex CRUD with relations):
- Uses `Prisma.Decimal` for decimal fields: `new Prisma.Decimal(value)`
- Uses `decimalToNumber()` helper for Decimal -> number conversion in output
- `mapToOutput` with `Record<string, unknown>` casting for flexible Prisma result types
- Transaction (`ctx.prisma.$transaction`) for multi-table operations
- Re-fetch after create/update to include relations

### Pattern from `use-tariffs.ts` (migrated hooks):
```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query hooks use: trpc.router.procedure.queryOptions(input, { enabled })
// Mutation hooks use: trpc.router.procedure.mutationOptions()
// onSuccess invalidates: queryClient.invalidateQueries({ queryKey: trpc.router.list.queryKey() })
```

---

## 5. Permission Catalog

**Current state:** There is NO `vacation_config.manage` or `vacation_config.*` permission in the permission catalog (`apps/web/src/server/lib/permission-catalog.ts`). The catalog has 48 permissions total.

The ticket specifies `requirePermission("vacation_config.*")` but this permission does not exist. It needs to be added to:
1. `apps/web/src/server/lib/permission-catalog.ts` (TypeScript)
2. `apps/api/internal/permissions/permissions.go` (Go) -- to keep both in sync

Alternatively, an existing permission like `tariffs.manage` or `settings.manage` could be used, but the ticket explicitly calls for `vacation_config.*`.

---

## 6. Root Router Registration

**File:** `apps/web/src/server/root.ts`
- Imports router from `./routers/<name>`
- Registers in `createTRPCRouter({ ... })` with camelCase key
- Currently has 29 routers registered
- New routers to add: `vacationSpecialCalcs`, `vacationCalcGroups`, `vacationCappingRules`, `vacationCappingRuleGroups`, `employeeCappingExceptions`, plus a `vacation` router for preview endpoints

---

## 7. Frontend Hook File

**File:** `apps/web/src/hooks/api/use-vacation-config.ts` (277 lines, 27 hooks)
- Uses OLD pattern: `useApiQuery` and `useApiMutation` (REST-based)
- Needs migration to tRPC pattern using `useTRPC()`, `useQuery`, `useMutation`, `useQueryClient`

**Hooks by section:**
1. **VacationSpecialCalculations** (5 hooks): list, getById, create, update, delete
2. **VacationCalculationGroups** (5 hooks): list, getById, create, update, delete
3. **VacationCappingRules** (5 hooks): list, getById, create, update, delete
4. **VacationCappingRuleGroups** (5 hooks): list, getById, create, update, delete
5. **EmployeeCappingExceptions** (5 hooks): list, getById, create, update, delete
6. **Previews** (2 hooks): entitlementPreview, carryoverPreview

Total: 27 hooks to migrate.

---

## 8. Key Relationships and Data Flow

```
EmploymentType --FK--> VacationCalculationGroup
VacationCalculationGroup <--M2M--> VacationSpecialCalculation (via vacation_calc_group_special_calcs)
Tariff --FK--> VacationCappingRuleGroup
VacationCappingRuleGroup <--M2M--> VacationCappingRule (via vacation_capping_rule_group_rules)
EmployeeCappingException --FK--> Employee
EmployeeCappingException --FK--> VacationCappingRule
Employee --FK--> Tariff
```

**Entitlement Preview flow:**
Employee -> EmploymentType -> VacationCalcGroup -> SpecialCalculations -> calculate

**Carryover Preview flow:**
Employee -> Tariff -> VacationCappingRuleGroup -> CappingRules + EmployeeCappingExceptions -> calculate

---

## 9. Implementation Considerations

### Prisma Models to Add
8 new models needed in `schema.prisma`:
- VacationSpecialCalculation
- VacationCalculationGroup
- VacationCalcGroupSpecialCalc (junction -- explicit M2M)
- VacationCappingRule
- VacationCappingRuleGroup
- VacationCappingRuleGroupRule (junction -- explicit M2M)
- EmployeeCappingException
- VacationBalance

Plus relations on existing models:
- EmploymentType: add relation to VacationCalculationGroup
- Tariff: add relation to VacationCappingRuleGroup
- Employee: relations already exist for Tariff

### Decimal Handling
The codebase uses Prisma `Decimal` type for financial/day values. The existing pattern (tariffs router) shows:
- Store: `new Prisma.Decimal(value)`
- Read: `Number(val)` via `decimalToNumber()` helper
- Fields: BonusDays, CapValue, RetainDays, entitlement, carryover, adjustments, taken

### Junction Table Handling
For M2M relations (calc groups <-> special calcs, capping rule groups <-> capping rules), the Go code uses explicit junction table operations (delete all + insert new). In Prisma/tRPC, this can be handled with:
- `deleteMany` on junction table where groupId matches
- `createMany` for new entries
- All within a `$transaction`

### Preview Endpoints
The entitlement and carryover preview endpoints are compute-only (no persistence). They require porting the Go calculation logic to TypeScript. Key calculation modules:
- `calculation/vacation.go`: VacationCalcInput -> VacationCalcOutput (pro-rating, part-time, bonuses, rounding)
- `calculation/carryover.go`: CarryoverInput -> CarryoverOutput (year_end + mid_year capping with exceptions)

These calculations involve:
- Age/tenure computation from dates
- Pro-rating by months employed
- Part-time factor (weekly hours / standard hours)
- Special calc bonuses (age threshold, tenure threshold, disability flag)
- Rounding to half-day (`Math.round(value * 2) / 2`)
- Carryover capping with exception handling

### Permission
A new `vacation_config.manage` permission needs to be added to the permission catalog in both Go and TypeScript. The ticket references `vacation_config.*` which suggests a wildcard, but the existing pattern uses specific permission keys like `tariffs.manage`. The implementation should add `vacation_config.manage` as a new permission entry.

---

## 10. File Inventory

### Go files being replaced (to read business logic from):
| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/internal/service/vacationspecialcalc.go` | 199 | Special calc CRUD business logic |
| `apps/api/internal/handler/vacationspecialcalc.go` | 260 | HTTP handlers + response mapping |
| `apps/api/internal/repository/vacationspecialcalc.go` | 149 | GORM data access |
| `apps/api/internal/service/vacationcalcgroup.go` | 228 | Calc group CRUD + special calc linking |
| `apps/api/internal/handler/vacationcalcgroup.go` | 295 | HTTP handlers + response mapping |
| `apps/api/internal/repository/vacationcalcgroup.go` | 149 | GORM data access + junction table ops |
| `apps/api/internal/service/vacationcappingrule.go` | 238 | Capping rule CRUD business logic |
| `apps/api/internal/handler/vacationcappingrule.go` | 283 | HTTP handlers + response mapping |
| `apps/api/internal/repository/vacationcappingrule.go` | 149 | GORM data access |
| `apps/api/internal/service/vacationcappingrulegroup.go` | 205 | Capping rule group CRUD + rule linking |
| `apps/api/internal/handler/vacationcappingrulegroup.go` | 285 | HTTP handlers + response mapping |
| `apps/api/internal/repository/vacationcappingrulegroup.go` | 149 | GORM data access + junction table ops |
| `apps/api/internal/service/employeecappingexception.go` | 200 | Employee exception CRUD |
| `apps/api/internal/handler/employeecappingexception.go` | 312 | HTTP handlers + response mapping |
| `apps/api/internal/repository/employeecappingexception.go` | 132 | GORM data access with filters |
| `apps/api/internal/service/vacationcarryover.go` | 193 | Carryover preview calculation |
| `apps/api/internal/handler/vacationcarryover.go` | 96 | HTTP handler for carryover preview |
| `apps/api/internal/service/vacation.go` | ~55 lines (PreviewEntitlement) | Entitlement preview calculation |
| `apps/api/internal/handler/vacation.go` | ~50 lines (PreviewEntitlement) | HTTP handler for entitlement preview |
| `apps/api/internal/calculation/vacation.go` | 233 | Core vacation calculation engine |
| `apps/api/internal/calculation/carryover.go` | 164 | Core carryover calculation engine |

### Files to create:
| File | Purpose |
|------|---------|
| `apps/web/src/server/routers/vacationSpecialCalcs.ts` | tRPC router |
| `apps/web/src/server/routers/vacationCalcGroups.ts` | tRPC router |
| `apps/web/src/server/routers/vacationCappingRules.ts` | tRPC router |
| `apps/web/src/server/routers/vacationCappingRuleGroups.ts` | tRPC router |
| `apps/web/src/server/routers/employeeCappingExceptions.ts` | tRPC router |
| `apps/web/src/server/routers/vacation.ts` | tRPC router for preview endpoints |

### Files to modify:
| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add 8 new models + relations on existing models |
| `apps/web/src/server/root.ts` | Register 6 new routers |
| `apps/web/src/server/lib/permission-catalog.ts` | Add `vacation_config.manage` permission |
| `apps/web/src/hooks/api/use-vacation-config.ts` | Migrate 27 hooks from REST to tRPC |
