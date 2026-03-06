# Implementation Plan: ZMI-TICKET-220 - Vacation Configuration

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-220
**Status:** Plan Complete

---

## Overview

Implement tRPC routers for 5 vacation configuration entities (VacationSpecialCalc, VacationCalcGroup, VacationCappingRule, VacationCappingRuleGroup, EmployeeCappingException), plus 2 preview endpoints (entitlement preview and carryover preview), and migrate 27 frontend hooks.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/server/routers/vacationSpecialCalcs.ts` | tRPC router for VacationSpecialCalculation CRUD |
| `apps/web/src/server/routers/vacationCalcGroups.ts` | tRPC router for VacationCalculationGroup CRUD |
| `apps/web/src/server/routers/vacationCappingRules.ts` | tRPC router for VacationCappingRule CRUD |
| `apps/web/src/server/routers/vacationCappingRuleGroups.ts` | tRPC router for VacationCappingRuleGroup CRUD |
| `apps/web/src/server/routers/employeeCappingExceptions.ts` | tRPC router for EmployeeCappingException CRUD |
| `apps/web/src/server/routers/vacation.ts` | tRPC router for entitlement + carryover preview |
| `apps/web/src/server/lib/vacation-calculation.ts` | Ported Go calculation logic (CalculateVacation) |
| `apps/web/src/server/lib/carryover-calculation.ts` | Ported Go calculation logic (CalculateCarryoverWithCapping) |
| `apps/web/src/server/__tests__/vacationSpecialCalcs-router.test.ts` | Tests |
| `apps/web/src/server/__tests__/vacationCalcGroups-router.test.ts` | Tests |
| `apps/web/src/server/__tests__/vacationCappingRules-router.test.ts` | Tests |
| `apps/web/src/server/__tests__/vacationCappingRuleGroups-router.test.ts` | Tests |
| `apps/web/src/server/__tests__/employeeCappingExceptions-router.test.ts` | Tests |
| `apps/web/src/server/__tests__/vacation-calculation.test.ts` | Tests for ported calculation logic |
| `apps/web/src/server/__tests__/vacation-router.test.ts` | Tests for preview endpoints |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add 8 new models + relations on EmploymentType and Tariff |
| `apps/web/src/server/root.ts` | Register 6 new routers |
| `apps/web/src/server/lib/permission-catalog.ts` | Add `vacation_config.manage` permission |
| `apps/web/src/hooks/api/use-vacation-config.ts` | Migrate all 27 hooks from REST to tRPC |

---

## Phase 1: Prisma Schema + Permission Catalog

### 1.1 Add `vacation_config.manage` permission

**File:** `apps/web/src/server/lib/permission-catalog.ts`

Add to the `ALL_PERMISSIONS` array (after the last entry, before the closing bracket):

```typescript
p(
  "vacation_config.manage",
  "vacation_config",
  "manage",
  "Manage vacation configuration including special calculations, calculation groups, capping rules, and exceptions"
),
```

This follows the exact pattern of other permissions like `tariffs.manage`, `absence_types.manage`, etc.

### 1.2 Add Prisma Models

**File:** `apps/web/prisma/schema.prisma`

Append the following 8 models after the last model (TariffDayPlan at line 1445). Also add relations to existing EmploymentType and Tariff models.

#### Model 1: VacationSpecialCalculation

```prisma
// -----------------------------------------------------------------------------
// VacationSpecialCalculation
// -----------------------------------------------------------------------------
// Migration: 000048
//
// CHECK constraints (enforced at DB level only):
//   - type IN ('age', 'tenure', 'disability')
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model VacationSpecialCalculation {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  type        String   @db.VarChar(20)
  threshold   Int      @default(0)
  bonusDays   Decimal  @map("bonus_days") @db.Decimal(5, 2)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  calcGroupLinks VacationCalcGroupSpecialCalc[]

  // Indexes
  @@unique([tenantId, type, threshold], map: "vacation_special_calculations_tenant_type_threshold_key")
  @@index([tenantId], map: "idx_vacation_special_calcs_tenant")
  @@index([tenantId, isActive], map: "idx_vacation_special_calcs_tenant_active")
  @@index([tenantId, type], map: "idx_vacation_special_calcs_tenant_type")
  @@map("vacation_special_calculations")
}
```

#### Model 2: VacationCalculationGroup

```prisma
// -----------------------------------------------------------------------------
// VacationCalculationGroup
// -----------------------------------------------------------------------------
// Migration: 000049
//
// CHECK constraints (enforced at DB level only):
//   - basis IN ('calendar_year', 'entry_date')
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model VacationCalculationGroup {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  basis       String   @default("calendar_year") @db.VarChar(20)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  specialCalcLinks VacationCalcGroupSpecialCalc[]
  employmentTypes  EmploymentType[]

  // Indexes
  @@unique([tenantId, code], map: "vacation_calculation_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_vacation_calc_groups_tenant")
  @@map("vacation_calculation_groups")
}
```

#### Model 3: VacationCalcGroupSpecialCalc (junction)

```prisma
// -----------------------------------------------------------------------------
// VacationCalcGroupSpecialCalc (Junction)
// -----------------------------------------------------------------------------
// Migration: 000049
// Links VacationCalculationGroup <-> VacationSpecialCalculation (M2M)
model VacationCalcGroupSpecialCalc {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  groupId              String   @map("group_id") @db.Uuid
  specialCalculationId String   @map("special_calculation_id") @db.Uuid
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  group              VacationCalculationGroup    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  specialCalculation VacationSpecialCalculation  @relation(fields: [specialCalculationId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([groupId, specialCalculationId], map: "vacation_calc_group_special_calcs_group_special_key")
  @@index([groupId], map: "idx_vcgsc_group")
  @@index([specialCalculationId], map: "idx_vcgsc_special_calc")
  @@map("vacation_calc_group_special_calcs")
}
```

#### Model 4: VacationCappingRule

```prisma
// -----------------------------------------------------------------------------
// VacationCappingRule
// -----------------------------------------------------------------------------
// Migration: 000050
//
// CHECK constraints (enforced at DB level only):
//   - rule_type IN ('year_end', 'mid_year')
//   - cutoff_month BETWEEN 1 AND 12
//   - cutoff_day BETWEEN 1 AND 31
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model VacationCappingRule {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  ruleType    String   @map("rule_type") @db.VarChar(20)
  cutoffMonth Int      @default(12) @map("cutoff_month")
  cutoffDay   Int      @default(31) @map("cutoff_day")
  capValue    Decimal  @default(0) @map("cap_value") @db.Decimal(5, 2)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ruleGroupLinks VacationCappingRuleGroupRule[]
  employeeCappingExceptions EmployeeCappingException[]

  // Indexes
  @@unique([tenantId, code], map: "vacation_capping_rules_tenant_id_code_key")
  @@index([tenantId], map: "idx_vacation_capping_rules_tenant")
  @@map("vacation_capping_rules")
}
```

#### Model 5: VacationCappingRuleGroup

```prisma
// -----------------------------------------------------------------------------
// VacationCappingRuleGroup
// -----------------------------------------------------------------------------
// Migration: 000051
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model VacationCappingRuleGroup {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  cappingRuleLinks VacationCappingRuleGroupRule[]
  tariffs          Tariff[]

  // Indexes
  @@unique([tenantId, code], map: "vacation_capping_rule_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_vacation_capping_rule_groups_tenant")
  @@map("vacation_capping_rule_groups")
}
```

#### Model 6: VacationCappingRuleGroupRule (junction)

```prisma
// -----------------------------------------------------------------------------
// VacationCappingRuleGroupRule (Junction)
// -----------------------------------------------------------------------------
// Migration: 000051
// Links VacationCappingRuleGroup <-> VacationCappingRule (M2M)
model VacationCappingRuleGroupRule {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  groupId       String   @map("group_id") @db.Uuid
  cappingRuleId String   @map("capping_rule_id") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  group       VacationCappingRuleGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  cappingRule VacationCappingRule      @relation(fields: [cappingRuleId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([groupId, cappingRuleId], map: "vacation_capping_rule_group_rules_group_rule_key")
  @@index([groupId], map: "idx_vcrgr_group")
  @@index([cappingRuleId], map: "idx_vcrgr_capping_rule")
  @@map("vacation_capping_rule_group_rules")
}
```

#### Model 7: EmployeeCappingException

```prisma
// -----------------------------------------------------------------------------
// EmployeeCappingException
// -----------------------------------------------------------------------------
// Migration: 000052
//
// CHECK constraints (enforced at DB level only):
//   - exemption_type IN ('full', 'partial')
//
// UNIQUE(employee_id, capping_rule_id, year) -- DB treats NULLs as distinct
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model EmployeeCappingException {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  employeeId     String   @map("employee_id") @db.Uuid
  cappingRuleId  String   @map("capping_rule_id") @db.Uuid
  exemptionType  String   @map("exemption_type") @db.VarChar(20)
  retainDays     Decimal? @map("retain_days") @db.Decimal(5, 2)
  year           Int?
  notes          String?  @db.Text
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee    Employee           @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  cappingRule VacationCappingRule @relation(fields: [cappingRuleId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tenantId], map: "idx_employee_capping_exceptions_tenant")
  @@index([employeeId], map: "idx_employee_capping_exceptions_employee")
  @@index([cappingRuleId], map: "idx_employee_capping_exceptions_rule")
  @@map("employee_capping_exceptions")
}
```

#### Model 8: VacationBalance

```prisma
// -----------------------------------------------------------------------------
// VacationBalance
// -----------------------------------------------------------------------------
// Migration: 000027, 000052 (adds carryover_expires_at)
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model VacationBalance {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  employeeId        String    @map("employee_id") @db.Uuid
  year              Int
  entitlement       Decimal   @default(0) @db.Decimal(5, 2)
  carryover         Decimal   @default(0) @db.Decimal(5, 2)
  adjustments       Decimal   @default(0) @db.Decimal(5, 2)
  taken             Decimal   @default(0) @db.Decimal(5, 2)
  carryoverExpiresAt DateTime? @map("carryover_expires_at") @db.Date
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([employeeId, year], map: "vacation_balances_employee_id_year_key")
  @@index([tenantId], map: "idx_vacation_balances_tenant")
  @@index([employeeId], map: "idx_vacation_balances_employee")
  @@map("vacation_balances")
}
```

### 1.3 Add Relations to Existing Models

**EmploymentType model** (around line 267 in schema.prisma):

Add the relation to VacationCalculationGroup. Change:
```prisma
  // Note: vacationCalcGroupId FK references vacation_calculation_groups(id) ON DELETE SET NULL.
  // VacationCalculationGroup model is not yet in Prisma. Relation will be added when it is.
```
To:
```prisma
  vacationCalcGroup VacationCalculationGroup? @relation(fields: [vacationCalcGroupId], references: [id], onDelete: SetNull)
```

**Tariff model** (around line 1369, after the existing relations):

Add the relation to VacationCappingRuleGroup:
```prisma
  vacationCappingRuleGroup VacationCappingRuleGroup? @relation(fields: [vacationCappingRuleGroupId], references: [id], onDelete: SetNull)
```

**Employee model** (around line 567, after existing relations):

Add reverse relations:
```prisma
  cappingExceptions EmployeeCappingException[]
  vacationBalances  VacationBalance[]
```

**Tenant model** (add to the relations section, around line 101):

Add reverse relations for all new models:
```prisma
  vacationSpecialCalculations VacationSpecialCalculation[]
  vacationCalculationGroups   VacationCalculationGroup[]
  vacationCappingRules        VacationCappingRule[]
  vacationCappingRuleGroups   VacationCappingRuleGroup[]
  employeeCappingExceptions   EmployeeCappingException[]
  vacationBalances            VacationBalance[]
```

### 1.4 Generate Prisma Client

```bash
cd apps/web && npx prisma generate
```

### Phase 1 Verification

1. `npx prisma generate` completes without errors
2. `npx prisma validate` passes
3. Permission catalog test still passes: `npx vitest run src/server/__tests__/permission-catalog.test.ts`

---

## Phase 2: Calculation Libraries (Port from Go)

### 2.1 Vacation Entitlement Calculation

**File:** `apps/web/src/server/lib/vacation-calculation.ts`

Port from `apps/api/internal/calculation/vacation.go` (233 lines).

```typescript
/**
 * Vacation Entitlement Calculation
 *
 * Ported from: apps/api/internal/calculation/vacation.go
 * Computes vacation entitlement with pro-rating, part-time adjustment,
 * and special calculation bonuses (age, tenure, disability).
 */

// --- Types ---

export type VacationBasis = "calendar_year" | "entry_date"
export type SpecialCalcType = "age" | "tenure" | "disability"

export interface VacationSpecialCalc {
  type: SpecialCalcType
  threshold: number   // Age in years (age), tenure in years (tenure), ignored for disability
  bonusDays: number   // Additional vacation days to add
}

export interface VacationCalcInput {
  // Employee data
  birthDate: Date
  entryDate: Date
  exitDate: Date | null
  weeklyHours: number
  hasDisability: boolean

  // Configuration (from tariff)
  baseVacationDays: number    // Jahresurlaub
  standardWeeklyHours: number // Full-time weekly hours (e.g., 40)
  basis: VacationBasis        // calendar_year or entry_date
  specialCalcs: VacationSpecialCalc[]

  // Calculation context
  year: number
  referenceDate: Date         // Date to evaluate age/tenure at
}

export interface VacationCalcOutput {
  baseEntitlement: number
  proRatedEntitlement: number
  partTimeAdjustment: number
  ageBonus: number
  tenureBonus: number
  disabilityBonus: number
  totalEntitlement: number
  monthsEmployed: number
  ageAtReference: number
  tenureYears: number
}

// --- Core Functions ---

export function calculateVacation(input: VacationCalcInput): VacationCalcOutput {
  const output: VacationCalcOutput = {
    baseEntitlement: 0,
    proRatedEntitlement: 0,
    partTimeAdjustment: 0,
    ageBonus: 0,
    tenureBonus: 0,
    disabilityBonus: 0,
    totalEntitlement: 0,
    monthsEmployed: 0,
    ageAtReference: 0,
    tenureYears: 0,
  }

  // Step 1 - Reference Metrics
  output.ageAtReference = calculateAge(input.birthDate, input.referenceDate)
  output.tenureYears = calculateTenure(input.entryDate, input.referenceDate)

  // Step 2 - Months Employed
  output.monthsEmployed = calculateMonthsEmployedInYear(
    input.entryDate, input.exitDate, input.year, input.basis
  )

  // Step 3 - Pro-Rate by Months
  output.baseEntitlement = input.baseVacationDays
  if (output.monthsEmployed < 12) {
    output.proRatedEntitlement = input.baseVacationDays * (output.monthsEmployed / 12)
  } else {
    output.proRatedEntitlement = input.baseVacationDays
  }

  // Step 4 - Part-Time Adjustment
  if (input.standardWeeklyHours > 0) {
    const partTimeFactor = input.weeklyHours / input.standardWeeklyHours
    output.partTimeAdjustment = output.proRatedEntitlement * partTimeFactor
  } else {
    output.partTimeAdjustment = output.proRatedEntitlement
  }

  // Step 5 - Special Calculations (Bonuses)
  for (const sc of input.specialCalcs) {
    switch (sc.type) {
      case "age":
        if (output.ageAtReference >= sc.threshold) {
          output.ageBonus += sc.bonusDays
        }
        break
      case "tenure":
        if (output.tenureYears >= sc.threshold) {
          output.tenureBonus += sc.bonusDays
        }
        break
      case "disability":
        if (input.hasDisability) {
          output.disabilityBonus += sc.bonusDays
        }
        break
    }
  }

  // Step 6 - Total
  output.totalEntitlement = output.partTimeAdjustment
    + output.ageBonus + output.tenureBonus + output.disabilityBonus

  // Step 7 - Rounding to half-day
  output.totalEntitlement = roundToHalfDay(output.totalEntitlement)

  return output
}

// --- Helper Functions (all exported for testing) ---

export function calculateAge(birthDate: Date, referenceDate: Date): number {
  let years = referenceDate.getFullYear() - birthDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const refDay = referenceDate.getDate()
  const birthMonth = birthDate.getMonth()
  const birthDay = birthDate.getDate()
  if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
    years--
  }
  return Math.max(0, years)
}

export function calculateTenure(entryDate: Date, referenceDate: Date): number {
  if (referenceDate < entryDate) return 0
  let years = referenceDate.getFullYear() - entryDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const refDay = referenceDate.getDate()
  const entryMonth = entryDate.getMonth()
  const entryDay = entryDate.getDate()
  if (refMonth < entryMonth || (refMonth === entryMonth && refDay < entryDay)) {
    years--
  }
  return Math.max(0, years)
}

export function calculateMonthsEmployedInYear(
  entryDate: Date,
  exitDate: Date | null,
  year: number,
  basis: VacationBasis
): number {
  let periodStart: Date
  let periodEnd: Date

  if (basis === "calendar_year") {
    periodStart = new Date(Date.UTC(year, 0, 1))
    periodEnd = new Date(Date.UTC(year, 11, 31))
  } else {
    periodStart = new Date(Date.UTC(year, entryDate.getMonth(), entryDate.getDate()))
    periodEnd = new Date(Date.UTC(year + 1, entryDate.getMonth(), entryDate.getDate()))
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1)
  }

  let effectiveStart = periodStart
  if (entryDate > periodStart) {
    effectiveStart = entryDate
  }

  let effectiveEnd = periodEnd
  if (exitDate && exitDate < periodEnd) {
    effectiveEnd = exitDate
  }

  if (effectiveStart > effectiveEnd) return 0

  let months = 0
  const current = new Date(effectiveStart)
  while (current <= effectiveEnd) {
    months++
    current.setUTCMonth(current.getUTCMonth() + 1)
  }

  return Math.min(months, 12)
}

export function roundToHalfDay(value: number): number {
  return Math.round(value * 2) / 2
}
```

### 2.2 Carryover Calculation

**File:** `apps/web/src/server/lib/carryover-calculation.ts`

Port from `apps/api/internal/calculation/carryover.go` (164 lines).

```typescript
/**
 * Carryover Calculation with Capping
 *
 * Ported from: apps/api/internal/calculation/carryover.go
 * Computes vacation carryover applying capping rules and employee exceptions.
 */

// --- Types ---

export interface CappingRuleInput {
  ruleId: string
  ruleName: string
  ruleType: "year_end" | "mid_year"
  cutoffMonth: number
  cutoffDay: number
  capValue: number
}

export interface CappingExceptionInput {
  cappingRuleId: string
  exemptionType: "full" | "partial"
  retainDays: number | null
}

export interface CarryoverInput {
  availableDays: number
  year: number             // The year ending (carryover goes TO year+1)
  referenceDate: Date      // Date to evaluate mid-year rules against
  cappingRules: CappingRuleInput[]
  exceptions: CappingExceptionInput[]
}

export interface CappingRuleResult {
  ruleId: string
  ruleName: string
  ruleType: string
  capValue: number
  applied: boolean
  exceptionActive: boolean
}

export interface CarryoverOutput {
  availableDays: number
  cappedCarryover: number
  forfeitedDays: number
  rulesApplied: CappingRuleResult[]
  hasException: boolean
}

// --- Core Function ---

export function calculateCarryoverWithCapping(input: CarryoverInput): CarryoverOutput {
  const output: CarryoverOutput = {
    availableDays: input.availableDays,
    cappedCarryover: input.availableDays,
    forfeitedDays: 0,
    rulesApplied: [],
    hasException: false,
  }

  if (input.availableDays <= 0) {
    output.cappedCarryover = 0
    output.forfeitedDays = 0
    return output
  }

  // Build exception lookup by rule ID
  const exceptionMap = new Map<string, CappingExceptionInput>()
  for (const exc of input.exceptions) {
    exceptionMap.set(exc.cappingRuleId, exc)
  }

  let currentCarryover = input.availableDays

  for (const rule of input.cappingRules) {
    const result: CappingRuleResult = {
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      ruleType: rule.ruleType,
      capValue: rule.capValue,
      applied: false,
      exceptionActive: false,
    }

    // Check for employee exception
    const exc = exceptionMap.get(rule.ruleId)
    if (exc) {
      result.exceptionActive = true
      output.hasException = true

      if (exc.exemptionType === "full") {
        result.applied = false
        output.rulesApplied.push(result)
        continue
      }

      // Partial exemption: use RetainDays as the effective cap
      if (exc.retainDays !== null && exc.retainDays > rule.capValue) {
        if (currentCarryover > exc.retainDays) {
          currentCarryover = exc.retainDays
          result.applied = true
        }
        output.rulesApplied.push(result)
        continue
      }
    }

    // Apply the rule based on type
    switch (rule.ruleType) {
      case "year_end":
        if (rule.capValue === 0) {
          currentCarryover = 0
          result.applied = true
        } else if (currentCarryover > rule.capValue) {
          currentCarryover = rule.capValue
          result.applied = true
        }
        break

      case "mid_year": {
        const cutoffDate = new Date(Date.UTC(input.year + 1, rule.cutoffMonth - 1, rule.cutoffDay))
        if (input.referenceDate > cutoffDate) {
          if (rule.capValue === 0) {
            currentCarryover = 0
            result.applied = true
          } else if (currentCarryover > rule.capValue) {
            currentCarryover = rule.capValue
            result.applied = true
          }
        }
        break
      }
    }

    output.rulesApplied.push(result)
  }

  // Ensure non-negative
  currentCarryover = Math.max(0, currentCarryover)

  output.cappedCarryover = currentCarryover
  output.forfeitedDays = Math.max(0, input.availableDays - currentCarryover)

  return output
}
```

### Phase 2 Verification

1. TypeScript compiles: `npx tsc --noEmit` on the two new files
2. Unit tests pass for both calculation modules (see Phase 4)

---

## Phase 3: tRPC Routers

### 3.1 Router: vacationSpecialCalcs

**File:** `apps/web/src/server/routers/vacationSpecialCalcs.ts`

Pattern: Follow `absenceTypes.ts` (simpler CRUD) + `tariffs.ts` (decimal handling).

```typescript
// Permission constant
const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// Enum constants
const SPECIAL_CALC_TYPES = ["age", "tenure", "disability"] as const

// Output schema
const vacationSpecialCalcOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.string(),
  threshold: z.number(),
  bonusDays: z.number(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Create input schema
const createVacationSpecialCalcInputSchema = z.object({
  type: z.enum(SPECIAL_CALC_TYPES),
  threshold: z.number().int().min(0).default(0),
  bonusDays: z.number().positive("Bonus days must be positive"),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

// Update input schema
const updateVacationSpecialCalcInputSchema = z.object({
  id: z.string().uuid(),
  threshold: z.number().int().min(0).optional(),
  bonusDays: z.number().positive().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
```

**Router procedures:**
- `list`: query, input: `{ isActive?: boolean, type?: string }`, output: `{ data: VacationSpecialCalc[] }`, orderBy: `[{ type: "asc" }, { threshold: "asc" }]`
- `getById`: query, input: `{ id: string }`, output: single item
- `create`: mutation, validates:
  - Type must be valid enum
  - Threshold: must be 0 for disability, positive for age/tenure
  - BonusDays must be positive
  - Uniqueness: `findFirst({ where: { tenantId, type, threshold } })`
  - Store bonusDays as `new Prisma.Decimal(input.bonusDays)`
- `update`: mutation, partial update, validates threshold against existing type
- `delete`: mutation, checks `vacationCalcGroupSpecialCalc.count({ where: { specialCalculationId } })` before delete

**mapToOutput helper**: Converts `bonusDays` from Prisma Decimal to number using `decimalToNumber()` pattern from tariffs router.

### 3.2 Router: vacationCalcGroups

**File:** `apps/web/src/server/routers/vacationCalcGroups.ts`

Pattern: Follow `tariffs.ts` (complex CRUD with relations via junction table + transactions).

```typescript
// Enum constants
const VACATION_BASES = ["calendar_year", "entry_date"] as const

// Output includes nested specialCalculations summary
const specialCalcSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  threshold: z.number(),
  bonusDays: z.number(),
})

const vacationCalcGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  basis: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  specialCalculations: z.array(specialCalcSummarySchema).optional(),
})

// Create input
const createVacationCalcGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  basis: z.enum(VACATION_BASES).optional().default("calendar_year"),
  isActive: z.boolean().optional().default(true),
  specialCalculationIds: z.array(z.string().uuid()).optional(),
})

// Update input
const updateVacationCalcGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  basis: z.enum(VACATION_BASES).optional(),
  isActive: z.boolean().optional(),
  specialCalculationIds: z.array(z.string().uuid()).optional(), // null/undefined = don't change
})
```

**Key implementation details:**
- `list`: Preload special calculations via `include: { specialCalcLinks: { include: { specialCalculation: true } } }`. Map nested junction entries to flat array.
- `getById`: Same include pattern.
- `create`: Use `$transaction`:
  1. Create group record
  2. If `specialCalculationIds` provided, validate via `vacationSpecialCalculation.findMany({ where: { id: { in: ids } } })`, count must match
  3. `vacationCalcGroupSpecialCalc.createMany()` for junction entries
  4. Re-fetch with includes
- `update`: Use `$transaction`:
  1. Update group fields
  2. If `specialCalculationIds` provided (not undefined), `deleteMany` junction + `createMany` new entries
  3. Re-fetch with includes
- `delete`: Check `employmentType.count({ where: { vacationCalcGroupId } })` before delete

**Prisma include object:**
```typescript
const calcGroupDetailInclude = {
  specialCalcLinks: {
    include: {
      specialCalculation: {
        select: { id: true, type: true, threshold: true, bonusDays: true },
      },
    },
  },
} as const
```

**mapToOutput helper**: Extracts `specialCalculations` from `specialCalcLinks` array, converting each link's `specialCalculation` to summary format with `decimalToNumber()` for `bonusDays`.

### 3.3 Router: vacationCappingRules

**File:** `apps/web/src/server/routers/vacationCappingRules.ts`

Pattern: Same as `vacationSpecialCalcs.ts` (simple CRUD with decimal handling).

```typescript
const CAPPING_RULE_TYPES = ["year_end", "mid_year"] as const

const vacationCappingRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ruleType: z.string(),
  cutoffMonth: z.number(),
  cutoffDay: z.number(),
  capValue: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const createVacationCappingRuleInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  ruleType: z.enum(CAPPING_RULE_TYPES),
  cutoffMonth: z.number().int().min(1).max(12).optional().default(12),
  cutoffDay: z.number().int().min(1).max(31).optional().default(31),
  capValue: z.number().min(0, "Cap value must not be negative").optional().default(0),
  isActive: z.boolean().optional().default(true),
})

const updateVacationCappingRuleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  ruleType: z.enum(CAPPING_RULE_TYPES).optional(),
  cutoffMonth: z.number().int().min(1).max(12).optional(),
  cutoffDay: z.number().int().min(1).max(31).optional(),
  capValue: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})
```

**Router procedures:**
- `list`: input: `{ isActive?: boolean, ruleType?: string }`, orderBy: `{ code: "asc" }`
- `getById`: standard pattern
- `create`: validates code uniqueness, stores capValue as `new Prisma.Decimal(input.capValue)`
- `update`: partial update, standard pattern
- `delete`: checks `vacationCappingRuleGroupRule.count({ where: { cappingRuleId } })` before delete

### 3.4 Router: vacationCappingRuleGroups

**File:** `apps/web/src/server/routers/vacationCappingRuleGroups.ts`

Pattern: Same as `vacationCalcGroups.ts` (complex CRUD with junction table).

```typescript
const cappingRuleSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  ruleType: z.string(),
  capValue: z.number(),
})

const vacationCappingRuleGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cappingRules: z.array(cappingRuleSummarySchema).optional(),
})

const createVacationCappingRuleGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  cappingRuleIds: z.array(z.string().uuid()).optional(),
})

const updateVacationCappingRuleGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  cappingRuleIds: z.array(z.string().uuid()).optional(),
})
```

**Key implementation details:**
- Same junction table pattern as vacationCalcGroups
- Preload via `cappingRuleLinks: { include: { cappingRule: { select: ... } } }`
- `delete`: checks `tariff.count({ where: { vacationCappingRuleGroupId } })` before delete

### 3.5 Router: employeeCappingExceptions

**File:** `apps/web/src/server/routers/employeeCappingExceptions.ts`

Pattern: Similar to `absenceTypes.ts` but with additional filters and decimal handling.

```typescript
const EXEMPTION_TYPES = ["full", "partial"] as const

const employeeCappingExceptionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  cappingRuleId: z.string().uuid(),
  exemptionType: z.string(),
  retainDays: z.number().nullable(),
  year: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const createEmployeeCappingExceptionInputSchema = z.object({
  employeeId: z.string().uuid(),
  cappingRuleId: z.string().uuid(),
  exemptionType: z.enum(EXEMPTION_TYPES),
  retainDays: z.number().min(0).optional(),  // required if exemptionType = "partial"
  year: z.number().int().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

const updateEmployeeCappingExceptionInputSchema = z.object({
  id: z.string().uuid(),
  exemptionType: z.enum(EXEMPTION_TYPES).optional(),
  retainDays: z.number().min(0).nullable().optional(),
  year: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
```

**Router procedures:**
- `list`: input: `{ employeeId?: string, cappingRuleId?: string, year?: number }`, orderBy: `{ createdAt: "desc" }`. Year filter: `{ OR: [{ year: input.year }, { year: null }] }` (matches Go behavior of also returning null-year entries)
- `getById`: standard pattern
- `create`: validates:
  - `cappingRule.findFirst({ where: { id: input.cappingRuleId, tenantId } })` exists
  - If exemptionType = "partial", retainDays must be provided and >= 0
  - Uniqueness check: raw SQL or `findFirst` for employee+rule+year combo (handling null year via `$queryRawUnsafe`)
  - Store retainDays as `new Prisma.Decimal(input.retainDays)` when present
- `update`: partial update, validates retainDays required for partial type after applying changes
- `delete`: simple existence check + delete

### 3.6 Router: vacation (preview endpoints)

**File:** `apps/web/src/server/routers/vacation.ts`

```typescript
const entitlementPreviewOutputSchema = z.object({
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  year: z.number(),
  basis: z.string(),
  calcGroupId: z.string().uuid().nullable(),
  calcGroupName: z.string().nullable(),
  weeklyHours: z.number(),
  standardWeeklyHours: z.number(),
  partTimeFactor: z.number(),
  baseEntitlement: z.number(),
  proRatedEntitlement: z.number(),
  partTimeAdjustment: z.number(),
  ageBonus: z.number(),
  tenureBonus: z.number(),
  disabilityBonus: z.number(),
  totalEntitlement: z.number(),
  monthsEmployed: z.number(),
  ageAtReference: z.number(),
  tenureYears: z.number(),
})

const carryoverPreviewOutputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number(),
  availableDays: z.number(),
  cappedCarryover: z.number(),
  forfeitedDays: z.number(),
  hasException: z.boolean(),
  rulesApplied: z.array(z.object({
    ruleId: z.string().uuid(),
    ruleName: z.string(),
    ruleType: z.string(),
    capValue: z.number(),
    applied: z.boolean(),
    exceptionActive: z.boolean(),
  })),
})
```

**Procedures:**

#### `vacation.entitlementPreview` (mutation)

Input: `{ employeeId: z.string().uuid(), year: z.number().int().min(1900).max(2200), calcGroupId?: z.string().uuid() }`

Implementation:
1. Load employee with `include: { employmentType: true }`
2. Resolve calc group: if `calcGroupId` override provided, load it with special calcs; else resolve from `employee.employmentType.vacationCalcGroupId` -> load group with special calcs
3. Resolve tariff: load from `employee.tariffId`; also check `employeeTariffAssignment` for effective date
4. Build `VacationCalcInput` from employee fields + tariff fields + calc group special calcs
5. Call `calculateVacation(input)`
6. Return preview output

#### `vacation.carryoverPreview` (mutation)

Input: `{ employeeId: z.string().uuid(), year: z.number().int() }`

Implementation:
1. Load employee
2. Get tariff via `employee.tariffId`; throw if none
3. Get capping rule group via `tariff.vacationCappingRuleGroupId`; throw if none
4. Load group with capping rules: `include: { cappingRuleLinks: { include: { cappingRule: true } } }`
5. Get vacation balance: `vacationBalance.findFirst({ where: { employeeId, year } })`
6. Calculate available = entitlement + carryover + adjustments - taken (or 0)
7. Load employee exceptions: `employeeCappingException.findMany({ where: { employeeId, isActive: true, OR: [{ year }, { year: null }] } })`
8. Build `CarryoverInput` and call `calculateCarryoverWithCapping(input)`
9. Return preview output

### 3.7 Register All Routers in Root

**File:** `apps/web/src/server/root.ts`

Add imports:
```typescript
import { vacationSpecialCalcsRouter } from "./routers/vacationSpecialCalcs"
import { vacationCalcGroupsRouter } from "./routers/vacationCalcGroups"
import { vacationCappingRulesRouter } from "./routers/vacationCappingRules"
import { vacationCappingRuleGroupsRouter } from "./routers/vacationCappingRuleGroups"
import { employeeCappingExceptionsRouter } from "./routers/employeeCappingExceptions"
import { vacationRouter } from "./routers/vacation"
```

Add to `createTRPCRouter({})`:
```typescript
vacationSpecialCalcs: vacationSpecialCalcsRouter,
vacationCalcGroups: vacationCalcGroupsRouter,
vacationCappingRules: vacationCappingRulesRouter,
vacationCappingRuleGroups: vacationCappingRuleGroupsRouter,
employeeCappingExceptions: employeeCappingExceptionsRouter,
vacation: vacationRouter,
```

### Phase 3 Verification

1. TypeScript compiles: `cd apps/web && npx tsc --noEmit`
2. All existing tests still pass: `npx vitest run`
3. Router structure matches existing patterns (permission middleware, tenant-scoped queries, TRPCError codes)

---

## Phase 4: Frontend Hooks Migration

### 4.1 Migrate use-vacation-config.ts

**File:** `apps/web/src/hooks/api/use-vacation-config.ts`

Replace the entire file. Change from `useApiQuery`/`useApiMutation` pattern to tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Vacation Special Calculations ====================

export function useVacationSpecialCalculations(options: { isActive?: boolean; enabled?: boolean } = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationSpecialCalcs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useVacationSpecialCalculation(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationSpecialCalcs.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
    },
  })
}

export function useUpdateVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
    },
  })
}

export function useDeleteVacationSpecialCalculation() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationSpecialCalcs.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationSpecialCalcs.list.queryKey(),
      })
    },
  })
}

// ==================== Vacation Calculation Groups ====================

export function useVacationCalculationGroups(options: { isActive?: boolean; enabled?: boolean } = {}) {
  const trpc = useTRPC()
  const { enabled = true, ...input } = options
  return useQuery(
    trpc.vacationCalcGroups.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useVacationCalculationGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.vacationCalcGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
    },
  })
}

export function useUpdateVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
    },
  })
}

export function useDeleteVacationCalculationGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.vacationCalcGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.vacationCalcGroups.list.queryKey(),
      })
    },
  })
}

// ==================== Vacation Capping Rules ====================
// (same pattern x5 hooks using trpc.vacationCappingRules.*)

// ==================== Vacation Capping Rule Groups ====================
// (same pattern x5 hooks using trpc.vacationCappingRuleGroups.*)

// ==================== Employee Capping Exceptions ====================
// (same pattern x5 hooks using trpc.employeeCappingExceptions.*)
// list hook takes { employeeId?: string, enabled?: boolean }

// ==================== Previews ====================

export function useVacationEntitlementPreview() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.vacation.entitlementPreview.mutationOptions(),
  })
}

export function useVacationCarryoverPreview() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.vacation.carryoverPreview.mutationOptions(),
  })
}
```

Total: 27 hooks migrated.

### Phase 4 Verification

1. TypeScript compiles with no errors
2. No imports of old `useApiQuery`/`useApiMutation` remain in this file

---

## Phase 5: Tests

### 5.1 Calculation Tests

**File:** `apps/web/src/server/__tests__/vacation-calculation.test.ts`

Test the ported Go calculation logic:

```typescript
describe("calculateVacation", () => {
  it("calculates full-year, full-time entitlement (30 days)")
  it("pro-rates for partial year (6 months -> 15 days)")
  it("applies part-time factor (20h/40h -> half entitlement)")
  it("adds age bonus when threshold met")
  it("adds tenure bonus when threshold met")
  it("adds disability bonus when flag set")
  it("skips age bonus when under threshold")
  it("rounds to half-day (e.g., 22.3 -> 22.5)")
  it("handles entry_date basis")
  it("handles employee with exit date mid-year")
})

describe("calculateAge", () => {
  it("returns correct age before birthday in reference year")
  it("returns correct age on birthday")
  it("returns 0 for future birth date")
})

describe("calculateTenure", () => {
  it("returns correct tenure years")
  it("returns 0 when reference before entry")
})

describe("calculateMonthsEmployedInYear", () => {
  it("returns 12 for full year employment")
  it("returns correct months for mid-year start")
  it("returns correct months for mid-year exit")
  it("handles entry_date basis")
})

describe("roundToHalfDay", () => {
  it("rounds 22.3 to 22.5")
  it("rounds 22.7 to 22.5")
  it("rounds 22.75 to 23.0")
  it("keeps 22.0 as 22.0")
  it("keeps 22.5 as 22.5")
})
```

**File:** `apps/web/src/server/__tests__/vacation-calculation.test.ts` (carryover section or separate file)

```typescript
describe("calculateCarryoverWithCapping", () => {
  it("returns full carryover when no rules")
  it("caps year_end rule when available > capValue")
  it("does not cap when available <= capValue")
  it("applies mid_year rule when reference date past cutoff")
  it("does not apply mid_year rule when reference date before cutoff")
  it("handles full exemption (skips rule)")
  it("handles partial exemption (uses retainDays as effective cap)")
  it("handles zero available days")
  it("handles capValue of 0 (forfeit all)")
  it("applies multiple rules in sequence")
})
```

### 5.2 Router Tests

Follow the exact pattern from `tariffs-router.test.ts`:
- Use `createCallerFactory(router)` to create caller
- Use mock Prisma objects with `vi.fn()`
- Use `createTestContext()` helper with `createUserWithPermissions([VACATION_CONFIG_MANAGE])`

**File:** `apps/web/src/server/__tests__/vacationSpecialCalcs-router.test.ts`

```typescript
describe("vacationSpecialCalcs.list", () => {
  it("returns all special calcs for tenant, ordered by type and threshold")
  it("filters by isActive when provided")
  it("filters by type when provided")
  it("returns empty array when none exist")
})

describe("vacationSpecialCalcs.getById", () => {
  it("returns special calc by ID")
  it("throws NOT_FOUND for non-existent")
})

describe("vacationSpecialCalcs.create", () => {
  it("creates age type with positive threshold")
  it("creates disability type with threshold 0")
  it("throws BAD_REQUEST for disability type with non-zero threshold")
  it("throws BAD_REQUEST for age type with zero threshold")
  it("throws CONFLICT for duplicate type+threshold")
  it("stores bonusDays as Prisma Decimal")
})

describe("vacationSpecialCalcs.update", () => {
  it("updates bonusDays successfully")
  it("throws NOT_FOUND for non-existent")
  it("throws BAD_REQUEST when setting threshold != 0 for disability type")
})

describe("vacationSpecialCalcs.delete", () => {
  it("deletes successfully when not in use")
  it("throws BAD_REQUEST when used by calc groups")
  it("throws NOT_FOUND for non-existent")
})
```

**File:** `apps/web/src/server/__tests__/vacationCalcGroups-router.test.ts`

```typescript
describe("vacationCalcGroups.list", () => {
  it("returns groups with special calculations preloaded")
  it("filters by isActive")
})

describe("vacationCalcGroups.create", () => {
  it("creates group with special calculation links in transaction")
  it("throws CONFLICT for duplicate code")
  it("throws BAD_REQUEST when specialCalculationIds reference non-existent records")
})

describe("vacationCalcGroups.update", () => {
  it("replaces special calculations when IDs provided")
  it("keeps existing links when specialCalculationIds undefined")
})

describe("vacationCalcGroups.delete", () => {
  it("deletes when not assigned to employment types")
  it("throws BAD_REQUEST when assigned to employment types")
})
```

**Files for remaining routers follow the same pattern:**
- `vacationCappingRules-router.test.ts` - CRUD tests with cutoff validation
- `vacationCappingRuleGroups-router.test.ts` - CRUD + junction table tests
- `employeeCappingExceptions-router.test.ts` - CRUD with filter tests + retain days validation

**File:** `apps/web/src/server/__tests__/vacation-router.test.ts`

```typescript
describe("vacation.entitlementPreview", () => {
  it("returns full entitlement preview for full-time employee")
  it("applies pro-rating for partial year")
  it("uses calc group override when provided")
  it("resolves calc group from employment type when no override")
  it("throws NOT_FOUND when employee not found")
  it("throws BAD_REQUEST for invalid year")
})

describe("vacation.carryoverPreview", () => {
  it("returns carryover preview with capping rules applied")
  it("applies employee exceptions")
  it("throws when employee has no tariff")
  it("throws when tariff has no capping rule group")
  it("returns zero carryover when no balance exists")
})
```

### Phase 5 Verification

1. All tests pass: `cd apps/web && npx vitest run`
2. No regressions in existing tests

---

## Implementation Order Summary

1. **Phase 1** - Schema + Permission (must be first - everything depends on Prisma models)
   - Add permission to catalog
   - Add 8 Prisma models
   - Add relations to existing models (EmploymentType, Tariff, Employee, Tenant)
   - Run `npx prisma generate`
   - Verify: `npx prisma validate`

2. **Phase 2** - Calculation Libraries (standalone, no dependencies except types)
   - Create `vacation-calculation.ts`
   - Create `carryover-calculation.ts`
   - Verify: TypeScript compiles

3. **Phase 3** - tRPC Routers (depends on Phase 1 + 2)
   - Create 5 CRUD routers (vacationSpecialCalcs, vacationCalcGroups, vacationCappingRules, vacationCappingRuleGroups, employeeCappingExceptions)
   - Create vacation preview router
   - Register all in root.ts
   - Verify: TypeScript compiles, existing tests pass

4. **Phase 4** - Frontend Hooks (depends on Phase 3)
   - Rewrite `use-vacation-config.ts` to use tRPC
   - Verify: TypeScript compiles

5. **Phase 5** - Tests (depends on Phase 3 + 4)
   - Write calculation tests
   - Write router tests for all 6 routers
   - Verify: All tests pass

---

## Key References

| Pattern | Reference File |
|---------|---------------|
| Simple CRUD router | `apps/web/src/server/routers/absenceTypes.ts` |
| Complex CRUD with relations + transactions | `apps/web/src/server/routers/tariffs.ts` |
| Decimal handling (`decimalToNumber`, `new Prisma.Decimal`) | `apps/web/src/server/routers/tariffs.ts` |
| Permission constant pattern | `permissionIdByKey("xxx.manage")!` |
| Router test pattern (mock Prisma, createCallerFactory) | `apps/web/src/server/__tests__/tariffs-router.test.ts` |
| Test helpers | `apps/web/src/server/__tests__/helpers.ts` |
| Frontend hooks pattern | `apps/web/src/hooks/api/use-tariffs.ts` |
| Root router registration | `apps/web/src/server/root.ts` |
| Go vacation calculation (to port) | `apps/api/internal/calculation/vacation.go` |
| Go carryover calculation (to port) | `apps/api/internal/calculation/carryover.go` |
| Go entitlement preview service | `apps/api/internal/service/vacation.go` (lines 237-410) |
| Go carryover preview service | `apps/api/internal/service/vacationcarryover.go` |
