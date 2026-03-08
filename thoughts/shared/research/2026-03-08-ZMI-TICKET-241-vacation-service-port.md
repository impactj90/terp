# Research: ZMI-TICKET-241 -- VacationService Port (Go → TypeScript)

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the Go VacationService (`vacation.go`, `vacationbalance.go`, `vacationcarryover.go`), Go VacationBalance repository (`vacationbalance.go`), Go calculation packages (`vacation.go`, `carryover.go`), the existing TypeScript vacation router and calculation libs, Prisma schema for all related models, and test patterns, to support a full port of VacationService to TypeScript.

## Summary

The VacationService consists of three Go files (947 lines total) and one repository file (150 lines). The service handles: vacation entitlement calculation and persistence (`InitializeYear`), entitlement previews (`PreviewEntitlement`), balance retrieval (`GetBalance`), taken-days recalculation (`RecalculateTaken`), manual adjustments (`AdjustBalance`), and carryover processing (`CarryoverFromPreviousYear`). A separate `VacationCarryoverService` (193 lines) provides carryover previews. A `VacationBalanceService` (127 lines) provides CRUD for vacation balances.

**Already ported to TypeScript**:
- Vacation entitlement calculation engine: `apps/web/src/server/lib/vacation-calculation.ts` (208 lines)
- Carryover calculation engine: `apps/web/src/server/lib/carryover-calculation.ts` (149 lines)
- Preview-only tRPC router: `apps/web/src/server/routers/vacation.ts` (405 lines) -- `entitlementPreview` and `carryoverPreview` mutations
- `recalculateVacationTaken()` function: already inlined in `apps/web/src/server/routers/absences.ts` (lines 380-473) as a standalone helper

**Not yet ported (needs this ticket)**:
- `InitializeYear` -- calculates and persists entitlement
- `GetBalance` -- retrieves vacation balance
- `AdjustBalance` -- manual adjustment accumulation
- `CarryoverFromPreviousYear` -- carries over vacation with capping
- VacationBalance CRUD (List, GetByID, Create, Update) -- from `vacationbalance.go`
- Frontend hooks migration: `use-vacation-balance.ts` uses legacy REST (`useApiQuery`/`useApiMutation`)

---

## 1. Go Source Files -- Complete Analysis

### 1.1 service/vacation.go (627 lines)

**File**: `apps/api/internal/service/vacation.go`

**Purpose**: Core vacation business logic -- entitlement calculation, balance management, taken recalculation, carryover.

**Dependencies (12 repository interfaces)**:
```
vacationBalanceRepoForVacation    -- GetByEmployeeYear, Upsert, UpdateTaken
absenceDayRepoForVacation         -- CountByTypeInRange, ListApprovedByTypeInRange
absenceTypeRepoForVacation        -- List (all types for tenant)
tenantRepoForVacation             -- GetByID (for vacation basis)
tariffRepoForVacation             -- GetByID (for StandardWeeklyHours, AnnualVacationDays)
employeeRepoForVacation           -- GetByID
employmentTypeRepoForVacation     -- GetByID (for VacationCalcGroupID)
vacationCalcGroupRepoForVacation  -- GetByID (for calc group + special calcs)
empDayPlanRepoForVacation         -- GetForEmployeeDateRange (for vacation deduction weighting)
tariffAssignmentRepoForVacation   -- GetEffectiveForDate (for active tariff assignment)
cappingGroupRepoForVacation       -- GetByID (for capping rules)
exceptionRepoForVacation          -- ListActiveByEmployee (for capping exceptions)
```

Also stores `defaultMaxCarryover decimal.Decimal` (0 = unlimited) for fallback carryover capping.

**Constructor**: `NewVacationService(...)` accepts the first 8 repos + defaultMaxCarryover. The remaining 4 repos are set via setter methods (`SetEmpDayPlanRepo`, `SetTariffAssignmentRepo`, `SetCappingGroupRepo`, `SetExceptionRepo`).

