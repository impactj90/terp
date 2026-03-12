/**
 * Macros Service
 *
 * Business logic for macro CRUD, assignment management, and execution.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./macros-repository"

// --- Error Classes ---

export class MacroNotFoundError extends Error {
  constructor(message = "Macro not found") {
    super(message)
    this.name = "MacroNotFoundError"
  }
}

export class MacroAssignmentNotFoundError extends Error {
  constructor(message = "Macro assignment not found") {
    super(message)
    this.name = "MacroAssignmentNotFoundError"
  }
}

export class MacroExecutionNotFoundError extends Error {
  constructor(message = "Macro execution not found") {
    super(message)
    this.name = "MacroExecutionNotFoundError"
  }
}

export class MacroValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MacroValidationError"
  }
}

export class MacroConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MacroConflictError"
  }
}

// --- Helpers ---

/**
 * Validates executionDay based on macroType.
 * Weekly: 0-6 (Sun-Sat). Monthly: 1-31.
 */
function validateExecutionDay(macroType: string, day: number): void {
  if (macroType === "weekly" && (day < 0 || day > 6)) {
    throw new MacroValidationError(
      "Weekly execution day must be 0-6 (Sun-Sat)"
    )
  }
  if (macroType === "monthly" && (day < 1 || day > 31)) {
    throw new MacroValidationError("Monthly execution day must be 1-31")
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

// --- Macro CRUD ---

export async function list(prisma: PrismaClient, tenantId: string) {
  return repo.findManyMacros(prisma, tenantId)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const macro = await repo.findMacroById(prisma, tenantId, id)
  if (!macro) {
    throw new MacroNotFoundError()
  }
  return macro
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    macroType: string
    actionType: string
    actionParams?: unknown
  }
) {
  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new MacroValidationError("Macro name is required")
  }

  // Check name uniqueness within tenant
  const existingByName = await repo.findMacroByName(prisma, tenantId, name)
  if (existingByName) {
    throw new MacroConflictError("Macro name already exists")
  }

  const macro = await repo.createMacro(prisma, {
    tenantId,
    name,
    description: input.description?.trim() || null,
    macroType: input.macroType,
    actionType: input.actionType,
    actionParams: (input.actionParams as object) ?? {},
    isActive: true,
  })

  // Re-fetch with assignments
  const result = await repo.findMacroById(prisma, tenantId, macro.id)
  return result!
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    macroType?: string
    actionType?: string
    actionParams?: unknown
    isActive?: boolean
  }
) {
  // Verify macro exists (tenant-scoped)
  const existing = await repo.findMacroByIdBasic(prisma, tenantId, input.id)
  if (!existing) {
    throw new MacroNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new MacroValidationError("Macro name is required")
    }
    // Check uniqueness if name changed
    if (name !== existing.name) {
      const conflict = await repo.findMacroByName(prisma, tenantId, name)
      if (conflict) {
        throw new MacroConflictError("Macro name already exists")
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

  await repo.updateMacro(prisma, tenantId, input.id, data)

  // Re-fetch with assignments
  const result = await repo.findMacroById(prisma, tenantId, input.id)
  return result!
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify macro exists (tenant-scoped)
  const existing = await repo.findMacroByIdBasic(prisma, tenantId, id)
  if (!existing) {
    throw new MacroNotFoundError()
  }

  // Hard delete (cascades to assignments and executions via FK)
  await repo.deleteMacro(prisma, tenantId, id)
}

// --- Assignment Management ---

export async function listAssignments(
  prisma: PrismaClient,
  tenantId: string,
  macroId: string
) {
  // Verify macro exists in tenant
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  return repo.findAssignmentsByMacroId(prisma, macroId)
}

export async function createAssignment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    macroId: string
    tariffId?: string
    employeeId?: string
    executionDay: number
  }
) {
  // Verify macro exists in tenant
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, input.macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  // Validate exactly one of tariffId/employeeId
  const hasTariff = !!input.tariffId
  const hasEmployee = !!input.employeeId
  if (hasTariff === hasEmployee) {
    throw new MacroValidationError(
      "Exactly one of tariffId or employeeId must be provided"
    )
  }

  // Validate executionDay based on macroType
  validateExecutionDay(macro.macroType, input.executionDay)

  return repo.createAssignment(prisma, {
    tenantId,
    macroId: input.macroId,
    tariffId: input.tariffId || null,
    employeeId: input.employeeId || null,
    executionDay: input.executionDay,
    isActive: true,
  })
}

export async function updateAssignment(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    macroId: string
    assignmentId: string
    executionDay?: number
    isActive?: boolean
  }
) {
  // Verify macro exists in tenant
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, input.macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  // Verify assignment exists AND belongs to macro
  const existing = await repo.findAssignmentById(
    prisma,
    input.assignmentId,
    input.macroId
  )
  if (!existing) {
    throw new MacroAssignmentNotFoundError()
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

  return (await repo.updateAssignment(prisma, tenantId, input.assignmentId, data))!
}

export async function deleteAssignment(
  prisma: PrismaClient,
  tenantId: string,
  macroId: string,
  assignmentId: string
) {
  // Verify macro exists in tenant
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  // Verify assignment exists AND belongs to macro
  const existing = await repo.findAssignmentById(prisma, assignmentId, macroId)
  if (!existing) {
    throw new MacroAssignmentNotFoundError()
  }

  await repo.deleteAssignment(prisma, tenantId, assignmentId)
}

// --- Execution ---

export async function triggerExecution(
  prisma: PrismaClient,
  tenantId: string,
  macroId: string,
  userId: string
) {
  // Fetch macro (verify tenantId + id)
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  // Check isActive
  if (!macro.isActive) {
    throw new MacroValidationError("Cannot execute inactive macro")
  }

  // Create execution record
  const execution = await repo.createExecution(prisma, {
    tenantId,
    macroId,
    status: "running",
    triggerType: "manual",
    triggeredBy: userId,
    startedAt: new Date(),
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
  const updated = (await repo.updateExecution(prisma, tenantId, execution.id, {
    completedAt: new Date(),
    status: actionResult.error ? "failed" : "completed",
    result: (actionResult.result as object) ?? {},
    errorMessage: actionResult.error,
  }))!

  return updated
}

export async function listExecutions(
  prisma: PrismaClient,
  tenantId: string,
  macroId: string,
  limit: number
) {
  // Verify macro exists in tenant
  const macro = await repo.findMacroByIdBasic(prisma, tenantId, macroId)
  if (!macro) {
    throw new MacroNotFoundError()
  }

  return repo.findExecutionsByMacroId(prisma, macroId, limit)
}

export async function getExecution(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const execution = await repo.findExecutionById(prisma, tenantId, id)
  if (!execution) {
    throw new MacroExecutionNotFoundError()
  }
  return execution
}
