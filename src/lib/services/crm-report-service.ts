import type { PrismaClient } from "@/generated/prisma/client"
import { Prisma } from "@/generated/prisma/client"

// --- Helper ---

function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// --- Report Functions ---

export async function overview(prisma: PrismaClient, tenantId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = getStartOfWeek(now)

  const [
    totalAddresses,
    newAddressesThisMonth,
    openInquiries,
    pendingTasks,
    overdueTaskCount,
    correspondenceThisWeek,
  ] = await Promise.all([
    prisma.crmAddress.count({ where: { tenantId } }),
    prisma.crmAddress.count({
      where: { tenantId, createdAt: { gte: startOfMonth } },
    }),
    prisma.crmInquiry.count({
      where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        type: "TASK",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        type: "TASK",
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lt: now },
      },
    }),
    prisma.crmCorrespondence.count({
      where: { tenantId, date: { gte: startOfWeek } },
    }),
  ])

  return {
    totalAddresses,
    newAddressesThisMonth,
    openInquiries,
    pendingTasks,
    overdueTaskCount,
    correspondenceThisWeek,
  }
}

export async function addressStats(
  prisma: PrismaClient,
  tenantId: string,
  params: { type?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.type) where.type = params.type

  const [byType, active, inactive, total] = await Promise.all([
    prisma.crmAddress.groupBy({
      by: ["type"],
      where: where as Prisma.CrmAddressWhereInput,
      _count: true,
    }),
    prisma.crmAddress.count({
      where: { ...where, isActive: true } as Prisma.CrmAddressWhereInput,
    }),
    prisma.crmAddress.count({
      where: { ...where, isActive: false } as Prisma.CrmAddressWhereInput,
    }),
    prisma.crmAddress.count({
      where: where as Prisma.CrmAddressWhereInput,
    }),
  ])

  return {
    total,
    byType: byType.map((g) => ({ type: g.type, count: g._count })),
    active,
    inactive,
  }
}

export async function correspondenceByPeriod(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string; groupBy: "day" | "week" | "month" }
) {
  const truncUnit = params.groupBy === "day" ? "day" : params.groupBy === "week" ? "week" : "month"

  const rows = await prisma.$queryRaw<
    Array<{
      period: Date
      direction: string
      count: bigint
    }>
  >(
    Prisma.sql`
      SELECT
        date_trunc(${truncUnit}, date) AS period,
        direction,
        COUNT(*)::int AS count
      FROM crm_correspondences
      WHERE tenant_id = ${tenantId}::uuid
        AND date >= ${new Date(params.dateFrom)}
        AND date <= ${new Date(params.dateTo)}
      GROUP BY period, direction
      ORDER BY period
    `
  )

  // Pivot rows by period
  const periodMap = new Map<
    string,
    { period: string; incoming: number; outgoing: number; internal: number; total: number }
  >()

  for (const row of rows) {
    const key = row.period.toISOString().slice(0, 10)
    if (!periodMap.has(key)) {
      periodMap.set(key, { period: key, incoming: 0, outgoing: 0, internal: 0, total: 0 })
    }
    const entry = periodMap.get(key)!
    const count = Number(row.count)
    if (row.direction === "INCOMING") entry.incoming += count
    else if (row.direction === "OUTGOING") entry.outgoing += count
    else if (row.direction === "INTERNAL") entry.internal += count
    entry.total += count
  }

  return { periods: Array.from(periodMap.values()) }
}

export async function correspondenceByType(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string }
) {
  const where = {
    tenantId,
    date: { gte: new Date(params.dateFrom), lte: new Date(params.dateTo) },
  }

  const groups = await prisma.crmCorrespondence.groupBy({
    by: ["type"],
    where,
    _count: true,
  })

  return {
    byType: groups.map((g) => ({ type: g.type, count: g._count })),
  }
}

