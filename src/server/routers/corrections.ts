/**
 * Corrections Router
 *
 * Provides correction CRUD operations plus approve/reject workflow via tRPC procedures.
 * Includes paginated list with filters and relation preloads.
 * Triggers recalculation on correction approval.
 *
 * Replaces the Go backend correction endpoints:
 * - GET /corrections -> corrections.list
 * - GET /corrections/{id} -> corrections.getById
 * - POST /corrections -> corrections.create
 * - PATCH /corrections/{id} -> corrections.update
 * - DELETE /corrections/{id} -> corrections.delete
 * - POST /corrections/{id}/approve -> corrections.approve
 * - POST /corrections/{id}/reject -> corrections.reject
 *
 * @see apps/api/internal/service/correction.go
 * @see apps/api/internal/handler/correction.go
 * @see apps/api/internal/repository/correction.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import type { PrismaClient } from "@/generated/prisma/client"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { RecalcService } from "../services/recalc"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:1595-1618

const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    departmentId: z.string().uuid().nullable(),
  })
  .nullable()

const accountSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const correctionOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  correctionDate: z.date(),
  correctionType: z.string(),
  accountId: z.string().uuid().nullable(),
  valueMinutes: z.number().int(),
  reason: z.string(),
  status: z.string(),
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.date().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Nested relations (included in list/getById)
  employee: employeeSummarySchema.optional(),
  account: accountSummarySchema.optional(),
})

type CorrectionOutput = z.infer<typeof correctionOutputSchema>

// --- Input Schemas ---

const listInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
    employeeId: z.string().uuid().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    correctionType: z.string().optional(),
    status: z.string().optional(),
  })
  .optional()

const createInputSchema = z.object({
  employeeId: z.string().uuid(),
  correctionDate: z.string().date(), // YYYY-MM-DD
  correctionType: z.string().min(1),
  accountId: z.string().uuid().optional(),
  valueMinutes: z.number().int(),
  reason: z.string().optional().default(""),
})

const updateInputSchema = z.object({
  id: z.string().uuid(),
  valueMinutes: z.number().int().optional(),
  reason: z.string().optional(),
})

// --- Prisma Include Objects ---

const correctionInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      departmentId: true,
    },
  },
  account: {
    select: { id: true, code: true, name: true },
  },
} as const

// --- Helper Functions ---

/**
 * Maps a Prisma Correction record (with relations) to the output schema shape.
 * Mirrors Go correctionToResponse.
 */
function mapToOutput(record: Record<string, unknown>): CorrectionOutput {
  const employee = record.employee as {
    id: string
    firstName: string
    lastName: string
    personnelNumber: string
    departmentId: string | null
  } | null | undefined
  const account = record.account as {
    id: string
    code: string
    name: string
  } | null | undefined

  const result: CorrectionOutput = {
    id: record.id as string,
    tenantId: record.tenantId as string,
    employeeId: record.employeeId as string,
    correctionDate: record.correctionDate as Date,
    correctionType: record.correctionType as string,
    accountId: (record.accountId as string | null) ?? null,
    valueMinutes: record.valueMinutes as number,
    reason: record.reason as string,
    status: record.status as string,
    approvedBy: (record.approvedBy as string | null) ?? null,
    approvedAt: (record.approvedAt as Date | null) ?? null,
    createdBy: (record.createdBy as string | null) ?? null,
    createdAt: record.createdAt as Date,
    updatedAt: record.updatedAt as Date,
  }

  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          departmentId: employee.departmentId,
        }
      : null
  }

  if (account !== undefined) {
    result.account = account
      ? {
          id: account.id,
          code: account.code,
          name: account.name,
        }
      : null
  }

  return result
}

// --- Recalculation Helper ---

/**
 * Triggers recalculation for a specific employee/day.
 * Best effort -- errors are logged but do not fail the parent operation.
 * Uses RecalcService which triggers both daily calc AND monthly recalc.
 *
 * @see ZMI-TICKET-243
 */
async function triggerRecalc(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  correctionDate: Date
): Promise<void> {
  try {
    const service = new RecalcService(prisma)
    await service.triggerRecalc(tenantId, employeeId, correctionDate)
  } catch (error) {
    console.error(
      `Recalc failed for employee ${employeeId} on ${correctionDate.toISOString().split("T")[0]}:`,
      error
    )
  }
}

// --- Router ---

