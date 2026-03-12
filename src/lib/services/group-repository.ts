/**
 * Group Repository
 *
 * Pure Prisma data-access functions for the group models
 * (EmployeeGroup, WorkflowGroup, ActivityGroup).
 */
import type { PrismaClient } from "@/generated/prisma/client"

export type GroupType = "employee" | "workflow" | "activity"

/** Shape shared by EmployeeGroup, WorkflowGroup, ActivityGroup records */
export interface GroupRecord {
  id: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/** Common delegate shape shared by EmployeeGroup, WorkflowGroup, ActivityGroup */
type GroupDelegate = {
  findMany: (args: { where: Record<string, unknown>; orderBy: Record<string, string> }) => Promise<GroupRecord[]>
  findFirst: (args: { where: Record<string, unknown> }) => Promise<GroupRecord | null>
  create: (args: { data: Record<string, unknown> }) => Promise<GroupRecord>
  updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>
}

/**
 * Returns the correct Prisma delegate based on the group type.
 */
function getGroupDelegate(prisma: PrismaClient, type: GroupType): GroupDelegate {
  switch (type) {
    case "employee":
      return prisma.employeeGroup as unknown as GroupDelegate
    case "workflow":
      return prisma.workflowGroup as unknown as GroupDelegate
    case "activity":
      return prisma.activityGroup as unknown as GroupDelegate
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

  return delegate.findMany({
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
  return delegate.findFirst({
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
  return delegate.findFirst({ where })
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
  return delegate.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string,
  data: Record<string, unknown>
) {
  const delegate = getGroupDelegate(prisma, type)
  await delegate.updateMany({ where: { id, tenantId }, data })
  return delegate.findFirst({ where: { id, tenantId } })
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string
) {
  const delegate = getGroupDelegate(prisma, type)
  const { count } = await delegate.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
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
