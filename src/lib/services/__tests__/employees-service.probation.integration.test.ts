/**
 * Integration tests for employeesService.list probation filtering.
 *
 * Proves the raw-SQL path in `probation-repository.ts` against a real database:
 * exit-date exclusion, tenant-default fallback, month-end math, department
 * scope, and server-side pagination totals.
 *
 * These cannot be covered by mocked Prisma unit tests because the Prisma mock
 * cannot execute `make_interval` and other Postgres-specific expressions.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as employeesService from "@/lib/services/employees-service"
import type { DataScope } from "@/lib/auth/middleware"
import { computeProbationEndDate } from "@/lib/services/probation-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000985"
const DEPARTMENT_A = "d0000000-0000-4000-a000-000000000985"
const DEPARTMENT_B = "d0000000-0000-4000-a000-000000000986"

const MS_PER_DAY = 24 * 60 * 60 * 1000

const allScope: DataScope = {
  type: "all",
  tenantIds: [],
  departmentIds: [],
  employeeIds: [],
}

function utcMidnight(date: Date = new Date()): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ))
}

/** Returns an entry date such that `computeProbationEndDate` produces today + daysRemaining. */
function entryDateFor(today: Date, daysRemaining: number, months = 6): Date {
  const desiredEnd = new Date(today.getTime() + daysRemaining * MS_PER_DAY)
  const approxEntry = new Date(Date.UTC(
    desiredEnd.getUTCFullYear(),
    desiredEnd.getUTCMonth() - months,
    desiredEnd.getUTCDate()
  ))
  const actualEnd = computeProbationEndDate(approxEntry, months)
  const drift = Math.round((desiredEnd.getTime() - actualEnd.getTime()) / MS_PER_DAY)
  return new Date(approxEntry.getTime() + drift * MS_PER_DAY)
}

type EmployeeSeed = {
  id: string
  personnelNumber: string
  departmentId?: string | null
  entryDate: Date
  exitDate?: Date | null
  probationMonths?: number | null
}

async function createEmployees(seeds: EmployeeSeed[]): Promise<void> {
  for (const seed of seeds) {
    // Use the last 4 characters of the uuid id as a unique PIN so per-tenant
    // (tenant_id, pin) unique constraint never collides across seeds.
    const pin = seed.id.replace(/-/g, "").slice(-4)
    await prisma.employee.create({
      data: {
        id: seed.id,
        tenantId: TENANT_ID,
        personnelNumber: seed.personnelNumber,
        pin,
        firstName: "Prob",
        lastName: seed.personnelNumber,
        entryDate: seed.entryDate,
        exitDate: seed.exitDate ?? null,
        departmentId: seed.departmentId ?? null,
        probationMonths: seed.probationMonths ?? null,
      },
    })
  }
}

async function setTenantProbationDefault(months: number) {
  await prisma.systemSetting.upsert({
    where: { tenantId: TENANT_ID },
    update: { probationDefaultMonths: months },
    create: {
      tenantId: TENANT_ID,
      probationDefaultMonths: months,
      probationRemindersEnabled: true,
      probationReminderDays: [28, 14, 7],
    },
  })
}

async function clearEmployees() {
  await prisma.employee.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {})
}

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { isActive: true },
    create: { id: TENANT_ID, name: "Probation SVC IT", slug: "probation-svc-it", isActive: true },
  })
  await prisma.department.upsert({
    where: { id: DEPARTMENT_A },
    update: {},
    create: { id: DEPARTMENT_A, tenantId: TENANT_ID, code: "PROBSVC-A", name: "SVC A" },
  })
  await prisma.department.upsert({
    where: { id: DEPARTMENT_B },
    update: {},
    create: { id: DEPARTMENT_B, tenantId: TENANT_ID, code: "PROBSVC-B", name: "SVC B" },
  })
  await setTenantProbationDefault(6)
})

