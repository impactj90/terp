/**
 * Vacation Special Calculations Router
 *
 * Provides CRUD operations for vacation special calculations (Sonderberechnungen)
 * via tRPC procedures.
 *
 * Replaces the Go backend endpoints:
 * - GET /vacation-special-calculations -> vacationSpecialCalcs.list
 * - GET /vacation-special-calculations/{id} -> vacationSpecialCalcs.getById
 * - POST /vacation-special-calculations -> vacationSpecialCalcs.create
 * - PATCH /vacation-special-calculations/{id} -> vacationSpecialCalcs.update
 * - DELETE /vacation-special-calculations/{id} -> vacationSpecialCalcs.delete
 *
 * @see apps/api/internal/service/vacationspecialcalc.go
 */
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as vacationSpecialCalcService from "@/lib/services/vacation-special-calc-service"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const SPECIAL_CALC_TYPES = ["age", "tenure", "disability"] as const

// --- Output Schemas ---

const vacationSpecialCalcOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.string(),
  threshold: z.number(),
  bonusDays: z.number(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type VacationSpecialCalcOutput = z.infer<typeof vacationSpecialCalcOutputSchema>

// --- Input Schemas ---

const createVacationSpecialCalcInputSchema = z.object({
  type: z.enum(SPECIAL_CALC_TYPES),
  threshold: z.number().int().min(0).default(0),
  bonusDays: z.number().positive("Bonus days must be positive"),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

const updateVacationSpecialCalcInputSchema = z.object({
  id: z.string().uuid(),
  threshold: z.number().int().min(0).optional(),
  bonusDays: z.number().positive().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Converts a Prisma Decimal to a number.
 */
function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

/**
 * Maps a Prisma VacationSpecialCalculation record to the output schema shape.
 */
function mapToOutput(
  r: Record<string, unknown>
): VacationSpecialCalcOutput {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    type: r.type as string,
    threshold: r.threshold as number,
    bonusDays: decimalToNumber(r.bonusDays as Prisma.Decimal) ?? 0,
    description: (r.description as string | null) ?? null,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }
}

// --- Router ---

export const vacationSpecialCalcsRouter = createTRPCRouter({
  /**
   * vacationSpecialCalcs.list -- Returns special calculations for the current tenant.
   *
   * Supports optional filters: isActive, type.
   * Orders by type ASC, threshold ASC.
   *
   * Requires: vacation_config.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          type: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(vacationSpecialCalcOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const items = await vacationSpecialCalcService.list(
          ctx.prisma,
          tenantId,
          input ?? undefined
        )
        return {
          data: items.map((item) =>
            mapToOutput(item as unknown as Record<string, unknown>)
          ),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationSpecialCalcs.getById -- Returns a single special calculation by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(vacationSpecialCalcOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const item = await vacationSpecialCalcService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapToOutput(item as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationSpecialCalcs.create -- Creates a new special calculation.
   *
   * Validates:
   * - Type must be age, tenure, or disability
   * - Threshold must be 0 for disability, positive for age/tenure
   * - BonusDays must be positive
   * - Uniqueness by type + threshold within tenant
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(createVacationSpecialCalcInputSchema)
    .output(vacationSpecialCalcOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const created = await vacationSpecialCalcService.create(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(created as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationSpecialCalcs.update -- Updates an existing special calculation.
   *
   * Supports partial updates. Validates threshold against existing type.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(updateVacationSpecialCalcInputSchema)
    .output(vacationSpecialCalcOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const updated = await vacationSpecialCalcService.update(
          ctx.prisma,
          tenantId,
          input
        )
        return mapToOutput(updated as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationSpecialCalcs.delete -- Deletes a special calculation.
   *
   * Checks usage in calc group junction table before deletion.
   *
   * Requires: vacation_config.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await vacationSpecialCalcService.remove(
          ctx.prisma,
          tenantId,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