**Data Types**:
```go
PreviewEntitlementInput {
    EmployeeID          uuid.UUID
    Year                int
    CalcGroupIDOverride *uuid.UUID  // Optional override
}

PreviewEntitlementOutput {
    EmployeeID          uuid.UUID
    EmployeeName        string
    Year                int
    Basis               string
    CalcGroupID         *uuid.UUID
    CalcGroupName       *string
    CalcOutput          calculation.VacationCalcOutput
    WeeklyHours         decimal.Decimal
    StandardWeeklyHours decimal.Decimal
    PartTimeFactor      decimal.Decimal
}
```

**Public Methods (6)**:

1. **`GetBalance(ctx, employeeID, year)`** -- Retrieves vacation balance. Validates year (1900-2200). Returns `ErrVacationBalanceNotFound` if no record.

2. **`InitializeYear(ctx, employeeID, year)`** -- Calculates and persists entitlement:
   - Validates year
   - Gets employee data
   - Resolves calc group via `resolveCalcGroup()`
   - Builds calc input via `buildCalcInput()`
   - Runs `calculation.CalculateVacation()`
   - Gets existing balance (if any) to preserve carryover/adjustments/taken
   - Upserts balance with new entitlement
   - Idempotent: calling multiple times recalculates entitlement only

3. **`PreviewEntitlement(ctx, input)`** -- Preview without persistence:
   - Same resolution + calculation as `InitializeYear`
   - Optional `CalcGroupIDOverride` to try a different group
   - Computes `PartTimeFactor = WeeklyHours / StandardWeeklyHours`
   - Returns full output with all calculation details

4. **`RecalculateTaken(ctx, employeeID, year)`** -- Recalculates vacation days taken:
   - Gets all absence types that `DeductsVacation`
   - Batch-fetches day plans for year (builds `dayPlanMap[date] -> vacationDeduction`)
   - For each vacation-deducting type, lists approved absence days in year range
   - For each day: `totalTaken += vacationDeduction * duration` (default deduction = 1.0)
   - Updates taken via `UpdateTaken()`

5. **`AdjustBalance(ctx, employeeID, year, adjustment, notes)`** -- Manual adjustment:
   - Gets existing balance (must exist)
   - Accumulates: `balance.Adjustments += adjustment`
   - Upserts balance

6. **`CarryoverFromPreviousYear(ctx, employeeID, year)`** -- Carryover to target year:
   - Year must be >= 1901
   - Gets previous year's balance, computes `available = prevBalance.Available()`
   - Calls `calculateCappedCarryover()` for capping
   - Gets or creates current year balance
   - Sets `currentBalance.Carryover = carryover` (replaces, not accumulates)
   - Upserts current year balance

**Private Methods (4)**:

1. **`resolveCalcGroup(ctx, employee)`** -- Resolves VacationCalculationGroup:
   - Employee -> EmploymentType -> VacationCalcGroupID -> VacationCalculationGroup
   - Returns nil at any missing step

2. **`resolveTariff(ctx, employee, year)`** -- Resolves effective Tariff:
   - Priority 1: Active tariff assignment (via `tariffAssignmentRepo.GetEffectiveForDate`)
     - Reference date: end-of-year for past years, today for current/future
   - Priority 2: Fallback to `employee.TariffID`
   - Returns nil if nothing found

3. **`buildCalcInput(ctx, employee, year, calcGroup)`** -- Constructs `VacationCalcInput`:
   - Sets employee fields: EntryDate, ExitDate, WeeklyHours, BaseVacationDays, HasDisability, BirthDate
   - Resolves tariff: sets StandardWeeklyHours (default 40), BaseVacationDays from tariff
   - Resolves basis: from calcGroup, or from tariff/tenant fallback
   - Sets reference date based on basis (Jan 1 for calendar_year, entry anniversary for entry_date)
   - Builds special calcs list from calcGroup's SpecialCalculations