afterAll(async () => {
  await clearEmployees()
  await prisma.systemSetting.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {})
  await prisma.department.deleteMany({
    where: { id: { in: [DEPARTMENT_A, DEPARTMENT_B] } },
  }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } }).catch(() => {})
})

beforeEach(async () => {
  await clearEmployees()
  await setTenantProbationDefault(6)
})

describe.sequential("employeesService.list probation filtering", () => {
  it("IN_PROBATION returns both IN_PROBATION and ENDS_IN_30_DAYS employees", async () => {
    const today = utcMidnight()
    await createEmployees([
      // In probation, not ending soon: end date = today + 90 days
      {
        id: "e0000000-0000-4000-a000-000000101001",
        personnelNumber: "PSVC-IN-LONG",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 90),
        probationMonths: 6,
      },
      // In probation, ending in 14 days
      {
        id: "e0000000-0000-4000-a000-000000101002",
        personnelNumber: "PSVC-IN-SOON",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 14),
        probationMonths: 6,
      },
      // Already ended
      {
        id: "e0000000-0000-4000-a000-000000101003",
        personnelNumber: "PSVC-ENDED",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, -10),
        probationMonths: 6,
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "IN_PROBATION", pageSize: 50 }
    )

    expect(result.total).toBe(2)
    const ids = result.employees.map((e) => e.id).sort()
    expect(ids).toEqual([
      "e0000000-0000-4000-a000-000000101001",
      "e0000000-0000-4000-a000-000000101002",
    ])
  })

  it("ENDS_IN_30_DAYS only matches the 30-day window", async () => {
    const today = utcMidnight()
    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000102001",
        personnelNumber: "PSVC-W-14",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 14),
        probationMonths: 6,
      },
      {
        id: "e0000000-0000-4000-a000-000000102002",
        personnelNumber: "PSVC-W-31",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 31),
        probationMonths: 6,
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "ENDS_IN_30_DAYS", pageSize: 50 }
    )

    expect(result.total).toBe(1)
    expect(result.employees[0]!.personnelNumber).toBe("PSVC-W-14")
  })

  it("ENDED includes past end dates and excludes exited employees", async () => {
    const today = utcMidnight()
    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000103001",
        personnelNumber: "PSVC-PAST",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, -10),
        probationMonths: 6,
      },
      {
        id: "e0000000-0000-4000-a000-000000103002",
        personnelNumber: "PSVC-EXITED",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, -10),
        probationMonths: 6,
        exitDate: new Date(today.getTime() - 1 * MS_PER_DAY),
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "ENDED", pageSize: 50 }
    )

    expect(result.total).toBe(1)
    expect(result.employees[0]!.personnelNumber).toBe("PSVC-PAST")
  })

  it("server-side pagination respects the filter: total and page both reflect filtered set", async () => {
    const today = utcMidnight()
    // Seed 5 employees currently in probation (long window) and 3 already ended.
    const inProbation: EmployeeSeed[] = Array.from({ length: 5 }, (_, i) => ({
      id: `e0000000-0000-4000-a000-0000001040${(i + 1).toString().padStart(2, "0")}`,
      personnelNumber: `PSVC-IN-PG-${i + 1}`,
      departmentId: DEPARTMENT_A,
      entryDate: entryDateFor(today, 80 + i),
      probationMonths: 6,
    }))
    const ended: EmployeeSeed[] = Array.from({ length: 3 }, (_, i) => ({
      id: `e0000000-0000-4000-a000-0000001041${(i + 1).toString().padStart(2, "0")}`,
      personnelNumber: `PSVC-END-PG-${i + 1}`,
      departmentId: DEPARTMENT_A,
      entryDate: entryDateFor(today, -30 - i),
      probationMonths: 6,
    }))
    await createEmployees([...inProbation, ...ended])

    const pageOne = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "IN_PROBATION", page: 1, pageSize: 3 }
    )
    const pageTwo = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "IN_PROBATION", page: 2, pageSize: 3 }
    )

    expect(pageOne.total).toBe(5)
    expect(pageTwo.total).toBe(5)
    expect(pageOne.employees).toHaveLength(3)
    expect(pageTwo.employees).toHaveLength(2)

    const combinedIds = [...pageOne.employees, ...pageTwo.employees].map((e) => e.id)
    expect(new Set(combinedIds).size).toBe(5)
  })

  it("never returns exited employees in IN_PROBATION even if their end date is in the future", async () => {
    const today = utcMidnight()
    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000105001",
        personnelNumber: "PSVC-EXITED-FUTURE",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 14),
        probationMonths: 6,
        exitDate: today,
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "IN_PROBATION", pageSize: 50 }
    )
    expect(result.total).toBe(0)
  })

  it("falls back to the tenant default months when probationMonths is NULL", async () => {
    const today = utcMidnight()
    await setTenantProbationDefault(6)
    // Entry aligned for tenant default (6 months) → end date in 14 days.
    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000106001",
        personnelNumber: "PSVC-DEFAULT",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 14, 6),
        probationMonths: null,
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "ENDS_IN_30_DAYS", pageSize: 50 }
    )

    expect(result.total).toBe(1)
    expect(result.employees[0]!.probation.effectiveMonths).toBe(6)
    expect(result.employees[0]!.probation.status).toBe("ends_in_30_days")
  })

  it("month-end math: Jan 31 + 1 month resolves to Feb 28/29 in both service and SQL", async () => {
    // Pick a fixed reference date so the test is independent from 'today'.
    // Here we seed an employee and then use the shared probation service to
    // confirm the snapshot math; we also filter so the SQL path observes the
    // same status.
    const entryDate = new Date(Date.UTC(2026, 0, 31)) // Jan 31 2026
    const months = 1
    const expectedEnd = computeProbationEndDate(entryDate, months)
    // Feb 2026 has 28 days → Jan 31 + 1 month = Feb 28.
    expect(expectedEnd.getUTCMonth()).toBe(1)
    expect(expectedEnd.getUTCDate()).toBe(28)

    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000107001",
        personnelNumber: "PSVC-MONTHEND",
        departmentId: DEPARTMENT_A,
        entryDate,
        probationMonths: months,
      },
    ])

    const result = await employeesService.list(
      prisma,
      TENANT_ID,
      allScope,
      { probationStatus: "ALL", pageSize: 50 }
    )
    const row = result.employees.find((e) => e.personnelNumber === "PSVC-MONTHEND")!
    expect(row.probation.endDate).toBeTruthy()
    const endDate = row.probation.endDate!
    expect(endDate.getUTCFullYear()).toBe(2026)
    expect(endDate.getUTCMonth()).toBe(1)
    expect(endDate.getUTCDate()).toBe(28)
  })

  it("department scope restricts both items and total", async () => {
    const today = utcMidnight()
    await createEmployees([
      {
        id: "e0000000-0000-4000-a000-000000108001",
        personnelNumber: "PSVC-SCOPE-A",
        departmentId: DEPARTMENT_A,
        entryDate: entryDateFor(today, 14),
        probationMonths: 6,
      },
      {
        id: "e0000000-0000-4000-a000-000000108002",
        personnelNumber: "PSVC-SCOPE-B",
        departmentId: DEPARTMENT_B,
        entryDate: entryDateFor(today, 14),
        probationMonths: 6,
      },
    ])

    const deptScope: DataScope = {
      type: "department",
      tenantIds: [],
      departmentIds: [DEPARTMENT_A],
      employeeIds: [],
    }

    const scoped = await employeesService.list(
      prisma,
      TENANT_ID,
      deptScope,
      { probationStatus: "ENDS_IN_30_DAYS", pageSize: 50 }
    )

    expect(scoped.total).toBe(1)
    expect(scoped.employees[0]!.personnelNumber).toBe("PSVC-SCOPE-A")
  })
})
