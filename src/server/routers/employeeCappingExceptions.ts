/**
 * Employee Capping Exceptions Router
 *
 * Provides CRUD operations for employee capping exceptions via tRPC procedures.
 *
 * Replaces the Go backend endpoints:
 * - GET /employee-capping-exceptions -> employeeCappingExceptions.list
 * - GET /employee-capping-exceptions/{id} -> employeeCappingExceptions.getById
 * - POST /employee-capping-exceptions -> employeeCappingExceptions.create
 * - PATCH /employee-capping-exceptions/{id} -> employeeCappingExceptions.update
 * - DELETE /employee-capping-exceptions/{id} -> employeeCappingExceptions.delete
 *
 * @see apps/api/internal/service/employeecappingexception.go
 */
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const VACATION_CONFIG_MANAGE = permissionIdByKey("vacation_config.manage")!

// --- Enum Constants ---

const EXEMPTION_TYPES = ["full", "partial"] as const

// --- Output Schemas ---

const employeeCappingExceptionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  cappingRuleId: z.string().uuid(),
  exemptionType: z.string(),
  retainDays: z.number().nullable(),
  year: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type EmployeeCappingExceptionOutput = z.infer<
  typeof employeeCappingExceptionOutputSchema
>

// --- Input Schemas ---

const createEmployeeCappingExceptionInputSchema = z.object({
  employeeId: z.string().uuid(),
  cappingRuleId: z.string().uuid(),
  exemptionType: z.enum(EXEMPTION_TYPES),
  retainDays: z.number().min(0).optional(),
  year: z.number().int().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

const updateEmployeeCappingExceptionInputSchema = z.object({
  id: z.string().uuid(),
  exemptionType: z.enum(EXEMPTION_TYPES).optional(),
  retainDays: z.number().min(0).nullable().optional(),
  year: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function mapToOutput(
  r: Record<string, unknown>
): EmployeeCappingExceptionOutput {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    employeeId: r.employeeId as string,
    cappingRuleId: r.cappingRuleId as string,
    exemptionType: r.exemptionType as string,
    retainDays: decimalToNumber(
      r.retainDays as Prisma.Decimal | null | undefined
    ),
    year: (r.year as number | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isActive: r.isActive as boolean,
    createdAt: r.createdAt as Date,
    updatedAt: r.updatedAt as Date,
  }
}

// --- Router ---

export const employeeCappingExceptionsRouter = createTRPCRouter({
  /**
   * employeeCappingExceptions.list -- Returns exceptions for the current tenant.
   *
   * Supports optional filters: employeeId, cappingRuleId, year.
   * Year filter matches both specific year AND null-year entries (per Go behavior).
   * Orders by createdAt DESC.
   *
   * Requires: vacation_config.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(
      z
        .object({
          employeeId: z.string().uuid().optional(),
          cappingRuleId: z.string().uuid().optional(),
          year: z.number().int().optional(),
        })
        .optional()
    )
    .output(
      z.object({ data: z.array(employeeCappingExceptionOutputSchema) })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const where: Record<string, unknown> = { tenantId }

      if (input?.employeeId !== undefined) {
        where.employeeId = input.employeeId
      }

      if (input?.cappingRuleId !== undefined) {
        where.cappingRuleId = input.cappingRuleId
      }

      if (input?.year !== undefined) {
        // Match Go behavior: return entries for specific year OR null year
        where.OR = [{ year: input.year }, { year: null }]
      }

      const items = await ctx.prisma.employeeCappingException.findMany({
        where,
        orderBy: { createdAt: "desc" },
      })

      return {
        data: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
      }
    }),

  /**
   * employeeCappingExceptions.getById -- Returns a single exception by ID.
   *
   * Requires: vacation_config.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(employeeCappingExceptionOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const item = await ctx.prisma.employeeCappingException.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee capping exception not found",
        })
      }

      return mapToOutput(item as unknown as Record<string, unknown>)
    }),

  /**
   * employeeCappingExceptions.create -- Creates a new exception.
   *
   * Validates:
   * - Capping rule exists
   * - RetainDays required for partial exemption type
   * - Uniqueness by employee + rule + year
   *
   * Requires: vacation_config.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(createEmployeeCappingExceptionInputSchema)
    .output(employeeCappingExceptionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate capping rule exists
      const rule = await ctx.prisma.vacationCappingRule.findFirst({
        where: { id: input.cappingRuleId, tenantId },
      })
      if (!rule) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Capping rule not found",
        })
      }

      // Validate retainDays for partial exemption
      if (
        input.exemptionType === "partial" &&
        (input.retainDays === undefined || input.retainDays === null)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Retain days is required for partial exemption type",
        })
      }

      // Check uniqueness: employee + rule + year
      // Handle null year carefully
      if (input.year !== undefined) {
        const existing =
          await ctx.prisma.employeeCappingException.findFirst({
            where: {
              employeeId: input.employeeId,
              cappingRuleId: input.cappingRuleId,
              year: input.year,
            },
          })
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An exception for this employee, rule, and year already exists",
          })
        }
      } else {
        // Check for null-year duplicate
        const existing =
          await ctx.prisma.employeeCappingException.findFirst({
            where: {
              employeeId: input.employeeId,
              cappingRuleId: input.cappingRuleId,
              year: null,
            },
          })
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An exception for this employee and rule (all years) already exists",
          })
        }
      }

      const created = await ctx.prisma.employeeCappingException.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          cappingRuleId: input.cappingRuleId,
          exemptionType: input.exemptionType,
          retainDays:
            input.retainDays !== undefined
              ? new Prisma.Decimal(input.retainDays)
              : null,
          year: input.year ?? null,
          notes: input.notes?.trim() || null,
          isActive: input.isActive,
        },
      })

      return mapToOutput(created as unknown as Record<string, unknown>)
    }),

  /**
   * employeeCappingExceptions.update -- Updates an existing exception.
   *
   * Supports partial updates. Validates retainDays required for partial type
   * after all changes applied.
   *
   * Requires: vacation_config.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(VACATION_CONFIG_MANAGE))
    .input(updateEmployeeCappingExceptionInputSchema)
    .output(employeeCappingExceptionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const existing =
        await ctx.prisma.employeeCappingException.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee capping exception not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      if (input.exemptionType !== undefined)
        data.exemptionType = input.exemptionType
      if (input.retainDays !== undefined) {
        data.retainDays =
          input.retainDays === null
            ? null
            : new Prisma.Decimal(input.retainDays)
      }
      if (input.year !== undefined) data.year = input.year
      if (input.notes !== undefined) {
        data.notes = input.notes === null ? null : input.notes.trim()
      }
      if (input.isActive !== undefined) data.isActive = input.isActive

      // Determine effective exemption type after update
      const effectiveType =
        input.exemptionType ?? existing.exemptionType
      const effectiveRetainDays =
        input.retainDays !== undefined
          ? input.retainDays
          : existing.retainDays !== null
            ? Number(existing.retainDays)
            : null

      // Validate retainDays required for partial
      if (
        effectiveType === "partial" &&
        (effectiveRetainDays === null || effectiveRetainDays === undefined)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Retain days is required for partial exemption type",
        })
      }

      const updated = await ctx.prisma.employeeCappingException.update({
        where: { id: input.id },
        data,
      })

      return mapToOutput(updated as unknown as Record<string, unknown>)
    }),

  /**
   * employeeCappingExceptions.delete -- Deletes an exception.
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
        await ctx.prisma.employeeCappingException.findFirst({
          where: { id: input.id, tenantId },
        })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee capping exception not found",
        })
      }

      await ctx.prisma.employeeCappingException.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
