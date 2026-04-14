/**
 * Unit tests for EmployeeDayPlanGenerator.
 *
 * Focus: the generator resolves tariffs via EmployeeTariffAssignment rows
 * (not legacy employee.tariffId), and segments the output correctly when
 * multiple assignments cover different parts of the input range.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import { EmployeeDayPlanGenerator } from "../employee-day-plan-generator"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222"
const TARIFF_A_ID = "33333333-3333-4333-8333-333333333333"
const TARIFF_B_ID = "44444444-4444-4444-8444-444444444444"
const WEEK_PLAN_A_ID = "55555555-5555-4555-8555-555555555555"
const WEEK_PLAN_B_ID = "66666666-6666-4666-8666-666666666666"
const DAY_PLAN_A_ID = "77777777-7777-4777-8777-777777777777"
const DAY_PLAN_B_ID = "88888888-8888-4888-8888-888888888888"

type UpsertRecord = {
  employeeId: string
  planDate: Date
  dayPlanId: string | null
  source: string
  isCreate: boolean
}

type ExistingPlan = {
  employeeId: string
  tenantId: string
  planDate: Date
  dayPlanId: string | null
  source: string
}

type FakeAssignment = {
  id: string
  employeeId: string
  tariffId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}

type FakeEmployee = {
  id: string
  tenantId: string
  isActive: boolean
  deletedAt: Date | null
  entryDate: Date
  exitDate: Date | null
  tariffId: string | null
}

interface FakeState {
  employees: FakeEmployee[]
  assignments: FakeAssignment[]
  tariffs: Array<{
    id: string
    tenantId: string
    rhythmType: string
    weekPlanId: string | null
    weekPlan: {
      mondayDayPlanId: string | null
      tuesdayDayPlanId: string | null
      wednesdayDayPlanId: string | null
      thursdayDayPlanId: string | null
      fridayDayPlanId: string | null
      saturdayDayPlanId: string | null
      sundayDayPlanId: string | null
    } | null
    tariffWeekPlans: unknown[]
    tariffDayPlans: unknown[]
    rhythmStartDate: Date | null
    cycleDays: number | null
    validFrom: Date | null
    validTo: Date | null
  }>
  existingPlans: ExistingPlan[]
  upserts: UpsertRecord[]
  deletes: Array<{ range: { from: Date; to: Date }; employeeIds: string[] }>
}

function makeWorkdayWeekPlan(dayPlanId: string) {
  return {
    mondayDayPlanId: dayPlanId,
    tuesdayDayPlanId: dayPlanId,
    wednesdayDayPlanId: dayPlanId,
    thursdayDayPlanId: dayPlanId,
    fridayDayPlanId: dayPlanId,
    saturdayDayPlanId: null,
    sundayDayPlanId: null,
  }
}

function createMockPrisma(state: FakeState): PrismaClient {
  const matchRange = (date: Date, from: Date, to: Date) =>
    date.getTime() >= from.getTime() && date.getTime() <= to.getTime()

  const mock = {
    employee: {
      findMany: vi.fn(async (args: { where: { id?: { in: string[] }; tenantId: string; isActive?: boolean; deletedAt?: Date | null } }) => {
        return state.employees
          .filter((e) => {
            if (e.tenantId !== args.where.tenantId) return false
            if (args.where.id?.in && !args.where.id.in.includes(e.id)) return false
            if (args.where.isActive !== undefined && e.isActive !== args.where.isActive) return false
            if (args.where.deletedAt === null && e.deletedAt !== null) return false
            return true
          })
          .map((e) => ({
            id: e.id,
            entryDate: e.entryDate,
            exitDate: e.exitDate,
          }))
      }),
    },
    employeeTariffAssignment: {
      findMany: vi.fn(
        async (args: {
          where: {
            tenantId: string
            employeeId: { in: string[] }
            isActive: boolean
            effectiveFrom: { lte: Date }
            OR: unknown[]
          }
        }) => {
          const toDate = args.where.effectiveFrom.lte
          // The OR clause covers [effectiveTo null] OR [effectiveTo >= fromDate].
          const fromDate = (args.where.OR[1] as { effectiveTo: { gte: Date } })
            .effectiveTo.gte
          return state.assignments
            .filter(
              (a) =>
                a.employeeId &&
                args.where.employeeId.in.includes(a.employeeId) &&
                a.isActive === args.where.isActive &&
                a.effectiveFrom.getTime() <= toDate.getTime() &&
                (a.effectiveTo === null ||
                  a.effectiveTo.getTime() >= fromDate.getTime()),
            )
            .sort((x, y) => {
              if (x.employeeId !== y.employeeId)
                return x.employeeId.localeCompare(y.employeeId)
              return x.effectiveFrom.getTime() - y.effectiveFrom.getTime()
            })
            .map((a) => ({
              id: a.id,
              employeeId: a.employeeId,
              tariffId: a.tariffId,
              effectiveFrom: a.effectiveFrom,
              effectiveTo: a.effectiveTo,
            }))
        },
      ),
    },
    tariff: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] }; tenantId: string } }) => {
        return state.tariffs.filter(
          (t) => args.where.id.in.includes(t.id) && t.tenantId === args.where.tenantId,
        )
      }),
    },
    employeeDayPlan: {
      findMany: vi.fn(
        async (args: {
          where: {
            tenantId: string
            employeeId: { in: string[] }
            planDate: { gte: Date; lte: Date }
          }
        }) => {
          return state.existingPlans.filter(
            (p) =>
              p.tenantId === args.where.tenantId &&
              args.where.employeeId.in.includes(p.employeeId) &&
              matchRange(p.planDate, args.where.planDate.gte, args.where.planDate.lte),
          )
        },
      ),
      deleteMany: vi.fn(
        async (args: {
          where: {
            tenantId: string
            employeeId: { in: string[] }
            source: string
            planDate: { gte: Date; lte: Date }
          }
        }) => {
          state.deletes.push({
            range: {
              from: args.where.planDate.gte,
              to: args.where.planDate.lte,
            },
            employeeIds: args.where.employeeId.in,
          })
          const before = state.existingPlans.length
          state.existingPlans = state.existingPlans.filter(
            (p) =>
              !(
                p.tenantId === args.where.tenantId &&
                args.where.employeeId.in.includes(p.employeeId) &&
                p.source === args.where.source &&
                matchRange(
                  p.planDate,
                  args.where.planDate.gte,
                  args.where.planDate.lte,
                )
              ),
          )
          return { count: before - state.existingPlans.length }
        },
      ),
      upsert: vi.fn(
        (args: {
          where: { employeeId_planDate: { employeeId: string; planDate: Date } }
          create: { dayPlanId: string | null; source: string }
          update: { dayPlanId: string | null; source: string }
        }) => {
          const key = args.where.employeeId_planDate
          const existing = state.existingPlans.find(
            (p) => p.employeeId === key.employeeId && p.planDate.getTime() === key.planDate.getTime(),
          )
          const isCreate = !existing
          state.upserts.push({
            employeeId: key.employeeId,
            planDate: key.planDate,
            dayPlanId: args.create.dayPlanId,
            source: args.create.source,
            isCreate,
          })
          return Promise.resolve({
            id: `plan-${key.employeeId}-${key.planDate.toISOString()}`,
          })
        },
      ),
    },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => {
      return Promise.all(ops)
    }),
  }
  return mock as unknown as PrismaClient
}

// Simple test fixtures
function buildEmployee(overrides: Partial<FakeEmployee> = {}): FakeEmployee {
  return {
    id: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    isActive: true,
    deletedAt: null,
    entryDate: new Date("2026-01-01T00:00:00.000Z"),
    exitDate: null,
    tariffId: null,
    ...overrides,
  }
}

function buildTariff(
  id: string,
  weekPlanId: string,
  weekPlan: ReturnType<typeof makeWorkdayWeekPlan>,
): FakeState["tariffs"][number] {
  return {
    id,
    tenantId: TENANT_ID,
    rhythmType: "weekly",
    weekPlanId,
    weekPlan,
    tariffWeekPlans: [],
    tariffDayPlans: [],
    rhythmStartDate: null,
    cycleDays: null,
    validFrom: null,
    validTo: null,
  }
}

describe("EmployeeDayPlanGenerator.generateFromTariff", () => {
  let state: FakeState

  beforeEach(() => {
    state = {
      employees: [buildEmployee()],
      assignments: [],
      tariffs: [],
      existingPlans: [],
      upserts: [],
      deletes: [],
    }
  })

  it("skips employees with no active tariff assignments", async () => {
    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))

    const result = await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-01T00:00:00.000Z"),
      to: new Date("2026-04-07T00:00:00.000Z"),
    })

    expect(result.employeesSkipped).toBe(1)
    expect(result.employeesProcessed).toBe(0)
    expect(state.upserts).toHaveLength(0)
  })

  it("generates plans only within the assignment effective range", async () => {
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"), // Monday
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),   // Friday
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-01T00:00:00.000Z"), // Wed (before assignment)
      to: new Date("2026-04-15T00:00:00.000Z"),   // Wed (after assignment)
    })

    // Expected: only weekdays from 2026-04-06..2026-04-10 get plans
    expect(state.upserts).toHaveLength(5)
    const dates = state.upserts.map((u) => u.planDate.toISOString().split("T")[0])
    expect(dates.sort()).toEqual([
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
    ])
  })

  it("skips Saturday/Sunday when weekPlan has null weekend dayPlanIds", async () => {
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-11T00:00:00.000Z"), // Saturday
      effectiveTo: new Date("2026-04-12T00:00:00.000Z"),   // Sunday
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    const result = await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-11T00:00:00.000Z"),
      to: new Date("2026-04-12T00:00:00.000Z"),
    })

    // Employee is processed (segment exists), but no upserts (weekend off)
    expect(result.employeesProcessed).toBe(1)
    expect(state.upserts).toHaveLength(0)
  })

  it("handles open-ended assignment (effectiveTo = null) up to input.to", async () => {
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"), // Monday
      effectiveTo: null,
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"), // Mon
      to: new Date("2026-04-10T00:00:00.000Z"),   // Fri
    })

    expect(state.upserts).toHaveLength(5)
    expect(state.upserts.every((u) => u.dayPlanId === DAY_PLAN_A_ID)).toBe(true)
  })

  it("produces correct segments for two consecutive assignments", async () => {
    // Assignment A: 06.-08.04 (Mon-Wed) with Tariff A
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
      effectiveTo: new Date("2026-04-08T00:00:00.000Z"),
      isActive: true,
    })
    // Assignment B: 09.-10.04 (Thu-Fri) with Tariff B
    state.assignments.push({
      id: "assignment-b",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_B_ID,
      effectiveFrom: new Date("2026-04-09T00:00:00.000Z"),
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )
    state.tariffs.push(
      buildTariff(TARIFF_B_ID, WEEK_PLAN_B_ID, makeWorkdayWeekPlan(DAY_PLAN_B_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
    })

    expect(state.upserts).toHaveLength(5)

    const byDate = new Map(
      state.upserts.map((u) => [u.planDate.toISOString().split("T")[0], u.dayPlanId]),
    )
    expect(byDate.get("2026-04-06")).toBe(DAY_PLAN_A_ID)
    expect(byDate.get("2026-04-07")).toBe(DAY_PLAN_A_ID)
    expect(byDate.get("2026-04-08")).toBe(DAY_PLAN_A_ID)
    expect(byDate.get("2026-04-09")).toBe(DAY_PLAN_B_ID)
    expect(byDate.get("2026-04-10")).toBe(DAY_PLAN_B_ID)
  })

  it("respects employee.entryDate even if assignment starts earlier", async () => {
    state.employees[0]!.entryDate = new Date("2026-04-08T00:00:00.000Z") // Wednesday
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"), // Monday
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
    })

    // Only Wed, Thu, Fri — Mon/Tue are before entryDate
    expect(state.upserts).toHaveLength(3)
    const dates = state.upserts.map((u) => u.planDate.toISOString().split("T")[0]).sort()
    expect(dates).toEqual(["2026-04-08", "2026-04-09", "2026-04-10"])
  })

  it("deletes orphaned tariff plans when deleteOrphanedTariffPlansInRange=true", async () => {
    // Existing source='tariff' plan in the range — should be deleted first
    state.existingPlans.push({
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      planDate: new Date("2026-04-07T00:00:00.000Z"), // Tuesday
      dayPlanId: DAY_PLAN_A_ID,
      source: "tariff",
    })
    // Existing source='manual' plan — should be preserved
    state.existingPlans.push({
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      planDate: new Date("2026-04-08T00:00:00.000Z"), // Wednesday
      dayPlanId: "manual-dp",
      source: "manual",
    })
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
      deleteOrphanedTariffPlansInRange: true,
    })

    // Assert: deleteMany was called for the range and employee
    expect(state.deletes).toHaveLength(1)

    // Assert: tariff row deleted, manual row preserved
    const manualStillExists = state.existingPlans.some(
      (p) => p.source === "manual",
    )
    expect(manualStillExists).toBe(true)

    // Assert: Tue upsert exists (re-created) and Wed is NOT upserted
    // (manual plan is preserved from the original existingPlans)
    const upsertDates = state.upserts.map((u) => u.planDate.toISOString().split("T")[0])
    expect(upsertDates).toContain("2026-04-07") // Tue: previously tariff, re-created
    expect(upsertDates).not.toContain("2026-04-08") // Wed: manual, preserved
  })

  it("does not modify manual plans when overwriteTariffSource=true", async () => {
    state.existingPlans.push({
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      planDate: new Date("2026-04-07T00:00:00.000Z"),
      dayPlanId: "manual-dp",
      source: "manual",
    })
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
      overwriteTariffSource: true,
    })

    const upsertDates = state.upserts.map((u) => u.planDate.toISOString().split("T")[0])
    expect(upsertDates).not.toContain("2026-04-07") // manual day skipped
    expect(upsertDates).toContain("2026-04-06") // other weekdays fine
  })

  it("preserves existing tariff-source plans when overwriteTariffSource=false", async () => {
    state.existingPlans.push({
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      planDate: new Date("2026-04-07T00:00:00.000Z"),
      dayPlanId: DAY_PLAN_A_ID,
      source: "tariff",
    })
    state.assignments.push({
      id: "assignment-a",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
      effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
      overwriteTariffSource: false,
    })

    const upsertDates = state.upserts.map((u) => u.planDate.toISOString().split("T")[0])
    // 07.04 already has a tariff plan, so with overwrite=false it's skipped
    expect(upsertDates).not.toContain("2026-04-07")
    // Other weekdays are created
    expect(upsertDates).toContain("2026-04-06")
    expect(upsertDates).toContain("2026-04-08")
  })

  it("skips employee entirely when assignment is outside input range", async () => {
    state.assignments.push({
      id: "assignment-old",
      employeeId: EMPLOYEE_ID,
      tariffId: TARIFF_A_ID,
      effectiveFrom: new Date("2025-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2025-12-31T00:00:00.000Z"),
      isActive: true,
    })
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    const result = await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
    })

    expect(result.employeesSkipped).toBe(1)
    expect(state.upserts).toHaveLength(0)
  })

  it("ignores legacy employee.tariffId when no assignment exists", async () => {
    state.employees[0]!.tariffId = TARIFF_A_ID // Legacy field populated
    // But no assignment row — new semantics: skip
    state.tariffs.push(
      buildTariff(TARIFF_A_ID, WEEK_PLAN_A_ID, makeWorkdayWeekPlan(DAY_PLAN_A_ID)),
    )

    const gen = new EmployeeDayPlanGenerator(createMockPrisma(state))
    const result = await gen.generateFromTariff({
      tenantId: TENANT_ID,
      employeeIds: [EMPLOYEE_ID],
      from: new Date("2026-04-06T00:00:00.000Z"),
      to: new Date("2026-04-10T00:00:00.000Z"),
    })

    expect(result.employeesSkipped).toBe(1)
    expect(state.upserts).toHaveLength(0)
  })
})
