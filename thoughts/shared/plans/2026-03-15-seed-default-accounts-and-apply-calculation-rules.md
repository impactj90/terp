# Seed Default Accounts & Apply Calculation Rules in Daily-Calc Pipeline

## Overview

Two gaps exist in the daily calculation pipeline:

1. **No default accounts seeded**: `DayPlan.netAccountId` and `DayPlan.capAccountId` exist but no standard NET/CAP accounts are available out of the box — admins must create them manually before any account postings happen.
2. **Calculation rules not applied**: `AbsenceType.calculationRuleId` links to a `CalculationRule` with `accountId`, `value`, `factor`, but `daily-calc.ts` never reads or applies this data. When an absence is approved, no minutes are posted to the rule's target account.

This plan closes both gaps so the system works end-to-end: absence → approval → daily calc → account posting.

## Current State Analysis

### Accounts
- 3 system accounts from migration `000007`: FLEX, OT, VAC (`tenant_id = NULL, is_system = true`)
- 6 dev-seed accounts in `seed.sql`: NIGHT, SAT, SUN, ONCALL, TRAVEL, SICK
- No NET or CAP system account exists
- `DayPlan.netAccountId` / `capAccountId` added in migration `000080`, always `NULL`

### Daily Calc Pipeline (`daily-calc.ts:104-221`)
9 steps: holiday check → load plan → load bookings → branch (off day / holiday / absence / no-bookings / normal) → upsert DailyValue → postDailyAccountValues (net/cap) → postSurchargeValues → notify errors

### Key Gap: Absence → Calculation Rule → Account Posting
- `loadAbsenceDay` (line 341): SQL joins `absence_types` but only fetches `at_portion`, `at_priority`, `at_code`
- `AbsenceDayRow` type (daily-calc.types.ts:12-32): no calculation rule fields
- `postDailyAccountValues` (line 1411): only posts `net_time` and `capped_time` from `DayPlan`
- DailyAccountValue sources: `'net_time'`, `'capped_time'`, `'surcharge'` — no absence source
- Calculation rule data (`value`, `factor`, `accountId`) is stored but never consumed during calculation

### Key Discoveries
- `loadAbsenceDay` is called in multiple places: `calculateDay:137`, `resolveTargetHours:328`, `handleNoBookings:810` — but the absence data is NOT propagated to `postDailyAccountValues`
- The `resolveTargetHours` method already loads the absence day to check `isAbsenceDay`, so the absence data is available at that point but discarded
- `handleAbsenceCredit` only fires for the rare case: holiday + no bookings + approved absence with priority > 0
- For the common case (normal workday + approved absence + no bookings), `handleNoBookings` runs — it resolves target hours (which internally checks absence) but doesn't know about the absence type or calculation rule

## Desired End State

After this plan:
1. System accounts NET and CAP exist globally for all tenants
2. When `calculateDay` runs and an approved absence exists for that date, the system looks up the absence type's calculation rule
3. If the rule has an `accountId`, the system computes `minutes = (value > 0 ? value : targetTime) * factor` and upserts a `DailyAccountValue` with `source = 'absence_rule'`
4. This works for ALL absence paths (holiday override, no-bookings, normal work day with absence)
5. Handbook section 4.13 is updated to reflect that calculation rules now work automatically

### Verification:
- `pnpm vitest run src/lib/services/__tests__/daily-calc.test.ts` — all existing + new tests pass
- `pnpm vitest run src/lib/services/__tests__/daily-calc.helpers.test.ts` — new helper tests pass
- `pnpm typecheck` — no new type errors
- `pnpm lint` — clean
- Migration applies cleanly: `pnpm db:reset`

## What We're NOT Doing

