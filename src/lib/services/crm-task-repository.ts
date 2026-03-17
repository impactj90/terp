import type { PrismaClient, CrmTaskStatus, CrmTaskType } from "@/generated/prisma/client"

// --- Standard include for task queries ---
const taskInclude = {
  assignees: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true } },
    },
  },
  address: { select: { id: true, company: true, number: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  inquiry: { select: { id: true, title: true, number: true } },
}

// --- Task Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    inquiryId?: string
    assigneeEmployeeId?: string
    status?: CrmTaskStatus
    type?: CrmTaskType
    search?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.addressId) {
    where.addressId = params.addressId
  }

  if (params.inquiryId) {
    where.inquiryId = params.inquiryId
  }

  if (params.assigneeEmployeeId) {
    where.assignees = {
      some: { employeeId: params.assigneeEmployeeId },
    }
  }

  if (params.status) {
    where.status = params.status
  }

  if (params.type) {
    where.type = params.type
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { subject: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.crmTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: taskInclude,
    }),
    prisma.crmTask.count({ where }),
  ])

  return { items, total }
}

export async function findMyTasks(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  params: {
    status?: CrmTaskStatus
    type?: CrmTaskType
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = {
    tenantId,
    assignees: {
      some: {
        OR: [
          { employeeId },
          { team: { members: { some: { employeeId } } } },
        ],
      },
    },
  }

  if (params.status) {
    where.status = params.status
  }

  if (params.type) {
    where.type = params.type
  }

  const [items, total] = await Promise.all([
    prisma.crmTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: taskInclude,
    }),
    prisma.crmTask.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmTask.findFirst({
    where: { id, tenantId },
    include: taskInclude,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    type: CrmTaskType
    subject: string
    description?: string | null
    addressId?: string | null
    contactId?: string | null
    inquiryId?: string | null
    status?: CrmTaskStatus
    dueAt?: Date | null
    dueTime?: string | null
    durationMin?: number | null
    attachments?: unknown
    createdById?: string | null
  },
  assignees: Array<{ employeeId?: string | null; teamId?: string | null }>
) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.crmTask.create({
      data: {
        tenantId: data.tenantId,
        type: data.type,
        subject: data.subject,
        description: data.description ?? null,
        addressId: data.addressId ?? null,
        contactId: data.contactId ?? null,
        inquiryId: data.inquiryId ?? null,
        status: data.status ?? "OPEN",
        dueAt: data.dueAt ?? null,
        dueTime: data.dueTime ?? null,
        durationMin: data.durationMin ?? null,
        attachments: data.attachments as never ?? undefined,
        createdById: data.createdById ?? null,
      },
    })

    if (assignees.length > 0) {
      await tx.crmTaskAssignee.createMany({
        data: assignees.map((a) => ({
          taskId: task.id,
          employeeId: a.employeeId ?? null,
          teamId: a.teamId ?? null,
        })),
      })
    }

    return tx.crmTask.findFirst({
      where: { id: task.id },
      include: taskInclude,
    })
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.crmTask.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.crmTask.findFirst({
    where: { id, tenantId },
    include: taskInclude,
  })
}

export async function updateAssignees(
  prisma: PrismaClient,
  taskId: string,
  assignees: Array<{ employeeId?: string | null; teamId?: string | null }>
) {
  await prisma.$transaction(async (tx) => {
    await tx.crmTaskAssignee.deleteMany({ where: { taskId } })
    if (assignees.length > 0) {
      await tx.crmTaskAssignee.createMany({
        data: assignees.map((a) => ({
          taskId,
          employeeId: a.employeeId ?? null,
          teamId: a.teamId ?? null,
        })),
      })
    }
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.crmTask.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function markRead(
  prisma: PrismaClient,
  taskId: string,
  employeeId: string
) {
  await prisma.crmTaskAssignee.updateMany({
    where: { taskId, employeeId },
    data: { readAt: new Date() },
  })
}