4. **`resolveVacationBasisFromTariff(ctx, employee, tariff)`** -- Fallback basis resolution:
   - Default: `calendar_year`
   - If tenant has vacation basis: use it
   - If tariff has vacation basis: override with tariff's

5. **`calculateCappedCarryover(ctx, employee, prevYear, available)`** -- Carryover with capping:
   - Priority 1: Advanced capping via tariff's VacationCappingRuleGroupID
     - Builds `CarryoverInput` with rules + exceptions
     - Calls `calculation.CalculateCarryoverWithCapping()`
   - Priority 2: Simple fallback via `calculation.CalculateCarryover(available, defaultMaxCarryover)`

---

### 1.2 service/vacationbalance.go (127 lines)

**File**: `apps/api/internal/service/vacationbalance.go`

**Purpose**: CRUD operations for vacation balances.

**Dependencies**:
```
vacationBalanceRepoForBalanceService -- GetByID, GetByEmployeeYear, Create, Update, ListAll
```

**Data Types**:
```go
CreateVacationBalanceInput {
    TenantID           uuid.UUID
    EmployeeID         uuid.UUID
    Year               int
    Entitlement        decimal.Decimal
    Carryover          decimal.Decimal
    Adjustments        decimal.Decimal
    CarryoverExpiresAt *time.Time
}

UpdateVacationBalanceInput {
    Entitlement        *decimal.Decimal
    Carryover          *decimal.Decimal
    Adjustments        *decimal.Decimal
    CarryoverExpiresAt *time.Time
}
```

**Methods (4)**:

1. **`List(ctx, filter)`** -- Returns balances matching `VacationBalanceFilter` (TenantID, EmployeeID?, Year?, DepartmentID?)
2. **`GetByID(ctx, id)`** -- Returns single balance by ID
3. **`Create(ctx, input)`** -- Creates new balance. Returns `ErrVacationBalanceAlreadyExists` if duplicate (employee+year)
4. **`Update(ctx, id, input)`** -- Partial update of entitlement, carryover, adjustments, carryoverExpiresAt

---

### 1.3 service/vacationcarryover.go (193 lines)

**File**: `apps/api/internal/service/vacationcarryover.go`

**Purpose**: Carryover preview calculations (compute-only, no persistence).

**Dependencies**:
```
carryoverEmployeeRepository        -- GetByID
carryoverTariffRepository          -- GetByID
carryoverBalanceRepository         -- GetByEmployeeYear
vacationCappingRuleGroupRepository -- GetByID (with CappingRules loaded)
employeeCappingExceptionRepository -- ListActiveByEmployee
```

**Data Types**:
```go
CarryoverPreviewResult {
    EmployeeID      uuid.UUID
    Year            int
    AvailableDays   decimal.Decimal
    CappedCarryover decimal.Decimal
    ForfeitedDays   decimal.Decimal
    RulesApplied    []CarryoverRuleApplication
    HasException    bool
}

CarryoverRuleApplication {
    RuleID          uuid.UUID
    RuleName        string
    RuleType        string
    CapValue        decimal.Decimal
    Applied         bool
    ExceptionActive bool
}
```

**Methods (1)**:

**`PreviewCarryover(ctx, employeeID, year)`** -- Computes carryover preview:
- Loads employee, tariff (from employee.TariffID), capping group
- Gets vacation balance for the year: `available = entitlement + carryover + adjustments - taken`
- Gets employee capping exceptions
- Builds `CarryoverInput` with rules (active only) and exceptions
- Calls `calculation.CalculateCarryoverWithCapping()`
- Maps output to `CarryoverPreviewResult`

---

### 1.4 repository/vacationbalance.go (150 lines)

**File**: `apps/api/internal/repository/vacationbalance.go`

**Purpose**: GORM-based data access for vacation_balances table.

**Methods (7)**:

