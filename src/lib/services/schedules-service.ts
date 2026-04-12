/**
 * Schedules Service
 *
 * Business logic for schedule CRUD, task management, execution orchestration,
 * and task catalog.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./schedules-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "code",
]

// --- Error Classes ---

export class ScheduleNotFoundError extends Error {
  constructor(message = "Schedule not found") {
    super(message)
    this.name = "ScheduleNotFoundError"
  }
}

export class ScheduleTaskNotFoundError extends Error {
  constructor(message = "Schedule task not found") {
    super(message)
    this.name = "ScheduleTaskNotFoundError"
  }
}

export class ScheduleExecutionNotFoundError extends Error {
  constructor(message = "Schedule execution not found") {
    super(message)
    this.name = "ScheduleExecutionNotFoundError"
  }
}

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleValidationError"
  }
}

export class ScheduleConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScheduleConflictError"
  }
}

// --- Timing Computation Helpers ---

/**
 * Computes the next run time based on timing type and config.
 * Port of Go computeNextRun (schedule.go lines 434-533).
 */
export function computeNextRun(
  timingType: string,
  timingConfig: unknown,
  now: Date
): Date | null {
  const config = timingConfig as {
    interval?: number
    time?: string
    day_of_week?: number
    day_of_month?: number
  } | null

  switch (timingType) {
    case "seconds": {
      const interval =
        config?.interval && config.interval > 0 ? config.interval : 60
      return new Date(now.getTime() + interval * 1000)
    }
    case "minutes": {
      const interval =
        config?.interval && config.interval > 0 ? config.interval : 5
      return new Date(now.getTime() + interval * 60 * 1000)
    }
    case "hours": {
      const interval =
        config?.interval && config.interval > 0 ? config.interval : 1
      return new Date(now.getTime() + interval * 60 * 60 * 1000)
    }
    case "daily":
      return computeNextDailyRun(now, config?.time)
    case "weekly":
      return computeNextWeeklyRun(
        now,
        config?.day_of_week ?? 0,
        config?.time
      )
    case "monthly":
      return computeNextMonthlyRun(
        now,
        config?.day_of_month ?? 1,
        config?.time
      )
    case "manual":
      return null
    default:
      return null
  }
}

function parseTimeOfDay(timeStr?: string): [number, number] {
  if (!timeStr) return [2, 0] // default 02:00
  const parts = timeStr.split(":")
  return [parseInt(parts[0] ?? "2", 10), parseInt(parts[1] ?? "0", 10)]
}

function computeNextDailyRun(now: Date, timeStr?: string): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  const next = new Date(now)
  next.setHours(h, m, 0, 0)
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

function computeNextWeeklyRun(
  now: Date,
  dayOfWeek: number,
  timeStr?: string
): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  const next = new Date(now)
  next.setHours(h, m, 0, 0)
  let daysUntil = (dayOfWeek - now.getDay() + 7) % 7
  if (daysUntil === 0 && next <= now) {
    daysUntil = 7
  }
  next.setDate(next.getDate() + daysUntil)
  return next
}

function computeNextMonthlyRun(
  now: Date,
  dayOfMonth: number,
  timeStr?: string
): Date {
  const [h, m] = parseTimeOfDay(timeStr)
  let day = dayOfMonth
  if (day <= 0) day = 1
  if (day > 28) day = 28 // safe for all months

  const next = new Date(now.getFullYear(), now.getMonth(), day, h, m, 0, 0)
  if (next <= now) {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}

// --- Task Catalog ---

/**
 * Returns the list of available task types with their metadata.
 * Port of Go GetTaskCatalog (scheduler_catalog.go).
 *
 * Only includes task types valid per DB CHECK constraint (migration 000089).
 */
export function getTaskCatalog() {
  return [
    {
      taskType: "calculate_days",
      name: "Calculate Days",
      description:
        "Recalculates daily values for all employees for a given date range. Default: yesterday.",
      parameterSchema: {
        type: "object",
        properties: {
          date_range: {
            type: "string",
            enum: ["yesterday", "today", "last_7_days", "current_month"],
            description: "Which date range to recalculate",
            default: "yesterday",
          },
        },
      },
    },
    {
      taskType: "calculate_months",
      name: "Calculate Months",
      description:
        "Recalculates monthly aggregations for a specific year/month. Default: previous month.",
      parameterSchema: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            description: "Target year (default: current year)",
          },
          month: {
            type: "integer",
            description: "Target month 1-12 (default: previous month)",
            minimum: 1,
            maximum: 12,
          },
        },
      },
    },
    {
      taskType: "backup_database",
      name: "Backup Database",
      description:
        "Triggers a database backup (placeholder - logs execution only).",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "send_notifications",
      name: "Send Notifications",
      description:
        "Processes all pending employee message recipients and delivers notifications.",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "export_data",
      name: "Export Data",
      description:
        "Exports data via configured export interfaces (placeholder - logs execution only).",
      parameterSchema: {
        type: "object",
        properties: {
          export_interface_id: {
            type: "string",
            format: "uuid",
            description: "Export interface to use",
          },
        },
      },
    },
    {
      taskType: "alive_check",
      name: "Alive Check",
      description:
        "Simple heartbeat task that confirms the scheduler is running.",
      parameterSchema: { type: "object", properties: {} },
    },
    {
      taskType: "execute_macros",
      name: "Execute Macros",
      description:
        "Executes all due weekly and monthly macros for the current date.",
      parameterSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            format: "date",
            description: "Target date (YYYY-MM-DD). Default: today.",
          },
        },
      },
    },
    {
      taskType: "generate_day_plans",
      name: "Generate Day Plans",
      description:
        "Expands tariff week plans into employee day plans for upcoming period.",
      parameterSchema: {
        type: "object",
        properties: {
          days_ahead: {
            type: "integer",
            description: "How many days ahead to generate (default: 14)",
            default: 14,
          },
        },
      },
    },
  ]
}

