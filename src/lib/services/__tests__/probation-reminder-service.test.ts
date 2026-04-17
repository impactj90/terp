import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { processTenantProbationReminders } from "../probation-reminder-service"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const DEPT_ID = "a0000000-0000-4000-a000-000000000200"
const OTHER_DEPT_ID = "a0000000-0000-4000-a000-000000000201"

const { mockFindDueProbationReminderCandidates, mockPublish } = vi.hoisted(() => ({
  mockFindDueProbationReminderCandidates: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../probation-repository", () => ({
  findDueProbationReminderCandidates: (...args: unknown[]) =>
    mockFindDueProbationReminderCandidates(...args),
}))

vi.mock("@/lib/pubsub/singleton", () => ({
  getHub: vi.fn().mockResolvedValue({
    publish: mockPublish,
  }),
}))

vi.mock("@/lib/pubsub/topics", () => ({
  userTopic: (id: string) => `user:${id}`,
}))

function makeAdminUser(
  overrides: Partial<{
    id: string
    dataScopeType: string
    dataScopeDepartmentIds: string[]
    dataScopeEmployeeIds: string[]
    notificationPreferences: Array<{ remindersEnabled: boolean }>
  }> = {}
) {
  return {
    id: "user-1",
    email: "admin@example.com",
    displayName: "Admin",
    role: "user",
    isActive: true,
    isLocked: false,
    deletedAt: null,
    dataScopeType: "all",
    dataScopeTenantIds: [],
    dataScopeDepartmentIds: [],
    dataScopeEmployeeIds: [],
    userGroup: {
      id: "group-1",
      tenantId: TENANT_ID,
      name: "Admins",
      code: "admins",
      permissions: [EMPLOYEES_VIEW],
      isSystem: false,
      isActive: true,
      isAdmin: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    userTenants: [],
    notificationPreferences: [{ remindersEnabled: true }],
    ...overrides,
  }
}

describe("processTenantProbationReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips tenants with disabled probation reminders", async () => {
    const prisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue({
          probationDefaultMonths: 6,
          probationRemindersEnabled: false,
          probationReminderDays: [28, 14, 7],
        }),
      },
    }

    const result = await processTenantProbationReminders(
      prisma as never,
      TENANT_ID,
      new Date("2026-04-17T00:00:00.000Z")
    )

    expect(result.skipped).toBe(true)
    expect(result.skipReason).toBe("disabled")
    expect(mockFindDueProbationReminderCandidates).not.toHaveBeenCalled()
  })

  it("suppresses duplicate reminder stages via the ledger unique key", async () => {
    mockFindDueProbationReminderCandidates.mockResolvedValue([
      {
        id: "employee-1",
        firstName: "Jane",
        lastName: "Doe",
        departmentId: DEPT_ID,
        departmentName: "Operations",
        entryDate: new Date("2026-01-01T00:00:00.000Z"),
        exitDate: null,
        probationMonths: 6,
        probationEndDate: new Date("2026-05-01T00:00:00.000Z"),
        daysRemaining: 14,
      },
    ])

    const prisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue({
          probationDefaultMonths: 6,
          probationRemindersEnabled: true,
          probationReminderDays: [28, 14, 7],
        }),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([makeAdminUser()]),
      },
      employeeProbationReminder: {
        create: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            {
              code: "P2002",
              clientVersion: "5.0.0",
              meta: { target: ["uq_emp_probation_reminder"] },
            }
          )
        ),
      },
      notification: {
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const result = await processTenantProbationReminders(
      prisma as never,
      TENANT_ID,
      new Date("2026-04-17T00:00:00.000Z")
    )

    expect(result.skipped).toBe(false)
    expect(result.duplicateCount).toBe(1)
    expect(result.remindersCreated).toBe(0)
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it("delivers reminders only to recipients with enabled preferences and matching scope", async () => {
    mockFindDueProbationReminderCandidates.mockResolvedValue([
      {
        id: "employee-1",
        firstName: "Jane",
        lastName: "Doe",
        departmentId: DEPT_ID,
        departmentName: "Operations",
        entryDate: new Date("2026-01-01T00:00:00.000Z"),
        exitDate: null,
        probationMonths: 6,
        probationEndDate: new Date("2026-05-01T00:00:00.000Z"),
        daysRemaining: 14,
      },
    ])

    const prisma = {
      systemSetting: {
        findUnique: vi.fn().mockResolvedValue({
          probationDefaultMonths: 6,
          probationRemindersEnabled: true,
          probationReminderDays: [28, 14, 7],
        }),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          makeAdminUser({ id: "user-visible" }),
          makeAdminUser({
            id: "user-pref-off",
            notificationPreferences: [{ remindersEnabled: false }],
          }),
          makeAdminUser({
            id: "user-other-scope",
            dataScopeType: "department",
            dataScopeDepartmentIds: [OTHER_DEPT_ID],
          }),
        ]),
      },
      employeeProbationReminder: {
        create: vi.fn().mockResolvedValue({ id: "ledger-1" }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: "notification-1" }),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const result = await processTenantProbationReminders(
      prisma as never,
      TENANT_ID,
      new Date("2026-04-17T00:00:00.000Z")
    )

    expect(result.skipped).toBe(false)
    expect(result.remindersCreated).toBe(1)
    expect(result.notificationsCreated).toBe(1)
    expect(result.recipientsNotified).toBe(1)
    expect(result.recipientsSuppressedByPreference).toBe(1)
    expect(result.recipientsSuppressedByScope).toBe(1)
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: "user-visible",
          type: "reminders",
          link: "/admin/employees/employee-1",
        }),
      })
    )
    expect(mockPublish).toHaveBeenCalledTimes(1)
  })
})
