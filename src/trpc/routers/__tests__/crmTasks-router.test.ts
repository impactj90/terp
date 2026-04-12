import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmTasksRouter } from "../crm/tasks"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

// --- Constants ---
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
const TASK_CREATE = permissionIdByKey("crm_tasks.create")!
const TASK_EDIT = permissionIdByKey("crm_tasks.edit")!
const TASK_DELETE = permissionIdByKey("crm_tasks.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const TASK_ID = "c6000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"

const createCaller = createCallerFactory(crmTasksRouter)

// --- Helpers ---

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [TASK_VIEW, TASK_CREATE, TASK_EDIT, TASK_DELETE]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      employeeId: EMPLOYEE_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

const mockTask = {
  id: TASK_ID,
  tenantId: TENANT_ID,
  type: "TASK",
  subject: "Test Task",
  description: "Test description",
  addressId: ADDRESS_ID,
  contactId: null,
  inquiryId: null,
  status: "OPEN",
  dueAt: new Date("2026-04-01"),
  dueTime: "14:00",
  durationMin: 60,
  attachments: null,
  completedAt: null,
  completedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  assignees: [
    {
      id: "a1",
      taskId: TASK_ID,
      employeeId: EMPLOYEE_ID,
      teamId: null,
      readAt: null,
      createdAt: new Date(),
      employee: { id: EMPLOYEE_ID, firstName: "Max", lastName: "Mustermann" },
      team: null,
    },
  ],
  address: { id: ADDRESS_ID, company: "Test GmbH", number: "K-1" },
  contact: null,
  inquiry: null,
}

// --- crm.tasks.list tests ---

describe("crm.tasks.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      crmTask: {
        findMany: vi.fn().mockResolvedValue([mockTask]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it("requires crm_tasks.view permission", async () => {
    const prisma = {
      crmTask: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createNoPermContext(prisma))

    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.tasks.myTasks tests ---

describe("crm.tasks.myTasks", () => {
  it("accessible to any authenticated user without special permission", async () => {
    const prisma = {
      crmTask: {
        findMany: vi.fn().mockResolvedValue([mockTask]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    // User has no task-specific permissions but is authenticated with CRM module
    const caller = createCaller(createTestContext(prisma, []))

    // myTasks doesn't require specific permissions
    const result = await caller.myTasks({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
  })

  it("delegates to myTasks service with employeeId", async () => {
    const prisma = {
      crmTask: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.myTasks({ page: 1, pageSize: 10 })

    expect(result.items).toHaveLength(0)
    const callArgs = prisma.crmTask.findMany.mock.calls[0]![0]
    expect(callArgs.where.assignees).toBeDefined()
  })
})

// --- crm.tasks.getById tests ---

describe("crm.tasks.getById", () => {
  it("returns single task with relations", async () => {
    const prisma = {
      crmTask: {
        findFirst: vi.fn().mockResolvedValue(mockTask),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: TASK_ID })

    expect(result.subject).toBe("Test Task")
    expect(result.address?.company).toBe("Test GmbH")
  })

  it("throws NOT_FOUND for missing task", async () => {
    const prisma = {
      crmTask: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.getById({ id: TASK_ID })
    ).rejects.toThrow("CRM task not found")
  })
})

// --- crm.tasks.create tests ---

describe("crm.tasks.create", () => {
  it("creates task with multiple assignees", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ id: ADDRESS_ID, tenantId: TENANT_ID }),
      },
      crmTask: {
        create: vi.fn().mockResolvedValue(mockTask),
        findFirst: vi.fn().mockResolvedValue(mockTask),
      },
      crmTaskAssignee: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID, user: null }),
      },
      teamMember: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        create: vi.fn(),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      type: "TASK",
      subject: "Test Task",
      addressId: ADDRESS_ID,
      assignees: [
        { employeeId: EMPLOYEE_ID },
        { teamId: "f0000000-0000-4000-a000-000000000001" },
      ],
    })

    expect(result!.id).toBe(TASK_ID)
  })

  it("requires crm_tasks.create permission", async () => {
    const prisma = {
      crmTask: {},
      crmAddress: {},
    }

    const caller = createCaller(createTestContext(prisma, [TASK_VIEW]))

    await expect(
      caller.create({
        subject: "Test",
        assignees: [{ employeeId: EMPLOYEE_ID }],
      })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.tasks.update tests ---

describe("crm.tasks.update", () => {
  it("updates existing task", async () => {
    const updated = { ...mockTask, subject: "Updated", status: "IN_PROGRESS" }
    const prisma = {
      crmTask: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockTask)
          .mockResolvedValueOnce(updated),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({ id: TASK_ID, subject: "Updated" })

    expect(result!.subject).toBe("Updated")
  })

  it("requires crm_tasks.edit permission", async () => {
    const prisma = { crmTask: {} }
    const caller = createCaller(createTestContext(prisma, [TASK_VIEW]))

    await expect(
      caller.update({ id: TASK_ID, subject: "Updated" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.tasks.complete tests ---

describe("crm.tasks.complete", () => {
  it("sets completedAt and status", async () => {
    const completedResult = { ...mockTask, status: "COMPLETED" }
    const prisma = {
      crmTask: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockTask)
          .mockResolvedValueOnce(completedResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.complete({ id: TASK_ID })

    expect(result!.status).toBe("COMPLETED")
  })
})

// --- crm.tasks.cancel tests ---

describe("crm.tasks.cancel", () => {
  it("sets status to CANCELLED", async () => {
    const cancelledResult = { ...mockTask, status: "CANCELLED" }
    const prisma = {
      crmTask: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockTask)
          .mockResolvedValueOnce(cancelledResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.cancel({ id: TASK_ID })

    expect(result!.status).toBe("CANCELLED")
  })
})

// --- crm.tasks.reopen tests ---

describe("crm.tasks.reopen", () => {
  it("reopens completed task", async () => {
    const reopenedResult = { ...mockTask, status: "IN_PROGRESS" }
    const prisma = {
      crmTask: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockTask, status: "COMPLETED" })
          .mockResolvedValueOnce(reopenedResult),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.reopen({ id: TASK_ID })

    expect(result!.status).toBe("IN_PROGRESS")
  })
})

// --- crm.tasks.markRead tests ---

describe("crm.tasks.markRead", () => {
  it("accessible to any authenticated user", async () => {
    const prisma = {
      crmTask: {
        findFirst: vi.fn().mockResolvedValue(mockTask),
      },
      crmTaskAssignee: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    // No task-specific permissions
    const caller = createCaller(createTestContext(prisma, []))
    const result = await caller.markRead({ id: TASK_ID })

    expect(result.success).toBe(true)
  })

  it("marks task as read for current user", async () => {
    const prisma = {
      crmTask: {
        findFirst: vi.fn().mockResolvedValue(mockTask),
      },
      crmTaskAssignee: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.markRead({ id: TASK_ID })

    expect(prisma.crmTaskAssignee.updateMany).toHaveBeenCalledWith({
      where: { taskId: TASK_ID, employeeId: EMPLOYEE_ID },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    })
  })
})

// --- crm.tasks.delete tests ---

describe("crm.tasks.delete", () => {
  it("deletes task and returns success", async () => {
    const prisma = {
      crmTask: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: TASK_ID })

    expect(result.success).toBe(true)
  })

  it("requires crm_tasks.delete permission", async () => {
    const prisma = { crmTask: {} }
    const caller = createCaller(createTestContext(prisma, [TASK_VIEW]))

    await expect(
      caller.delete({ id: TASK_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})
