/**
 * End-to-end integration test for EmployeeTariffAssignment post-commit sync.
 *
 * Verifies that the full chain works against a real Postgres instance:
 *   Assignment create → EmployeeDayPlan rows exist for the covered range
 *   Assignment update (date shift) → old-range plans removed, new-range plans created
 *   Assignment delete → all tariff-source plans in the range are cleaned up
 *
 * Each test creates an ephemeral tenant + employee + day plan + week plan
 * + tariff, then cleans them up in `afterEach`.
 *
 * Requires DATABASE_URL (local Supabase via `pnpm db:start`).
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest"

import { prisma } from "@/lib/db/prisma"
import * as service from "../employee-tariff-assignment-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// Track created resource IDs for cleanup
const createdIds = {
  tenants: new Set<string>(),
  employees: new Set<string>(),
  dayPlans: new Set<string>(),
  weekPlans: new Set<string>(),
  tariffs: new Set<string>(),
  assignments: new Set<string>(),
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

async function createFixture() {
  const suffix = uniqueSuffix()

  const tenant = await prisma.tenant.create({
    data: {
      name: `Sync Test ${suffix}`,
      slug: `sync-test-${suffix}`,
      isActive: true,
    },
    select: { id: true },
  })
  createdIds.tenants.add(tenant.id)

  const employee = await prisma.employee.create({
    data: {
      tenantId: tenant.id,
      personnelNumber: `ST${suffix.slice(-8)}`,
      pin: suffix.slice(-4),
      firstName: "Sync",
      lastName: "Test",
      entryDate: new Date("2026-01-01T00:00:00.000Z"),
      isActive: true,
    },
    select: { id: true },
  })
  createdIds.employees.add(employee.id)

  const dayPlan = await prisma.dayPlan.create({
    data: {
      tenantId: tenant.id,
      code: `FLEX${suffix.slice(-6)}`,
      name: "Flex Test",
      planType: "flextime",
      comeFrom: 300, // 05:00
      goTo: 1320,    // 22:00
      regularHours: 450, // 7:30
      isActive: true,
    },
    select: { id: true },
  })
  createdIds.dayPlans.add(dayPlan.id)

  const weekPlan = await prisma.weekPlan.create({
    data: {
      tenantId: tenant.id,
      code: `WP${suffix.slice(-8)}`,
      name: "Mo-Fr Test",
      mondayDayPlanId: dayPlan.id,
      tuesdayDayPlanId: dayPlan.id,
      wednesdayDayPlanId: dayPlan.id,
      thursdayDayPlanId: dayPlan.id,
      fridayDayPlanId: dayPlan.id,
      saturdayDayPlanId: null,
      sundayDayPlanId: null,
      isActive: true,
    },
    select: { id: true },
  })
  createdIds.weekPlans.add(weekPlan.id)

  const tariff = await prisma.tariff.create({
    data: {
      tenantId: tenant.id,
      code: `T${suffix.slice(-8)}`,
      name: "Standard Test Tariff",
      rhythmType: "weekly",
      weekPlanId: weekPlan.id,
      dailyTargetHours: 7.5,
      weeklyTargetHours: 37.5,
      workDaysPerWeek: 5,
      annualVacationDays: 30,
      vacationBasis: "calendar_year",
      isActive: true,
    },
    select: { id: true },
  })
  createdIds.tariffs.add(tariff.id)

  return {
    tenantId: tenant.id,
    employeeId: employee.id,
    dayPlanId: dayPlan.id,
    weekPlanId: weekPlan.id,
    tariffId: tariff.id,
  }
}

async function cleanupAll() {
  // Delete in FK-safe order: assignments → employee day plans → employee
  //                         → tariff → week plan → day plan → tenant
  if (createdIds.assignments.size > 0) {
    await prisma.employeeTariffAssignment
      .deleteMany({
        where: { id: { in: Array.from(createdIds.assignments) } },
      })
      .catch(() => {})
  }
  if (createdIds.employees.size > 0) {
    await prisma.employeeDayPlan
      .deleteMany({
        where: { employeeId: { in: Array.from(createdIds.employees) } },
      })
      .catch(() => {})
    await prisma.dailyValue
      .deleteMany({
        where: { employeeId: { in: Array.from(createdIds.employees) } },
      })
      .catch(() => {})
  }
  if (createdIds.tariffs.size > 0) {
    await prisma.tariff
      .deleteMany({ where: { id: { in: Array.from(createdIds.tariffs) } } })
      .catch(() => {})
  }
  if (createdIds.weekPlans.size > 0) {
    await prisma.weekPlan
      .deleteMany({ where: { id: { in: Array.from(createdIds.weekPlans) } } })
      .catch(() => {})
  }
  if (createdIds.dayPlans.size > 0) {
    await prisma.dayPlan
      .deleteMany({ where: { id: { in: Array.from(createdIds.dayPlans) } } })
      .catch(() => {})
  }
  if (createdIds.employees.size > 0) {
    await prisma.employee
      .deleteMany({ where: { id: { in: Array.from(createdIds.employees) } } })
      .catch(() => {})
  }
  if (createdIds.tenants.size > 0) {
    await prisma.tenant
      .deleteMany({ where: { id: { in: Array.from(createdIds.tenants) } } })
      .catch(() => {})
  }

  createdIds.tenants.clear()
  createdIds.employees.clear()
  createdIds.dayPlans.clear()
  createdIds.weekPlans.clear()
  createdIds.tariffs.clear()
  createdIds.assignments.clear()
}

describe.skipIf(!HAS_DB)(
  "employee-tariff-assignment-service post-commit sync (integration)",
  () => {
    beforeAll(async () => {
      // Ensure clean starting state
      await cleanupAll()
    })

    afterEach(async () => {
      await cleanupAll()
    })

    afterAll(async () => {
      await cleanupAll()
    })

    test(
      "create() generates EmployeeDayPlan rows for the assignment range",
      async () => {
        const fx = await createFixture()

        const effectiveFrom = new Date("2026-04-06T00:00:00.000Z") // Mon
        const effectiveTo = new Date("2026-04-12T00:00:00.000Z")   // Sun

        const assignment = await service.create(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          tariffId: fx.tariffId,
          effectiveFrom,
          effectiveTo,
        })
        createdIds.assignments.add(assignment.id)

        const plans = await prisma.employeeDayPlan.findMany({
          where: {
            employeeId: fx.employeeId,
            planDate: { gte: effectiveFrom, lte: effectiveTo },
          },
          orderBy: { planDate: "asc" },
        })

        // Mon-Fri get assigned the dayPlanId; Sat/Sun get nothing (null in weekPlan)
        const byDate = new Map(
          plans.map((p) => [p.planDate.toISOString().split("T")[0], p]),
        )
        expect(byDate.get("2026-04-06")?.dayPlanId).toBe(fx.dayPlanId)
        expect(byDate.get("2026-04-07")?.dayPlanId).toBe(fx.dayPlanId)
        expect(byDate.get("2026-04-08")?.dayPlanId).toBe(fx.dayPlanId)
        expect(byDate.get("2026-04-09")?.dayPlanId).toBe(fx.dayPlanId)
        expect(byDate.get("2026-04-10")?.dayPlanId).toBe(fx.dayPlanId)
        // Weekend: no plan row created (weekPlan has null weekend slots)
        expect(byDate.has("2026-04-11")).toBe(false)
        expect(byDate.has("2026-04-12")).toBe(false)
      },
      60_000,
    )

    test(
      "update() with date shift removes old-range plans and creates new-range plans",
      async () => {
        const fx = await createFixture()

        // Create assignment 2026-04-06..2026-04-10
        const assignment = await service.create(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          tariffId: fx.tariffId,
          effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
          effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
        })
        createdIds.assignments.add(assignment.id)

        // Shift to 2026-04-13..2026-04-17
        await service.update(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          id: assignment.id,
          effectiveFrom: new Date("2026-04-13T00:00:00.000Z"),
          effectiveTo: new Date("2026-04-17T00:00:00.000Z"),
        })

        const plans = await prisma.employeeDayPlan.findMany({
          where: { employeeId: fx.employeeId },
          orderBy: { planDate: "asc" },
        })

        const dates = plans.map((p) => p.planDate.toISOString().split("T")[0])
        // Old range is gone
        expect(dates).not.toContain("2026-04-06")
        expect(dates).not.toContain("2026-04-10")
        // New range is present (Mo-Fr)
        expect(dates).toContain("2026-04-13")
        expect(dates).toContain("2026-04-14")
        expect(dates).toContain("2026-04-17")
      },
      60_000,
    )

    test(
      "remove() cleans up all tariff-source plans in the range",
      async () => {
        const fx = await createFixture()

        const assignment = await service.create(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          tariffId: fx.tariffId,
          effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
          effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
        })
        createdIds.assignments.add(assignment.id)

        const plansBefore = await prisma.employeeDayPlan.count({
          where: { employeeId: fx.employeeId },
        })
        expect(plansBefore).toBeGreaterThan(0)

        await service.remove(
          prisma,
          fx.tenantId,
          fx.employeeId,
          assignment.id,
        )
        // Prevent double-delete in cleanup
        createdIds.assignments.delete(assignment.id)

        const plansAfter = await prisma.employeeDayPlan.findMany({
          where: { employeeId: fx.employeeId, source: "tariff" },
        })
        expect(plansAfter).toHaveLength(0)
      },
      60_000,
    )

    test(
      "two consecutive assignments expand into separate segments",
      async () => {
        const fx = await createFixture()

        // Create a second tariff with the same week plan (any tariff works)
        const suffix = uniqueSuffix()
        const tariffB = await prisma.tariff.create({
          data: {
            tenantId: fx.tenantId,
            code: `TB${suffix.slice(-8)}`,
            name: "Second Test Tariff",
            rhythmType: "weekly",
            weekPlanId: fx.weekPlanId,
            dailyTargetHours: 8,
            weeklyTargetHours: 40,
            workDaysPerWeek: 5,
            annualVacationDays: 30,
            vacationBasis: "calendar_year",
            isActive: true,
          },
          select: { id: true },
        })
        createdIds.tariffs.add(tariffB.id)

        // Assignment A: 2026-04-06..2026-04-10 (Mo-Fr)
        const assignmentA = await service.create(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          tariffId: fx.tariffId,
          effectiveFrom: new Date("2026-04-06T00:00:00.000Z"),
          effectiveTo: new Date("2026-04-10T00:00:00.000Z"),
        })
        createdIds.assignments.add(assignmentA.id)

        // Assignment B: 2026-04-13..2026-04-17 (Mo-Fr)
        const assignmentB = await service.create(prisma, fx.tenantId, {
          employeeId: fx.employeeId,
          tariffId: tariffB.id,
          effectiveFrom: new Date("2026-04-13T00:00:00.000Z"),
          effectiveTo: new Date("2026-04-17T00:00:00.000Z"),
        })
        createdIds.assignments.add(assignmentB.id)

        const plans = await prisma.employeeDayPlan.findMany({
          where: { employeeId: fx.employeeId, source: "tariff" },
        })
        const dates = plans.map((p) => p.planDate.toISOString().split("T")[0])

        // Both assignment ranges covered (Mo-Fr each)
        expect(dates).toContain("2026-04-06")
        expect(dates).toContain("2026-04-10")
        expect(dates).toContain("2026-04-13")
        expect(dates).toContain("2026-04-17")
        // Weekend gap between the two assignments is NOT covered
        expect(dates).not.toContain("2026-04-11")
        expect(dates).not.toContain("2026-04-12")
      },
      60_000,
    )
  },
)
