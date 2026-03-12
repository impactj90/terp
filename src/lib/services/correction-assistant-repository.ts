/**
 * Correction Assistant Repository
 *
 * Pure Prisma data-access functions for CorrectionMessage and related models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

export async function countMessages(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.correctionMessage.count({ where: { tenantId } })
}

export async function createManyMessages(
  prisma: PrismaClient,
  data: {
    tenantId: string
    code: string
    defaultText: string
    severity: string
    description: string
  }[]
) {
  return prisma.correctionMessage.createMany({ data })
}

export async function findManyMessages(
  prisma: PrismaClient,
  tenantId: string,
  params?: { severity?: string; isActive?: boolean; code?: string }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.severity !== undefined) {
    where.severity = params.severity
  }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params?.code !== undefined) {
    where.code = params.code
  }

  return prisma.correctionMessage.findMany({
    where,
    orderBy: [{ severity: "asc" }, { code: "asc" }],
  })
}

export async function findMessageById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.correctionMessage.findFirst({
    where: { id, tenantId },
  })
}

export async function updateMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.correctionMessage.findFirst({ where: { id, tenantId } })
  if (!existing) {
    return null
  }
  return prisma.correctionMessage.update({ where: { id }, data })
}

export async function findActiveMessages(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.correctionMessage.findMany({
    where: { tenantId, isActive: true },
  })
}

export async function findDailyValuesWithErrors(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: Date
    toDate: Date
    employeeId?: string
    departmentId?: string
  }
) {
  const dvWhere: Record<string, unknown> = {
    tenantId,
    hasError: true,
    valueDate: {
      gte: params.fromDate,
      lte: params.toDate,
    },
  }

  if (params.employeeId) {
    dvWhere.employeeId = params.employeeId
  }

  if (params.departmentId) {
    dvWhere.employee = { departmentId: params.departmentId }
  }

  return prisma.dailyValue.findMany({
    where: dvWhere,
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          departmentId: true,
          department: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { valueDate: "asc" },
  })
}
