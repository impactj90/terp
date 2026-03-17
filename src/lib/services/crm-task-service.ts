import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-task-repository"

// --- Error Classes ---

export class CrmTaskNotFoundError extends Error {
  constructor(message = "CRM task not found") {
    super(message)
    this.name = "CrmTaskNotFoundError"
  }
}

export class CrmTaskValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmTaskValidationError"
  }
}

export class CrmTaskConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmTaskConflictError"
  }
}

// --- Task Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    inquiryId?: string
    assigneeId?: string
    status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
    type?: "TASK" | "MESSAGE"
    search?: string
    page: number
    pageSize: number
  }
) {
  return repo.findMany(prisma, tenantId, {
    ...params,
    assigneeEmployeeId: params.assigneeId,
  })
}

export async function myTasks(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string | null | undefined,
  params: {
    status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
    type?: "TASK" | "MESSAGE"
    page: number
    pageSize: number
  }
) {
  if (!employeeId) {
    throw new CrmTaskValidationError(
      "No employee record linked to current user"
    )
  }
  return repo.findMyTasks(prisma, tenantId, employeeId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const task = await repo.findById(prisma, tenantId, id)
  if (!task) {
    throw new CrmTaskNotFoundError()
  }
  return task
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type: "TASK" | "MESSAGE"
    subject: string
    description?: string
    addressId?: string
    contactId?: string
    inquiryId?: string
    dueAt?: string
    dueTime?: string
    durationMin?: number
    attachments?: Array<{ name: string; url: string; size: number; mimeType: string }>
    assignees: Array<{ employeeId?: string; teamId?: string }>
  },
  createdById: string
) {
  // Validate at least one assignee
  if (!input.assignees || input.assignees.length === 0) {
    throw new CrmTaskValidationError("At least one assignee is required")
  }

  // Validate address belongs to tenant (if provided)
  if (input.addressId) {
    const address = await prisma.crmAddress.findFirst({
      where: { id: input.addressId, tenantId },
    })
    if (!address) {
      throw new CrmTaskValidationError("Address not found in this tenant")
    }
  }

  // Validate contact belongs to address (if both provided)
  if (input.contactId && input.addressId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new CrmTaskValidationError("Contact not found for this address")
    }
  }

  // Validate inquiry belongs to tenant (if provided)
  if (input.inquiryId) {
    const inquiry = await prisma.crmInquiry.findFirst({
      where: { id: input.inquiryId, tenantId },
    })
    if (!inquiry) {
      throw new CrmTaskValidationError("Inquiry not found in this tenant")
    }
  }

  const task = await repo.create(
    prisma,
    {
      tenantId,
      type: input.type,
      subject: input.subject,
      description: input.description || null,
      addressId: input.addressId || null,
      contactId: input.contactId || null,
      inquiryId: input.inquiryId || null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      dueTime: input.dueTime || null,
      durationMin: input.durationMin || null,
      attachments: input.attachments || null,
      createdById,
    },
    input.assignees.map((a) => ({
      employeeId: a.employeeId || null,
      teamId: a.teamId || null,
    }))
  )

  // Send notifications (best-effort)
  try {
    await sendAssigneeNotifications(
      prisma,
      tenantId,
      input.subject,
      input.assignees
    )
  } catch (err) {
    console.warn("Failed to send task notifications:", err)
  }

  return task
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    subject?: string
    description?: string | null
    addressId?: string | null
    contactId?: string | null
    inquiryId?: string | null
    dueAt?: string | null
    dueTime?: string | null
    durationMin?: number | null
    attachments?: Array<{ name: string; url: string; size: number; mimeType: string }> | null
    assignees?: Array<{ employeeId?: string; teamId?: string }>
  }
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmTaskNotFoundError()
  }

  if (existing.status === "COMPLETED") {
    throw new CrmTaskValidationError("Cannot update a completed task")
  }

  if (existing.status === "CANCELLED") {
    throw new CrmTaskValidationError("Cannot update a cancelled task")
  }

  const data: Record<string, unknown> = {}

  if (input.subject !== undefined) data.subject = input.subject
  if (input.description !== undefined) data.description = input.description
  if (input.addressId !== undefined) data.addressId = input.addressId
  if (input.contactId !== undefined) data.contactId = input.contactId
  if (input.inquiryId !== undefined) data.inquiryId = input.inquiryId
  if (input.dueAt !== undefined) {
    data.dueAt = input.dueAt ? new Date(input.dueAt) : null
  }
  if (input.dueTime !== undefined) data.dueTime = input.dueTime
  if (input.durationMin !== undefined) data.durationMin = input.durationMin
  if (input.attachments !== undefined) data.attachments = input.attachments

  // Auto-transition from OPEN to IN_PROGRESS on first update
  if (existing.status === "OPEN" && Object.keys(data).length > 0) {
    data.status = "IN_PROGRESS"
  }

  // Update assignees if provided
  if (input.assignees) {
    await repo.updateAssignees(
      prisma,
      input.id,
      input.assignees.map((a) => ({
        employeeId: a.employeeId || null,
        teamId: a.teamId || null,
      }))
    )
  }

  if (Object.keys(data).length === 0 && !input.assignees) {
    return existing
  }

  if (Object.keys(data).length > 0) {
    return repo.update(prisma, tenantId, input.id, data)
  }

  // Only assignees updated, re-fetch
  return repo.findById(prisma, tenantId, input.id)
}