1. **`Create(ctx, balance)`** -- Insert new record
2. **`GetByID(ctx, id)`** -- Find by ID with `Preload("Employee")`. Returns `ErrVacationBalanceNotFound` on not found
3. **`GetByEmployeeYear(ctx, employeeID, year)`** -- Find by composite key. Returns `nil, nil` on not found (not error)
4. **`Update(ctx, balance)`** -- Full save via `db.Save()`
5. **`Upsert(ctx, balance)`** -- Conflict on `(employee_id, year)`, updates: entitlement, carryover, adjustments, taken, updated_at
6. **`UpdateTaken(ctx, employeeID, year, taken)`** -- Targeted update of `taken` field only. Returns `ErrVacationBalanceNotFound` if no rows affected
7. **`IncrementTaken(ctx, employeeID, year, amount)`** -- Atomic increment: `taken = taken + amount`
8. **`ListAll(ctx, filter)`** -- Filtered list with optional joins for department filtering. Preloads Employee. Orders by `year DESC`
9. **`ListByEmployee(ctx, employeeID)`** -- All balances for employee, ordered by `year ASC`

**Filter**:
```go
VacationBalanceFilter {
    TenantID     uuid.UUID
    EmployeeID   *uuid.UUID
    Year         *int
    DepartmentID *uuid.UUID  // Joins employees table
}
```

---

## 2. Go Calculation Packages (Already Ported)

### 2.1 calculation/vacation.go (233 lines)

**Already ported to**: `apps/web/src/server/lib/vacation-calculation.ts`

Key structures:
- `VacationBasis`: `"calendar_year"` | `"entry_date"`
- `SpecialCalcType`: `"age"` | `"tenure"` | `"disability"`
- `VacationCalcInput`: birthDate, entryDate, exitDate, weeklyHours, hasDisability, baseVacationDays, standardWeeklyHours, basis, specialCalcs, year, referenceDate
- `VacationCalcOutput`: baseEntitlement, proRatedEntitlement, partTimeAdjustment, ageBonus, tenureBonus, disabilityBonus, totalEntitlement, monthsEmployed, ageAtReference, tenureYears

**Calculation steps**:
1. Reference metrics (age, tenure)
2. Months employed in year
3. Pro-rate by months (if < 12 months)
4. Part-time adjustment (weeklyHours / standardWeeklyHours)
5. Special calculation bonuses (age, tenure, disability)
6. Total = partTimeAdjustment + bonuses
7. Round to half-day

Also includes:
- `CalculateCarryover(available, maxCarryover)` -- simple carryover cap (0 = unlimited)
- `CalculateVacationDeduction(deductionValue, durationDays)` -- deduction = value * duration

### 2.2 calculation/carryover.go (164 lines)

**Already ported to**: `apps/web/src/server/lib/carryover-calculation.ts`

Key structures:
- `CappingRuleInput`: ruleId, ruleName, ruleType ("year_end"|"mid_year"), cutoffMonth, cutoffDay, capValue
- `CappingExceptionInput`: cappingRuleId, exemptionType ("full"|"partial"), retainDays
- `CarryoverInput`: availableDays, year, referenceDate, cappingRules, exceptions
- `CarryoverOutput`: availableDays, cappedCarryover, forfeitedDays, rulesApplied, hasException

Rule application:
- **year_end**: Caps total carryover to capValue at year boundary
- **mid_year**: Applies only if referenceDate > cutoff date in next year (year+1)
- **full exception**: Rule is completely skipped
- **partial exception**: Uses retainDays as effective cap (only if retainDays > capValue)

---

## 3. Existing TypeScript Code

### 3.1 Vacation Router (apps/web/src/server/routers/vacation.ts -- 405 lines)

**Already exists with**:
- `vacation.entitlementPreview` -- mutation with `tenantProcedure` + `requirePermission(vacation_config.manage)`
- `vacation.carryoverPreview` -- mutation with same auth

