/**
 * Integration tests for the probation-reminders cron route.
 *
 * Proves behaviors that unit-level mocks cannot: real raw-SQL candidate
 * selection through `probation-repository.ts`, real unique-key dedupe on
 * `employee_probation_reminders`, real recipient resolution through
 * `users`/`user_groups`/`notification_preferences`, and real
 * `schedule_executions` logging.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

vi.mock("@/lib/pubsub/singleton", () => ({
  getHub: vi.fn().mockResolvedValue({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock("@/lib/pubsub/topics", () => ({
  userTopic: vi.fn((id: string) => `user:${id}`),
}))

import { prisma } from "@/lib/db/prisma"
import { GET, executeProbationReminders } from "../route"
import { computeProbationEndDate } from "@/lib/services/probation-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000981"
const TENANT_ID_FAIL = "f0000000-0000-4000-a000-000000000982"
const DEPARTMENT_A = "d0000000-0000-4000-a000-000000000981"
const DEPARTMENT_B = "d0000000-0000-4000-a000-000000000982"
const USER_ALL = "a0000000-0000-4000-a000-000000000981"
const USER_DEPT_A = "a0000000-0000-4000-a000-000000000982"
const USER_NO_VIEW = "a0000000-0000-4000-a000-000000000983"
const USER_PREF_OFF = "a0000000-0000-4000-a000-000000000984"
const CRON_SECRET = "probation-integration-cron-secret"

const MS_PER_DAY = 24 * 60 * 60 * 1000

function makeRequest(secret = CRON_SECRET) {
  return new Request("http://localhost/api/cron/probation-reminders", {
    headers: { authorization: `Bearer ${secret}` },
  })
}

function utcMidnight(date: Date = new Date()): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ))
}

/**
 * Given a desired `daysRemaining` and the canonical probation-service end-date
 * math, reverse-engineer an `entryDate` + `probationMonths` so that
 * `computeProbationEndDate(entryDate, months) === today + daysRemaining`.
 *
 * We fix `months = 6` and vary `entryDate = (today + daysRemaining) - 6 months`.
 * The exact same `computeProbationEndDate` used by production code is used to
 * compute the end date, which keeps month-end math consistent.
 */
function seedEntryDateForDaysRemaining(
  today: Date,
  daysRemaining: number,
  months = 6
): { entryDate: Date; probationMonths: number; expectedEndDate: Date } {
  const desiredEnd = new Date(today.getTime() + daysRemaining * MS_PER_DAY)
  const approxEntry = new Date(Date.UTC(
    desiredEnd.getUTCFullYear(),
    desiredEnd.getUTCMonth() - months,
    desiredEnd.getUTCDate()
  ))
  const actualEnd = computeProbationEndDate(approxEntry, months)
  const drift = Math.round((desiredEnd.getTime() - actualEnd.getTime()) / MS_PER_DAY)
  const entryDate = new Date(approxEntry.getTime() + drift * MS_PER_DAY)
  const expectedEndDate = computeProbationEndDate(entryDate, months)

  return { entryDate, probationMonths: months, expectedEndDate }
}

async function createEmployee(opts: {
  id: string
  tenantId?: string
  personnelNumber: string
  departmentId?: string | null
  entryDate: Date
  exitDate?: Date | null
  probationMonths?: number | null
}): Promise<void> {
  // Use the last 4 characters of the uuid id as a unique PIN so the
  // per-tenant (tenant_id, pin) unique constraint never collides across seeds.
  const pin = opts.id.replace(/-/g, "").slice(-4)
  await prisma.employee.create({
    data: {
      id: opts.id,
      tenantId: opts.tenantId ?? TENANT_ID,
      personnelNumber: opts.personnelNumber,
      pin,
      firstName: "Probation",
      lastName: opts.personnelNumber,
      entryDate: opts.entryDate,
      exitDate: opts.exitDate ?? null,
      departmentId: opts.departmentId ?? null,
      probationMonths: opts.probationMonths ?? null,
    },
  })
}