- NOT auto-assigning NET/CAP accounts to existing DayPlans (that's a UI/admin action)
- NOT changing the existing net_time/capped_time/surcharge posting logic
- NOT adding calculation rule selection to the absence type form (that's a separate UI ticket)
- NOT touching monthly calculation — this is daily-level only
- NOT creating new browser E2E tests for this (no UI changes involved)

## Implementation Approach

The work splits into 3 phases:
1. **Migration**: Seed NET + CAP system accounts
2. **Core Logic**: Extend daily-calc to apply calculation rules for absences
3. **Tests + Handbook**: Unit tests, integration test assertions, handbook update

---

## Phase 1: Seed Default System Accounts

### Overview
Add NET and CAP as system accounts (like FLEX, OT, VAC) so they're available to all tenants out of the box.

### Changes Required:

#### 1. New Migration
**File**: `supabase/migrations/20260101000092_seed_net_cap_system_accounts.sql`

```sql
-- Seed NET and CAP system accounts (global, available to all tenants)
INSERT INTO accounts (tenant_id, code, name, account_type, unit, is_system, description, sort_order)
VALUES
  (NULL, 'NET', 'Netto-Arbeitszeit', 'day', 'minutes', true, 'Automatisch berechnete Netto-Arbeitszeit pro Tag', 10),
  (NULL, 'CAP', 'Kappungszeit',      'day', 'minutes', true, 'Über die maximale Nettoarbeitszeit hinausgehende Minuten', 11)
ON CONFLICT DO NOTHING;
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies: `pnpm db:reset` succeeds
- [ ] Accounts visible: `SELECT code, name, is_system FROM accounts WHERE code IN ('NET','CAP')` returns 2 rows

#### Manual Verification:
- [ ] In the Accounts admin page, toggle "Systemkonten anzeigen" → NET and CAP appear

**Implementation Note**: After this phase, pause for manual confirmation.

---

## Phase 2: Apply Calculation Rules in Daily-Calc Pipeline

### Overview
Extend the daily-calc pipeline so that when a day has an approved absence, and the absence type has a calculation rule with an account, the computed value is posted as a `DailyAccountValue`.

### Changes Required:

#### 1. Add `DAV_SOURCE_ABSENCE_RULE` constant
**File**: `src/lib/services/daily-calc.types.ts`

Add after line 60:
```typescript
export const DAV_SOURCE_ABSENCE_RULE = "absence_rule"
```

#### 2. Extend `AbsenceDayRow` with calculation rule fields
**File**: `src/lib/services/daily-calc.types.ts`

Add to the `AbsenceDayRow` interface after `at_code` (line 31):
```typescript
  // Joined fields from calculation_rules (via absence_types.calculation_rule_id)
  cr_account_id: string | null
  cr_value: number | null
  cr_factor: string | null // Decimal as string from raw SQL
```

#### 3. Extend `loadAbsenceDay` SQL query
**File**: `src/lib/services/daily-calc.ts` (line 341-357)

Replace the existing query with:
```typescript
private async loadAbsenceDay(
  employeeId: string,
  date: Date
): Promise<AbsenceDayRow | null> {
  const rows = await this.prisma.$queryRaw<AbsenceDayRow[]>`
    SELECT ad.*,
           at.portion as at_portion,
           at.priority as at_priority,
           at.code as at_code,
           cr.account_id as cr_account_id,
           cr.value as cr_value,
           cr.factor::text as cr_factor
    FROM absence_days ad
    LEFT JOIN absence_types at ON at.id = ad.absence_type_id
    LEFT JOIN calculation_rules cr ON cr.id = at.calculation_rule_id
    WHERE ad.employee_id = ${employeeId}::uuid
      AND ad.absence_date = ${date}::date
    LIMIT 1
  `
  return rows[0] ?? null
}
```

#### 4. Add pure helper: `calculateAbsenceRuleValue`
**File**: `src/lib/services/daily-calc.helpers.ts`

Add after `calculateAbsenceCredit` (after line 454):
```typescript
/**
 * Calculate value to post from a calculation rule.
 * Formula: if ruleValue > 0 → ruleValue * factor, else targetTime * factor.
 * Returns minutes (floored to integer).
 */
export function calculateAbsenceRuleValue(
  targetTime: number,
  ruleValue: number,
  ruleFactor: number
): number {
  const base = ruleValue > 0 ? ruleValue : targetTime
  return Math.floor(base * ruleFactor)
}
```

#### 5. Add `postAbsenceRuleValue` private method
**File**: `src/lib/services/daily-calc.ts`

Add a new private method after `postSurchargeValues` (after line 1562):
```typescript
/**
 * Post absence rule account value when an approved absence has a calculation rule.
 * Called for every day that has an approved absence with a linked calculation rule.
 */
private async postAbsenceRuleValue(
  tenantId: string,
  employeeId: string,
  date: Date,
  absenceDay: AbsenceDayRow | null,
  targetTime: number,
  dayPlanId: string | null
): Promise<void> {
  // Clean up any previous absence_rule posting for this date
  await this.prisma.dailyAccountValue.deleteMany({
    where: { employeeId, valueDate: date, source: DAV_SOURCE_ABSENCE_RULE },
  })

  // Only post if we have an approved absence with a calculation rule that has an account
  if (
    !absenceDay ||
    absenceDay.status !== "approved" ||
    !absenceDay.cr_account_id ||
    absenceDay.cr_factor === null
  ) {
    return
  }

  const ruleValue = absenceDay.cr_value ?? 0
  const ruleFactor = Number(absenceDay.cr_factor)
  const minutes = calculateAbsenceRuleValue(targetTime, ruleValue, ruleFactor)

  if (minutes <= 0) {
    return
  }

  await this.prisma.dailyAccountValue.upsert({
    where: {
      employeeId_valueDate_accountId_source: {
        employeeId,
        valueDate: date,
        accountId: absenceDay.cr_account_id,
        source: DAV_SOURCE_ABSENCE_RULE,
      },
    },
    create: {
      tenantId,
      employeeId,
      accountId: absenceDay.cr_account_id,
      valueDate: date,
      valueMinutes: minutes,
      source: DAV_SOURCE_ABSENCE_RULE,
      dayPlanId,
    },
    update: {
      valueMinutes: minutes,
      dayPlanId,
      updatedAt: new Date(),
    },
  })
}
```

#### 6. Wire into `calculateDay` — add step 7.5
**File**: `src/lib/services/daily-calc.ts`

Add imports at the top:
```typescript
import { DAV_SOURCE_ABSENCE_RULE } from "./daily-calc.types"
import { calculateAbsenceRuleValue } from "./daily-calc.helpers"
```

After step 7 (postDailyAccountValues, line 197) and before step 8, insert:

```typescript
    // 7.5. Post absence rule account value (if applicable)
    {
      const absenceDay = await this.loadAbsenceDay(employeeId, calcDate)
      await this.postAbsenceRuleValue(
        tenantId,
        employeeId,
        calcDate,
        absenceDay,
        dvInput.targetTime,
        empDayPlan?.dayPlan?.id ?? null
      )
    }
```

**Note**: We load absenceDay again here rather than threading it through every branch. The query is lightweight (single row by employee+date, already indexed) and this keeps the change minimal — no signature changes to any existing method.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] `pnpm vitest run src/lib/services/__tests__/daily-calc.test.ts` — all existing tests pass
- [ ] `pnpm vitest run src/lib/services/__tests__/daily-calc.helpers.test.ts` — all tests pass
- [ ] `pnpm lint` — clean

**Implementation Note**: After this phase, pause for manual confirmation before proceeding to tests.

---

## Phase 3: Tests & Handbook

### Overview
Add unit tests for the new helper function, add integration tests for the calculation rule posting in the daily-calc service, and update the handbook.

### Changes Required:

#### 1. Unit tests for `calculateAbsenceRuleValue`
**File**: `src/lib/services/__tests__/daily-calc.helpers.test.ts`

Add a new describe block:
```typescript
describe("calculateAbsenceRuleValue", () => {
  it("uses ruleValue when > 0", () => {
    // ruleValue=120, factor=1.0 → 120 minutes
    expect(calculateAbsenceRuleValue(480, 120, 1.0)).toBe(120)
  })

  it("uses targetTime when ruleValue is 0", () => {
    // ruleValue=0 → use targetTime=480, factor=1.0 → 480
    expect(calculateAbsenceRuleValue(480, 0, 1.0)).toBe(480)
  })

  it("applies factor as multiplier", () => {
    // ruleValue=0 → use targetTime=480, factor=0.5 → 240
    expect(calculateAbsenceRuleValue(480, 0, 0.5)).toBe(240)
  })

  it("floors the result", () => {
    // 480 * 0.33 = 158.4 → 158
    expect(calculateAbsenceRuleValue(480, 0, 0.33)).toBe(158)
  })

  it("returns 0 when factor is 0", () => {
    expect(calculateAbsenceRuleValue(480, 0, 0)).toBe(0)
  })

  it("uses fixed ruleValue * factor (ignoring targetTime)", () => {
    // ruleValue=60, factor=2.0 → 120 (targetTime=480 is ignored)
    expect(calculateAbsenceRuleValue(480, 60, 2.0)).toBe(120)
  })
})
```

#### 2. Integration tests for absence rule posting
**File**: `src/lib/services/__tests__/daily-calc.test.ts`

Add new tests in the `calculateDay` describe block:

```typescript
it("posts absence_rule account value when absence has calculation rule", async () => {
  mocks.employeeDayPlan.findFirst.mockResolvedValue(
    makeEmpDayPlan({ noBookingBehavior: "adopt_target" })
  )

  // Mock loadAbsenceDay ($queryRaw) to return absence with calculation rule
  // Called twice: once in resolveTargetHours, once in step 7.5
  const absenceRow = {
    id: "ad1",
    status: "approved",
    duration: "1.00",
    at_portion: 1,
    at_priority: 0,
    at_code: "K01",
    cr_account_id: "acc-sick",
    cr_value: 0,        // use targetTime
    cr_factor: "1.00",
  }
  mocks.$queryRaw.mockResolvedValue([absenceRow])

  await service.calculateDay(TENANT_ID, EMPLOYEE_ID, DATE)

  // Find the absence_rule upsert call
  const upsertCalls = mocks.dailyAccountValue.upsert.mock.calls
  const absenceRuleCall = upsertCalls.find(
    (c: unknown[]) => (c[0] as { create: { source: string } }).create.source === "absence_rule"
  )
  expect(absenceRuleCall).toBeDefined()
  const create = (absenceRuleCall![0] as { create: Record<string, unknown> }).create
  expect(create.accountId).toBe("acc-sick")
  expect(create.valueMinutes).toBe(480) // targetTime * 1.0
})

it("does not post absence_rule when no calculation rule linked", async () => {
  mocks.employeeDayPlan.findFirst.mockResolvedValue(
    makeEmpDayPlan({ noBookingBehavior: "adopt_target" })
  )

  // Absence without calculation rule
  mocks.$queryRaw.mockResolvedValue([{
    id: "ad1",
    status: "approved",
    duration: "1.00",
    at_portion: 1,
    at_priority: 0,
    at_code: "U01",
    cr_account_id: null,
    cr_value: null,
    cr_factor: null,
  }])

  await service.calculateDay(TENANT_ID, EMPLOYEE_ID, DATE)

  const upsertCalls = mocks.dailyAccountValue.upsert.mock.calls
  const absenceRuleCall = upsertCalls.find(
    (c: unknown[]) => (c[0] as { create: { source: string } }).create.source === "absence_rule"
  )
  expect(absenceRuleCall).toBeUndefined()
})

it("cleans up absence_rule posting when no absence", async () => {
  mocks.employeeDayPlan.findFirst.mockResolvedValue(
    makeEmpDayPlan({ noBookingBehavior: "adopt_target" })
  )

  // No absence
  mocks.$queryRaw.mockResolvedValue([])

  await service.calculateDay(TENANT_ID, EMPLOYEE_ID, DATE)

  // Should have called deleteMany with absence_rule source
  const deleteCalls = mocks.dailyAccountValue.deleteMany.mock.calls
  const absenceRuleDelete = deleteCalls.find(
    (c: unknown[]) => (c[0] as { where: { source?: string } }).where.source === "absence_rule"
  )
  expect(absenceRuleDelete).toBeDefined()
})

it("uses fixed ruleValue when > 0 (ignores targetTime)", async () => {
  mocks.employeeDayPlan.findFirst.mockResolvedValue(
    makeEmpDayPlan({ noBookingBehavior: "adopt_target" })
  )

  mocks.$queryRaw.mockResolvedValue([{
    id: "ad1",
    status: "approved",
    duration: "1.00",
    at_portion: 1,
    at_priority: 0,
    at_code: "K01",
    cr_account_id: "acc-sick",
    cr_value: 120,       // fixed 120 minutes
    cr_factor: "1.50",   // factor 1.5
  }])

  await service.calculateDay(TENANT_ID, EMPLOYEE_ID, DATE)

  const upsertCalls = mocks.dailyAccountValue.upsert.mock.calls
  const absenceRuleCall = upsertCalls.find(
    (c: unknown[]) => (c[0] as { create: { source: string } }).create.source === "absence_rule"
  )
  expect(absenceRuleCall).toBeDefined()
  const create = (absenceRuleCall![0] as { create: Record<string, unknown> }).create
  expect(create.valueMinutes).toBe(180) // 120 * 1.5
})
```

#### 3. Handbook update — Section 4.13
**File**: `TERP_HANDBUCH_V2.md`

Update section 4.13 to clarify:
- The button text is "Erstellen" (not "Speichern") for new rules
- The Wert field unit is Minuten (matching the UI)
- Calculation rules are now automatically applied during daily calculation
- Remove the note about "über die API" for linking absence types (still true for UI, but the rule itself now works)

Replace the paragraph after "Praxisbeispiel" step 3 (line 1639-1642) with:

```markdown
3. **Abwesenheitstyp verknüpfen:**
   Die Verknüpfung zwischen Abwesenheitstyp und Berechnungsregel erfolgt aktuell über die Datenbank (Feld `calculation_rule_id` in der Tabelle `absence_types`). Eine UI-Zuordnung in der Abwesenheitsarten-Verwaltung ist noch nicht verfügbar.

4. **Automatische Anwendung bei Tagesberechnung:**
   Wenn ein Mitarbeiter mit 8 Stunden Tagessollzeit einen Tag krank gemeldet wird, berechnet das System bei der nächsten Tagesberechnung: **0 (= 480 Min. Sollzeit) × 1,00 = 480 Minuten** → werden automatisch auf das Konto `KR` gebucht. Die Buchung erscheint in den Kontobuchungen (📍 Verwaltung → Konten → ⋮ → „Buchungen anzeigen") mit der Quelle „Berechnungsregel".
```

Update the Hinweis at line 1644:

```markdown
💡 **Hinweis:** Berechnungsregeln werden automatisch bei jeder Tagesberechnung angewendet — sowohl bei der Genehmigung einer Abwesenheit als auch beim nächtlichen Neuberechnungslauf. Der berechnete Wert wird als `DailyAccountValue` mit Quelle `absence_rule` gespeichert. Für die reine Urlaubskontoführung (Tage abziehen) werden keine Berechnungsregeln benötigt — das erledigt der Abwesenheitstyp selbst über die Einstellung „Urlaub betroffen".
```

Also fix the minor discrepancies found during verification:
- Line 1618: Change `Wert (0 = Tagessollzeit verwenden)` to include "Minuten" to match the UI label
- Line 1619: Change `📍 „Speichern"` to `📍 „Erstellen"`

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm vitest run src/lib/services/__tests__/daily-calc.helpers.test.ts` — all tests pass (including new `calculateAbsenceRuleValue`)
- [ ] `pnpm vitest run src/lib/services/__tests__/daily-calc.test.ts` — all tests pass (including 4 new tests)
- [ ] `pnpm typecheck` — no new type errors
- [ ] `pnpm lint` — clean

#### Manual Verification:
- [ ] Handbook section 4.13 reads correctly and matches the new behavior

---

## Testing Strategy

### Unit Tests (Phase 3):
- `calculateAbsenceRuleValue` — 6 test cases covering: fixed value, targetTime fallback, factor application, floor rounding, zero factor, factor > 1

### Integration Tests (Phase 3):
- Absence with calculation rule → `absence_rule` DailyAccountValue posted with correct minutes
- Absence without calculation rule → no `absence_rule` posting
- No absence → old `absence_rule` postings cleaned up
- Fixed ruleValue > 0 → uses ruleValue instead of targetTime

### E2E Tests:
- No new browser E2E tests needed (no UI changes)
- The existing tRPC e2e tests for calculation rules (`src/e2e/__tests__/02-arbeitszeitmodelle.test.ts`) cover CRUD operations and don't need changes

## Migration Notes

- Migration `000092` is additive (INSERT ON CONFLICT DO NOTHING) — safe for existing databases
- No schema changes to existing tables
- The `loadAbsenceDay` SQL change adds a LEFT JOIN to `calculation_rules` — this is safe even if `calculation_rule_id` is NULL (LEFT JOIN returns NULLs)
- Existing `DailyAccountValue` rows with sources `net_time`, `capped_time`, `surcharge` are untouched

## References

- `prisma/schema.prisma:1147-1171` — CalculationRule model
- `prisma/schema.prisma:1185-1218` — AbsenceType model (calculationRuleId at line 1203)
- `prisma/schema.prisma:2956-2984` — DailyAccountValue model
- `src/lib/services/daily-calc.ts:104-221` — calculateDay pipeline
- `src/lib/services/daily-calc.ts:341-357` — loadAbsenceDay
- `src/lib/services/daily-calc.ts:1411-1487` — postDailyAccountValues
- `src/lib/services/daily-calc.types.ts:12-32` — AbsenceDayRow
- `src/lib/services/daily-calc.helpers.ts:448-454` — calculateAbsenceCredit
- `supabase/migrations/20260101000007_create_accounts.sql` — existing system accounts
- `TERP_HANDBUCH_V2.md:1599-1644` — Section 4.13 Berechnungsregeln