Both are compute-only (no persistence). The router currently:
- Resolves calc group from override or employment type
- Resolves tariff from `employee.tariffId` (does NOT use tariff assignments)
- Builds VacationCalcInput and runs `calculateVacation()`
- Handles Prisma Decimal → number conversions via `decimalToNumber()`

**NOTE**: The existing router does NOT resolve tariff via `EmployeeTariffAssignment`. The Go service's `resolveTariff()` checks tariff assignments first (via `GetEffectiveForDate`), then falls back to `employee.TariffID`. The TypeScript router only does the fallback. This is a gap to address in the port.

### 3.2 vacation-calculation.ts (208 lines)

Pure calculation library. Exports:
- `calculateVacation(input: VacationCalcInput): VacationCalcOutput`
- `calculateAge(birthDate, referenceDate): number`
- `calculateTenure(entryDate, referenceDate): number`
- `calculateMonthsEmployedInYear(entryDate, exitDate, year, basis): number`
- `roundToHalfDay(value): number`

### 3.3 carryover-calculation.ts (149 lines)

Pure calculation library. Exports:
- `calculateCarryoverWithCapping(input: CarryoverInput): CarryoverOutput`

### 3.4 recalculateVacationTaken() in absences.ts (lines 380-473)

Already ported as a standalone function in the absences router. Logic:
1. Gets all vacation-deducting absence types
2. Fetches approved absence days for employee/year
3. Fetches day plans for year (for vacationDeduction weight)
4. Calculates `totalTaken = sum(vacationDeduction * duration)` for each day
5. Upserts vacation balance with new taken value

This is called from `approve`, `cancel`, and `delete` mutations in the absences router.

---

## 4. Prisma Schema -- Relevant Models

### 4.1 VacationBalance
```prisma
model VacationBalance {
  id                 String    @id @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  year               Int
  entitlement        Decimal   @default(0) @db.Decimal(5, 2)
  carryover          Decimal   @default(0) @db.Decimal(5, 2)
  adjustments        Decimal   @default(0) @db.Decimal(5, 2)
  taken              Decimal   @default(0) @db.Decimal(5, 2)
  carryoverExpiresAt DateTime? @map("carryover_expires_at") @db.Date
  createdAt          DateTime
  updatedAt          DateTime

  @@unique([employeeId, year])  // Composite unique for upsert
  @@map("vacation_balances")
}
```

Computed values (from Go model): `Total() = entitlement + carryover + adjustments`, `Available() = Total() - taken`.

### 4.2 Employee (relevant fields)
```prisma
model Employee {
  entryDate            DateTime  @map("entry_date") @db.Date
  exitDate             DateTime? @map("exit_date") @db.Date
  employmentTypeId     String?   @map("employment_type_id") @db.Uuid
  weeklyHours          Decimal   @default(40.00) @db.Decimal(5, 2)
  vacationDaysPerYear  Decimal   @default(30.00) @db.Decimal(5, 2)
  tariffId             String?   @map("tariff_id") @db.Uuid
  birthDate            DateTime? @map("birth_date") @db.Date
  disabilityFlag       Boolean   @default(false) @map("disability_flag")

  employmentType EmploymentType? @relation(...)
  tariff         Tariff?         @relation(...)
  tariffAssignments EmployeeTariffAssignment[]
  vacationBalances  VacationBalance[]
}
```

### 4.3 EmploymentType
```prisma
model EmploymentType {
  vacationCalcGroupId String? @map("vacation_calc_group_id") @db.Uuid
  vacationCalcGroup   VacationCalculationGroup? @relation(...)
}
```

### 4.4 VacationCalculationGroup
```prisma
model VacationCalculationGroup {
  id       String @db.Uuid
  tenantId String @db.Uuid
  code     String
  name     String
  basis    String @default("calendar_year") // "calendar_year" | "entry_date"
  specialCalcLinks VacationCalcGroupSpecialCalc[]
}
```

