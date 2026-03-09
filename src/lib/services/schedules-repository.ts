/**
 * Schedules Repository
 *
 * Pure Prisma data-access functions for the Schedule, ScheduleTask,
 * ScheduleExecution, and ScheduleTaskExecution models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Prisma Include Objects ---

const withTasksSorted = {
  tasks: { orderBy: { sortOrder: "asc" as const } },
} as const

const withTaskExecutionsSorted = {
  taskExecutions: { orderBy: { sortOrder: "asc" as const } },
} as const

// --- Schedule ---

export async function findManySchedules(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.schedule.findMany({
    where: { tenantId },
    include: withTasksSorted,
    orderBy: { name: "asc" },
  })
}

export async function findScheduleById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.schedule.findFirst({
    where: { id, tenantId },
    include: withTasksSorted,
  })
}

export async function findScheduleByIdPlain(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.schedule.findFirst({
    where: { id, tenantId },
  })
}

export async function findScheduleByName(
  prisma: PrismaClient,
  tenantId: string,
  name: string
) {
  return prisma.schedule.findFirst({
    where: { tenantId, name },
  })
}

export async function createSchedule(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    description: string | null
    timingType: string
    timingConfig: object
    isEnabled: boolean
    nextRunAt: Date | null
  }
) {
  return prisma.schedule.create({ data })
}

export async function updateSchedule(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.schedule.update({
    where: { id },
    data,
  })
}

export async function deleteSchedule(prisma: PrismaClient, id: string) {
  return prisma.schedule.delete({
    where: { id },
  })
}

// --- Schedule Task ---

export async function findTasksByScheduleId(
  prisma: PrismaClient,
  scheduleId: string
) {
  return prisma.scheduleTask.findMany({
    where: { scheduleId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function findTaskById(
  prisma: PrismaClient,
  taskId: string,
  scheduleId: string
) {
  return prisma.scheduleTask.findFirst({
    where: { id: taskId, scheduleId },
  })
}

export async function createTask(
  prisma: PrismaClient,
  data: {
    scheduleId: string
    taskType: string
    sortOrder: number
    parameters: object
    isEnabled: boolean
  }
) {
  return prisma.scheduleTask.create({ data })
}

export async function updateTask(
  prisma: PrismaClient,
  taskId: string,
  data: Record<string, unknown>
) {
  return prisma.scheduleTask.update({
    where: { id: taskId },
    data,
  })
}

export async function deleteTask(prisma: PrismaClient, taskId: string) {
  return prisma.scheduleTask.delete({
    where: { id: taskId },
  })
}

// --- Schedule Execution ---

export async function createExecution(
  prisma: PrismaClient,
  data: {
    tenantId: string
    scheduleId: string
    status: string
    triggerType: string
    triggeredBy: string
    startedAt: Date
    tasksTotal: number
  }
) {
  return prisma.scheduleExecution.create({ data })
}

export async function updateExecution(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.scheduleExecution.update({
    where: { id },
    data,
  })
}

export async function findExecutionById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.scheduleExecution.findFirst({
    where: { id, tenantId },
    include: withTaskExecutionsSorted,
  })
}

export async function findExecutionsByScheduleId(
  prisma: PrismaClient,
  scheduleId: string,
  limit: number
) {
  return prisma.scheduleExecution.findMany({
    where: { scheduleId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: withTaskExecutionsSorted,
  })
}

// --- Schedule Task Execution ---

export async function createTaskExecution(
  prisma: PrismaClient,
  data: {
    executionId: string
    taskType: string
    sortOrder: number
    status: string
    startedAt: Date
  }
) {
  return prisma.scheduleTaskExecution.create({ data })
}

export async function updateTaskExecution(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.scheduleTaskExecution.update({
    where: { id },
    data,
  })
}
