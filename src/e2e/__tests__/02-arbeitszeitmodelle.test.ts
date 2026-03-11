/**
 * Phase 2: Arbeitszeitmodelle (Working Time Models)
 *
 * Tests UC-012 through UC-016 against the real database.
 * Requires local Supabase running with seed data.
 *
 * Covers:
 *   UC-012: Tagesplan erstellen (Day Plan)
 *   UC-013: Wochenplan erstellen (Week Plan)
 *   UC-014: Tarif erstellen (Tariff)
 *   UC-015: Konten anlegen (Accounts)
 *   UC-016: Berechnungsregeln pruefen (Calculation Rules)
 *
 * @see docs/use-cases/02-arbeitszeitmodelle.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

describe("Phase 2: Arbeitszeitmodelle", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    dayPlanIds: [] as string[],
    dayPlanBreakIds: [] as string[],
    weekPlanIds: [] as string[],
    tariffIds: [] as string[],
    tariffBreakIds: [] as string[],
    accountIds: [] as string[],
    calculationRuleIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs (reverse dependency order)
    await prisma.tariffBreak
      .deleteMany({
        where: {
          tariff: {
            tenantId: SEED.TENANT_ID,
            code: { startsWith: "E2E" },
          },
        },
      })
      .catch(() => {})
    await prisma.tariff
      .deleteMany({
        where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      })
      .catch(() => {})
    await prisma.weekPlan
      .deleteMany({
        where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      })
      .catch(() => {})
    await prisma.dayPlanBreak
      .deleteMany({
        where: {
          dayPlan: {
            tenantId: SEED.TENANT_ID,
            code: { startsWith: "E2E" },
          },
        },
      })
      .catch(() => {})
    await prisma.dayPlan
      .deleteMany({
        where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      })
      .catch(() => {})
    await prisma.account
      .deleteMany({
        where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      })
      .catch(() => {})
    await prisma.calculationRule
      .deleteMany({
        where: { tenantId: SEED.TENANT_ID, code: { startsWith: "E2E" } },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Cleanup in reverse dependency order
    // Tariff breaks cascade via tariff FK, but clean explicitly just in case
    if (created.tariffBreakIds.length > 0) {
      await prisma.tariffBreak
        .deleteMany({ where: { id: { in: created.tariffBreakIds } } })
        .catch(() => {})
    }

    if (created.tariffIds.length > 0) {
      await prisma.tariff
        .deleteMany({ where: { id: { in: created.tariffIds } } })
        .catch(() => {})
    }

    if (created.weekPlanIds.length > 0) {
      await prisma.weekPlan
        .deleteMany({ where: { id: { in: created.weekPlanIds } } })
        .catch(() => {})
    }

    // Day plan breaks cascade via dayPlan FK, but clean explicitly
    if (created.dayPlanBreakIds.length > 0) {
      await prisma.dayPlanBreak
        .deleteMany({ where: { id: { in: created.dayPlanBreakIds } } })
        .catch(() => {})
    }

    if (created.dayPlanIds.length > 0) {
      await prisma.dayPlan
        .deleteMany({ where: { id: { in: created.dayPlanIds } } })
        .catch(() => {})
    }

    if (created.accountIds.length > 0) {
      await prisma.account
        .deleteMany({ where: { id: { in: created.accountIds } } })
        .catch(() => {})
    }

    if (created.calculationRuleIds.length > 0) {
      await prisma.calculationRule
        .deleteMany({ where: { id: { in: created.calculationRuleIds } } })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-012: Tagesplan erstellen (Day Plan)
  // =========================================================
  describe("UC-012: Tagesplan erstellen", () => {
    it("should create a fixed day plan with 8h target", async () => {
      const result = await caller.dayPlans.create({
        code: "E2E-NORM8",
        name: "E2E Normalarbeitstag 8h",
        planType: "fixed",
        comeFrom: 420, // 07:00
        comeTo: 540, // 09:00
        goFrom: 960, // 16:00
        goTo: 1080, // 18:00
        regularHours: 480, // 8h in minutes
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-NORM8")
      expect(result.name).toBe("E2E Normalarbeitstag 8h")
      expect(result.planType).toBe("fixed")
      expect(result.comeFrom).toBe(420)
      expect(result.comeTo).toBe(540)
      expect(result.goFrom).toBe(960)
      expect(result.goTo).toBe(1080)
      expect(result.regularHours).toBe(480)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.isActive).toBe(true)
      state.dayPlanId = result.id
      created.dayPlanIds.push(result.id)
    })

    it("should create a flextime day plan", async () => {
      const result = await caller.dayPlans.create({
        code: "E2E-FLEX",
        name: "E2E Gleitzeitplan",
        planType: "flextime",
        comeFrom: 360, // 06:00
        comeTo: 600, // 10:00
        goFrom: 900, // 15:00
        goTo: 1200, // 20:00
        regularHours: 480,
      })

      expect(result.id).toBeDefined()
      expect(result.planType).toBe("flextime")
      state.flextimeDayPlanId = result.id
      created.dayPlanIds.push(result.id)
    })

    it("should reject a free day plan with 0h (regularHours must be positive)", async () => {
      await expect(
        caller.dayPlans.create({
          code: "E2E-FREE",
          name: "E2E Freier Tag",
          planType: "fixed",
          regularHours: 0,
        })
      ).rejects.toThrow("Regular hours must be positive")
    })

    it("should create a minimal day plan for free days (1 min)", async () => {
      const result = await caller.dayPlans.create({
        code: "E2E-FREE",
        name: "E2E Freier Tag",
        planType: "fixed",
        regularHours: 1,
      })

      expect(result.id).toBeDefined()
      expect(result.regularHours).toBe(1)
      state.freeDayPlanId = result.id
      created.dayPlanIds.push(result.id)
    })

    it("should reject duplicate day plan codes within tenant", async () => {
      await expect(
        caller.dayPlans.create({
          code: "E2E-NORM8",
          name: "E2E Duplicate Code",
          regularHours: 480,
        })
      ).rejects.toThrow()
    })

    it("should list day plans including the new ones", async () => {
      const { data } = await caller.dayPlans.list()
      const e2ePlans = data.filter((p: any) => p.code.startsWith("E2E"))
      expect(e2ePlans.length).toBeGreaterThanOrEqual(3)

      const codes = e2ePlans.map((p: any) => p.code)
      expect(codes).toContain("E2E-NORM8")
      expect(codes).toContain("E2E-FLEX")
      expect(codes).toContain("E2E-FREE")
    })

    it("should get a day plan by ID with details", async () => {
      const result = await caller.dayPlans.getById({ id: state.dayPlanId })

      expect(result.id).toBe(state.dayPlanId)
      expect(result.code).toBe("E2E-NORM8")
      expect(result.tenantId).toBe(SEED.TENANT_ID)
    })

    it("should add a break rule to a day plan", async () => {
      const brk = await caller.dayPlans.createBreak({
        dayPlanId: state.dayPlanId,
        breakType: "fixed",
        startTime: 720, // 12:00
        endTime: 750, // 12:30
        duration: 30,
        autoDeduct: true,
      })

      expect(brk.id).toBeDefined()
      expect(brk.dayPlanId).toBe(state.dayPlanId)
      expect(brk.breakType).toBe("fixed")
      expect(brk.duration).toBe(30)
      expect(brk.autoDeduct).toBe(true)
      state.dayPlanBreakId = brk.id
      created.dayPlanBreakIds.push(brk.id)
    })

    it("should include breaks when fetching day plan by ID", async () => {
      const result = await caller.dayPlans.getById({ id: state.dayPlanId })

      expect(result.breaks).toBeDefined()
      expect(result.breaks!.length).toBeGreaterThanOrEqual(1)
      const brk = result.breaks!.find(
        (b: any) => b.id === state.dayPlanBreakId
      )
      expect(brk).toBeDefined()
      expect(brk!.duration).toBe(30)
    })

    it("should delete a break from a day plan", async () => {
      const result = await caller.dayPlans.deleteBreak({
        dayPlanId: state.dayPlanId,
        breakId: state.dayPlanBreakId,
      })

      expect(result.success).toBe(true)
      // Remove from cleanup tracker since already deleted
      created.dayPlanBreakIds = created.dayPlanBreakIds.filter(
        (id) => id !== state.dayPlanBreakId
      )
    })

    it("should copy a day plan as an independent copy", async () => {
      const copy = await caller.dayPlans.copy({
        id: state.dayPlanId,
        newCode: "E2E-NORM8-COPY",
        newName: "E2E Normalarbeitstag 8h (Kopie)",
      })

      expect(copy.id).toBeDefined()
      expect(copy.id).not.toBe(state.dayPlanId)
      expect(copy.code).toBe("E2E-NORM8-COPY")
      expect(copy.name).toBe("E2E Normalarbeitstag 8h (Kopie)")
      expect(copy.regularHours).toBe(480)
      expect(copy.planType).toBe("fixed")
      created.dayPlanIds.push(copy.id)
    })

    it("should update a day plan", async () => {
      const updated = await caller.dayPlans.update({
        id: state.dayPlanId,
        name: "E2E Normalarbeitstag 8h (updated)",
        regularHours: 450, // 7.5h
      })

      expect(updated.name).toBe("E2E Normalarbeitstag 8h (updated)")
      expect(updated.regularHours).toBe(450)

      // Revert for downstream tests
      await caller.dayPlans.update({
        id: state.dayPlanId,
        name: "E2E Normalarbeitstag 8h",
        regularHours: 480,
      })
    })
  })

  // =========================================================
  // UC-013: Wochenplan erstellen (Week Plan)
  // =========================================================
  describe("UC-013: Wochenplan erstellen", () => {
    it("should create a 40h week plan (Mo-Fr work, Sa-So free)", async () => {
      const result = await caller.weekPlans.create({
        code: "E2E-40H",
        name: "E2E Standard 40h-Woche",
        mondayDayPlanId: state.dayPlanId,
        tuesdayDayPlanId: state.dayPlanId,
        wednesdayDayPlanId: state.dayPlanId,
        thursdayDayPlanId: state.dayPlanId,
        fridayDayPlanId: state.dayPlanId,
        saturdayDayPlanId: state.freeDayPlanId,
        sundayDayPlanId: state.freeDayPlanId,
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-40H")
      expect(result.name).toBe("E2E Standard 40h-Woche")
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.isActive).toBe(true)
      // Verify all 7 days are configured
      expect(result.mondayDayPlanId).toBe(state.dayPlanId)
      expect(result.tuesdayDayPlanId).toBe(state.dayPlanId)
      expect(result.wednesdayDayPlanId).toBe(state.dayPlanId)
      expect(result.thursdayDayPlanId).toBe(state.dayPlanId)
      expect(result.fridayDayPlanId).toBe(state.dayPlanId)
      expect(result.saturdayDayPlanId).toBe(state.freeDayPlanId)
      expect(result.sundayDayPlanId).toBe(state.freeDayPlanId)
      state.weekPlanId = result.id
      created.weekPlanIds.push(result.id)
    })

    it("should include day plan summaries in week plan", async () => {
      const result = await caller.weekPlans.getById({ id: state.weekPlanId })

      expect(result.mondayDayPlan).toBeDefined()
      expect(result.mondayDayPlan!.code).toBe("E2E-NORM8")
      expect(result.saturdayDayPlan).toBeDefined()
      expect(result.saturdayDayPlan!.code).toBe("E2E-FREE")
    })

    it("should reject duplicate week plan codes", async () => {
      await expect(
        caller.weekPlans.create({
          code: "E2E-40H",
          name: "E2E Duplicate Week Plan",
          mondayDayPlanId: state.dayPlanId,
          tuesdayDayPlanId: state.dayPlanId,
          wednesdayDayPlanId: state.dayPlanId,
          thursdayDayPlanId: state.dayPlanId,
          fridayDayPlanId: state.dayPlanId,
          saturdayDayPlanId: state.freeDayPlanId,
          sundayDayPlanId: state.freeDayPlanId,
        })
      ).rejects.toThrow()
    })

    it("should reject invalid day plan references", async () => {
      await expect(
        caller.weekPlans.create({
          code: "E2E-INVALID",
          name: "E2E Invalid Refs",
          mondayDayPlanId: "00000000-0000-0000-0000-000000000000",
          tuesdayDayPlanId: state.dayPlanId,
          wednesdayDayPlanId: state.dayPlanId,
          thursdayDayPlanId: state.dayPlanId,
          fridayDayPlanId: state.dayPlanId,
          saturdayDayPlanId: state.freeDayPlanId,
          sundayDayPlanId: state.freeDayPlanId,
        })
      ).rejects.toThrow()
    })

    it("should list week plans including the new one", async () => {
      const { data } = await caller.weekPlans.list()
      const e2ePlans = data.filter((p: any) => p.code.startsWith("E2E"))
      expect(e2ePlans.length).toBeGreaterThanOrEqual(1)
      expect(e2ePlans.some((p: any) => p.code === "E2E-40H")).toBe(true)
    })

    it("should update a week plan", async () => {
      const updated = await caller.weekPlans.update({
        id: state.weekPlanId,
        description: "E2E Standard work week",
      })

      expect(updated.description).toBe("E2E Standard work week")
    })

    it("should create a flextime week plan", async () => {
      const result = await caller.weekPlans.create({
        code: "E2E-FLEX-W",
        name: "E2E Gleitzeitwoche",
        mondayDayPlanId: state.flextimeDayPlanId,
        tuesdayDayPlanId: state.flextimeDayPlanId,
        wednesdayDayPlanId: state.flextimeDayPlanId,
        thursdayDayPlanId: state.flextimeDayPlanId,
        fridayDayPlanId: state.flextimeDayPlanId,
        saturdayDayPlanId: state.freeDayPlanId,
        sundayDayPlanId: state.freeDayPlanId,
      })

      expect(result.id).toBeDefined()
      state.flextimeWeekPlanId = result.id
      created.weekPlanIds.push(result.id)
    })
  })

  // =========================================================
  // UC-014: Tarif erstellen (Tariff)
  // =========================================================
  describe("UC-014: Tarif erstellen", () => {
    it("should create a full-time tariff with week plan and vacation days", async () => {
      const result = await caller.tariffs.create({
        code: "E2E-VZ40",
        name: "E2E Vollzeit 40h",
        weekPlanId: state.weekPlanId,
        annualVacationDays: 30,
        workDaysPerWeek: 5,
        dailyTargetHours: 8,
        weeklyTargetHours: 40,
        vacationBasis: "calendar_year",
        maxFlextimePerMonth: 20,
        upperLimitAnnual: 40,
        lowerLimitAnnual: -20,
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-VZ40")
      expect(result.name).toBe("E2E Vollzeit 40h")
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      expect(result.isActive).toBe(true)
      expect(result.weekPlanId).toBe(state.weekPlanId)
      expect(result.annualVacationDays).toBe(30)
      expect(result.workDaysPerWeek).toBe(5)
      expect(result.dailyTargetHours).toBe(8)
      expect(result.weeklyTargetHours).toBe(40)
      expect(result.maxFlextimePerMonth).toBe(20)
      expect(result.upperLimitAnnual).toBe(40)
      expect(result.lowerLimitAnnual).toBe(-20)
      state.tariffId = result.id
      created.tariffIds.push(result.id)
    })

    it("should reject duplicate tariff codes", async () => {
      await expect(
        caller.tariffs.create({
          code: "E2E-VZ40",
          name: "E2E Duplicate Tariff",
        })
      ).rejects.toThrow()
    })

    it("should get tariff by ID with relations", async () => {
      const result = await caller.tariffs.getById({ id: state.tariffId })

      expect(result.id).toBe(state.tariffId)
      expect(result.weekPlan).toBeDefined()
      expect(result.weekPlan!.code).toBe("E2E-40H")
    })

    it("should add a break to a tariff", async () => {
      const brk = await caller.tariffs.createBreak({
        tariffId: state.tariffId,
        breakType: "variable",
        afterWorkMinutes: 360, // 6h
        duration: 30,
        isPaid: false,
      })

      expect(brk.id).toBeDefined()
      expect(brk.tariffId).toBe(state.tariffId)
      expect(brk.breakType).toBe("variable")
      expect(brk.duration).toBe(30)
      expect(brk.isPaid).toBe(false)
      state.tariffBreakId = brk.id
      created.tariffBreakIds.push(brk.id)
    })

    it("should include breaks when fetching tariff by ID", async () => {
      const result = await caller.tariffs.getById({ id: state.tariffId })

      expect(result.breaks).toBeDefined()
      expect(result.breaks!.length).toBeGreaterThanOrEqual(1)
      const brk = result.breaks!.find(
        (b: any) => b.id === state.tariffBreakId
      )
      expect(brk).toBeDefined()
      expect(brk!.duration).toBe(30)
    })

    it("should delete a tariff break", async () => {
      const result = await caller.tariffs.deleteBreak({
        tariffId: state.tariffId,
        breakId: state.tariffBreakId,
      })

      expect(result.success).toBe(true)
      created.tariffBreakIds = created.tariffBreakIds.filter(
        (id) => id !== state.tariffBreakId
      )
    })

    it("should list tariffs including the new one", async () => {
      const { data } = await caller.tariffs.list()
      const e2eTariffs = data.filter((t: any) => t.code.startsWith("E2E"))
      expect(e2eTariffs.length).toBeGreaterThanOrEqual(1)
      expect(e2eTariffs.some((t: any) => t.code === "E2E-VZ40")).toBe(true)
    })

    it("should update a tariff (name, vacation days)", async () => {
      const updated = await caller.tariffs.update({
        id: state.tariffId,
        name: "E2E Vollzeit 40h (updated)",
        annualVacationDays: 28,
      })

      expect(updated.name).toBe("E2E Vollzeit 40h (updated)")
      expect(updated.annualVacationDays).toBe(28)
    })

    it("should create a part-time tariff", async () => {
      const result = await caller.tariffs.create({
        code: "E2E-TZ20",
        name: "E2E Teilzeit 20h",
        weekPlanId: state.weekPlanId,
        annualVacationDays: 30,
        workDaysPerWeek: 5,
        dailyTargetHours: 4,
        weeklyTargetHours: 20,
      })

      expect(result.id).toBeDefined()
      expect(result.dailyTargetHours).toBe(4)
      expect(result.weeklyTargetHours).toBe(20)
      created.tariffIds.push(result.id)
    })
  })

  // =========================================================
  // UC-015: Konten anlegen (Accounts)
  // =========================================================
  describe("UC-015: Konten anlegen", () => {
    it("should have pre-existing system accounts", async () => {
      const { data } = await caller.accounts.list({ includeSystem: true })
      const systemAccounts = data.filter((a: any) => a.isSystem === true)
      expect(systemAccounts.length).toBeGreaterThanOrEqual(1)
    })

    it("should create a flextime account (hours)", async () => {
      const result = await caller.accounts.create({
        code: "E2E-FLEX-ACC",
        name: "E2E Flexzeit",
        accountType: "month",
        unit: "hours",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-FLEX-ACC")
      expect(result.name).toBe("E2E Flexzeit")
      expect(result.accountType).toBe("month")
      expect(result.unit).toBe("hours")
      expect(result.isSystem).toBe(false)
      expect(result.isActive).toBe(true)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      state.flextimeAccountId = result.id
      created.accountIds.push(result.id)
    })

    it("should create an overtime account (hours)", async () => {
      const result = await caller.accounts.create({
        code: "E2E-OT-ACC",
        name: "E2E Ueberstunden",
        accountType: "month",
        unit: "hours",
        isPayrollRelevant: true,
      })

      expect(result.id).toBeDefined()
      expect(result.isPayrollRelevant).toBe(true)
      created.accountIds.push(result.id)
    })

    it("should create a sick hours account (days)", async () => {
      const result = await caller.accounts.create({
        code: "E2E-SICK-ACC",
        name: "E2E Krankheitsstunden",
        accountType: "day",
        unit: "days",
      })

      expect(result.id).toBeDefined()
      expect(result.accountType).toBe("day")
      expect(result.unit).toBe("days")
      created.accountIds.push(result.id)
    })

    it("should reject duplicate account codes", async () => {
      await expect(
        caller.accounts.create({
          code: "E2E-FLEX-ACC",
          name: "E2E Duplicate Account",
          accountType: "month",
        })
      ).rejects.toThrow()
    })

    it("should list accounts including the new ones", async () => {
      const { data } = await caller.accounts.list()
      const e2eAccounts = data.filter((a: any) => a.code.startsWith("E2E"))
      expect(e2eAccounts.length).toBeGreaterThanOrEqual(3)

      const codes = e2eAccounts.map((a: any) => a.code)
      expect(codes).toContain("E2E-FLEX-ACC")
      expect(codes).toContain("E2E-OT-ACC")
      expect(codes).toContain("E2E-SICK-ACC")
    })

    it("should not allow deleting system accounts", async () => {
      const { data } = await caller.accounts.list({ includeSystem: true })
      const systemAccount = data.find((a: any) => a.isSystem === true)
      expect(systemAccount).toBeDefined()

      await expect(
        caller.accounts.delete({ id: systemAccount!.id })
      ).rejects.toThrow()
    })

    it("should get account usage", async () => {
      const usage = await caller.accounts.getUsage({
        id: state.flextimeAccountId,
      })

      expect(usage.accountId).toBe(state.flextimeAccountId)
      expect(usage.usageCount).toBeDefined()
      expect(usage.dayPlans).toBeInstanceOf(Array)
    })

    it("should update an account", async () => {
      const updated = await caller.accounts.update({
        id: state.flextimeAccountId,
        name: "E2E Flexzeit (updated)",
        description: "Flextime balance account",
      })

      expect(updated.name).toBe("E2E Flexzeit (updated)")
      expect(updated.description).toBe("Flextime balance account")
    })
  })

  // =========================================================
  // UC-016: Berechnungsregeln pruefen (Calculation Rules)
  // =========================================================
  describe("UC-016: Berechnungsregeln pruefen", () => {
    it("should create a calculation rule", async () => {
      const result = await caller.calculationRules.create({
        code: "E2E-CALC-OT",
        name: "E2E Ueberstundenberechnung",
        description: "Overtime calculation rule",
        value: 60,
        factor: 1.5,
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-CALC-OT")
      expect(result.name).toBe("E2E Ueberstundenberechnung")
      expect(result.value).toBe(60)
      expect(result.factor).toBe(1.5)
      expect(result.isActive).toBe(true)
      expect(result.tenantId).toBe(SEED.TENANT_ID)
      state.calculationRuleId = result.id
      created.calculationRuleIds.push(result.id)
    })

    it("should create a calculation rule linked to an account", async () => {
      const result = await caller.calculationRules.create({
        code: "E2E-CALC-FLEX",
        name: "E2E Flexzeitberechnung",
        accountId: state.flextimeAccountId,
        value: 0,
        factor: 1.0,
      })

      expect(result.id).toBeDefined()
      expect(result.accountId).toBe(state.flextimeAccountId)
      created.calculationRuleIds.push(result.id)
    })

    it("should reject duplicate calculation rule codes", async () => {
      await expect(
        caller.calculationRules.create({
          code: "E2E-CALC-OT",
          name: "E2E Duplicate Rule",
        })
      ).rejects.toThrow()
    })

    it("should list calculation rules including the new ones", async () => {
      const { data } = await caller.calculationRules.list()
      const e2eRules = data.filter((r: any) => r.code.startsWith("E2E"))
      expect(e2eRules.length).toBeGreaterThanOrEqual(2)

      const codes = e2eRules.map((r: any) => r.code)
      expect(codes).toContain("E2E-CALC-OT")
      expect(codes).toContain("E2E-CALC-FLEX")
    })

    it("should get a calculation rule by ID", async () => {
      const result = await caller.calculationRules.getById({
        id: state.calculationRuleId,
      })

      expect(result.id).toBe(state.calculationRuleId)
      expect(result.code).toBe("E2E-CALC-OT")
      expect(result.factor).toBe(1.5)
    })

    it("should update a calculation rule", async () => {
      const updated = await caller.calculationRules.update({
        id: state.calculationRuleId,
        name: "E2E Ueberstundenberechnung (updated)",
        factor: 2.0,
      })

      expect(updated.name).toBe("E2E Ueberstundenberechnung (updated)")
      expect(updated.factor).toBe(2.0)
    })

    it("should filter calculation rules by isActive", async () => {
      const { data: activeRules } = await caller.calculationRules.list({
        isActive: true,
      })

      activeRules.forEach((r: any) => {
        expect(r.isActive).toBe(true)
      })
    })

    it("should delete a calculation rule", async () => {
      // Create a throwaway rule to delete
      const rule = await caller.calculationRules.create({
        code: "E2E-CALC-DEL",
        name: "E2E To Delete",
        value: 0,
      })
      created.calculationRuleIds.push(rule.id)

      const result = await caller.calculationRules.delete({ id: rule.id })
      expect(result.success).toBe(true)

      // Remove from cleanup tracker
      created.calculationRuleIds = created.calculationRuleIds.filter(
        (id) => id !== rule.id
      )

      // Verify it is gone
      await expect(
        caller.calculationRules.getById({ id: rule.id })
      ).rejects.toThrow()
    })
  })
})
