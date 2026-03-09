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
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const VACATION_BASES = ["calendar_year", "entry_date"] as const

// --- Output Schemas ---

const specialCalcSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  threshold: z.number(),
  bonusDays: z.number(),
})

const vacationCalcGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
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
  specialCalculationIds: z.array(z.string().uuid()).optional(),
})

const updateVacationCalcGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  basis: z.enum(VACATION_BASES).optional(),
  isActive: z.boolean().optional(),
  specialCalculationIds: z.array(z.string().uuid()).optional(),
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
    .input(z.object({ id: z.string().uuid() }))
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
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Name is required",
        })
      }

      // Check code uniqueness
      const existingByCode =
        await ctx.prisma.vacationCalculationGroup.findFirst({
          where: { tenantId, code },
        })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Calculation group code already exists",
        })
      }

      // Validate special calculation IDs
      if (input.specialCalculationIds && input.specialCalculationIds.length > 0) {
        const found = await ctx.prisma.vacationSpecialCalculation.findMany({
          where: { id: { in: input.specialCalculationIds } },
          select: { id: true },
        })
        if (found.length !== input.specialCalculationIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more special calculation IDs are invalid",
          })
        }
      }

      const description = input.description?.trim() || null

      // Create group + junction entries in transaction
      const group = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.vacationCalculationGroup.create({
          data: {
            tenantId,
            code,
            name,
            description,
            basis: input.basis,
            isActive: input.isActive,
          },
        })

        if (
          input.specialCalculationIds &&
          input.specialCalculationIds.length > 0
        ) {
          await tx.vacationCalcGroupSpecialCalc.createMany({
            data: input.specialCalculationIds.map((scId) => ({
              groupId: created.id,
              specialCalculationId: scId,
            })),
          })
        }

        return created
      })

      // Re-fetch with includes
      const result = await ctx.prisma.vacationCalculationGroup.findFirst({
        where: { id: group.id, tenantId },
        include: calcGroupDetailInclude,
      })

      return mapToOutput(result as unknown as Record<string, unknown>)
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
      const tenantId = ctx.tenantId!

      const existing =
        await ctx.prisma.vacationCalculationGroup.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation calculation group not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Name is required",
          })
        }
        data.name = name
      }

      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }
      if (input.basis !== undefined) data.basis = input.basis
      if (input.isActive !== undefined) data.isActive = input.isActive

      // Validate special calculation IDs if provided
      if (
        input.specialCalculationIds !== undefined &&
        input.specialCalculationIds.length > 0
      ) {
        const found = await ctx.prisma.vacationSpecialCalculation.findMany({
          where: { id: { in: input.specialCalculationIds } },
          select: { id: true },
        })
        if (found.length !== input.specialCalculationIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more special calculation IDs are invalid",
          })
        }
      }

      // Update group + replace junction entries in transaction
      await ctx.prisma.$transaction(async (tx) => {
        await tx.vacationCalculationGroup.update({
          where: { id: input.id },
          data,
        })

        // Replace junction entries if IDs provided
        if (input.specialCalculationIds !== undefined) {
          await tx.vacationCalcGroupSpecialCalc.deleteMany({
            where: { groupId: input.id },
          })
          if (input.specialCalculationIds.length > 0) {
            await tx.vacationCalcGroupSpecialCalc.createMany({
              data: input.specialCalculationIds.map((scId) => ({
                groupId: input.id,
                specialCalculationId: scId,
              })),
            })
          }
        }
      })

      // Re-fetch with includes
      const result = await ctx.prisma.vacationCalculationGroup.findFirst({
        where: { id: input.id, tenantId },
        include: calcGroupDetailInclude,
      })

      return mapToOutput(result as unknown as Record<string, unknown>)
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing =
        await ctx.prisma.vacationCalculationGroup.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation calculation group not found",
        })
      }

      // Check usage in employment types
      const usageCount = await ctx.prisma.employmentType.count({
        where: { vacationCalcGroupId: input.id },
      })
      if (usageCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete calculation group that is assigned to employment types",
        })
      }

      await ctx.prisma.vacationCalculationGroup.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