export async function inquiryPipeline(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {} as Record<string, unknown>
    if (params.dateFrom)
      (where.createdAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo)
      (where.createdAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const [byStatus, closedInquiries, topAddressRows] = await Promise.all([
    prisma.crmInquiry.groupBy({
      by: ["status"],
      where: where as Prisma.CrmInquiryWhereInput,
      _count: true,
    }),
    prisma.crmInquiry.findMany({
      where: {
        ...where,
        status: "CLOSED",
        closedAt: { not: null },
      } as Prisma.CrmInquiryWhereInput,
      select: { createdAt: true, closedAt: true },
    }),
    prisma.crmInquiry.groupBy({
      by: ["addressId"],
      where: where as Prisma.CrmInquiryWhereInput,
      _count: true,
      orderBy: { _count: { addressId: "desc" } },
      take: 10,
    }),
  ])

  // Calculate avgDaysToClose
  let avgDaysToClose: number | null = null
  if (closedInquiries.length > 0) {
    const totalDays = closedInquiries.reduce((sum, inq) => {
      const diffMs = inq.closedAt!.getTime() - inq.createdAt.getTime()
      return sum + diffMs / (1000 * 60 * 60 * 24)
    }, 0)
    avgDaysToClose = Math.round((totalDays / closedInquiries.length) * 10) / 10
  }

  // Fetch address names for top addresses
  const addressIds = topAddressRows.map((r) => r.addressId)
  const addresses =
    addressIds.length > 0
      ? await prisma.crmAddress.findMany({
          where: { id: { in: addressIds } },
          select: { id: true, company: true },
        })
      : []
  const addressMap = Object.fromEntries(addresses.map((a) => [a.id, a.company]))

  return {
    byStatus: byStatus.map((g) => ({ status: g.status, count: g._count })),
    avgDaysToClose,
    topAddresses: topAddressRows.map((r) => ({
      addressId: r.addressId,
      company: addressMap[r.addressId] ?? "Unknown",
      count: r._count,
    })),
  }
}

export async function inquiryByEffort(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {} as Record<string, unknown>
    if (params.dateFrom)
      (where.createdAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo)
      (where.createdAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const groups = await prisma.crmInquiry.groupBy({
    by: ["effort"],
    where: where as Prisma.CrmInquiryWhereInput,
    _count: true,
  })

  return {
    byEffort: groups.map((g) => ({
      effort: g.effort ?? "Unbekannt",
      count: g._count,
    })),
  }
}

export async function taskCompletion(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  const where: Record<string, unknown> = { tenantId, type: "TASK" as const }
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {} as Record<string, unknown>
    if (params.dateFrom)
      (where.createdAt as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo)
      (where.createdAt as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const now = new Date()

  const [total, completed, cancelled, overdue, completedTasks] = await Promise.all([
    prisma.crmTask.count({ where: where as Prisma.CrmTaskWhereInput }),
    prisma.crmTask.count({
      where: { ...where, status: "COMPLETED" } as Prisma.CrmTaskWhereInput,
    }),
    prisma.crmTask.count({
      where: { ...where, status: "CANCELLED" } as Prisma.CrmTaskWhereInput,
    }),
    prisma.crmTask.count({
      where: {
        ...where,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueAt: { lt: now },
      } as Prisma.CrmTaskWhereInput,
    }),
    prisma.crmTask.findMany({
      where: {
        ...where,
        status: "COMPLETED",
        completedAt: { not: null },
      } as Prisma.CrmTaskWhereInput,
      select: { createdAt: true, completedAt: true },
    }),
  ])

  // Calculate avg completion days
  let avgCompletionDays: number | null = null
  if (completedTasks.length > 0) {
    const totalDays = completedTasks.reduce((sum, t) => {
      const diffMs = t.completedAt!.getTime() - t.createdAt.getTime()
      return sum + diffMs / (1000 * 60 * 60 * 24)
    }, 0)
    avgCompletionDays = Math.round((totalDays / completedTasks.length) * 10) / 10
  }

  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0

  return { total, completed, cancelled, overdue, completionRate, avgCompletionDays }
}

export async function tasksByAssignee(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom?: string; dateTo?: string } = {}
) {
  // Build optional date filter
  let dateFilter = Prisma.sql``
  if (params.dateFrom && params.dateTo) {
    dateFilter = Prisma.sql`AND t.created_at >= ${new Date(params.dateFrom)} AND t.created_at <= ${new Date(params.dateTo)}`
  } else if (params.dateFrom) {
    dateFilter = Prisma.sql`AND t.created_at >= ${new Date(params.dateFrom)}`
  } else if (params.dateTo) {
    dateFilter = Prisma.sql`AND t.created_at <= ${new Date(params.dateTo)}`
  }

  const rows = await prisma.$queryRaw<
    Array<{
      employee_id: string
      first_name: string
      last_name: string
      total: number
      completed: number
      open: number
    }>
  >(
    Prisma.sql`
      SELECT
        a.employee_id,
        e.first_name,
        e.last_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE t.status IN ('OPEN', 'IN_PROGRESS'))::int AS open
      FROM crm_task_assignees a
      JOIN crm_tasks t ON t.id = a.task_id
      JOIN employees e ON e.id = a.employee_id
      WHERE t.tenant_id = ${tenantId}::uuid
        AND t.type = 'TASK'
        AND a.employee_id IS NOT NULL
        ${dateFilter}
      GROUP BY a.employee_id, e.first_name, e.last_name
      ORDER BY total DESC
    `
  )

  return {
    assignees: rows.map((r) => ({
      employeeId: r.employee_id,
      name: `${r.first_name} ${r.last_name}`,
      total: r.total,
      completed: r.completed,
      open: r.open,
    })),
  }
}