// --- Service Functions ---

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.findManySchedules(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const schedule = await repo.findScheduleById(prisma, tenantId, id)
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }
  return schedule
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    timingType: string
    timingConfig?: unknown
    isEnabled?: boolean
    tasks?: {
      taskType: string
      sortOrder: number
      parameters?: unknown
      isEnabled?: boolean
    }[]
  },
  audit?: AuditContext
) {
  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new ScheduleValidationError("Schedule name is required")
  }

  // Check name uniqueness within tenant
  const existingByName = await repo.findScheduleByName(prisma, tenantId, name)
  if (existingByName) {
    throw new ScheduleConflictError("Schedule name already exists")
  }

  // Compute nextRunAt
  const isEnabled = input.isEnabled ?? true
  const timingConfig = (input.timingConfig as object) ?? {}
  let nextRunAt: Date | null = null
  if (isEnabled && input.timingType !== "manual") {
    nextRunAt = computeNextRun(input.timingType, timingConfig, new Date())
  }

  const schedule = await repo.createSchedule(prisma, {
    tenantId,
    name,
    description: input.description?.trim() || null,
    timingType: input.timingType,
    timingConfig,
    isEnabled,
    nextRunAt,
  })

  // Create tasks if provided
  if (input.tasks && input.tasks.length > 0) {
    for (const task of input.tasks) {
      await repo.createTask(prisma, {
        scheduleId: schedule.id,
        taskType: task.taskType,
        sortOrder: task.sortOrder,
        parameters: (task.parameters as object) ?? {},
        isEnabled: task.isEnabled ?? true,
      })
    }
  }

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "schedule",
      entityId: schedule.id,
      entityName: schedule.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Re-fetch with tasks
  const result = await repo.findScheduleById(prisma, tenantId, schedule.id)
  return result!
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    timingType?: string
    timingConfig?: unknown
    isEnabled?: boolean
  },
  audit?: AuditContext
) {
  // Verify schedule exists (tenant-scoped)
  const existing = await repo.findScheduleByIdPlain(prisma, tenantId, input.id)
  if (!existing) {
    throw new ScheduleNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ScheduleValidationError("Schedule name is required")
    }
    // Check uniqueness if name changed
    if (name !== existing.name) {
      const conflict = await repo.findScheduleByName(prisma, tenantId, name)
      if (conflict) {
        throw new ScheduleConflictError("Schedule name already exists")
      }
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  if (input.timingType !== undefined) {
    data.timingType = input.timingType
  }

  if (input.timingConfig !== undefined) {
    data.timingConfig = input.timingConfig as object
  }

  if (input.isEnabled !== undefined) {
    data.isEnabled = input.isEnabled
  }

  // Recompute nextRunAt based on final state
  const finalEnabled =
    input.isEnabled !== undefined ? input.isEnabled : existing.isEnabled
  const finalTimingType =
    input.timingType !== undefined ? input.timingType : existing.timingType
  const finalTimingConfig =
    input.timingConfig !== undefined
      ? input.timingConfig
      : existing.timingConfig

  if (!finalEnabled || finalTimingType === "manual") {
    data.nextRunAt = null
  } else {
    data.nextRunAt = computeNextRun(
      finalTimingType,
      finalTimingConfig,
      new Date()
    )
  }

  await repo.updateSchedule(prisma, tenantId, input.id, data)

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      data as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "schedule",
      entityId: input.id,
      entityName: (data.name as string) ?? existing.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  // Re-fetch with tasks
  const result = await repo.findScheduleById(prisma, tenantId, input.id)
  return result!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify schedule exists (tenant-scoped)
  const existing = await repo.findScheduleByIdPlain(prisma, tenantId, id)
  if (!existing) {
    throw new ScheduleNotFoundError()
  }

  // Hard delete (cascades to tasks and executions via FK)
  await repo.deleteSchedule(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "schedule",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// --- Task Management ---

export async function listTasks(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string
) {
  // Verify schedule exists in tenant
  const schedule = await repo.findScheduleByIdPlain(prisma, tenantId, scheduleId)
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  return repo.findTasksByScheduleId(prisma, scheduleId)
}

export async function createTask(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    scheduleId: string
    taskType: string
    sortOrder: number
    parameters?: unknown
    isEnabled?: boolean
  },
  audit?: AuditContext
) {
  // Verify schedule exists in tenant
  const schedule = await repo.findScheduleByIdPlain(
    prisma,
    tenantId,
    input.scheduleId
  )
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  const created = await repo.createTask(prisma, {
    scheduleId: input.scheduleId,
    taskType: input.taskType,
    sortOrder: input.sortOrder,
    parameters: (input.parameters as object) ?? {},
    isEnabled: input.isEnabled ?? true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "schedule_task",
      entityId: created.id,
      entityName: created.taskType ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateTask(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    scheduleId: string
    taskId: string
    taskType?: string
    sortOrder?: number
    parameters?: unknown
    isEnabled?: boolean
  },
  audit?: AuditContext
) {
  // Verify schedule exists in tenant
  const schedule = await repo.findScheduleByIdPlain(
    prisma,
    tenantId,
    input.scheduleId
  )
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  // Verify task exists AND belongs to schedule
  const existing = await repo.findTaskById(
    prisma,
    input.taskId,
    input.scheduleId
  )
  if (!existing) {
    throw new ScheduleTaskNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.taskType !== undefined) {
    data.taskType = input.taskType
  }

  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder
  }

  if (input.parameters !== undefined) {
    data.parameters = input.parameters as object
  }

  if (input.isEnabled !== undefined) {
    data.isEnabled = input.isEnabled
  }

  const updated = (await repo.updateTask(prisma, tenantId, input.taskId, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "schedule_task",
      entityId: input.taskId,
      entityName: updated.taskType ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function removeTask(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string,
  taskId: string,
  audit?: AuditContext
) {
  // Verify schedule exists in tenant
  const schedule = await repo.findScheduleByIdPlain(
    prisma,
    tenantId,
    scheduleId
  )
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  // Verify task exists AND belongs to schedule
  const existing = await repo.findTaskById(prisma, taskId, scheduleId)
  if (!existing) {
    throw new ScheduleTaskNotFoundError()
  }

  await repo.deleteTask(prisma, tenantId, taskId)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "schedule_task",
      entityId: taskId,
      entityName: existing.taskType ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// --- Execution ---

export async function execute(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string,
  userId: string
) {
  // Fetch schedule with tasks (tenant-scoped)
  const schedule = await repo.findScheduleById(prisma, tenantId, scheduleId)
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  // Check isEnabled
  if (!schedule.isEnabled) {
    throw new ScheduleValidationError("Cannot execute disabled schedule")
  }

  // Create execution record
  const enabledTasks = schedule.tasks.filter((t) => t.isEnabled)

  const execution = await repo.createExecution(prisma, {
    tenantId,
    scheduleId,
    status: "running",
    triggerType: "manual",
    triggeredBy: userId,
    startedAt: new Date(),
    tasksTotal: enabledTasks.length,
  })

  // Execute tasks
  let tasksSucceeded = 0
  let tasksFailed = 0

  for (const task of enabledTasks) {
    // Create task execution record
    const taskExecution = await repo.createTaskExecution(prisma, {
      executionId: execution.id,
      taskType: task.taskType,
      sortOrder: task.sortOrder,
      status: "running",
      startedAt: new Date(),
    })

    // Execute placeholder handler
    try {
      const executedAt = new Date().toISOString()
      const result = {
        action: task.taskType,
        status: "executed_manually",
        executed_at: executedAt,
      }

      await repo.updateTaskExecution(prisma, tenantId, taskExecution.id, {
        status: "completed",
        completedAt: new Date(),
        result: result as object,
      })

      tasksSucceeded++
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error"

      await repo.updateTaskExecution(prisma, tenantId, taskExecution.id, {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      })

      tasksFailed++
    }
  }

  // Determine overall status
  let overallStatus: string
  if (tasksFailed === 0) {
    overallStatus = "completed"
  } else if (tasksSucceeded === 0) {
    overallStatus = "failed"
  } else {
    overallStatus = "partial"
  }

  // Update execution record
  await repo.updateExecution(prisma, tenantId, execution.id, {
    status: overallStatus,
    completedAt: new Date(),
    tasksSucceeded,
    tasksFailed,
  })

  // Update schedule's lastRunAt and recompute nextRunAt
  const nextRunAt = computeNextRun(
    schedule.timingType,
    schedule.timingConfig,
    new Date()
  )
  await repo.updateSchedule(prisma, tenantId, scheduleId, {
    lastRunAt: new Date(),
    nextRunAt,
  })

  // Re-fetch execution with task executions
  const result = await repo.findExecutionById(prisma, tenantId, execution.id)
  return result!
}

export async function listExecutions(
  prisma: PrismaClient,
  tenantId: string,
  scheduleId: string,
  limit: number
) {
  // Verify schedule exists in tenant
  const schedule = await repo.findScheduleByIdPlain(
    prisma,
    tenantId,
    scheduleId
  )
  if (!schedule) {
    throw new ScheduleNotFoundError()
  }

  return repo.findExecutionsByScheduleId(prisma, scheduleId, limit)
}

export async function getExecutionById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const execution = await repo.findExecutionById(prisma, tenantId, id)
  if (!execution) {
    throw new ScheduleExecutionNotFoundError()
  }
  return execution
}
