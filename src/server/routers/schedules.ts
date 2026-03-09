/**
 * Schedules Router
 *
 * Provides schedule CRUD, task management, manual execution,
 * execution history, and task catalog via tRPC procedures.
 *
 * Replaces the Go backend schedule endpoints:
 * - GET /schedules -> schedules.list
 * - GET /schedules/{id} -> schedules.getById
 * - POST /schedules -> schedules.create
 * - PATCH /schedules/{id} -> schedules.update
 * - DELETE /schedules/{id} -> schedules.delete
 * - GET /schedules/{id}/tasks -> schedules.tasks
 * - POST /schedules/{id}/tasks -> schedules.createTask
 * - PATCH /schedules/{id}/tasks/{taskId} -> schedules.updateTask
 * - DELETE /schedules/{id}/tasks/{taskId} -> schedules.deleteTask
 * - POST /schedules/{id}/execute -> schedules.execute
 * - GET /schedules/{id}/executions -> schedules.executions
 * - GET /schedule-executions/{id} -> schedules.execution
 * - GET /scheduler/task-catalog -> schedules.taskCatalog
 *
 * @see apps/api/internal/service/schedule.go
 * @see apps/api/internal/service/scheduler_catalog.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const SCHEDULES_MANAGE = permissionIdByKey("schedules.manage")!

// --- Enum Constants ---

const TIMING_TYPES = [
  "seconds",
  "minutes",
  "hours",
  "daily",
  "weekly",
  "monthly",
  "manual",
] as const

const TASK_TYPES = [
  "calculate_days",
  "calculate_months",
  "backup_database",
  "send_notifications",
  "export_data",
  "alive_check",
  "execute_macros",
  "generate_day_plans",
] as const

const EXECUTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "partial",
] as const
const TASK_EXECUTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
] as const
const TRIGGER_TYPES = ["scheduled", "manual"] as const

// Suppress unused-variable warnings for exhaustive const arrays
void EXECUTION_STATUSES
void TASK_EXECUTION_STATUSES
void TRIGGER_TYPES

// --- Output Schemas ---

const scheduleTaskOutputSchema = z.object({
  id: z.string().uuid(),
  scheduleId: z.string().uuid(),
  taskType: z.string(),
  sortOrder: z.number(),
  parameters: z.unknown(),
  isEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const scheduleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  timingType: z.string(),
  timingConfig: z.unknown(),
  isEnabled: z.boolean(),
  lastRunAt: z.date().nullable(),
  nextRunAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  tasks: z.array(scheduleTaskOutputSchema).optional(),
})

const scheduleTaskExecutionOutputSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  taskType: z.string(),
  sortOrder: z.number(),
  status: z.string(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  result: z.unknown(),
  createdAt: z.date(),
})

const scheduleExecutionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  status: z.string(),
  triggerType: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  tasksTotal: z.number(),
  tasksSucceeded: z.number(),
  tasksFailed: z.number(),
  createdAt: z.date(),
  taskExecutions: z.array(scheduleTaskExecutionOutputSchema).optional(),
})

const taskCatalogEntrySchema = z.object({
  taskType: z.string(),
  name: z.string(),
  description: z.string(),
  parameterSchema: z.unknown(),
})

// --- Input Schemas ---

const createScheduleInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  timingType: z.enum(TIMING_TYPES),
  timingConfig: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
  tasks: z
    .array(
      z.object({
        taskType: z.enum(TASK_TYPES),
        sortOrder: z.number().int().default(0),
        parameters: z.unknown().optional(),
        isEnabled: z.boolean().optional(),
      })
    )
    .optional(),
})

const updateScheduleInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  timingType: z.enum(TIMING_TYPES).optional(),
  timingConfig: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})

const createTaskInputSchema = z.object({
  scheduleId: z.string().uuid(),
  taskType: z.enum(TASK_TYPES),
  sortOrder: z.number().int().default(0),
  parameters: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})

const updateTaskInputSchema = z.object({
  scheduleId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskType: z.enum(TASK_TYPES).optional(),
  sortOrder: z.number().int().optional(),
  parameters: z.unknown().optional(),
  isEnabled: z.boolean().optional(),
})

// --- Prisma Include Objects ---

const withTasksSorted = {
  tasks: { orderBy: { sortOrder: "asc" as const } },
} as const

const withTaskExecutionsSorted = {
  taskExecutions: { orderBy: { sortOrder: "asc" as const } },
} as const

// --- Timing Computation Helpers ---

/**
 * Computes the next run time based on timing type and config.
 * Port of Go computeNextRun (schedule.go lines 434-533).
 */
