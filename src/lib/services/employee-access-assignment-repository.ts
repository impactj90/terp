/**
 * Employee Access Assignment Repository
 *
 * Pure Prisma data-access functions for the EmployeeAccessAssignment model.
 */
import type { PrismaClient } from "@/generated/prisma/client"

const assignmentInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
  accessProfile: {
    select: { id: true, code: true, name: true },
  },
} as const

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  scopeWhere?: Record<string, unknown> | null
) {
  const where: Record<string, unknown> = { tenantId }
  if (scopeWhere) {
    if (scopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((scopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, scopeWhere)
    }
  }
  return prisma.employeeAccessAssignment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: assignmentInclude,
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.employeeAccessAssignment.findFirst({
    where: { id, tenantId },
    include: assignmentInclude,
  })
}

export async function findEmployeeForTenant(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true },
  })
}

export async function findAccessProfileForTenant(
  prisma: PrismaClient,
  tenantId: string,
  accessProfileId: string
) {
  return prisma.accessProfile.findFirst({
    where: { id: accessProfileId, tenantId },
    select: { id: true },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    accessProfileId: string
    validFrom: Date | null
    validTo: Date | null
    isActive: boolean
  }
) {
  return prisma.employeeAccessAssignment.create({
    data,
    include: assignmentInclude,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeAccessAssignment.update({
    where: { id },
    data,
    include: assignmentInclude,
  })
}

export async function deleteById(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.employeeAccessAssignment.deleteMany({
    where: { id, employee: { tenantId } },
  })
  return count > 0
}