### 4.5 VacationCalcGroupSpecialCalc (Junction)
```prisma
model VacationCalcGroupSpecialCalc {
  groupId              String @db.Uuid
  specialCalculationId String @db.Uuid
  group              VacationCalculationGroup
  specialCalculation VacationSpecialCalculation
}
```

### 4.6 VacationSpecialCalculation
```prisma
model VacationSpecialCalculation {
  type      String  // "age" | "tenure" | "disability"
  threshold Int
  bonusDays Decimal @db.Decimal(5, 2)
  isActive  Boolean @default(true)
}
```

### 4.7 Tariff (vacation-relevant fields)
```prisma
model Tariff {
  annualVacationDays         Decimal? @db.Decimal(5, 2)
  weeklyTargetHours          Decimal? @db.Decimal(5, 2)
  vacationBasis              String?  @default("calendar_year")
  vacationCappingRuleGroupId String?  @db.Uuid
  vacationCappingRuleGroup   VacationCappingRuleGroup? @relation(...)
}
```

### 4.8 Tenant (vacation-relevant fields)
```prisma
model Tenant {
  vacationBasis String @default("calendar_year") @db.VarChar(20)
}
```

### 4.9 EmployeeTariffAssignment
```prisma
model EmployeeTariffAssignment {
  employeeId    String    @db.Uuid
  tariffId      String    @db.Uuid
  effectiveFrom DateTime  @db.Date
  effectiveTo   DateTime? @db.Date
  isActive      Boolean   @default(true)
  tariff        Tariff    @relation(...)

  @@index([employeeId, effectiveFrom, effectiveTo, isActive])
}
```

### 4.10 VacationCappingRuleGroup + VacationCappingRule
```prisma
model VacationCappingRuleGroup {
  cappingRuleLinks VacationCappingRuleGroupRule[]
}

model VacationCappingRuleGroupRule {
  groupId       String @db.Uuid
  cappingRuleId String @db.Uuid
  cappingRule    VacationCappingRule
}

model VacationCappingRule {
  ruleType    String  // "year_end" | "mid_year"
  cutoffMonth Int
  cutoffDay   Int
  capValue    Decimal @db.Decimal(5, 2)
  isActive    Boolean
}
```

### 4.11 EmployeeCappingException
```prisma
model EmployeeCappingException {
  employeeId    String   @db.Uuid
  cappingRuleId String   @db.Uuid
  exemptionType String   // "full" | "partial"
  retainDays    Decimal? @db.Decimal(5, 2)
  year          Int?     // null = all years
  isActive      Boolean  @default(true)
}
```

### 4.12 AbsenceType (vacation-relevant)
```prisma
model AbsenceType {
  deductsVacation Boolean @default(false)
}
```

### 4.13 AbsenceDay
```prisma
model AbsenceDay {
  absenceDate   DateTime @db.Date
  absenceTypeId String   @db.Uuid
  duration      Decimal  @default(1.00) @db.Decimal(3, 2)
  status        String   @default("pending") // "pending"|"approved"|"rejected"|"cancelled"
}
```

### 4.14 EmployeeDayPlan + DayPlan (vacation deduction)
```prisma
model EmployeeDayPlan {
  planDate   DateTime @db.Date
  dayPlanId  String?  @db.Uuid
  dayPlan    DayPlan? @relation(...)
}

model DayPlan {
  vacationDeduction Decimal @default(1.00) @db.Decimal(5, 2)
}
```

---

## 5. Frontend Hooks -- Current State

### 5.1 use-vacation-balance.ts (legacy REST hooks)

**File**: `apps/web/src/hooks/api/use-vacation-balance.ts`

Uses legacy `useApiQuery`/`useApiMutation` -- NOT tRPC. These call the Go backend endpoints:
- `useVacationBalances(options)` -- GET `/vacation-balances` with optional employee_id, year, department_id
- `useVacationBalance(id)` -- GET `/vacation-balances/{id}`
- `useEmployeeVacationBalance(employeeId, year)` -- GET `/employees/{id}/vacation-balance`
- `useCreateVacationBalance()` -- POST `/vacation-balances`
- `useUpdateVacationBalance()` -- PATCH `/vacation-balances/{id}`
- `useInitializeVacationBalances()` -- POST `/vacation-balances/initialize`