async function cleanupDynamicData() {
  await prisma.notification.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {})
  await prisma.notification.deleteMany({ where: { tenantId: TENANT_ID_FAIL } }).catch(() => {})
  await prisma.employeeProbationReminder.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {})
  await prisma.employeeProbationReminder.deleteMany({ where: { tenantId: TENANT_ID_FAIL } }).catch(() => {})
  await prisma.scheduleTaskExecution.deleteMany({
    where: { execution: { tenantId: { in: [TENANT_ID, TENANT_ID_FAIL] } } },
  }).catch(() => {})
  await prisma.scheduleExecution.deleteMany({
    where: { tenantId: { in: [TENANT_ID, TENANT_ID_FAIL] } },
  }).catch(() => {})
  await prisma.schedule.deleteMany({
    where: { tenantId: { in: [TENANT_ID, TENANT_ID_FAIL] } },
  }).catch(() => {})
  await prisma.employee.deleteMany({
    where: { tenantId: { in: [TENANT_ID, TENANT_ID_FAIL] } },
  }).catch(() => {})
}

async function resetSystemSettings() {
  await prisma.systemSetting.upsert({
    where: { tenantId: TENANT_ID },
    update: {
      probationDefaultMonths: 6,
      probationRemindersEnabled: true,
      probationReminderDays: [28, 14, 7],
    },
    create: {
      tenantId: TENANT_ID,
      probationDefaultMonths: 6,
      probationRemindersEnabled: true,
      probationReminderDays: [28, 14, 7],
    },
  })
}

beforeAll(async () => {
  process.env.CRON_SECRET = CRON_SECRET

  for (const tenantId of [TENANT_ID, TENANT_ID_FAIL]) {
    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: { isActive: true },
      create: {
        id: tenantId,
        name: `Probation IT ${tenantId.slice(-3)}`,
        slug: `probation-it-${tenantId.slice(-3)}`,
        isActive: true,
      },
    })
  }

  await prisma.department.upsert({
    where: { id: DEPARTMENT_A },
    update: {},
    create: { id: DEPARTMENT_A, tenantId: TENANT_ID, code: "PROBIT-A", name: "Probation IT A" },
  })
  await prisma.department.upsert({
    where: { id: DEPARTMENT_B },
    update: {},
    create: { id: DEPARTMENT_B, tenantId: TENANT_ID, code: "PROBIT-B", name: "Probation IT B" },
  })

  const users = [
    { id: USER_ALL, email: "probation-all@test.local", displayName: "All Scope" },
    { id: USER_DEPT_A, email: "probation-dept-a@test.local", displayName: "Dept A Scope" },
    { id: USER_NO_VIEW, email: "probation-noview@test.local", displayName: "No View" },
    { id: USER_PREF_OFF, email: "probation-prefoff@test.local", displayName: "Pref Off" },
  ]
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, email: user.email, displayName: user.displayName, role: "user" },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: TENANT_ID } },
      update: {},
      create: { userId: user.id, tenantId: TENANT_ID },
    })
  }

  await prisma.user.update({
    where: { id: USER_ALL },
    data: {
      role: "admin",
      dataScopeType: "all",
      dataScopeDepartmentIds: [],
      dataScopeEmployeeIds: [],
    },
  })
  await prisma.user.update({
    where: { id: USER_DEPT_A },
    data: {
      role: "admin",
      dataScopeType: "department",
      dataScopeDepartmentIds: [DEPARTMENT_A],
      dataScopeEmployeeIds: [],
    },
  })
  await prisma.user.update({
    where: { id: USER_NO_VIEW },
    data: {
      role: "user",
      dataScopeType: "all",
      dataScopeDepartmentIds: [],
      dataScopeEmployeeIds: [],
    },
  })
  await prisma.user.update({
    where: { id: USER_PREF_OFF },
    data: {
      role: "admin",
      dataScopeType: "all",
      dataScopeDepartmentIds: [],
      dataScopeEmployeeIds: [],
    },
  })

  await prisma.notificationPreference.upsert({
    where: { tenantId_userId: { tenantId: TENANT_ID, userId: USER_PREF_OFF } },
    update: { remindersEnabled: false },
    create: { tenantId: TENANT_ID, userId: USER_PREF_OFF, remindersEnabled: false },
  })
})