function computeNextRun(
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

// --- Task Catalog Helper ---

/**
 * Returns the list of available task types with their metadata.
 * Port of Go GetTaskCatalog (scheduler_catalog.go).
 *
 * Only includes task types valid per DB CHECK constraint (migration 000089).
 */
function getTaskCatalog() {
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

// --- Output Mappers ---

function mapTask(t: {
  id: string
  scheduleId: string
  taskType: string
  sortOrder: number
  parameters: unknown
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    scheduleId: t.scheduleId,
    taskType: t.taskType,
    sortOrder: t.sortOrder,
    parameters: t.parameters,
    isEnabled: t.isEnabled,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}

function mapSchedule(s: {
  id: string
  tenantId: string
  name: string
  description: string | null
  timingType: string
  timingConfig: unknown
  isEnabled: boolean
  lastRunAt: Date | null
  nextRunAt: Date | null
  createdAt: Date
  updatedAt: Date
  tasks?: {
    id: string
    scheduleId: string
    taskType: string
    sortOrder: number
    parameters: unknown
    isEnabled: boolean
    createdAt: Date
    updatedAt: Date
  }[]
}) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    name: s.name,
    description: s.description,
    timingType: s.timingType,
    timingConfig: s.timingConfig,
    isEnabled: s.isEnabled,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    tasks: s.tasks?.map(mapTask),
  }
}

function mapTaskExecution(te: {
  id: string
  executionId: string
  taskType: string
  sortOrder: number
  status: string
  startedAt: Date | null
  completedAt: Date | null
  errorMessage: string | null
  result: unknown
  createdAt: Date
}) {
  return {
    id: te.id,
    executionId: te.executionId,
    taskType: te.taskType,
    sortOrder: te.sortOrder,
    status: te.status,
    startedAt: te.startedAt,
    completedAt: te.completedAt,
    errorMessage: te.errorMessage,
    result: te.result,
    createdAt: te.createdAt,
  }
}

function mapExecution(e: {
  id: string
  tenantId: string
  scheduleId: string
  status: string
  triggerType: string
  triggeredBy: string | null
  startedAt: Date | null
  completedAt: Date | null
  errorMessage: string | null
  tasksTotal: number
  tasksSucceeded: number
  tasksFailed: number
  createdAt: Date
  taskExecutions?: {
    id: string
    executionId: string
    taskType: string
    sortOrder: number
    status: string
    startedAt: Date | null
    completedAt: Date | null
    errorMessage: string | null
    result: unknown
    createdAt: Date
  }[]
}) {
  return {
    id: e.id,
    tenantId: e.tenantId,
    scheduleId: e.scheduleId,
    status: e.status,
    triggerType: e.triggerType,
    triggeredBy: e.triggeredBy,
    startedAt: e.startedAt,
    completedAt: e.completedAt,
    errorMessage: e.errorMessage,
    tasksTotal: e.tasksTotal,
    tasksSucceeded: e.tasksSucceeded,
    tasksFailed: e.tasksFailed,
    createdAt: e.createdAt,
    taskExecutions: e.taskExecutions?.map(mapTaskExecution),
  }
}

// --- Router ---

export const schedulesRouter = createTRPCRouter({
  // ==================== Schedule CRUD ====================

  /**
   * schedules.list -- Returns all schedules for the current tenant with tasks.
   *
   * Orders by name ASC.
   *
   * Requires: schedules.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(scheduleOutputSchema) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const schedules = await ctx.prisma.schedule.findMany({
        where: { tenantId },
        include: withTasksSorted,
        orderBy: { name: "asc" },
      })

      return {
        data: schedules.map(mapSchedule),
      }
    }),

  /**
   * schedules.getById -- Returns a single schedule by ID with tasks.
   *
   * Requires: schedules.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(scheduleOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.id, tenantId },
        include: withTasksSorted,
      })

      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      return mapSchedule(schedule)
    }),

  /**
   * schedules.create -- Creates a new schedule.
   *
   * Validates name non-empty, name uniqueness per tenant.
   * Computes nextRunAt if enabled and not manual.
   * Optionally creates tasks inline.
   *
   * Requires: schedules.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(createScheduleInputSchema)
    .output(scheduleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Schedule name is required",
        })
      }

      // Check name uniqueness within tenant
      const existingByName = await ctx.prisma.schedule.findFirst({
        where: { tenantId, name },
      })
      if (existingByName) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Schedule name already exists",
        })
      }

      // Compute nextRunAt
      const isEnabled = input.isEnabled ?? true
      const timingConfig = (input.timingConfig as object) ?? {}
      let nextRunAt: Date | null = null
      if (isEnabled && input.timingType !== "manual") {
        nextRunAt = computeNextRun(input.timingType, timingConfig, new Date())
      }

      const schedule = await ctx.prisma.schedule.create({
        data: {
          tenantId,
          name,
          description: input.description?.trim() || null,
          timingType: input.timingType,
          timingConfig,
          isEnabled,
          nextRunAt,
        },
      })

      // Create tasks if provided
      if (input.tasks && input.tasks.length > 0) {
        for (const task of input.tasks) {
          await ctx.prisma.scheduleTask.create({
            data: {
              scheduleId: schedule.id,
              taskType: task.taskType,
              sortOrder: task.sortOrder,
              parameters: (task.parameters as object) ?? {},
              isEnabled: task.isEnabled ?? true,
            },
          })
        }
      }

      // Re-fetch with tasks
      const result = await ctx.prisma.schedule.findFirst({
        where: { id: schedule.id, tenantId },
        include: withTasksSorted,
      })

      return mapSchedule(result!)
    }),

  /**
   * schedules.update -- Updates an existing schedule.
   *
   * Supports partial updates. If name changed, checks uniqueness.
   * Recomputes nextRunAt based on current enabled/timing state.
   *
   * Requires: schedules.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(updateScheduleInputSchema)
    .output(scheduleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists (tenant-scoped)
      const existing = await ctx.prisma.schedule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Schedule name is required",
          })
        }
        // Check uniqueness if name changed
        if (name !== existing.name) {
          const conflict = await ctx.prisma.schedule.findFirst({
            where: { tenantId, name },
          })
          if (conflict) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Schedule name already exists",
            })
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

      await ctx.prisma.schedule.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with tasks
      const result = await ctx.prisma.schedule.findFirst({
        where: { id: input.id, tenantId },
        include: withTasksSorted,
      })

      return mapSchedule(result!)
    }),

  /**
   * schedules.delete -- Deletes a schedule.
   *
   * Cascades to tasks, executions via FK.
   *
   * Requires: schedules.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists (tenant-scoped)
      const existing = await ctx.prisma.schedule.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      // Hard delete (cascades to tasks and executions via FK)
      await ctx.prisma.schedule.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  // ==================== Task Management ====================

  /**
   * schedules.tasks -- Lists tasks for a schedule.
   *
   * Requires: schedules.manage permission
   */
  tasks: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.object({ scheduleId: z.string().uuid() }))
    .output(z.object({ data: z.array(scheduleTaskOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists in tenant
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      const tasks = await ctx.prisma.scheduleTask.findMany({
        where: { scheduleId: input.scheduleId },
        orderBy: { sortOrder: "asc" },
      })

      return {
        data: tasks.map(mapTask),
      }
    }),

  /**
   * schedules.createTask -- Creates a new task for a schedule.
   *
   * Requires: schedules.manage permission
   */
  createTask: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(createTaskInputSchema)
    .output(scheduleTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists in tenant
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      const task = await ctx.prisma.scheduleTask.create({
        data: {
          scheduleId: input.scheduleId,
          taskType: input.taskType,
          sortOrder: input.sortOrder,
          parameters: (input.parameters as object) ?? {},
          isEnabled: input.isEnabled ?? true,
        },
      })

      return mapTask(task)
    }),

  /**
   * schedules.updateTask -- Updates an existing schedule task.
   *
   * Verifies task belongs to the schedule.
   *
   * Requires: schedules.manage permission
   */
  updateTask: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(updateTaskInputSchema)
    .output(scheduleTaskOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists in tenant
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      // Verify task exists AND belongs to schedule
      const existing = await ctx.prisma.scheduleTask.findFirst({
        where: { id: input.taskId, scheduleId: input.scheduleId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule task not found",
        })
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

      const task = await ctx.prisma.scheduleTask.update({
        where: { id: input.taskId },
        data,
      })

      return mapTask(task)
    }),

  /**
   * schedules.deleteTask -- Deletes a schedule task.
   *
   * Verifies task belongs to the schedule.
   *
   * Requires: schedules.manage permission
   */
  deleteTask: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        taskId: z.string().uuid(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists in tenant
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      // Verify task exists AND belongs to schedule
      const existing = await ctx.prisma.scheduleTask.findFirst({
        where: { id: input.taskId, scheduleId: input.scheduleId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule task not found",
        })
      }

      await ctx.prisma.scheduleTask.delete({
        where: { id: input.taskId },
      })

      return { success: true }
    }),

  // ==================== Execution ====================

  /**
   * schedules.execute -- Manually triggers execution of a schedule.
   *
   * Creates execution records, iterates enabled tasks, and records results.
   * Uses placeholder handlers (actual task logic runs via Vercel Cron routes).
   *
   * Requires: schedules.manage permission
   */
  execute: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.object({ scheduleId: z.string().uuid() }))
    .output(scheduleExecutionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const userId = ctx.user!.id

      // Fetch schedule with tasks (tenant-scoped)
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
        include: withTasksSorted,
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      // Check isEnabled
      if (!schedule.isEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot execute disabled schedule",
        })
      }

      // Create execution record
      const enabledTasks = schedule.tasks.filter((t) => t.isEnabled)

      const execution = await ctx.prisma.scheduleExecution.create({
        data: {
          tenantId,
          scheduleId: input.scheduleId,
          status: "running",
          triggerType: "manual",
          triggeredBy: userId,
          startedAt: new Date(),
          tasksTotal: enabledTasks.length,
        },
      })

      // Execute tasks
      let tasksSucceeded = 0
      let tasksFailed = 0

      for (const task of enabledTasks) {
        // Create task execution record
        const taskExecution = await ctx.prisma.scheduleTaskExecution.create({
          data: {
            executionId: execution.id,
            taskType: task.taskType,
            sortOrder: task.sortOrder,
            status: "running",
            startedAt: new Date(),
          },
        })

        // Execute placeholder handler
        try {
          const executedAt = new Date().toISOString()
          const result = {
            action: task.taskType,
            status: "executed_manually",
            executed_at: executedAt,
          }

          await ctx.prisma.scheduleTaskExecution.update({
            where: { id: taskExecution.id },
            data: {
              status: "completed",
              completedAt: new Date(),
              result: result as object,
            },
          })

          tasksSucceeded++
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error"

          await ctx.prisma.scheduleTaskExecution.update({
            where: { id: taskExecution.id },
            data: {
              status: "failed",
              completedAt: new Date(),
              errorMessage,
            },
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
      await ctx.prisma.scheduleExecution.update({
        where: { id: execution.id },
        data: {
          status: overallStatus,
          completedAt: new Date(),
          tasksSucceeded,
          tasksFailed,
        },
      })

      // Update schedule's lastRunAt and recompute nextRunAt
      const nextRunAt = computeNextRun(
        schedule.timingType,
        schedule.timingConfig,
        new Date()
      )
      await ctx.prisma.schedule.update({
        where: { id: input.scheduleId },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
        },
      })

      // Re-fetch execution with task executions
      const result = await ctx.prisma.scheduleExecution.findFirst({
        where: { id: execution.id, tenantId },
        include: withTaskExecutionsSorted,
      })

      return mapExecution(result!)
    }),

  /**
   * schedules.executions -- Lists executions for a schedule.
   *
   * Orders by createdAt DESC, with optional limit.
   *
   * Requires: schedules.manage permission
   */
  executions: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      })
    )
    .output(z.object({ data: z.array(scheduleExecutionOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify schedule exists in tenant
      const schedule = await ctx.prisma.schedule.findFirst({
        where: { id: input.scheduleId, tenantId },
      })
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        })
      }

      const executions = await ctx.prisma.scheduleExecution.findMany({
        where: { scheduleId: input.scheduleId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: withTaskExecutionsSorted,
      })

      return {
        data: executions.map(mapExecution),
      }
    }),

  /**
   * schedules.execution -- Returns a single execution by ID.
   *
   * Requires: schedules.manage permission
   */
  execution: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(scheduleExecutionOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const execution = await ctx.prisma.scheduleExecution.findFirst({
        where: { id: input.id, tenantId },
        include: withTaskExecutionsSorted,
      })

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule execution not found",
        })
      }

      return mapExecution(execution)
    }),

  // ==================== Task Catalog ====================

  /**
   * schedules.taskCatalog -- Returns available task types with metadata.
   *
   * Requires: schedules.manage permission
   */
  taskCatalog: tenantProcedure
    .use(requirePermission(SCHEDULES_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(taskCatalogEntrySchema) }))
    .query(async () => {
      return {
        data: getTaskCatalog(),
      }
    }),
})

// Export helpers for testing
export { computeNextRun as _computeNextRun }
export { getTaskCatalog as _getTaskCatalog }
