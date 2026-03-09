/**
 * Group Repository
 *
 * Pure Prisma data-access functions for the group models
 * (EmployeeGroup, WorkflowGroup, ActivityGroup).
 */
import type { PrismaClient } from "@/generated/prisma/client"

export type GroupType = "employee" | "workflow" | "activity"

/**
 * Returns the correct Prisma delegate based on the group type.
 */
function getGroupDelegate(prisma: PrismaClient, type: GroupType) {
  switch (type) {
    case "employee":
      return prisma.employeeGroup
    case "workflow":
      return prisma.workflowGroup
    case "activity":
      return prisma.activityGroup
  }
}

/**
 * Returns the Employee FK column name for the given group type.
 */
function getEmployeeFkColumn(type: GroupType): string {
  switch (type) {
    case "employee":
      return "employeeGroupId"
    case "workflow":
      return "workflowGroupId"
    case "activity":
      return "activityGroupId"
  }
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  params?: { isActive?: boolean }
) {
  const delegate = getGroupDelegate(prisma, type)
  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  return (delegate as any).findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string
) {
  const delegate = getGroupDelegate(prisma, type)
  return (delegate as any).findFirst({
    where: { id, tenantId },
  })
}

export async function findByCode(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  code: string,
  excludeId?: string
) {
  const delegate = getGroupDelegate(prisma, type)
  const where: Record<string, unknown> = { tenantId, code }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return (delegate as any).findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  type: GroupType,
  data: {
    tenantId: string
    code: string
    name: string
    description: string | null
    isActive: boolean
  }
) {
  const delegate = getGroupDelegate(prisma, type)
  return (delegate as any).create({ data })
}

export async function update(
  prisma: PrismaClient,
  type: GroupType,
  id: string,
  data: Record<string, unknown>
) {
  const delegate = getGroupDelegate(prisma, type)
  return (delegate as any).update({
    where: { id },
    data,
  })
}

export async function deleteById(
  prisma: PrismaClient,
  type: GroupType,
  id: string
) {
  const delegate = getGroupDelegate(prisma, type)
  return (delegate as any).delete({
    where: { id },
  })
}

export async function countEmployees(
  prisma: PrismaClient,
  type: GroupType,
  groupId: string
) {
  const fkColumn = getEmployeeFkColumn(type)
  return prisma.employee.count({
    where: { [fkColumn]: groupId },
  })
}
