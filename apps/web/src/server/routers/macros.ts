/**
 * Macros Router
 *
 * Provides macro CRUD, assignment management, and execution operations
 * via tRPC procedures.
 *
 * Replaces the Go backend macro endpoints:
 * - GET /macros -> macros.list
 * - GET /macros/{id} -> macros.getById
 * - POST /macros -> macros.create
 * - PATCH /macros/{id} -> macros.update
 * - DELETE /macros/{id} -> macros.delete
 * - GET /macros/{id}/assignments -> macros.listAssignments
 * - POST /macros/{id}/assignments -> macros.createAssignment
 * - PATCH /macros/{id}/assignments/{assignmentId} -> macros.updateAssignment
 * - DELETE /macros/{id}/assignments/{assignmentId} -> macros.deleteAssignment
 * - POST /macros/{id}/execute -> macros.triggerExecution
 * - GET /macros/{id}/executions -> macros.listExecutions
 * - GET /macro-executions/{id} -> macros.getExecution
 *
 * @see apps/api/internal/service/macro.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const MACROS_MANAGE = permissionIdByKey("macros.manage")!

// --- Enum Constants ---

const MACRO_TYPES = ["weekly", "monthly"] as const
const ACTION_TYPES = [
  "log_message",
  "recalculate_target_hours",
  "reset_flextime",
  "carry_forward_balance",
] as const
const EXECUTION_STATUSES = ["pending", "running", "completed", "failed"] as const
const TRIGGER_TYPES = ["scheduled", "manual"] as const

// Suppress unused-variable warnings for exhaustive const arrays
void EXECUTION_STATUSES
void TRIGGER_TYPES

// --- Output Schemas ---

const macroAssignmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  macroId: z.string().uuid(),
  tariffId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
  executionDay: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const macroOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  macroType: z.string(),
  actionType: z.string(),
  actionParams: z.unknown(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  assignments: z.array(macroAssignmentOutputSchema).optional(),
})

const macroExecutionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  macroId: z.string().uuid(),
  assignmentId: z.string().uuid().nullable(),
  status: z.string(),
  triggerType: z.string(),
  triggeredBy: z.string().uuid().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  result: z.unknown(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
})

// --- Input Schemas ---

const createMacroInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  macroType: z.enum(MACRO_TYPES),
  actionType: z.enum(ACTION_TYPES),
  actionParams: z.unknown().optional(),
})

const updateMacroInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  macroType: z.enum(MACRO_TYPES).optional(),
  actionType: z.enum(ACTION_TYPES).optional(),
  actionParams: z.unknown().optional(),
  isActive: z.boolean().optional(),
})

const createAssignmentInputSchema = z.object({
  macroId: z.string().uuid(),
  tariffId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  executionDay: z.number().int(),
})

const updateAssignmentInputSchema = z.object({
  macroId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  executionDay: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Validates executionDay based on macroType.
 * Weekly: 0-6 (Sun-Sat). Monthly: 1-31.
 */
function validateExecutionDay(macroType: string, day: number): void {
  if (macroType === "weekly" && (day < 0 || day > 6)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Weekly execution day must be 0-6 (Sun-Sat)",
    })
  }
  if (macroType === "monthly" && (day < 1 || day > 31)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Monthly execution day must be 1-31",
    })
  }
}

/**
 * Executes a macro action and returns the result.
 * Port of Go executeAction (service/macro.go lines 479-528).
 */
export async function executeAction(macro: {
  id: string
  name: string
  macroType: string
  actionType: string
  actionParams: unknown
}): Promise<{ result: unknown; error: string | null }> {
  const executedAt = new Date().toISOString()
  switch (macro.actionType) {
    case "log_message":
      return {
        result: {
          action: "log_message",
          macro_name: macro.name,
          macro_type: macro.macroType,
          executed_at: executedAt,
        },
        error: null,
      }
    case "recalculate_target_hours":
      return {
        result: {
          action: "recalculate_target_hours",
          status: "placeholder",
          executed_at: executedAt,
        },
        error: null,
      }
    case "reset_flextime":
      return {
        result: {
          action: "reset_flextime",
          status: "placeholder",
          executed_at: executedAt,
        },
        error: null,
      }
    case "carry_forward_balance":
      return {
        result: {
          action: "carry_forward_balance",
          status: "placeholder",
          executed_at: executedAt,
        },
        error: null,
      }
    default:
      return { result: {}, error: `Unknown action type: ${macro.actionType}` }
  }
}

