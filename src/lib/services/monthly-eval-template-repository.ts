/**
 * Monthly Evaluation Template Repository
 *
 * Pure Prisma data-access functions for the MonthlyEvaluationTemplate model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params?: { isActive?: boolean }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return prisma.monthlyEvaluationTemplate.findMany({
    where,
    orderBy: { name: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.monthlyEvaluationTemplate.findFirst({
    where: { id, tenantId },
  })
}

export async function findDefault(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.monthlyEvaluationTemplate.findFirst({
    where: { tenantId, isDefault: true },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    description: string
    flextimeCapPositive: number
    flextimeCapNegative: number
    overtimeThreshold: number
    maxCarryoverVacation: number
    isDefault: boolean
    isActive: boolean
  }
) {
  if (data.isDefault) {
    return prisma.$transaction(async (tx: TxClient) => {
      await tx.monthlyEvaluationTemplate.updateMany({
        where: { tenantId: data.tenantId, isDefault: true },
        data: { isDefault: false },
      })
      return tx.monthlyEvaluationTemplate.create({ data })
    })
  }

  return prisma.monthlyEvaluationTemplate.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  setAsDefault: boolean
) {
  if (setAsDefault) {
    return prisma.$transaction(async (tx: TxClient) => {
      await tx.monthlyEvaluationTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      })
      const { count } = await tx.monthlyEvaluationTemplate.updateMany({
        where: { id, tenantId },
        data,
      })
      if (count === 0) return null
      return tx.monthlyEvaluationTemplate.findFirst({ where: { id, tenantId } })
    })
  }

  const { count } = await prisma.monthlyEvaluationTemplate.updateMany({
    where: { id, tenantId },
    data,
  })
  if (count === 0) return null
  return prisma.monthlyEvaluationTemplate.findFirst({ where: { id, tenantId } })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.monthlyEvaluationTemplate.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

export async function setDefault(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.$transaction(async (tx: TxClient) => {
    await tx.monthlyEvaluationTemplate.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    })
    const { count } = await tx.monthlyEvaluationTemplate.updateMany({
      where: { id, tenantId },
      data: { isDefault: true },
    })
    if (count === 0) return null
    return tx.monthlyEvaluationTemplate.findFirst({ where: { id, tenantId } })
  })
}
