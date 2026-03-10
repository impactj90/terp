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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as macrosService from "@/lib/services/macros-service"

// Re-export executeAction so existing consumers don't break
export { executeAction } from "@/lib/services/macros-service"

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
  id: z.string(),
  tenantId: z.string(),
  macroId: z.string(),
  tariffId: z.string().nullable(),
  employeeId: z.string().nullable(),
  executionDay: z.number(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const macroOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  id: z.string(),
  tenantId: z.string(),
  macroId: z.string(),
  assignmentId: z.string().nullable(),
  status: z.string(),
  triggerType: z.string(),
  triggeredBy: z.string().nullable(),
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
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  macroType: z.enum(MACRO_TYPES).optional(),
  actionType: z.enum(ACTION_TYPES).optional(),
  actionParams: z.unknown().optional(),
  isActive: z.boolean().optional(),
})

const createAssignmentInputSchema = z.object({
  macroId: z.string(),
  tariffId: z.string().optional(),
  employeeId: z.string().optional(),
  executionDay: z.number().int(),
})

const updateAssignmentInputSchema = z.object({
  macroId: z.string(),
  assignmentId: z.string(),
  executionDay: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// --- Mapping Functions ---

function mapMacroToOutput(m: {
  id: string
  tenantId: string
  name: string
  description: string | null
  macroType: string
  actionType: string
  actionParams: unknown
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  assignments: Array<{
    id: string
    tenantId: string
    macroId: string
    tariffId: string | null
    employeeId: string | null
    executionDay: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }>
}) {
  return {
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
    assignments: m.assignments.map(mapAssignmentToOutput),
  }
}

function mapAssignmentToOutput(a: {
  id: string
  tenantId: string
  macroId: string
  tariffId: string | null
  employeeId: string | null
  executionDay: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    macroId: a.macroId,
    tariffId: a.tariffId,
    employeeId: a.employeeId,
    executionDay: a.executionDay,
    isActive: a.isActive,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}

function mapExecutionToOutput(e: {
  id: string
  tenantId: string
  macroId: string
  assignmentId: string | null
  status: string
  triggerType: string
  triggeredBy: string | null
  startedAt: Date | null
  completedAt: Date | null
  result: unknown
  errorMessage: string | null
  createdAt: Date
}) {
  return {
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
  }
}

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
      try {
        const macros = await macrosService.list(ctx.prisma, ctx.tenantId!)
        return { data: macros.map(mapMacroToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * macros.getById -- Returns a single macro by ID with assignments.
   *
   * Requires: macros.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(macroOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const macro = await macrosService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapMacroToOutput(macro)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const macro = await macrosService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapMacroToOutput(macro)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const macro = await macrosService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapMacroToOutput(macro)
      } catch (err) {
        handleServiceError(err)
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await macrosService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ==================== Assignment Management ====================

  /**
   * macros.listAssignments -- Lists assignments for a macro.
   *
   * Requires: macros.manage permission
   */
  listAssignments: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ macroId: z.string() }))
    .output(z.object({ data: z.array(macroAssignmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const assignments = await macrosService.listAssignments(
          ctx.prisma,
          ctx.tenantId!,
          input.macroId
        )
        return { data: assignments.map(mapAssignmentToOutput) }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const assignment = await macrosService.createAssignment(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
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
      try {
        const assignment = await macrosService.updateAssignment(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapAssignmentToOutput(assignment)
      } catch (err) {
        handleServiceError(err)
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
        macroId: z.string(),
        assignmentId: z.string(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await macrosService.deleteAssignment(
          ctx.prisma,
          ctx.tenantId!,
          input.macroId,
          input.assignmentId
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ macroId: z.string() }))
    .output(macroExecutionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const execution = await macrosService.triggerExecution(
          ctx.prisma,
          ctx.tenantId!,
          input.macroId,
          ctx.user!.id
        )
        return mapExecutionToOutput(execution)
      } catch (err) {
        handleServiceError(err)
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
        macroId: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(20),
      })
    )
    .output(z.object({ data: z.array(macroExecutionOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const executions = await macrosService.listExecutions(
          ctx.prisma,
          ctx.tenantId!,
          input.macroId,
          input.limit
        )
        return { data: executions.map(mapExecutionToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * macros.getExecution -- Returns a single execution by ID.
   *
   * Requires: macros.manage permission
   */
  getExecution: tenantProcedure
    .use(requirePermission(MACROS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(macroExecutionOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const execution = await macrosService.getExecution(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapExecutionToOutput(execution)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