export async function complete(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  completedById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmTaskNotFoundError()
  }

  if (existing.status === "COMPLETED") {
    throw new CrmTaskConflictError("Task is already completed")
  }

  if (existing.status === "CANCELLED") {
    throw new CrmTaskValidationError("Cannot complete a cancelled task")
  }

  return repo.update(prisma, tenantId, id, {
    status: "COMPLETED",
    completedAt: new Date(),
    completedById,
  })
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmTaskNotFoundError()
  }

  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new CrmTaskValidationError(
      "Cannot cancel a task that is already completed or cancelled"
    )
  }

  return repo.update(prisma, tenantId, id, {
    status: "CANCELLED",
  })
}

export async function reopen(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmTaskNotFoundError()
  }

  if (existing.status !== "COMPLETED" && existing.status !== "CANCELLED") {
    throw new CrmTaskValidationError(
      "Can only reopen completed or cancelled tasks"
    )
  }

  return repo.update(prisma, tenantId, id, {
    status: "IN_PROGRESS",
    completedAt: null,
    completedById: null,
  })
}

export async function markRead(
  prisma: PrismaClient,
  tenantId: string,
  taskId: string,
  employeeId: string | null | undefined
) {
  if (!employeeId) {
    throw new CrmTaskValidationError(
      "No employee record linked to current user"
    )
  }

  const task = await repo.findById(prisma, tenantId, taskId)
  if (!task) {
    throw new CrmTaskNotFoundError()
  }

  await repo.markRead(prisma, taskId, employeeId)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) {
    throw new CrmTaskNotFoundError()
  }
}

// --- Internal helpers ---

async function sendAssigneeNotifications(
  prisma: PrismaClient,
  tenantId: string,
  subject: string,
  assignees: Array<{ employeeId?: string; teamId?: string }>
) {
  const notifiedUserIds = new Set<string>()

  for (const assignee of assignees) {
    if (assignee.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: assignee.employeeId, tenantId },
        include: { user: true },
      })
      if (employee?.user && !notifiedUserIds.has(employee.user.id)) {
        notifiedUserIds.add(employee.user.id)
        await prisma.notification.create({
          data: {
            tenantId,
            userId: employee.user.id,
            type: "reminders",
            title: `Neue Aufgabe: ${subject}`,
            message: "Sie haben eine neue Aufgabe erhalten.",
            link: "/crm/tasks",
          },
        })
      }
    }

    if (assignee.teamId) {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: assignee.teamId },
        include: { employee: { include: { user: true } } },
      })
      for (const member of teamMembers) {
        if (member.employee?.user && !notifiedUserIds.has(member.employee.user.id)) {
          notifiedUserIds.add(member.employee.user.id)
          await prisma.notification.create({
            data: {
              tenantId,
              userId: member.employee.user.id,
              type: "reminders",
              title: `Neue Aufgabe: ${subject}`,
              message: "Sie haben eine neue Aufgabe erhalten (Team-Zuweisung).",
              link: "/crm/tasks",
            },
          })
        }
      }
    }
  }
}
