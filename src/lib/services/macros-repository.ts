/**
 * Macros Repository
 *
 * Pure Prisma data-access functions for the Macro, MacroAssignment,
 * and MacroExecution models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Include constants ---

const macroWithAssignments = {
  assignments: { orderBy: { createdAt: "asc" as const } },
} as const

// --- Macro ---

export async function findManyMacros(prisma: PrismaClient, tenantId: string) {
  return prisma.macro.findMany({
    where: { tenantId },
    include: macroWithAssignments,
    orderBy: { name: "asc" },
  })
}

export async function findMacroById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.macro.findFirst({
    where: { id, tenantId },
    include: macroWithAssignments,
  })
}

export async function findMacroByIdBasic(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.macro.findFirst({
    where: { id, tenantId },
  })
}

export async function findMacroByName(
  prisma: PrismaClient,
  tenantId: string,
  name: string
) {
  return prisma.macro.findFirst({
    where: { tenantId, name },
  })
}

export async function createMacro(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    description: string | null
    macroType: string
    actionType: string
    actionParams: object
    isActive: boolean
  }
) {
  return prisma.macro.create({ data })
}

export async function updateMacro(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.macro.update({ where: { id }, data })
}

export async function deleteMacro(prisma: PrismaClient, tenantId: string, id: string) {
  const { count } = await prisma.macro.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- MacroAssignment ---

export async function findAssignmentsByMacroId(
  prisma: PrismaClient,
  macroId: string
) {
  return prisma.macroAssignment.findMany({
    where: { macroId },
    orderBy: { createdAt: "asc" },
  })
}

export async function findAssignmentById(
  prisma: PrismaClient,
  assignmentId: string,
  macroId: string
) {
  return prisma.macroAssignment.findFirst({
    where: { id: assignmentId, macroId },
  })
}

export async function createAssignment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    macroId: string
    tariffId: string | null
    employeeId: string | null
    executionDay: number
    isActive: boolean
  }
) {
  return prisma.macroAssignment.create({ data })
}

export async function updateAssignment(
  prisma: PrismaClient,
  tenantId: string,
  assignmentId: string,
  data: Record<string, unknown>
) {
  return prisma.macroAssignment.update({ where: { id: assignmentId }, data })
}

export async function deleteAssignment(
  prisma: PrismaClient,
  tenantId: string,
  assignmentId: string
) {
  const { count } = await prisma.macroAssignment.deleteMany({
    where: { id: assignmentId, macro: { tenantId } },
  })
  return count > 0
}

// --- MacroExecution ---

export async function findExecutionById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.macroExecution.findFirst({
    where: { id, tenantId },
  })
}

export async function findExecutionsByMacroId(
  prisma: PrismaClient,
  macroId: string,
  limit: number
) {
  return prisma.macroExecution.findMany({
    where: { macroId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

export async function createExecution(
  prisma: PrismaClient,
  data: {
    tenantId: string
    macroId: string
    status: string
    triggerType: string
    triggeredBy: string
    startedAt: Date
  }
) {
  return prisma.macroExecution.create({ data })
}

export async function updateExecution(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    completedAt: Date
    status: string
    result: object
    errorMessage: string | null
  }
) {
  return prisma.macroExecution.update({ where: { id }, data })
}
