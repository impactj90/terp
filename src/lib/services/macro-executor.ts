/**
 * MacroExecutor
 *
 * Standalone service for executing due macros (weekly and monthly).
 * Ported from Go MacroService.ExecuteDueMacros and MacroService.executeMacro.
 *
 * Iterates weekly and monthly macros, checks if assignments are due for the
 * given date, and executes matching actions. Records execution history in
 * the MacroExecution table.
 *
 * @see ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
 * @see Go source: apps/api/internal/service/macro.go (ExecuteDueMacros, executeMacro)
 */

import type { PrismaClient } from "@/generated/prisma/client"
import { executeAction } from "@/lib/services/macros-service"

// --- Exported Types ---

export interface ExecuteDueMacrosResult {
  executed: number
  failed: number
  errors: Array<{ macroId: string; assignmentId: string; error: string }>
}

// --- Service Class ---

export class MacroExecutor {
  constructor(private prisma: PrismaClient) {}

  /**
   * Executes all due macros for a tenant on the given date.
   *
   * Checks weekly macros against the weekday (0=Sunday..6=Saturday)
   * and monthly macros against the day of month (with last-day-of-month fallback).
   *
   * Port of Go MacroService.ExecuteDueMacros (macro.go lines 368-433).
   */
  async executeDueMacros(
    tenantId: string,
    date: Date,
  ): Promise<ExecuteDueMacrosResult> {
    const weekday = date.getUTCDay() // 0=Sunday..6=Saturday (matches Go's time.Weekday())
    const dayOfMonth = date.getUTCDate()
    const lastDayOfMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate()

    let executed = 0
    let failed = 0
    const errors: Array<{
      macroId: string
      assignmentId: string
      error: string
    }> = []

    // 1. Execute weekly macros
    const weeklyMacros = await this.prisma.macro.findMany({
      where: { tenantId, macroType: "weekly", isActive: true },
      include: { assignments: true },
    })

    for (const macro of weeklyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        if (assignment.executionDay === weekday) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }

    // 2. Execute monthly macros
    const monthlyMacros = await this.prisma.macro.findMany({
      where: { tenantId, macroType: "monthly", isActive: true },
      include: { assignments: true },
    })

    for (const macro of monthlyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        // Monthly day fallback: if configured day exceeds month length, use last day
        let effectiveDay = assignment.executionDay
        if (effectiveDay > lastDayOfMonth) {
          effectiveDay = lastDayOfMonth
        }
        if (effectiveDay === dayOfMonth) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }

    return { executed, failed, errors }
  }

  /**
   * Executes a single macro: creates execution record, runs the action,
   * and updates the execution record with the result.
   *
   * Port of Go MacroService.executeMacro (macro.go lines 435-476).
   */
  private async executeSingleMacro(
    macro: {
      id: string
      tenantId: string
      name: string
      macroType: string
      actionType: string
      actionParams: unknown
    },
    triggerType: "scheduled" | "manual",
    assignmentId: string,
  ): Promise<void> {
    // 1. Create execution record with status "running"
    const execution = await this.prisma.macroExecution.create({
      data: {
        tenantId: macro.tenantId,
        macroId: macro.id,
        assignmentId,
        status: "running",
        triggerType,
        startedAt: new Date(),
      },
    })

    // 2. Run the action
    const actionResult = await executeAction({
      id: macro.id,
      name: macro.name,
      macroType: macro.macroType,
      actionType: macro.actionType,
      actionParams: macro.actionParams,
    })

    // 3. Update execution record
    await this.prisma.macroExecution.update({
      where: { id: execution.id },
      data: {
        completedAt: new Date(),
        status: actionResult.error ? "failed" : "completed",
        result: (actionResult.result as object) ?? {},
        errorMessage: actionResult.error,
      },
    })

    // 4. If action returned an error, throw so caller counts it as failed
    if (actionResult.error) {
      throw new Error(actionResult.error)
    }
  }
}
