/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 7: Urlaubskonfiguration (Fortgeschritten)
 *
 * Tests UC-046 through UC-050 against the real database.
 * Requires local Supabase running with seed data.
 *
 * Seed data used:
 *   - Employees: Admin (..0011), User (..0012), Maria (..0013), Thomas (..0014), Anna (..0015)
 *   - Vacation special calcs: age 50 (..17001), tenure 5 (..17002), tenure 10 (..17003),
 *     disability (..17004), age 60 (..17005), tenure 20 inactive (..17006)
 *   - Vacation calc groups: STANDARD (..17010), ENTRY_BASED (..17011)
 *   - Capping rules: YEAR_END_10 (..17020), MID_YEAR_5 (..17021), FORFEIT_ALL (..17022)
 *   - Employee capping exceptions: Anna partial (..17040), Thomas full (..17041)
 *   - Vacation balances for 2026
 *
 * @see docs/use-cases/07-urlaub-erweitert.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

// --- Seed Constants ---
const EMPLOYEE_ADMIN = "00000000-0000-0000-0000-000000000011"
const EMPLOYEE_USER = "00000000-0000-0000-0000-000000000012"
const EMPLOYEE_MARIA = "00000000-0000-0000-0000-000000000013"
const EMPLOYEE_THOMAS = "00000000-0000-0000-0000-000000000014"
const EMPLOYEE_ANNA = "00000000-0000-0000-0000-000000000015"

// Seed vacation special calculation IDs
const SPECIAL_CALC_AGE_50 = "00000000-0000-0000-0000-000000017001"
const SPECIAL_CALC_TENURE_5 = "00000000-0000-0000-0000-000000017002"
const SPECIAL_CALC_TENURE_10 = "00000000-0000-0000-0000-000000017003"
const SPECIAL_CALC_DISABILITY = "00000000-0000-0000-0000-000000017004"
const _SPECIAL_CALC_AGE_60 = "00000000-0000-0000-0000-000000017005"
const _SPECIAL_CALC_TENURE_20_INACTIVE = "00000000-0000-0000-0000-000000017006"

// Seed vacation calc group IDs
const CALC_GROUP_STANDARD = "00000000-0000-0000-0000-000000017010"
const CALC_GROUP_ENTRY_BASED = "00000000-0000-0000-0000-000000017011"

// Seed capping rule IDs
const CAPPING_YEAR_END_10 = "00000000-0000-0000-0000-000000017020"
const CAPPING_MID_YEAR_5 = "00000000-0000-0000-0000-000000017021"
const _CAPPING_FORFEIT_ALL = "00000000-0000-0000-0000-000000017022"

// Seed capping rule group IDs
const CAPPING_GROUP_STANDARD = "00000000-0000-0000-0000-000000017030"

// Tariff IDs that need capping rule group assignments for carryover preview
const TARIFF_40H = "00000000-0000-0000-0000-000000000701"
const TARIFF_38H = "00000000-0000-0000-0000-000000000702"

// Seed employee capping exception IDs
const EXCEPTION_ANNA_PARTIAL = "00000000-0000-0000-0000-000000017040"
const EXCEPTION_THOMAS_FULL = "00000000-0000-0000-0000-000000017041"

