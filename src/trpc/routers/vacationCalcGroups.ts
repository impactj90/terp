/**
 * Vacation Calculation Groups Router
 *
 * Provides CRUD operations for vacation calculation groups via tRPC procedures.
 * Groups link to special calculations via a junction table (M2M).
 *
 * Replaces the Go backend endpoints:
 * - GET /vacation-calculation-groups -> vacationCalcGroups.list
 * - GET /vacation-calculation-groups/{id} -> vacationCalcGroups.getById
 * - POST /vacation-calculation-groups -> vacationCalcGroups.create
 * - PATCH /vacation-calculation-groups/{id} -> vacationCalcGroups.update
 * - DELETE /vacation-calculation-groups/{id} -> vacationCalcGroups.delete
 *
 * @see apps/api/internal/service/vacationcalcgroup.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as vacationCalcGroupService from "@/lib/services/vacation-calc-group-service"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const VACATION_BASES = ["calendar_year", "entry_date"] as const

// --- Output Schemas ---

const specialCalcSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  threshold: z.number(),
  bonusDays: z.number(),
})

const vacationCalcGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  basis: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  specialCalculations: z.array(specialCalcSummarySchema).optional(),
})

type VacationCalcGroupOutput = z.infer<typeof vacationCalcGroupOutputSchema>

// --- Input Schemas ---

const createVacationCalcGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  basis: z.enum(VACATION_BASES).optional().default("calendar_year"),
  isActive: z.boolean().optional().default(true),
  specialCalculationIds: z.array(z.string()).optional(),
})

const updateVacationCalcGroupInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  basis: z.enum(VACATION_BASES).optional(),
  isActive: z.boolean().optional(),
  specialCalculationIds: z.array(z.string()).optional(),
})

// --- Prisma Include Objects ---

const calcGroupDetailInclude = {
  specialCalcLinks: {
    include: {
      specialCalculation: {
        select: { id: true, type: true, threshold: true, bonusDays: true },
      },
    },
  },
} as const

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function mapToOutput(r: Record<string, unknown>): VacationCalcGroupOutput {
  const base: VacationCalcGroupOutput = {
    id: r.id as string,
    tenantId: r.tenantId as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    basis: r.basis as string,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }

  // Map junction table links to flat special calculations array
  const links = r.specialCalcLinks as
    | Array<{ specialCalculation: { id: string; type: string; threshold: number; bonusDays: Prisma.Decimal } }>
    | undefined
  if (links) {
    base.specialCalculations = links.map((link) => ({
      id: link.specialCalculation.id,
      type: link.specialCalculation.type,
      threshold: link.specialCalculation.threshold,
      bonusDays: decimalToNumber(link.specialCalculation.bonusDays) ?? 0,
    }))
  }

  return base
}

// --- Router ---

export const vacationCalcGroupsRouter = createTRPCRouter({
  /**
   * vacationCalcGroups.list -- Returns calculation groups for the current tenant.
   *
   * Includes nested special calculations summary.
   * Supports optional isActive filter.
   * Orders by code ASC.
   *
   * Requires: vacation_config.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(vacationCalcGroupOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const items = await ctx.prisma.vacationCalculationGroup.findMany({
        where,
        include: calcGroupDetailInclude,
        orderBy: { code: "asc" },
      })

      return {
        data: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * vacationCalcGroups.getById -- Returns a single calculation group by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(vacationCalcGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const item = await ctx.prisma.vacationCalculationGroup.findFirst({
        where: { id: input.id, tenantId },
        include: calcGroupDetailInclude,
      })

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation calculation group not found",
        })
      }

      return mapToOutput(item as unknown as Record<string, unknown>)
    }),

  /**
   * vacationCalcGroups.create -- Creates a new calculation group.
   *
   * Validates code uniqueness and special calculation IDs.
   * Uses transaction for atomicity when linking junction records.
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(createVacationCalcGroupInputSchema)
    .output(vacationCalcGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const result = await vacationCalcGroupService.create(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(result as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationCalcGroups.update -- Updates an existing calculation group.
   *
   * Supports partial updates. If specialCalculationIds is provided (not undefined),
   * replaces all junction entries.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(updateVacationCalcGroupInputSchema)
    .output(vacationCalcGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const result = await vacationCalcGroupService.update(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(result as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * vacationCalcGroups.delete -- Deletes a calculation group.
   *
   * Checks usage in employment types before deletion.
   *
   * Requires: vacation_config.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await vacationCalcGroupService.remove(
          ctx.prisma,
          tenantId,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