// --- Prisma Include Objects ---

const macroWithAssignments = {
  assignments: { orderBy: { createdAt: "asc" as const } },
} as const

// --- Router ---

export const macrosRouter = createTRPCRouter({
  // ==================== Macro CRUD ====================

  /**
   * macros.list -- Returns all macros for the current tenant with assignments.
   *
   * Orders by name ASC.
   *
   * Requires: macros.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.void().optional())
    .output(z.object({ data: z.array(macroOutputSchema) }))
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId!

      const macros = await ctx.prisma.macro.findMany({
        where: { tenantId },
        include: macroWithAssignments,
        orderBy: { name: "asc" },
      })

      return {
        data: macros.map((m) => ({
          id: m.id,
          tenantId: m.tenantId,
          name: m.name,
          description: m.description,
          macroType: m.macroType,
          actionType: m.actionType,
          actionParams: m.actionParams,
          isActive: m.isActive,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          assignments: m.assignments.map((a) => ({
            id: a.id,
            tenantId: a.tenantId,
            macroId: a.macroId,
            tariffId: a.tariffId,
            employeeId: a.employeeId,
            executionDay: a.executionDay,
            isActive: a.isActive,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })),
        })),
      }
    }),

  /**
   * macros.getById -- Returns a single macro by ID with assignments.
   *
   * Requires: macros.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(macroOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.id, tenantId },
        include: macroWithAssignments,
      })

      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      return {
        id: macro.id,
        tenantId: macro.tenantId,
        name: macro.name,
        description: macro.description,
        macroType: macro.macroType,
        actionType: macro.actionType,
        actionParams: macro.actionParams,
        isActive: macro.isActive,
        createdAt: macro.createdAt,
        updatedAt: macro.updatedAt,
        assignments: macro.assignments.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          macroId: a.macroId,
          tariffId: a.tariffId,
          employeeId: a.employeeId,
          executionDay: a.executionDay,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      }
    }),

  /**
   * macros.create -- Creates a new macro.
   *
   * Validates name non-empty, name uniqueness per tenant,
   * macroType and actionType enums.
   *
   * Requires: macros.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(createMacroInputSchema)
    .output(macroOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Macro name is required",
        })
      }

      // Check name uniqueness within tenant
      const existingByName = await ctx.prisma.macro.findFirst({
        where: { tenantId, name },
      })
      if (existingByName) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Macro name already exists",
        })
      }

      const macro = await ctx.prisma.macro.create({
        data: {
          tenantId,
          name,
          description: input.description?.trim() || null,
          macroType: input.macroType,
          actionType: input.actionType,
          actionParams: (input.actionParams as object) ?? {},
          isActive: true,
        },
      })

      // Re-fetch with assignments
      const result = await ctx.prisma.macro.findFirst({
        where: { id: macro.id, tenantId },
        include: macroWithAssignments,
      })

      return {
        id: result!.id,
        tenantId: result!.tenantId,
        name: result!.name,
        description: result!.description,
        macroType: result!.macroType,
        actionType: result!.actionType,
        actionParams: result!.actionParams,
        isActive: result!.isActive,
        createdAt: result!.createdAt,
        updatedAt: result!.updatedAt,
        assignments: result!.assignments.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          macroId: a.macroId,
          tariffId: a.tariffId,
          employeeId: a.employeeId,
          executionDay: a.executionDay,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      }
    }),

  /**
   * macros.update -- Updates an existing macro.
   *
   * Supports partial updates. If name changed, checks uniqueness.
   *
   * Requires: macros.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(updateMacroInputSchema)
    .output(macroOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists (tenant-scoped)
      const existing = await ctx.prisma.macro.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Macro name is required",
          })
        }
        // Check uniqueness if name changed
        if (name !== existing.name) {
          const conflict = await ctx.prisma.macro.findFirst({
            where: { tenantId, name },
          })
          if (conflict) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Macro name already exists",
            })
          }
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      if (input.macroType !== undefined) {
        data.macroType = input.macroType
      }

      if (input.actionType !== undefined) {
        data.actionType = input.actionType
      }

      if (input.actionParams !== undefined) {
        data.actionParams = input.actionParams as object
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      await ctx.prisma.macro.update({
        where: { id: input.id },
        data,
      })

      // Re-fetch with assignments
      const result = await ctx.prisma.macro.findFirst({
        where: { id: input.id, tenantId },
        include: macroWithAssignments,
      })

      return {
        id: result!.id,
        tenantId: result!.tenantId,
        name: result!.name,
        description: result!.description,
        macroType: result!.macroType,
        actionType: result!.actionType,
        actionParams: result!.actionParams,
        isActive: result!.isActive,
        createdAt: result!.createdAt,
        updatedAt: result!.updatedAt,
        assignments: result!.assignments.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          macroId: a.macroId,
          tariffId: a.tariffId,
          employeeId: a.employeeId,
          executionDay: a.executionDay,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      }
    }),

  /**
   * macros.delete -- Deletes a macro.
   *
   * Cascades to assignments and executions via FK.
   *
   * Requires: macros.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists (tenant-scoped)
      const existing = await ctx.prisma.macro.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Hard delete (cascades to assignments and executions via FK)
      await ctx.prisma.macro.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  // ==================== Assignment Management ====================

  /**
   * macros.listAssignments -- Lists assignments for a macro.
   *
   * Requires: macros.manage permission
   */
  listAssignments: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ macroId: z.string().uuid() }))
    .output(z.object({ data: z.array(macroAssignmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists in tenant
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      const assignments = await ctx.prisma.macroAssignment.findMany({
        where: { macroId: input.macroId },
        orderBy: { createdAt: "asc" },
      })

      return {
        data: assignments.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          macroId: a.macroId,
          tariffId: a.tariffId,
          employeeId: a.employeeId,
          executionDay: a.executionDay,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      }
    }),

  /**
   * macros.createAssignment -- Creates a new assignment for a macro.
   *
   * Validates exactly one of tariffId/employeeId (XOR).
   * Validates executionDay based on macroType.
   *
   * Requires: macros.manage permission
   */
  createAssignment: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(createAssignmentInputSchema)
    .output(macroAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists in tenant
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Validate exactly one of tariffId/employeeId
      const hasTariff = !!input.tariffId
      const hasEmployee = !!input.employeeId
      if (hasTariff === hasEmployee) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Exactly one of tariffId or employeeId must be provided",
        })
      }

      // Validate executionDay based on macroType
      validateExecutionDay(macro.macroType, input.executionDay)

      const assignment = await ctx.prisma.macroAssignment.create({
        data: {
          tenantId,
          macroId: input.macroId,
          tariffId: input.tariffId || null,
          employeeId: input.employeeId || null,
          executionDay: input.executionDay,
          isActive: true,
        },
      })

      return {
        id: assignment.id,
        tenantId: assignment.tenantId,
        macroId: assignment.macroId,
        tariffId: assignment.tariffId,
        employeeId: assignment.employeeId,
        executionDay: assignment.executionDay,
        isActive: assignment.isActive,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      }
    }),

  /**
   * macros.updateAssignment -- Updates an existing macro assignment.
   *
   * Verifies assignment belongs to the macro.
   * Validates executionDay if provided.
   *
   * Requires: macros.manage permission
   */
  updateAssignment: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(updateAssignmentInputSchema)
    .output(macroAssignmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists in tenant
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Verify assignment exists AND belongs to macro
      const existing = await ctx.prisma.macroAssignment.findFirst({
        where: { id: input.assignmentId, macroId: input.macroId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro assignment not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.executionDay !== undefined) {
        validateExecutionDay(macro.macroType, input.executionDay)
        data.executionDay = input.executionDay
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const assignment = await ctx.prisma.macroAssignment.update({
        where: { id: input.assignmentId },
        data,
      })

      return {
        id: assignment.id,
        tenantId: assignment.tenantId,
        macroId: assignment.macroId,
        tariffId: assignment.tariffId,
        employeeId: assignment.employeeId,
        executionDay: assignment.executionDay,
        isActive: assignment.isActive,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      }
    }),

  /**
   * macros.deleteAssignment -- Deletes a macro assignment.
   *
   * Verifies assignment belongs to the macro.
   *
   * Requires: macros.manage permission
   */
  deleteAssignment: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(
      z.object({
        macroId: z.string().uuid(),
        assignmentId: z.string().uuid(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists in tenant
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Verify assignment exists AND belongs to macro
      const existing = await ctx.prisma.macroAssignment.findFirst({
        where: { id: input.assignmentId, macroId: input.macroId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro assignment not found",
        })
      }

      await ctx.prisma.macroAssignment.delete({
        where: { id: input.assignmentId },
      })

      return { success: true }
    }),

  // ==================== Execution ====================

  /**
   * macros.triggerExecution -- Manually triggers execution of a macro.
   *
   * Creates an execution record, runs the action, and updates status.
   *
   * Requires: macros.manage permission
   */
  triggerExecution: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ macroId: z.string().uuid() }))
    .output(macroExecutionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const userId = ctx.user!.id

      // Fetch macro (verify tenantId + id)
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      // Check isActive
      if (!macro.isActive) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot execute inactive macro",
        })
      }

      // Create execution record
      const execution = await ctx.prisma.macroExecution.create({
        data: {
          tenantId,
          macroId: input.macroId,
          status: "running",
          triggerType: "manual",
          triggeredBy: userId,
          startedAt: new Date(),
        },
      })

      // Run action
      const actionResult = await executeAction({
        id: macro.id,
        name: macro.name,
        macroType: macro.macroType,
        actionType: macro.actionType,
        actionParams: macro.actionParams,
      })

      // Update execution record
      const updated = await ctx.prisma.macroExecution.update({
        where: { id: execution.id },
        data: {
          completedAt: new Date(),
          status: actionResult.error ? "failed" : "completed",
          result: (actionResult.result as object) ?? {},
          errorMessage: actionResult.error,
        },
      })

      return {
        id: updated.id,
        tenantId: updated.tenantId,
        macroId: updated.macroId,
        assignmentId: updated.assignmentId,
        status: updated.status,
        triggerType: updated.triggerType,
        triggeredBy: updated.triggeredBy,
        startedAt: updated.startedAt,
        completedAt: updated.completedAt,
        result: updated.result,
        errorMessage: updated.errorMessage,
        createdAt: updated.createdAt,
      }
    }),

  /**
   * macros.listExecutions -- Lists executions for a macro.
   *
   * Orders by createdAt DESC, with optional limit.
   *
   * Requires: macros.manage permission
   */
  listExecutions: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(
      z.object({
        macroId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      })
    )
    .output(z.object({ data: z.array(macroExecutionOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify macro exists in tenant
      const macro = await ctx.prisma.macro.findFirst({
        where: { id: input.macroId, tenantId },
      })
      if (!macro) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro not found",
        })
      }

      const executions = await ctx.prisma.macroExecution.findMany({
        where: { macroId: input.macroId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      })

      return {
        data: executions.map((e) => ({
          id: e.id,
          tenantId: e.tenantId,
          macroId: e.macroId,
          assignmentId: e.assignmentId,
          status: e.status,
          triggerType: e.triggerType,
          triggeredBy: e.triggeredBy,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          result: e.result,
          errorMessage: e.errorMessage,
          createdAt: e.createdAt,
        })),
      }
    }),

  /**
   * macros.getExecution -- Returns a single execution by ID.
   *
   * Requires: macros.manage permission
   */
  getExecution: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(macroExecutionOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const execution = await ctx.prisma.macroExecution.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Macro execution not found",
        })
      }

      return {
        id: execution.id,
        tenantId: execution.tenantId,
        macroId: execution.macroId,
        assignmentId: execution.assignmentId,
        status: execution.status,
        triggerType: execution.triggerType,
        triggeredBy: execution.triggeredBy,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        result: execution.result,
        errorMessage: execution.errorMessage,
        createdAt: execution.createdAt,
      }
    }),
})
