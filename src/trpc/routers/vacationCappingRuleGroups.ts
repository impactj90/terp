/**
 * Vacation Capping Rule Groups Router
 *
 * Provides CRUD operations for vacation capping rule groups via tRPC procedures.
 * Groups link to capping rules via a junction table (M2M).
 *
 * Replaces the Go backend endpoints:
 * - GET /vacation-capping-rule-groups -> vacationCappingRuleGroups.list
 * - GET /vacation-capping-rule-groups/{id} -> vacationCappingRuleGroups.getById
 * - POST /vacation-capping-rule-groups -> vacationCappingRuleGroups.create
 * - PATCH /vacation-capping-rule-groups/{id} -> vacationCappingRuleGroups.update
 * - DELETE /vacation-capping-rule-groups/{id} -> vacationCappingRuleGroups.delete
 *
 * @see apps/api/internal/service/vacationcappingrulegroup.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as vacationCappingRuleGroupService from "@/lib/services/vacation-capping-rule-group-service"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Output Schemas ---

const cappingRuleSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  ruleType: z.string(),
  capValue: z.number(),
})

const vacationCappingRuleGroupOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cappingRules: z.array(cappingRuleSummarySchema).optional(),
})

type VacationCappingRuleGroupOutput = z.infer<
  typeof vacationCappingRuleGroupOutputSchema
>

// --- Input Schemas ---

const createVacationCappingRuleGroupInputSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  cappingRuleIds: z.array(z.string()).optional(),
})

const updateVacationCappingRuleGroupInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  cappingRuleIds: z.array(z.string()).optional(),
})

// --- Prisma Include Objects ---

const ruleGroupDetailInclude = {
  cappingRuleLinks: {
    include: {
      cappingRule: {
        select: {
          id: true,
          code: true,
          name: true,
          ruleType: true,
          capValue: true,
        },
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

function mapToOutput(
  r: Record<string, unknown>
): VacationCappingRuleGroupOutput {
  const base: VacationCappingRuleGroupOutput = {
    id: r.id as string,
    tenantId: r.tenantId as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }

  // Map junction table links to flat capping rules array
  const links = r.cappingRuleLinks as
    | Array<{
        cappingRule: {
          id: string
          code: string
          name: string
          ruleType: string
          capValue: Prisma.Decimal
        }
      }>
    | undefined
  if (links) {
    base.cappingRules = links.map((link) => ({
      id: link.cappingRule.id,
      code: link.cappingRule.code,
      name: link.cappingRule.name,
      ruleType: link.cappingRule.ruleType,
      capValue: decimalToNumber(link.cappingRule.capValue) ?? 0,
    }))
  }

  return base
}

// --- Router ---

export const vacationCappingRuleGroupsRouter = createTRPCRouter({
  /**
   * vacationCappingRuleGroups.list -- Returns capping rule groups for the current tenant.
   *
   * Includes nested capping rules summary.
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
    .output(
      z.object({ data: z.array(vacationCappingRuleGroupOutputSchema) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const items = await ctx.prisma.vacationCappingRuleGroup.findMany({
        where,
        include: ruleGroupDetailInclude,
        orderBy: { code: "asc" },
      })

      return {
        data: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * vacationCappingRuleGroups.getById -- Returns a single capping rule group by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(vacationCappingRuleGroupOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const item = await ctx.prisma.vacationCappingRuleGroup.findFirst({
        where: { id: input.id, tenantId },
        include: ruleGroupDetailInclude,
      })

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation capping rule group not found",
        })
      }

      return mapToOutput(item as unknown as Record<string, unknown>)
    }),

  /**
   * vacationCappingRuleGroups.create -- Creates a new capping rule group.
   *
   * Validates code uniqueness and capping rule IDs.
   * Uses transaction for atomicity when linking junction records.
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(createVacationCappingRuleGroupInputSchema)
    .output(vacationCappingRuleGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const result = await vacationCappingRuleGroupService.create(
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
   * vacationCappingRuleGroups.update -- Updates an existing capping rule group.
   *
   * Supports partial updates. If cappingRuleIds is provided (not undefined),
   * replaces all junction entries.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(updateVacationCappingRuleGroupInputSchema)
    .output(vacationCappingRuleGroupOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const result = await vacationCappingRuleGroupService.update(
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
   * vacationCappingRuleGroups.delete -- Deletes a capping rule group.
   *
   * Checks usage in tariffs before deletion.
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
        await vacationCappingRuleGroupService.remove(
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