### 5.2 use-vacation-config.ts (tRPC hooks, already migrated)

Exports `useVacationEntitlementPreview` and `useVacationCarryoverPreview` which call the existing `vacation.entitlementPreview` and `vacation.carryoverPreview` tRPC mutations.

---

## 6. TypeScript Patterns and Conventions

### 6.1 Router Pattern

All routers follow this pattern:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const PERM = permissionIdByKey("some.permission")!

export const someRouter = createTRPCRouter({
  someMethod: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ ... }))
    .output(z.object({ ... }))
    .query(async ({ ctx, input }) => { ... }),
    // or .mutation() for writes
})
```

### 6.2 Service Pattern (for complex business logic)

Services are classes that receive PrismaClient in constructor:
```typescript
export class SomeService {
  constructor(private prisma: PrismaClient) {}

  async someMethod(args: ...): Promise<...> {
    // Business logic with this.prisma calls
  }
}
```

Used for: `DailyCalcService`, `MonthlyCalcService`.

### 6.3 Decimal Handling

Prisma returns `Prisma.Decimal` for decimal columns. Convention:
```typescript
function decimalToNumber(val: Prisma.Decimal | null | undefined): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}
```

For Decimal checks in calculations:
```typescript
import { Decimal } from "@prisma/client/runtime/client"
const dur = absence.duration instanceof Decimal
  ? absence.duration.toNumber()
  : Number(absence.duration)
```

### 6.4 Root Router Registration

New routers are added to `apps/web/src/server/root.ts`:
```typescript
import { someRouter } from "./routers/some"
export const appRouter = createTRPCRouter({
  ...,
  some: someRouter,
})
```

### 6.5 Prisma Upsert Pattern

For the vacation balance upsert (key pattern needed for this port):
```typescript
await prisma.vacationBalance.upsert({
  where: {
    employeeId_year: { employeeId, year },
  },
  update: { entitlement: newValue },
  create: {
    tenantId,
    employeeId,
    year,
    entitlement: newValue,
    carryover: 0,
    adjustments: 0,
    taken: 0,
  },
})
```

---

## 7. Test Patterns

### 7.1 Unit Tests for Calculation Libraries

**File**: `apps/web/src/server/__tests__/vacation-calculation.test.ts` (460 lines)

Uses `vitest` with pure function testing:
```typescript
import { describe, it, expect } from "vitest"
import { calculateVacation, type VacationCalcInput } from "../lib/vacation-calculation"

describe("calculateVacation", () => {
  function makeInput(overrides: Partial<VacationCalcInput> = {}): VacationCalcInput {
    return { ...defaults, ...overrides }
  }

  it("description", () => {
    const result = calculateVacation(makeInput({ ... }))
    expect(result.totalEntitlement).toBe(30)
  })
})
```

### 7.2 Router Tests with Mock Prisma

**File**: `apps/web/src/server/__tests__/vacation-router.test.ts` (291 lines)

Uses `createCallerFactory` with mocked Prisma:
```typescript
import { createCallerFactory } from "../trpc"
import { vacationRouter } from "../routers/vacation"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