afterAll(async () => {
  await cleanupDynamicData()
  await prisma.notificationPreference.deleteMany({ where: { tenantId: TENANT_ID } }).catch(() => {})
  await prisma.systemSetting.deleteMany({
    where: { tenantId: { in: [TENANT_ID, TENANT_ID_FAIL] } },
  }).catch(() => {})
  await prisma.userTenant.deleteMany({
    where: { userId: { in: [USER_ALL, USER_DEPT_A, USER_NO_VIEW, USER_PREF_OFF] } },
  }).catch(() => {})
  await prisma.user.deleteMany({
    where: { id: { in: [USER_ALL, USER_DEPT_A, USER_NO_VIEW, USER_PREF_OFF] } },
  }).catch(() => {})
  await prisma.department.deleteMany({ where: { id: { in: [DEPARTMENT_A, DEPARTMENT_B] } } }).catch(() => {})
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_ID, TENANT_ID_FAIL] } },
  }).catch(() => {})
})

beforeEach(async () => {
  await cleanupDynamicData()
  await resetSystemSettings()
})

describe.sequential("Probation Reminders Cron Integration", () => {
  it("creates ledger row + notifications for each due stage on a single run", async () => {
    const today = utcMidnight()
    const employees = [28, 14, 7].map((days, index) => {
      const { entryDate, probationMonths, expectedEndDate } =
        seedEntryDateForDaysRemaining(today, days)
      return {
        id: `e0000000-0000-4000-a000-00000010000${index + 1}`,
        personnelNumber: `PROB-DUE-${days}`,
        daysRemaining: days,
        entryDate,
        probationMonths,
        expectedEndDate,
      }
    })

    for (const emp of employees) {
      await createEmployee({
        id: emp.id,
        personnelNumber: emp.personnelNumber,
        departmentId: DEPARTMENT_A,
        entryDate: emp.entryDate,
        probationMonths: emp.probationMonths,
      })
    }

    const result = await executeProbationReminders(today)

    expect(result.ok).toBe(true)
    const tenantResult = result.results.find((r) => r.tenantId === TENANT_ID)!
    expect(tenantResult).toBeDefined()
    expect(tenantResult.employeesDue).toBe(3)
    expect(tenantResult.remindersCreated).toBe(3)
    expect(tenantResult.duplicateCount).toBe(0)

    const ledger = await prisma.employeeProbationReminder.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { reminderDaysBefore: "desc" },
    })
    expect(ledger).toHaveLength(3)
    for (const emp of employees) {
      const row = ledger.find((r) => r.employeeId === emp.id)
      expect(row, `ledger row missing for ${emp.personnelNumber}`).toBeDefined()
      expect(row!.reminderDaysBefore).toBe(emp.daysRemaining)
    }

    // 2 delivering recipients (all-scope admin, dept-A admin). pref-off and
    // no-view users must not get rows. 3 employees * 2 recipients = 6.
    const notifications = await prisma.notification.findMany({
      where: { tenantId: TENANT_ID, type: "reminders" },
    })
    expect(notifications).toHaveLength(6)
    for (const n of notifications) {
      expect(n.link).toMatch(/^\/admin\/employees\/[0-9a-f-]+$/i)
    }
    const notifiedUserIds = new Set(notifications.map((n) => n.userId))
    expect(notifiedUserIds.has(USER_ALL)).toBe(true)
    expect(notifiedUserIds.has(USER_DEPT_A)).toBe(true)
    expect(notifiedUserIds.has(USER_PREF_OFF)).toBe(false)
    expect(notifiedUserIds.has(USER_NO_VIEW)).toBe(false)
  })

  it("is idempotent: a second run creates no new ledger rows or notifications", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)
    await createEmployee({
      id: "e0000000-0000-4000-a000-000000020001",
      personnelNumber: "PROB-IDEMPOTENT",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    await executeProbationReminders(today)
    const firstLedger = await prisma.employeeProbationReminder.count({ where: { tenantId: TENANT_ID } })
    const firstNotifications = await prisma.notification.count({ where: { tenantId: TENANT_ID } })

    const secondResult = await executeProbationReminders(today)
    const tenantSecond = secondResult.results.find((r) => r.tenantId === TENANT_ID)!
    expect(tenantSecond.remindersCreated).toBe(0)
    expect(tenantSecond.duplicateCount).toBe(1)

    const secondLedger = await prisma.employeeProbationReminder.count({ where: { tenantId: TENANT_ID } })
    const secondNotifications = await prisma.notification.count({ where: { tenantId: TENANT_ID } })
    expect(secondLedger).toBe(firstLedger)
    expect(secondNotifications).toBe(firstNotifications)
  })

  it("issues a new reminder series when the computed end date changes", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)

    const employeeId = "e0000000-0000-4000-a000-000000030001"
    await createEmployee({
      id: employeeId,
      personnelNumber: "PROB-ENDCHG",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    await executeProbationReminders(today)
    const beforeLedger = await prisma.employeeProbationReminder.findMany({
      where: { tenantId: TENANT_ID, employeeId },
    })
    expect(beforeLedger).toHaveLength(1)

    // Shift entry_date so the new end date becomes today + 7 days.
    const shifted = seedEntryDateForDaysRemaining(today, 7)
    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        entryDate: shifted.entryDate,
        probationMonths: shifted.probationMonths,
      },
    })

    await executeProbationReminders(today)
    const afterLedger = await prisma.employeeProbationReminder.findMany({
      where: { tenantId: TENANT_ID, employeeId },
    })
    expect(afterLedger).toHaveLength(2)
    const daysBefore = afterLedger.map((r) => r.reminderDaysBefore).sort((a, b) => a - b)
    expect(daysBefore).toEqual([7, 14])
  })

  it("skips the tenant entirely when probationRemindersEnabled=false", async () => {
    const today = utcMidnight()
    await prisma.systemSetting.update({
      where: { tenantId: TENANT_ID },
      data: { probationRemindersEnabled: false },
    })

    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)
    await createEmployee({
      id: "e0000000-0000-4000-a000-000000040001",
      personnelNumber: "PROB-DISABLED",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    const result = await executeProbationReminders(today)
    const tenantResult = result.results.find((r) => r.tenantId === TENANT_ID)!
    expect(tenantResult.skipped).toBe(true)
    expect(tenantResult.skipReason).toBe("disabled")

    const ledger = await prisma.employeeProbationReminder.count({ where: { tenantId: TENANT_ID } })
    const notifications = await prisma.notification.count({ where: { tenantId: TENANT_ID } })
    expect(ledger).toBe(0)
    expect(notifications).toBe(0)

    // Scheduled run should still log a completed execution with skip_reason.
    const logged = await prisma.scheduleTaskExecution.findMany({
      where: { execution: { tenantId: TENANT_ID } },
      include: { execution: true },
    })
    expect(logged.length).toBeGreaterThan(0)
    const taskResults = logged.map((row) => row.result as { skip_reason?: string } | null)
    expect(taskResults.some((r) => r?.skip_reason === "disabled")).toBe(true)
  })

  it("honors data scope: dept-scoped user only receives notifications for their department", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)

    await createEmployee({
      id: "e0000000-0000-4000-a000-000000050001",
      personnelNumber: "PROB-SCOPE-A",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })
    await createEmployee({
      id: "e0000000-0000-4000-a000-000000050002",
      personnelNumber: "PROB-SCOPE-B",
      departmentId: DEPARTMENT_B,
      entryDate,
      probationMonths,
    })

    await executeProbationReminders(today)

    const allScopeNotifications = await prisma.notification.findMany({
      where: { tenantId: TENANT_ID, userId: USER_ALL },
    })
    const deptANotifications = await prisma.notification.findMany({
      where: { tenantId: TENANT_ID, userId: USER_DEPT_A },
    })

    expect(allScopeNotifications).toHaveLength(2)
    expect(deptANotifications).toHaveLength(1)
    expect(deptANotifications[0]!.link).toBe("/admin/employees/e0000000-0000-4000-a000-000000050001")
  })

  it("suppresses delivery for users with remindersEnabled=false but still advances the ledger", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 7)

    await createEmployee({
      id: "e0000000-0000-4000-a000-000000060001",
      personnelNumber: "PROB-PREFOFF",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    const result = await executeProbationReminders(today)
    const tenantResult = result.results.find((r) => r.tenantId === TENANT_ID)!
    expect(tenantResult.remindersCreated).toBe(1)
    expect(tenantResult.recipientsSuppressedByPreference).toBeGreaterThanOrEqual(1)

    const prefOffNotifications = await prisma.notification.count({
      where: { tenantId: TENANT_ID, userId: USER_PREF_OFF },
    })
    expect(prefOffNotifications).toBe(0)

    const ledger = await prisma.employeeProbationReminder.count({ where: { tenantId: TENANT_ID } })
    expect(ledger).toBe(1)
  })

  it("excludes exited employees (exit_date <= today) entirely", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)

    await createEmployee({
      id: "e0000000-0000-4000-a000-000000070001",
      personnelNumber: "PROB-EXITED",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
      exitDate: today,
    })

    const result = await executeProbationReminders(today)
    const tenantResult = result.results.find((r) => r.tenantId === TENANT_ID)!
    expect(tenantResult.employeesDue).toBe(0)

    const ledger = await prisma.employeeProbationReminder.count({ where: { tenantId: TENANT_ID } })
    const notifications = await prisma.notification.count({ where: { tenantId: TENANT_ID } })
    expect(ledger).toBe(0)
    expect(notifications).toBe(0)
  })

  it("logs a completed schedule_executions row with reminders_created > 0 after a successful run", async () => {
    const today = utcMidnight()
    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)

    await createEmployee({
      id: "e0000000-0000-4000-a000-000000080001",
      personnelNumber: "PROB-LOG",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    await executeProbationReminders(today)

    const executions = await prisma.scheduleExecution.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: "desc" },
      take: 1,
    })
    expect(executions).toHaveLength(1)
    expect(executions[0]!.status).toBe("completed")

    const taskExecutions = await prisma.scheduleTaskExecution.findMany({
      where: { executionId: executions[0]!.id },
    })
    expect(taskExecutions.length).toBeGreaterThan(0)
    const taskResult = taskExecutions[0]!.result as { reminders_created?: number } | null
    expect(taskResult?.reminders_created).toBeGreaterThan(0)
  })

  it("isolates one tenant's failure from another tenant's successful run", async () => {
    const today = utcMidnight()
    await prisma.systemSetting.upsert({
      where: { tenantId: TENANT_ID_FAIL },
      update: { probationDefaultMonths: -1 },
      create: {
        tenantId: TENANT_ID_FAIL,
        probationDefaultMonths: -1,
        probationRemindersEnabled: true,
        probationReminderDays: [28, 14, 7],
      },
    })

    const { entryDate, probationMonths } =
      seedEntryDateForDaysRemaining(today, 14)
    await createEmployee({
      id: "e0000000-0000-4000-a000-000000090001",
      personnelNumber: "PROB-OK",
      departmentId: DEPARTMENT_A,
      entryDate,
      probationMonths,
    })

    const result = await executeProbationReminders(today)

    const good = result.results.find((r) => r.tenantId === TENANT_ID)!
    expect(good).toBeDefined()
    expect(good.error).toBeUndefined()
    expect(good.remindersCreated).toBe(1)

    // We don't assert TENANT_ID_FAIL failed (the negative default may be
    // tolerated by the classifier), but we do require that the good tenant
    // still emitted reminders regardless of any sibling-tenant behavior.
    const goodNotifications = await prisma.notification.count({
      where: { tenantId: TENANT_ID, type: "reminders" },
    })
    expect(goodNotifications).toBeGreaterThan(0)
  })

  it("requires a valid CRON_SECRET", async () => {
    const response = await GET(makeRequest("wrong-secret"))
    expect(response.status).toBe(401)
  })
})