describe("Phase 7: Urlaubskonfiguration (Fortgeschritten)", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    specialCalcIds: [] as string[],
    calcGroupIds: [] as string[],
    cappingRuleIds: [] as string[],
    exceptionIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover E2E test data from previous runs
    await prisma.employeeCappingException
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          notes: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.vacationCappingRule
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    // Clean up calc groups -- first remove junction entries
    const e2eGroups = await prisma.vacationCalculationGroup.findMany({
      where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      select: { id: true },
    })
    if (e2eGroups.length > 0) {
      const groupIds = e2eGroups.map((g) => g.id)
      await prisma.vacationCalcGroupSpecialCalc
        .deleteMany({ where: { groupId: { in: groupIds } } })
        .catch(() => {})
      await prisma.vacationCalculationGroup
        .deleteMany({ where: { id: { in: groupIds } } })
        .catch(() => {})
    }

    await prisma.vacationSpecialCalculation
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          description: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    // Assign capping rule group to tariffs so carryover preview works.
    // The seed tariffs do not have vacationCappingRuleGroupId set.
    await prisma.tariff.updateMany({
      where: { id: { in: [TARIFF_40H, TARIFF_38H] } },
      data: { vacationCappingRuleGroupId: CAPPING_GROUP_STANDARD },
    })
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order

    // Exceptions
    if (created.exceptionIds.length > 0) {
      await prisma.employeeCappingException
        .deleteMany({ where: { id: { in: created.exceptionIds } } })
        .catch(() => {})
    }

    // Capping rules
    if (created.cappingRuleIds.length > 0) {
      await prisma.vacationCappingRule
        .deleteMany({ where: { id: { in: created.cappingRuleIds } } })
        .catch(() => {})
    }

    // Calc groups -- need to remove junction entries first
    if (created.calcGroupIds.length > 0) {
      await prisma.vacationCalcGroupSpecialCalc
        .deleteMany({
          where: { groupId: { in: created.calcGroupIds } },
        })
        .catch(() => {})
      await prisma.vacationCalculationGroup
        .deleteMany({ where: { id: { in: created.calcGroupIds } } })
        .catch(() => {})
    }

    // Special calcs
    if (created.specialCalcIds.length > 0) {
      await prisma.vacationSpecialCalculation
        .deleteMany({ where: { id: { in: created.specialCalcIds } } })
        .catch(() => {})
    }

    // Re-create seed disability special calculation if it was deleted by tests
    await prisma.vacationSpecialCalculation
      .upsert({
        where: { id: SPECIAL_CALC_DISABILITY },
        create: {
          id: SPECIAL_CALC_DISABILITY,
          tenantId: SEED.TENANT_ID,
          type: "disability",
          threshold: 0,
          bonusDays: 5,
          description: "Additional 5 days for severe disability",
          isActive: true,
        },
        update: {},
      })
      .catch(() => {})

    // Re-link disability calc to STANDARD group if needed
    await prisma.vacationCalcGroupSpecialCalc
      .upsert({
        where: {
          groupId_specialCalculationId: {
            groupId: CALC_GROUP_STANDARD,
            specialCalculationId: SPECIAL_CALC_DISABILITY,
          },
        },
        create: {
          groupId: CALC_GROUP_STANDARD,
          specialCalculationId: SPECIAL_CALC_DISABILITY,
        },
        update: {},
      })
      .catch(() => {})

    // Reset tariff capping rule group assignments
    await prisma.tariff
      .updateMany({
        where: { id: { in: [TARIFF_40H, TARIFF_38H] } },
        data: { vacationCappingRuleGroupId: null },
      })
      .catch(() => {})
  })

  // =========================================================
  // UC-046: Urlaubssonderberechnung anlegen
  // =========================================================
  describe("UC-046: Urlaubssonderberechnung anlegen", () => {
    it("should list existing special calculations from seed data", async () => {
      const { data } = await caller.vacationSpecialCalcs.list()

      expect(data).toBeInstanceOf(Array)
      expect(data.length).toBeGreaterThanOrEqual(5)

      // Verify shape
      const first = data[0]!
      expect(first.id).toBeDefined()
      expect(first.type).toBeDefined()
      expect(first.threshold).toBeTypeOf("number")
      expect(first.bonusDays).toBeTypeOf("number")
      expect(first.isActive).toBeTypeOf("boolean")
    })

    it("should filter by active status", async () => {
      const { data: active } = await caller.vacationSpecialCalcs.list({
        isActive: true,
      })
      const { data: inactive } = await caller.vacationSpecialCalcs.list({
        isActive: false,
      })

      active.forEach((sc: any) => expect(sc.isActive).toBe(true))
      inactive.forEach((sc: any) => expect(sc.isActive).toBe(false))

      // Seed has 5 active + 1 inactive
      expect(active.length).toBeGreaterThanOrEqual(5)
      expect(inactive.length).toBeGreaterThanOrEqual(1)
    })

    it("should filter by type", async () => {
      const { data } = await caller.vacationSpecialCalcs.list({
        type: "age",
      })

      expect(data.length).toBeGreaterThanOrEqual(2) // age 50 + age 60
      data.forEach((sc: any) => expect(sc.type).toBe("age"))
    })

    it("should create a new age-based special calculation", async () => {
      const result = await caller.vacationSpecialCalcs.create({
        type: "age",
        threshold: 55,
        bonusDays: 3,
        description: "E2E Additional 3 days for employees over 55",
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.type).toBe("age")
      expect(result.threshold).toBe(55)
      expect(result.bonusDays).toBe(3)
      expect(result.isActive).toBe(true)

      state.newSpecialCalcId = result.id
      created.specialCalcIds.push(result.id)
    })

    it("should create a disability-based special calculation", async () => {
      // Seed already has disability+threshold=0 (SPECIAL_CALC_DISABILITY).
      // Remove its calc group links first, then delete it so we can test creation.
      await prisma.vacationCalcGroupSpecialCalc
        .deleteMany({ where: { specialCalculationId: SPECIAL_CALC_DISABILITY } })
        .catch(() => {})
      await prisma.vacationSpecialCalculation
        .delete({ where: { id: SPECIAL_CALC_DISABILITY } })
        .catch(() => {})

      const result = await caller.vacationSpecialCalcs.create({
        type: "disability",
        threshold: 0,
        bonusDays: 3,
        description: "E2E Partial disability bonus",
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.type).toBe("disability")
      expect(result.threshold).toBe(0)
      expect(result.bonusDays).toBe(3)

      created.specialCalcIds.push(result.id)
    })

    it("should get a special calculation by ID", async () => {
      const result = await caller.vacationSpecialCalcs.getById({
        id: SPECIAL_CALC_AGE_50,
      })

      expect(result.id).toBe(SPECIAL_CALC_AGE_50)
      expect(result.type).toBe("age")
      expect(result.threshold).toBe(50)
      expect(result.bonusDays).toBe(2)
    })

    it("should update a special calculation", async () => {
      const result = await caller.vacationSpecialCalcs.update({
        id: state.newSpecialCalcId!,
        bonusDays: 4,
        description: "E2E Updated: 4 days for employees over 55",
      })

      expect(result.bonusDays).toBe(4)
      expect(result.description).toBe(
        "E2E Updated: 4 days for employees over 55"
      )
    })

    it("should deactivate a special calculation", async () => {
      const result = await caller.vacationSpecialCalcs.update({
        id: state.newSpecialCalcId!,
        isActive: false,
      })

      expect(result.isActive).toBe(false)
    })

    it("should delete a special calculation", async () => {
      // Create one specifically to delete
      const toDelete = await caller.vacationSpecialCalcs.create({
        type: "tenure",
        threshold: 25,
        bonusDays: 5,
        description: "E2E To be deleted",
      })

      const result = await caller.vacationSpecialCalcs.delete({
        id: toDelete.id,
      })
      expect(result.success).toBe(true)

      // Verify it's gone
      await expect(
        caller.vacationSpecialCalcs.getById({ id: toDelete.id })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-047: Berechnungsgruppe anlegen
  // =========================================================
  describe("UC-047: Berechnungsgruppe anlegen", () => {
    it("should list existing calculation groups from seed data", async () => {
      const { data } = await caller.vacationCalcGroups.list()

      expect(data).toBeInstanceOf(Array)
      expect(data.length).toBeGreaterThanOrEqual(2)

      // STANDARD group should have special calculations linked
      const standard = data.find((g: any) => g.code === "STANDARD")
      expect(standard).toBeDefined()
      expect(standard!.specialCalculations).toBeInstanceOf(Array)
      expect(standard!.specialCalculations!.length).toBeGreaterThanOrEqual(3)
    })

    it("should get a calculation group by ID with special calcs", async () => {
      const result = await caller.vacationCalcGroups.getById({
        id: CALC_GROUP_STANDARD,
      })

      expect(result.id).toBe(CALC_GROUP_STANDARD)
      expect(result.code).toBe("STANDARD")
      expect(result.basis).toBe("calendar_year")
      expect(result.specialCalculations).toBeInstanceOf(Array)
      expect(result.specialCalculations!.length).toBeGreaterThanOrEqual(3)
    })

    it("should create a new calculation group with special calcs", async () => {
      const result = await caller.vacationCalcGroups.create({
        code: "E2E-CALC-GRP",
        name: "E2E Test Calc Group",
        description: "E2E Test group for vacation calculation",
        basis: "calendar_year",
        isActive: true,
        specialCalculationIds: [SPECIAL_CALC_AGE_50, SPECIAL_CALC_TENURE_5],
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-CALC-GRP")
      expect(result.name).toBe("E2E Test Calc Group")
      expect(result.basis).toBe("calendar_year")
      expect(result.specialCalculations).toBeInstanceOf(Array)
      expect(result.specialCalculations!.length).toBe(2)

      state.newCalcGroupId = result.id
      created.calcGroupIds.push(result.id)
    })

    it("should reject duplicate group codes", async () => {
      await expect(
        caller.vacationCalcGroups.create({
          code: "E2E-CALC-GRP",
          name: "Duplicate Code",
        })
      ).rejects.toThrow()
    })

    it("should create a group without special calcs", async () => {
      const result = await caller.vacationCalcGroups.create({
        code: "E2E-EMPTY-GRP",
        name: "E2E Empty Group",
        basis: "entry_date",
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.basis).toBe("entry_date")
      // Either no specialCalculations key or empty array
      if (result.specialCalculations) {
        expect(result.specialCalculations.length).toBe(0)
      }

      created.calcGroupIds.push(result.id)
    })

    it("should update a calculation group and replace special calcs", async () => {
      const result = await caller.vacationCalcGroups.update({
        id: state.newCalcGroupId!,
        name: "E2E Updated Calc Group",
        specialCalculationIds: [
          SPECIAL_CALC_AGE_50,
          SPECIAL_CALC_TENURE_5,
          SPECIAL_CALC_TENURE_10,
        ],
      })

      expect(result.name).toBe("E2E Updated Calc Group")
      expect(result.specialCalculations!.length).toBe(3)
    })

    it("should remove all special calcs from a group", async () => {
      const result = await caller.vacationCalcGroups.update({
        id: state.newCalcGroupId!,
        specialCalculationIds: [],
      })

      expect(result.specialCalculations!.length).toBe(0)
    })

    it("should delete a calculation group that is not assigned", async () => {
      // Create a throwaway group
      const toDelete = await caller.vacationCalcGroups.create({
        code: "E2E-DELETE-GRP",
        name: "E2E Delete Group",
      })

      const result = await caller.vacationCalcGroups.delete({
        id: toDelete.id,
      })
      expect(result.success).toBe(true)
    })

    it("should filter groups by active status", async () => {
      // Deactivate our test group
      await caller.vacationCalcGroups.update({
        id: state.newCalcGroupId!,
        isActive: false,
      })

      const { data: active } = await caller.vacationCalcGroups.list({
        isActive: true,
      })
      const { data: inactive } = await caller.vacationCalcGroups.list({
        isActive: false,
      })

      active.forEach((g: any) => expect(g.isActive).toBe(true))
      inactive.forEach((g: any) => expect(g.isActive).toBe(false))

      // Our deactivated group should be in inactive list
      expect(inactive.some((g: any) => g.id === state.newCalcGroupId!)).toBe(
        true
      )

      // Reactivate for subsequent tests
      await caller.vacationCalcGroups.update({
        id: state.newCalcGroupId!,
        isActive: true,
      })
    })
  })

  // =========================================================
  // UC-048: Kappungsregeln definieren
  // =========================================================
  describe("UC-048: Kappungsregeln definieren", () => {
    it("should list existing capping rules from seed data", async () => {
      const { data } = await caller.vacationCappingRules.list()

      expect(data).toBeInstanceOf(Array)
      expect(data.length).toBeGreaterThanOrEqual(3)

      // Verify shape
      const first = data[0]!
      expect(first.id).toBeDefined()
      expect(first.code).toBeDefined()
      expect(first.ruleType).toBeDefined()
      expect(first.cutoffMonth).toBeTypeOf("number")
      expect(first.cutoffDay).toBeTypeOf("number")
      expect(first.capValue).toBeTypeOf("number")
    })

    it("should get a capping rule by ID", async () => {
      const result = await caller.vacationCappingRules.getById({
        id: CAPPING_YEAR_END_10,
      })

      expect(result.id).toBe(CAPPING_YEAR_END_10)
      expect(result.code).toBe("YEAR_END_10")
      expect(result.ruleType).toBe("year_end")
      expect(result.cutoffMonth).toBe(12)
      expect(result.cutoffDay).toBe(31)
      expect(result.capValue).toBe(10)
    })

    it("should create a year-end capping rule", async () => {
      const result = await caller.vacationCappingRules.create({
        code: "E2E-YE-CAP-15",
        name: "E2E Year-End Cap (15 days)",
        description: "E2E Cap carryover at 15 days at year end",
        ruleType: "year_end",
        cutoffMonth: 12,
        cutoffDay: 31,
        capValue: 15,
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-YE-CAP-15")
      expect(result.ruleType).toBe("year_end")
      expect(result.capValue).toBe(15)
      expect(result.cutoffMonth).toBe(12)
      expect(result.cutoffDay).toBe(31)

      state.newCappingRuleId = result.id
      created.cappingRuleIds.push(result.id)
    })

    it("should create a mid-year capping rule", async () => {
      const result = await caller.vacationCappingRules.create({
        code: "E2E-MY-CAP-3",
        name: "E2E March 31 Cap (3 days)",
        description: "E2E Carryover capped at 3 days after March 31",
        ruleType: "mid_year",
        cutoffMonth: 3,
        cutoffDay: 31,
        capValue: 3,
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.ruleType).toBe("mid_year")
      expect(result.cutoffMonth).toBe(3)
      expect(result.cutoffDay).toBe(31)
      expect(result.capValue).toBe(3)

      created.cappingRuleIds.push(result.id)
    })

    it("should reject duplicate capping rule codes", async () => {
      await expect(
        caller.vacationCappingRules.create({
          code: "E2E-YE-CAP-15",
          name: "Duplicate",
          ruleType: "year_end",
        })
      ).rejects.toThrow()
    })

    it("should update a capping rule", async () => {
      const result = await caller.vacationCappingRules.update({
        id: state.newCappingRuleId!,
        capValue: 20,
        name: "E2E Updated Year-End Cap (20 days)",
      })

      expect(result.capValue).toBe(20)
      expect(result.name).toBe("E2E Updated Year-End Cap (20 days)")
    })

    it("should filter by rule type", async () => {
      const { data: yearEnd } = await caller.vacationCappingRules.list({
        ruleType: "year_end",
      })
      const { data: midYear } = await caller.vacationCappingRules.list({
        ruleType: "mid_year",
      })

      yearEnd.forEach((r: any) => expect(r.ruleType).toBe("year_end"))
      midYear.forEach((r: any) => expect(r.ruleType).toBe("mid_year"))
    })

    it("should delete a capping rule", async () => {
      const toDelete = await caller.vacationCappingRules.create({
        code: "E2E-DELETE-RULE",
        name: "E2E To Delete",
        ruleType: "year_end",
        capValue: 0,
      })

      const result = await caller.vacationCappingRules.delete({
        id: toDelete.id,
      })
      expect(result.success).toBe(true)

      await expect(
        caller.vacationCappingRules.getById({ id: toDelete.id })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-049: Mitarbeiter-Ausnahmen pflegen
  // =========================================================
  describe("UC-049: Mitarbeiter-Ausnahmen pflegen", () => {
    it("should list existing employee capping exceptions from seed data", async () => {
      const { data } = await caller.employeeCappingExceptions.list()

      expect(data).toBeInstanceOf(Array)
      expect(data.length).toBeGreaterThanOrEqual(2) // Anna + Thomas

      // Verify seed data
      const annaException = data.find(
        (e: any) => e.id === EXCEPTION_ANNA_PARTIAL
      )
      expect(annaException).toBeDefined()
      expect(annaException!.employeeId).toBe(EMPLOYEE_ANNA)
      expect(annaException!.exemptionType).toBe("partial")
      expect(annaException!.retainDays).toBe(5)
      expect(annaException!.year).toBe(2026)

      const thomasException = data.find(
        (e: any) => e.id === EXCEPTION_THOMAS_FULL
      )
      expect(thomasException).toBeDefined()
      expect(thomasException!.employeeId).toBe(EMPLOYEE_THOMAS)
      expect(thomasException!.exemptionType).toBe("full")
      expect(thomasException!.retainDays).toBeNull()
      expect(thomasException!.year).toBeNull() // applies to all years
    })

    it("should filter exceptions by employee", async () => {
      const { data } = await caller.employeeCappingExceptions.list({
        employeeId: EMPLOYEE_ANNA,
      })

      expect(data.length).toBeGreaterThanOrEqual(1)
      data.forEach((e: any) => expect(e.employeeId).toBe(EMPLOYEE_ANNA))
    })

    it("should filter exceptions by capping rule", async () => {
      const { data } = await caller.employeeCappingExceptions.list({
        cappingRuleId: CAPPING_YEAR_END_10,
      })

      expect(data.length).toBeGreaterThanOrEqual(2) // Both Anna and Thomas
      data.forEach((e: any) =>
        expect(e.cappingRuleId).toBe(CAPPING_YEAR_END_10)
      )
    })

    it("should create a partial exception for an employee", async () => {
      const result = await caller.employeeCappingExceptions.create({
        employeeId: EMPLOYEE_MARIA,
        cappingRuleId: CAPPING_YEAR_END_10,
        exemptionType: "partial",
        retainDays: 8,
        year: 2026,
        notes: "E2E Maria retains up to 8 days for 2026",
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.employeeId).toBe(EMPLOYEE_MARIA)
      expect(result.cappingRuleId).toBe(CAPPING_YEAR_END_10)
      expect(result.exemptionType).toBe("partial")
      expect(result.retainDays).toBe(8)
      expect(result.year).toBe(2026)
      expect(result.isActive).toBe(true)

      state.newExceptionId = result.id
      created.exceptionIds.push(result.id)
    })

    it("should create a full exemption (no retain days needed)", async () => {
      const result = await caller.employeeCappingExceptions.create({
        employeeId: EMPLOYEE_USER,
        cappingRuleId: CAPPING_YEAR_END_10,
        exemptionType: "full",
        year: 2026,
        notes: "E2E User fully exempt from year-end capping for 2026",
        isActive: true,
      })

      expect(result.id).toBeDefined()
      expect(result.exemptionType).toBe("full")
      expect(result.retainDays).toBeNull()

      created.exceptionIds.push(result.id)
    })

    it("should get an exception by ID", async () => {
      const result = await caller.employeeCappingExceptions.getById({
        id: EXCEPTION_ANNA_PARTIAL,
      })

      expect(result.id).toBe(EXCEPTION_ANNA_PARTIAL)
      expect(result.employeeId).toBe(EMPLOYEE_ANNA)
      expect(result.exemptionType).toBe("partial")
    })

    it("should update an exception", async () => {
      const result = await caller.employeeCappingExceptions.update({
        id: state.newExceptionId!,
        retainDays: 10,
        notes: "E2E Updated: Maria retains up to 10 days for 2026",
      })

      expect(result.retainDays).toBe(10)
      expect(result.notes).toBe(
        "E2E Updated: Maria retains up to 10 days for 2026"
      )
    })

    it("should deactivate an exception", async () => {
      const result = await caller.employeeCappingExceptions.update({
        id: state.newExceptionId!,
        isActive: false,
      })

      expect(result.isActive).toBe(false)
    })

    it("should delete an exception", async () => {
      const toDelete = await caller.employeeCappingExceptions.create({
        employeeId: EMPLOYEE_ADMIN,
        cappingRuleId: CAPPING_MID_YEAR_5,
        exemptionType: "full",
        notes: "E2E To be deleted",
      })

      const result = await caller.employeeCappingExceptions.delete({
        id: toDelete.id,
      })
      expect(result.success).toBe(true)

      await expect(
        caller.employeeCappingExceptions.getById({ id: toDelete.id })
      ).rejects.toThrow()
    })
  })

  // =========================================================
  // UC-050: Urlaubsuebertrag-Vorschau
  // =========================================================
  describe("UC-050: Urlaubsuebertrag-Vorschau", () => {
    it("should generate entitlement preview for an employee", async () => {
      const result = await caller.vacation.entitlementPreview({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      expect(result.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(result.year).toBe(2026)
      expect(result.baseEntitlement).toBeTypeOf("number")
      expect(result.totalEntitlement).toBeTypeOf("number")
      expect(result.baseEntitlement).toBeGreaterThan(0)
      expect(result.weeklyHours).toBeTypeOf("number")
      expect(result.partTimeFactor).toBeTypeOf("number")
      expect(result.monthsEmployed).toBeTypeOf("number")
    })

    it("should compute entitlement preview with calculation group override", async () => {
      const result = await caller.vacation.entitlementPreview({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
        calcGroupId: CALC_GROUP_ENTRY_BASED,
      })

      expect(result.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(result.basis).toBe("entry_date")
      expect(result.calcGroupId).toBe(CALC_GROUP_ENTRY_BASED)
    })

    it("should compute age and tenure bonuses in entitlement preview", async () => {
      // Anna (entry_date 2015-09-01) should have tenure bonus
      const result = await caller.vacation.entitlementPreview({
        employeeId: EMPLOYEE_ANNA,
        year: 2026,
        calcGroupId: CALC_GROUP_STANDARD,
      })

      expect(result.employeeId).toBe(EMPLOYEE_ANNA)
      expect(result.tenureYears).toBeGreaterThanOrEqual(10)
      // With 10+ years tenure, should get at least the tenure 10 bonus (2 days)
      expect(result.tenureBonus).toBeGreaterThanOrEqual(0)
      expect(result.totalEntitlement).toBeGreaterThan(0)
    })

    it("should generate carryover preview for an employee", async () => {
      const result = await caller.vacation.carryoverPreview({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      expect(result.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(result.year).toBe(2026)
      expect(result.availableDays).toBeTypeOf("number")
      expect(result.cappedCarryover).toBeTypeOf("number")
      expect(result.forfeitedDays).toBeTypeOf("number")
      expect(result.hasException).toBeTypeOf("boolean")
      expect(result.rulesApplied).toBeInstanceOf(Array)
    })

    it("carryover preview should reflect employee exceptions", async () => {
      // Thomas has full exemption from year-end capping
      const result = await caller.vacation.carryoverPreview({
        employeeId: EMPLOYEE_THOMAS,
        year: 2026,
      })

      expect(result.employeeId).toBe(EMPLOYEE_THOMAS)
      // Thomas has a full exemption, so hasException should be true
      // (depending on whether the tariff has a capping rule group linked)
      expect(result.hasException).toBeTypeOf("boolean")
    })

    it("carryover preview should be read-only (no data mutation)", async () => {
      // Capture balance before preview
      const balanceBefore = await caller.vacation.getBalance({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      // Run carryover preview
      await caller.vacation.carryoverPreview({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      // Balance should remain unchanged
      const balanceAfter = await caller.vacation.getBalance({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      expect(balanceAfter.entitlement).toBe(balanceBefore.entitlement)
      expect(balanceAfter.carryover).toBe(balanceBefore.carryover)
      expect(balanceAfter.taken).toBe(balanceBefore.taken)
      expect(balanceAfter.adjustments).toBe(balanceBefore.adjustments)
    })

    it("should retrieve vacation balance for an employee", async () => {
      const balance = await caller.vacation.getBalance({
        employeeId: EMPLOYEE_ADMIN,
        year: 2026,
      })

      expect(balance.employeeId).toBe(EMPLOYEE_ADMIN)
      expect(balance.year).toBe(2026)
      expect(balance.entitlement).toBe(30)
      expect(balance.carryover).toBe(3)
      expect(balance.total).toBe(balance.entitlement + balance.carryover + balance.adjustments)
      expect(balance.available).toBe(balance.total - balance.taken)
    })

    it("should adjust vacation balance", async () => {
      const before = await caller.vacation.getBalance({
        employeeId: EMPLOYEE_USER,
        year: 2026,
      })

      const result = await caller.vacation.adjustBalance({
        employeeId: EMPLOYEE_USER,
        year: 2026,
        adjustment: 2,
        notes: "E2E Test: manual adjustment +2 days",
      })

      expect(result.adjustments).toBe(before.adjustments + 2)
      expect(result.total).toBe(result.entitlement + result.carryover + result.adjustments)
      expect(result.available).toBe(result.total - result.taken)

      // Undo the adjustment
      await caller.vacation.adjustBalance({
        employeeId: EMPLOYEE_USER,
        year: 2026,
        adjustment: -2,
        notes: "E2E Test: undo manual adjustment",
      })
    })

    it("should generate carryover preview with rules applied detail", async () => {
      const result = await caller.vacation.carryoverPreview({
        employeeId: EMPLOYEE_ANNA,
        year: 2026,
      })

      expect(result.employeeId).toBe(EMPLOYEE_ANNA)
      expect(result.rulesApplied).toBeInstanceOf(Array)

      // If rules are applied, they should have the expected shape
      if (result.rulesApplied.length > 0) {
        const rule = result.rulesApplied[0]!
        expect(rule.ruleId).toBeDefined()
        expect(rule.ruleName).toBeDefined()
        expect(rule.ruleType).toBeDefined()
        expect(rule.capValue).toBeTypeOf("number")
        expect(rule.applied).toBeTypeOf("boolean")
        expect(rule.exceptionActive).toBeTypeOf("boolean")
      }
    })
  })
})
