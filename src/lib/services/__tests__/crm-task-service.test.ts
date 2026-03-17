import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-task-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
const TEAM_ID = "f0000000-0000-4000-a000-000000000001"
const TASK_ID = "c6000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const INQUIRY_ID = "c5000000-0000-4000-a000-000000000099"

const mockTask = {
  id: TASK_ID,
  tenantId: TENANT_ID,
  type: "TASK" as const,
  subject: "Test Task",
  description: "Test description",
  addressId: ADDRESS_ID,
  contactId: null,
  inquiryId: null,
  status: "OPEN" as const,
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
      id: "a1000000-0000-4000-a000-000000000001",
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

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  const txMock = {
    crmTask: {
      create: vi.fn().mockResolvedValue(mockTask),
      findFirst: vi.fn().mockResolvedValue(mockTask),
    },
    crmTaskAssignee: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }

  return {
    crmTask: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    crmTaskAssignee: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    crmAddress: {
      findFirst: vi.fn(),
    },
    crmContact: {
      findFirst: vi.fn(),
    },
    crmInquiry: {
      findFirst: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: typeof txMock) => Promise<unknown>) =>
      fn(txMock)
    ),
    ...overrides,
  } as unknown as PrismaClient
}

describe("crm-task-service", () => {
  describe("create", () => {
    it("creates task with assignees in transaction", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: ADDRESS_ID,
        tenantId: TENANT_ID,
      })
      ;(prisma.employee.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EMPLOYEE_ID,
        user: null,
      })

      const result = await service.create(
        prisma,
        TENANT_ID,
        {
          type: "TASK",
          subject: "Test Task",
          addressId: ADDRESS_ID,
          assignees: [{ employeeId: EMPLOYEE_ID }],
        },
        USER_ID
      )

      expect(result).toBeDefined()
      expect(prisma.$transaction).toHaveBeenCalled()
    })

    it("sends notification to employee assignee with linked user", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: ADDRESS_ID,
        tenantId: TENANT_ID,
      })
      ;(prisma.employee.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EMPLOYEE_ID,
        user: { id: USER_ID },
      })

      await service.create(
        prisma,
        TENANT_ID,
        {
          type: "TASK",
          subject: "Notify Test",
          addressId: ADDRESS_ID,
          assignees: [{ employeeId: EMPLOYEE_ID }],
        },
        USER_ID
      )

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          type: "reminders",
          title: "Neue Aufgabe: Notify Test",
        }),
      })
    })

    it("sends notifications to team members", async () => {
      const prisma = createMockPrisma()
      ;(prisma.teamMember.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          employee: {
            id: EMPLOYEE_ID,
            user: { id: USER_ID },
          },
        },
      ])

      await service.create(
        prisma,
        TENANT_ID,
        {
          type: "TASK",
          subject: "Team Notify Test",
          assignees: [{ teamId: TEAM_ID }],
        },
        USER_ID
      )

      expect(prisma.notification.create).toHaveBeenCalled()
    })

    it("validates addressId belongs to tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            type: "TASK",
            subject: "Test",
            addressId: ADDRESS_ID,
            assignees: [{ employeeId: EMPLOYEE_ID }],
          },
          USER_ID
        )
      ).rejects.toThrow("Address not found in this tenant")
    })

    it("rejects if no assignees provided", async () => {
      const prisma = createMockPrisma()

      await expect(
        service.create(
          prisma,
          TENANT_ID,
          {
            type: "TASK",
            subject: "Test",
            assignees: [],
          },
          USER_ID
        )
      ).rejects.toThrow("At least one assignee is required")
    })

    it("creates MESSAGE type task without due date", async () => {
      const prisma = createMockPrisma()
      ;(prisma.employee.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EMPLOYEE_ID,
        user: null,
      })

      const result = await service.create(
        prisma,
        TENANT_ID,
        {
          type: "MESSAGE",
          subject: "Test Message",
          assignees: [{ employeeId: EMPLOYEE_ID }],
        },
        USER_ID
      )

      expect(result).toBeDefined()
      expect(prisma.$transaction).toHaveBeenCalled()
    })
  })

  describe("list", () => {
    it("returns paginated list", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockTask])
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      const result = await service.list(prisma, TENANT_ID, { page: 1, pageSize: 10 })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it("filters by status", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.list(prisma, TENANT_ID, { status: "OPEN", page: 1, pageSize: 10 })

      const callArgs = (prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callArgs.where.status).toBe("OPEN")
    })

    it("filters by addressId", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.list(prisma, TENANT_ID, { addressId: ADDRESS_ID, page: 1, pageSize: 10 })

      const callArgs = (prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callArgs.where.addressId).toBe(ADDRESS_ID)
    })

    it("searches by subject", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.list(prisma, TENANT_ID, { search: "Test", page: 1, pageSize: 10 })

      const callArgs = (prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callArgs.where.OR).toEqual([
        { subject: { contains: "Test", mode: "insensitive" } },
      ])
    })
  })

  describe("myTasks", () => {
    it("returns tasks for direct employee assignment", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockTask])
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)

      const result = await service.myTasks(prisma, TENANT_ID, EMPLOYEE_ID, { page: 1, pageSize: 10 })

      expect(result.items).toHaveLength(1)
      const callArgs = (prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(callArgs.where.assignees.some.OR).toBeDefined()
    })

    it("rejects if employeeId is null", async () => {
      const prisma = createMockPrisma()

      await expect(
        service.myTasks(prisma, TENANT_ID, null, { page: 1, pageSize: 10 })
      ).rejects.toThrow("No employee record linked to current user")
    })
  })

  describe("getById", () => {
    it("returns task with full relations", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask)

      const result = await service.getById(prisma, TENANT_ID, TASK_ID)

      expect(result.id).toBe(TASK_ID)
      expect(result.subject).toBe("Test Task")
    })

    it("throws CrmTaskNotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.getById(prisma, TENANT_ID, TASK_ID)
      ).rejects.toThrow("CRM task not found")
    })
  })

  describe("update", () => {
    it("updates task fields", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockTask, subject: "Updated", status: "IN_PROGRESS" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.update(prisma, TENANT_ID, {
        id: TASK_ID,
        subject: "Updated",
      })

      expect(result!.subject).toBe("Updated")
    })

    it("rejects update when COMPLETED", async () => {
      const prisma = createMockPrisma()
      const completedTask = { ...mockTask, status: "COMPLETED" }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(completedTask)

      await expect(
        service.update(prisma, TENANT_ID, { id: TASK_ID, subject: "Updated" })
      ).rejects.toThrow("Cannot update a completed task")
    })

    it("rejects update when CANCELLED", async () => {
      const prisma = createMockPrisma()
      const cancelledTask = { ...mockTask, status: "CANCELLED" }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(cancelledTask)

      await expect(
        service.update(prisma, TENANT_ID, { id: TASK_ID, subject: "Updated" })
      ).rejects.toThrow("Cannot update a cancelled task")
    })

    it("auto-transitions from OPEN to IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockTask) // OPEN
        .mockResolvedValueOnce({ ...mockTask, status: "IN_PROGRESS" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.update(prisma, TENANT_ID, {
        id: TASK_ID,
        description: "Updated description",
      })

      expect(prisma.crmTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "IN_PROGRESS",
          }),
        })
      )
    })
  })

  describe("complete", () => {
    it("sets status, completedAt, completedById", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockTask, status: "COMPLETED" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.complete(prisma, TENANT_ID, TASK_ID, USER_ID)

      expect(prisma.crmTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "COMPLETED",
            completedById: USER_ID,
          }),
        })
      )
    })

    it("rejects if already completed", async () => {
      const prisma = createMockPrisma()
      const completed = { ...mockTask, status: "COMPLETED" }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(completed)

      await expect(
        service.complete(prisma, TENANT_ID, TASK_ID, USER_ID)
      ).rejects.toThrow("Task is already completed")
    })

    it("rejects if cancelled", async () => {
      const prisma = createMockPrisma()
      const cancelled = { ...mockTask, status: "CANCELLED" }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(cancelled)

      await expect(
        service.complete(prisma, TENANT_ID, TASK_ID, USER_ID)
      ).rejects.toThrow("Cannot complete a cancelled task")
    })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce({ ...mockTask, status: "CANCELLED" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.cancel(prisma, TENANT_ID, TASK_ID)

      expect(prisma.crmTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELLED" }),
        })
      )
    })

    it("rejects if already completed or cancelled", async () => {
      const prisma = createMockPrisma()
      const completed = { ...mockTask, status: "COMPLETED" }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(completed)

      await expect(
        service.cancel(prisma, TENANT_ID, TASK_ID)
      ).rejects.toThrow("Cannot cancel a task that is already completed or cancelled")
    })
  })

  describe("reopen", () => {
    it("sets status from COMPLETED to IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      const completed = { ...mockTask, status: "COMPLETED", completedAt: new Date(), completedById: USER_ID }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(completed)
        .mockResolvedValueOnce({ ...mockTask, status: "IN_PROGRESS" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.reopen(prisma, TENANT_ID, TASK_ID)

      expect(prisma.crmTask.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "IN_PROGRESS",
            completedAt: null,
            completedById: null,
          }),
        })
      )
    })

    it("clears completedAt and completedById", async () => {
      const prisma = createMockPrisma()
      const completed = { ...mockTask, status: "COMPLETED", completedAt: new Date(), completedById: USER_ID }
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(completed)
        .mockResolvedValueOnce({ ...mockTask, status: "IN_PROGRESS" })
      ;(prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.reopen(prisma, TENANT_ID, TASK_ID)

      const updateCall = (prisma.crmTask.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(updateCall.data.completedAt).toBeNull()
      expect(updateCall.data.completedById).toBeNull()
    })

    it("rejects if not completed or cancelled", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask) // OPEN

      await expect(
        service.reopen(prisma, TENANT_ID, TASK_ID)
      ).rejects.toThrow("Can only reopen completed or cancelled tasks")
    })
  })

  describe("markRead", () => {
    it("updates readAt for the assignee", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockTask)
      ;(prisma.crmTaskAssignee.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.markRead(prisma, TENANT_ID, TASK_ID, EMPLOYEE_ID)

      expect(prisma.crmTaskAssignee.updateMany).toHaveBeenCalledWith({
        where: { taskId: TASK_ID, employeeId: EMPLOYEE_ID },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      })
    })

    it("throws not found if task does not exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.markRead(prisma, TENANT_ID, TASK_ID, EMPLOYEE_ID)
      ).rejects.toThrow("CRM task not found")
    })
  })

  describe("remove", () => {
    it("deletes task", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await expect(service.remove(prisma, TENANT_ID, TASK_ID)).resolves.not.toThrow()
    })

    it("throws not found when task does not exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      await expect(
        service.remove(prisma, TENANT_ID, TASK_ID)
      ).rejects.toThrow("CRM task not found")
    })
  })
})
