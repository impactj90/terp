import type { PrismaClient, Prisma } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    employeeId?: string
    year?: number
    month?: number
    status?: string
    departmentId?: string
  },
) {
  const where: Prisma.OvertimePayoutWhereInput = { tenantId }

  if (params?.employeeId) where.employeeId = params.employeeId
  if (params?.year !== undefined) where.year = params.year
  if (params?.month !== undefined) where.month = params.month
  if (params?.status) where.status = params.status
  if (params?.departmentId) {
    where.employee = { departmentId: params.departmentId }
  }

  return prisma.overtimePayout.findMany({
    where,
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          personnelNumber: true,
          departmentId: true,
        },
      },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  return prisma.overtimePayout.findFirst({
    where: { id, tenantId },
  })
}

export async function findByEmployeeMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number,
) {
  return prisma.overtimePayout.findFirst({
    where: { tenantId, employeeId, year, month },
  })
}

export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    employeeId: string
    year: number
    month: number
    payoutMinutes: number
    status: string
    sourceFlextimeEnd: number
    tariffRuleSnapshot: Prisma.InputJsonValue
    approvedBy?: string | null
    approvedAt?: Date | null
  },
) {
  return (prisma as PrismaClient).overtimePayout.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Prisma.OvertimePayoutUpdateInput,
) {
  return prisma.overtimePayout.updateMany({
    where: { id, tenantId },
    data,
  })
}

export async function deleteByEmployeeMonth(
  prisma: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number,
) {
  return (prisma as PrismaClient).overtimePayout.deleteMany({
    where: { tenantId, employeeId, year, month },
  })
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
) {
  const { count } = await prisma.overtimePayout.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function countByStatus(
  prisma: PrismaClient,
  tenantId: string,
  status: string,
  params?: { year?: number; month?: number },
) {
  const where: Prisma.OvertimePayoutWhereInput = { tenantId, status }
  if (params?.year !== undefined) where.year = params.year
  if (params?.month !== undefined) where.month = params.month
  return prisma.overtimePayout.count({ where })
}

export async function aggregateApprovedMinutes(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  year: number,
  month: number,
) {
  const result = await prisma.overtimePayout.aggregate({
    where: { tenantId, employeeId, year, month, status: "approved" },
    _sum: { payoutMinutes: true },
  })
  return result._sum.payoutMinutes ?? 0
}

export async function batchFindByEmployeeMonth(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
  year: number,
  month: number,
): Promise<Map<string, { id: string; payoutMinutes: number; status: string }>> {
  const payouts = await prisma.overtimePayout.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, year, month },
    select: { id: true, employeeId: true, payoutMinutes: true, status: true },
  })
  return new Map(payouts.map(p => [p.employeeId, { id: p.id, payoutMinutes: p.payoutMinutes, status: p.status }]))
}
