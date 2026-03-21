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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as correctionService from "@/lib/services/correction-service"

// --- Permission Constants ---
// Matching Go route registration at apps/api/internal/handler/routes.go:1595-1618

const CORRECTIONS_MANAGE = permissionIdByKey("corrections.manage")!

// --- Output Schemas ---

const employeeSummarySchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    personnelNumber: z.string(),
    departmentId: z.string().nullable(),
  })
  .nullable()

const accountSummarySchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  })
  .nullable()

const correctionOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  correctionDate: z.date(),
  correctionType: z.string(),
  accountId: z.string().nullable(),
  valueMinutes: z.number().int(),
  reason: z.string(),
  status: z.string(),
  approvedBy: z.string().nullable(),
  approvedAt: z.date().nullable(),
  createdBy: z.string().nullable(),
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
    employeeId: z.string().optional(),
    fromDate: z.string().date().optional(), // YYYY-MM-DD
    toDate: z.string().date().optional(), // YYYY-MM-DD
    correctionType: z.string().optional(),
    status: z.string().optional(),
  })
  .optional()

const createInputSchema = z.object({
  employeeId: z.string(),
  correctionDate: z.string().date(), // YYYY-MM-DD
  correctionType: z.string().min(1),
  accountId: z.string().optional(),
  valueMinutes: z.number().int().min(-10080).max(10080),
  reason: z.string().max(500).optional().default(""),
})

const updateInputSchema = z.object({
  id: z.string(),
  valueMinutes: z.number().int().optional(),
  reason: z.string().optional(),
})

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
    .use(applyDataScope())
    .input(listInputSchema)
    .output(
      z.object({
        items: z.array(correctionOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const { items, total } = await correctionService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? undefined,
          dataScope
        )
        return {
          items: items.map((item) =>
            mapToOutput(item as unknown as Record<string, unknown>)
          ),
          total,
        }
      } catch (err) {
        handleServiceError(err)
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(correctionOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const correction = await correctionService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope
        )
        return mapToOutput(correction as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(createInputSchema)
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const correction = await correctionService.create(
          ctx.prisma,
          ctx.tenantId!,
          input,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(correction as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(updateInputSchema)
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const correction = await correctionService.update(
          ctx.prisma,
          ctx.tenantId!,
          input,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(correction as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        await correctionService.remove(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const correction = await correctionService.approve(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(correction as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(correctionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const correction = await correctionService.reject(
          ctx.prisma,
          ctx.tenantId!,
          input.id,
          dataScope,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapToOutput(correction as unknown as Record<string, unknown>)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})

// --- Exported Helpers for Testing ---

export { mapToOutput }
