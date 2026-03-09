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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as schedulesService from "@/lib/services/schedules-service"

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
      try {
        const schedules = await schedulesService.list(
          ctx.prisma,
          ctx.tenantId!
        )
        return { data: schedules.map(mapSchedule) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const schedule = await schedulesService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapSchedule(schedule)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const schedule = await schedulesService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapSchedule(schedule)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const schedule = await schedulesService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapSchedule(schedule)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        await schedulesService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tasks = await schedulesService.listTasks(
          ctx.prisma,
          ctx.tenantId!,
          input.scheduleId
        )
        return { data: tasks.map(mapTask) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const task = await schedulesService.createTask(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapTask(task)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const task = await schedulesService.updateTask(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapTask(task)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        await schedulesService.removeTask(
          ctx.prisma,
          ctx.tenantId!,
          input.scheduleId,
          input.taskId
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const execution = await schedulesService.execute(
          ctx.prisma,
          ctx.tenantId!,
          input.scheduleId,
          ctx.user!.id
        )
        return mapExecution(execution)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const executions = await schedulesService.listExecutions(
          ctx.prisma,
          ctx.tenantId!,
          input.scheduleId,
          input.limit
        )
        return { data: executions.map(mapExecution) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const execution = await schedulesService.getExecutionById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapExecution(execution)
      } catch (err) {
        handleServiceError(err)
      }
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
        data: schedulesService.getTaskCatalog(),
      }
    }),
})

// Export helpers for testing
export { computeNextRun as _computeNextRun } from "@/lib/services/schedules-service"
export { getTaskCatalog as _getTaskCatalog } from "@/lib/services/schedules-service"