const createCaller = createCallerFactory(vacationRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as ...,
    authToken: "test-token",
    user: createUserWithPermissions([PERMISSION_ID], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// Mock Prisma methods:
const mockPrisma = {
  employee: { findFirst: vi.fn().mockResolvedValue(employee) },
  tariff: { findFirst: vi.fn().mockResolvedValue(tariff) },
  ...
}
const caller = createCaller(createTestContext(mockPrisma))
const result = await caller.entitlementPreview({ ... })
expect(result.totalEntitlement).toBe(30)
```

### 7.3 Absences Test Pattern (helper function testing)

**File**: `apps/web/src/server/routers/__tests__/absences.test.ts`

Tests exported helper functions directly:
```typescript
import { mapAbsenceDayToOutput, shouldSkipDate } from "../absences"
```

---

## 8. Dependencies and Data Access Summary

### 8.1 What the new VacationService procedures need to access

| Operation | Prisma Models Queried | Prisma Models Written |
|---|---|---|
| `initializeYear` | Employee, EmploymentType, VacationCalculationGroup, VacationCalcGroupSpecialCalc, VacationSpecialCalculation, Tariff, EmployeeTariffAssignment, Tenant, VacationBalance | VacationBalance (upsert) |
| `getBalance` | VacationBalance | (none) |
| `adjustBalance` | VacationBalance | VacationBalance (update) |
| `carryover` | Employee, VacationBalance (prev+current), Tariff, EmployeeTariffAssignment, VacationCappingRuleGroup, VacationCappingRuleGroupRule, VacationCappingRule, EmployeeCappingException | VacationBalance (upsert) |
| `list` | VacationBalance, Employee | (none) |
| `getById` | VacationBalance | (none) |
| `create` | VacationBalance | VacationBalance (create) |
| `update` | VacationBalance | VacationBalance (update) |

### 8.2 Tariff Assignment Resolution (not yet in TypeScript)

The Go service resolves tariffs via:
1. `tariffAssignmentRepo.GetEffectiveForDate(employeeID, refDate)` -- finds active assignment where `effectiveFrom <= refDate` and (`effectiveTo IS NULL` or `effectiveTo >= refDate`)
2. Fallback: `employee.TariffID`

Prisma query for this:
```typescript
const assignment = await prisma.employeeTariffAssignment.findFirst({
  where: {
    employeeId,
    isActive: true,
    effectiveFrom: { lte: refDate },
    OR: [
      { effectiveTo: null },
      { effectiveTo: { gte: refDate } },
    ],
  },
  include: { tariff: true },
  orderBy: { effectiveFrom: "desc" },
})
```

### 8.3 Vacation Basis Resolution Chain

1. Default: `"calendar_year"`
2. If tenant has `vacationBasis`: use it
3. If tariff has `vacationBasis`: override with tariff's
4. If calc group has `basis`: override with calc group's

---

## 9. Key Implementation Considerations

### 9.1 Existing `recalculateVacationTaken()` in absences.ts

This function already exists as a standalone helper in the absences router. For the VacationService port, this should be either:
- Extracted to the vacation service class and imported by the absences router
- Kept as-is with the absences router calling it (current pattern)

### 9.2 VacationBalance `Available()` Computation

Go model: `Available() = Entitlement + Carryover + Adjustments - Taken`

This is a pure computation -- no Prisma model method. Must be computed inline in TypeScript.

### 9.3 Permission for VacationBalance CRUD

The Go handler uses different permissions for different operations:
- List/GetByID: `vacation_balances.view`
- Create/Update: `vacation_balances.manage`
- InitializeYear: `vacation_balances.manage`
- AdjustBalance: `vacation_balances.manage`
- CarryoverFromPreviousYear: `vacation_balances.manage`

The existing preview endpoints use `vacation_config.manage`.

### 9.4 Existing Frontend Hooks Migration

`use-vacation-balance.ts` currently uses legacy REST. Needs migration to tRPC hooks following the pattern in `use-absences.ts`:
- Use `useTRPC()` and `useTRPCClient()` from `@/trpc`
- Legacy shape adaptation with `transformToLegacy()` if needed
- Query invalidation patterns

### 9.5 Router Registration

The existing `vacationRouter` is already registered in `root.ts` as `vacation`. The new balance CRUD procedures can be added to this router or as a new `vacationBalances` router. The existing codebase pattern separates concerns (e.g., `vacationCalcGroups`, `vacationCappingRules`), suggesting a separate `vacationBalances` router.
