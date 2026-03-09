/**
 * CronExecutionLogger
 *
 * Reusable service for logging cron job executions to the database.
 * Handles Schedule, ScheduleExecution, and ScheduleTaskExecution records.
 *
 * Used by Vercel Cron routes (e.g. /api/cron/calculate-days) to log
 * execution history per tenant, matching the Go scheduler executor pattern.
 *
 * Pattern: Constructor takes PrismaClient (same as RecalcService, DailyCalcService).
 *
 * @see ZMI-TICKET-245: Vercel Cron calculate_days task
 */

import type { PrismaClient } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"

export class CronExecutionLogger {
  constructor(private prisma: PrismaClient) {}

  /**
   * Ensures a Schedule + ScheduleTask record exists for this cron job.
   * Uses upsert on the (tenantId, name) unique constraint.
   * Returns the schedule ID for execution logging.
   */
  async ensureSchedule(
    tenantId: string,
    name: string,
    taskType: string,
    options?: {
      timingType?: string
      timingConfig?: Prisma.InputJsonValue
    },
  ): Promise<string> {
    const schedule = await this.prisma.schedule.upsert({
      where: {
        tenantId_name: { tenantId, name },
      },
      create: {
        tenantId,
        name,
        description: `Vercel Cron: ${name}`,
        timingType: options?.timingType ?? "daily",
        timingConfig: options?.timingConfig ?? { time: "02:00", source: "vercel_cron" },
        isEnabled: true,
        tasks: {
          create: {
            taskType,
            sortOrder: 0,
            parameters: {},
            isEnabled: true,
          },
        },
      },
      update: {
        // No-op update -- just ensure the record exists
        isEnabled: true,
      },
      select: { id: true },
    })

    return schedule.id
  }

  /**
   * Creates a ScheduleExecution record (status: "running").
   * Creates a single ScheduleTaskExecution record (status: "running").
   * Returns { executionId, taskExecutionId }.
   */
  async startExecution(
    tenantId: string,
    scheduleId: string,
    triggerType: "scheduled" | "manual",
    taskType: string,
  ): Promise<{ executionId: string; taskExecutionId: string }> {
    const now = new Date()

    const execution = await this.prisma.scheduleExecution.create({
      data: {
        tenantId,
        scheduleId,
        status: "running",
        triggerType,
        startedAt: now,
        tasksTotal: 1,
        tasksSucceeded: 0,
        tasksFailed: 0,
        taskExecutions: {
          create: {
            taskType,
            sortOrder: 0,
            status: "running",
            startedAt: now,
          },
        },
      },
      select: {
        id: true,
        taskExecutions: { select: { id: true } },
      },
    })

    return {
      executionId: execution.id,
      taskExecutionId: execution.taskExecutions[0]!.id,
    }
  }

  /**
   * Completes the task execution with result and final status.
   * Updates both ScheduleTaskExecution and ScheduleExecution.
   * Also updates Schedule.lastRunAt.
   */
  async completeExecution(
    executionId: string,
    taskExecutionId: string,
    scheduleId: string,
    result: {
      status: "completed" | "failed" | "partial"
      taskResult: Prisma.InputJsonValue
      errorMessage?: string
    },
  ): Promise<void> {
    const now = new Date()

    const taskStatus = result.status === "failed" ? "failed" : "completed"
    const tasksSucceeded = result.status === "failed" ? 0 : 1
    const tasksFailed = result.status === "failed" ? 1 : 0

    // Update all three records in a transaction
    await this.prisma.$transaction([
      // 1. Update ScheduleTaskExecution
      this.prisma.scheduleTaskExecution.update({
        where: { id: taskExecutionId },
        data: {
          status: taskStatus,
          completedAt: now,
          result: result.taskResult,
          errorMessage: result.errorMessage ?? null,
        },
      }),

      // 2. Update ScheduleExecution
      this.prisma.scheduleExecution.update({
        where: { id: executionId },
        data: {
          status: result.status,
          completedAt: now,
          tasksSucceeded,
          tasksFailed,
          errorMessage: result.errorMessage ?? null,
        },
      }),

      // 3. Update Schedule.lastRunAt
      this.prisma.schedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: now },
      }),
    ])
  }
}