export const correctionsRouter = createTRPCRouter({
  /**
   * corrections.list -- Returns paginated corrections for the current tenant.
   *
   * Supports filters: employeeId, fromDate, toDate, correctionType, status.
   * Orders by correctionDate DESC, createdAt DESC (matches Go).
   * Includes employee and account relations.
   *
   * Requires: corrections.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(correctionOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 50

      const where: Record<string, unknown> = { tenantId }

      // Optional filters
      if (input?.employeeId) {
        where.employeeId = input.employeeId
      }

      if (input?.correctionType) {
        where.correctionType = input.correctionType
      }

      if (input?.status) {
        where.status = input.status
      }

      // Date range filters
      if (input?.fromDate || input?.toDate) {
        const correctionDate: Record<string, unknown> = {}
        if (input?.fromDate) {
          correctionDate.gte = new Date(input.fromDate)
        }
        if (input?.toDate) {
          correctionDate.lte = new Date(input.toDate)
        }
        where.correctionDate = correctionDate
      }

      const [items, total] = await Promise.all([
        ctx.prisma.correction.findMany({
          where,
          include: correctionInclude,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ correctionDate: "desc" }, { createdAt: "desc" }],
        }),
        ctx.prisma.correction.count({ where }),
      ])

      return {
        items: items.map((item) =>
          mapToOutput(item as unknown as Record<string, unknown>)
        ),
        total,
      }
    }),

  /**
   * corrections.getById -- Returns a single correction by ID.
   *
   * Tenant-scoped. Includes employee and account relations.
   *
   * Requires: corrections.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(correctionOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const correction = await ctx.prisma.correction.findFirst({
        where: { id: input.id, tenantId },
        include: correctionInclude,
      })

      if (!correction) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Correction not found",
        })
      }

      return mapToOutput(correction as unknown as Record<string, unknown>)
    }),

  /**
   * corrections.create -- Creates a new correction.
   *
   * Status defaults to "pending".
   * Validates employee and optional account exist in tenant.
   * Sets createdBy to current user.
   *
   * Requires: corrections.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(createInputSchema)
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Validate employee exists in tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Validate account exists in tenant (if provided)
      if (input.accountId) {
        const account = await ctx.prisma.account.findFirst({
          where: { id: input.accountId, tenantId },
        })
        if (!account) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Account not found",
          })
        }
      }

      // Create correction
      const correction = await ctx.prisma.correction.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          correctionDate: new Date(input.correctionDate),
          correctionType: input.correctionType,
          accountId: input.accountId || null,
          valueMinutes: input.valueMinutes,
          reason: input.reason,
          status: "pending",
          createdBy: ctx.user!.id,
        },
        include: correctionInclude,
      })

      return mapToOutput(correction as unknown as Record<string, unknown>)
    }),

  /**
   * corrections.update -- Updates an existing correction.
   *
   * Only pending corrections can be updated.
   * Supports partial updates of valueMinutes and reason.
   * Manually sets updatedAt (no @updatedAt in Prisma).
   *
   * Requires: corrections.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(updateInputSchema)
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.correction.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Correction not found",
        })
      }

      // Check status is pending
      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update pending corrections",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = { updatedAt: new Date() }

      if (input.valueMinutes !== undefined) {
        data.valueMinutes = input.valueMinutes
      }

      if (input.reason !== undefined) {
        data.reason = input.reason
      }

      // Update with includes
      const correction = await ctx.prisma.correction.update({
        where: { id: input.id },
        data,
        include: correctionInclude,
      })

      return mapToOutput(correction as unknown as Record<string, unknown>)
    }),

  /**
   * corrections.delete -- Deletes a correction.
   *
   * Cannot delete approved corrections (returns FORBIDDEN).
   * Tenant-scoped: verifies correction belongs to current tenant.
   *
   * Requires: corrections.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.correction.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Correction not found",
        })
      }

      // Cannot delete approved corrections
      if (existing.status === "approved") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete approved corrections",
        })
      }

      await ctx.prisma.correction.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * corrections.approve -- Approves a pending correction.
   *
   * Sets status to "approved", records approver and timestamp.
   * Triggers recalculation for the correction date (best effort).
   *
   * Requires: corrections.manage permission
   */
  approve: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.correction.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Correction not found",
        })
      }

      // Check status is pending
      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Correction is not in pending status",
        })
      }

      // Update to approved
      const correction = await ctx.prisma.correction.update({
        where: { id: input.id },
        data: {
          status: "approved",
          approvedBy: ctx.user!.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
        include: correctionInclude,
      })

      // Trigger recalculation for the correction date (best effort)
      await triggerRecalc(
        ctx.prisma,
        tenantId,
        existing.employeeId,
        existing.correctionDate
      )

      return mapToOutput(correction as unknown as Record<string, unknown>)
    }),

  /**
   * corrections.reject -- Rejects a pending correction.
   *
   * Sets status to "rejected", records rejector (using approvedBy field, matching Go)
   * and timestamp. Does NOT trigger recalculation.
   *
   * Requires: corrections.manage permission
   */
  reject: tenantProcedure
    .use(requirePermission(CORRECTIONS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch existing (tenant-scoped)
      const existing = await ctx.prisma.correction.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Correction not found",
        })
      }

      // Check status is pending
      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Correction is not in pending status",
        })
      }

      // Update to rejected (Go uses approvedBy for rejector too)
      const correction = await ctx.prisma.correction.update({
        where: { id: input.id },
        data: {
          status: "rejected",
          approvedBy: ctx.user!.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
        include: correctionInclude,
      })

      return mapToOutput(correction as unknown as Record<string, unknown>)
    }),
})

// --- Exported Helpers for Testing ---

export { mapToOutput }
