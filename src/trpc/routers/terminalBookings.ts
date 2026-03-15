/**
 * Terminal Bookings Router
 *
 * Provides listing of raw terminal bookings, triggering imports, and
 * managing import batches via tRPC procedures.
 *
 * Replaces the Go backend terminal endpoints:
 * - GET    /terminal-bookings         -> terminalBookings.list
 * - POST   /terminal-bookings/import  -> terminalBookings.import
 * - GET    /import-batches            -> terminalBookings.batches
 * - GET    /import-batches/{id}       -> terminalBookings.batch
 *
 * @see apps/api/internal/service/terminal.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { buildRelatedEmployeeDataScopeWhere, mergeDataScopeWhere } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"

// --- Permission Constants ---

const TERMINAL_BOOKINGS_MANAGE = permissionIdByKey("terminal_bookings.manage")!

// --- Output Schemas ---

const importBatchOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  batchReference: z.string(),
  source: z.string(),
  terminalId: z.string().nullable(),
  status: z.string(),
  recordsTotal: z.number(),
  recordsImported: z.number(),
  recordsFailed: z.number(),
  errorMessage: z.string().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const rawTerminalBookingOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  importBatchId: z.string(),
  terminalId: z.string(),
  employeePin: z.string(),
  employeeId: z.string().nullable(),
  rawTimestamp: z.date(),
  rawBookingCode: z.string(),
  bookingDate: z.date(),
  bookingTypeId: z.string().nullable(),
  processedBookingId: z.string().nullable(),
  status: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
    })
    .nullable()
    .optional(),
  bookingType: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
})

// --- Router ---

export const terminalBookingsRouter = createTRPCRouter({
  /**
   * terminalBookings.list -- Returns raw terminal bookings for the current tenant.
   *
   * Supports filters: from/to date range, terminalId, employeeId, importBatchId, status.
   * Paginated with limit/page.
   *
   * Requires: terminal_bookings.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(TERMINAL_BOOKINGS_MANAGE))
    .use(applyDataScope())
    .input(
      z.object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        terminalId: z.string().optional(),
        employeeId: z.string().optional(),
        importBatchId: z.string().optional(),
        status: z
          .enum(["pending", "processed", "failed", "skipped"])
          .optional(),
        limit: z.number().int().min(1).max(250).default(50),
        page: z.number().int().min(1).default(1),
      })
    )
    .output(
      z.object({
        data: z.array(rawTerminalBookingOutputSchema),
        meta: z.object({
          total: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const where: Record<string, unknown> = { tenantId }
        if (input.terminalId) {
          where.terminalId = input.terminalId
        }
        if (input.employeeId) {
          where.employeeId = input.employeeId
        }
        if (input.importBatchId) {
          where.importBatchId = input.importBatchId
        }
        if (input.status) {
          where.status = input.status
        }
        if (input.from && input.to) {
          where.bookingDate = {
            gte: new Date(input.from),
            lte: new Date(input.to),
          }
        }
        mergeDataScopeWhere(where, buildRelatedEmployeeDataScopeWhere(dataScope))

        const [data, total] = await Promise.all([
          ctx.prisma.rawTerminalBooking.findMany({
            where,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
            orderBy: { rawTimestamp: "desc" },
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  personnelNumber: true,
                },
              },
              bookingType: {
                select: { id: true, code: true, name: true },
              },
            },
          }),
          ctx.prisma.rawTerminalBooking.count({ where }),
        ])

        return {
          data,
          meta: {
            total,
            limit: input.limit,
            hasMore: input.page * input.limit < total,
          },
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * terminalBookings.import -- Triggers a terminal booking import (idempotent).
   *
   * If a batch with the same batchReference already exists for this tenant,
   * returns the existing batch without re-importing (idempotency).
   *
   * Requires: terminal_bookings.manage permission
   */
  import: tenantProcedure
    .use(requirePermission(TERMINAL_BOOKINGS_MANAGE))
    .input(
      z.object({
        batchReference: z.string().min(1, "Batch reference is required"),
        terminalId: z.string().min(1, "Terminal ID is required"),
        bookings: z
          .array(
            z.object({
              employeePin: z.string().min(1),
              rawTimestamp: z.string(),
              rawBookingCode: z.string().min(1),
            })
          )
          .min(1, "At least one booking is required")
          .max(5000, "Maximum 5000 bookings per import"),
      })
    )
    .output(
      z.object({
        batch: importBatchOutputSchema,
        wasDuplicate: z.boolean(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Validate input
        const batchReference = input.batchReference.trim()
      if (batchReference.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Batch reference is required",
        })
      }
      const terminalId = input.terminalId.trim()
      if (terminalId.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Terminal ID is required",
        })
      }

      // Pre-fetch employee/booking-type lookup maps to avoid N+1
      const uniquePins = [...new Set(input.bookings.map((b) => b.employeePin))]
      const uniqueCodes = [...new Set(input.bookings.map((b) => b.rawBookingCode))]

      const [empsByPin, btsByCode] = await Promise.all([
        ctx.prisma.employee.findMany({
          where: { tenantId, pin: { in: uniquePins } },
          select: { id: true, pin: true },
        }),
        ctx.prisma.bookingType.findMany({
          where: {
            OR: [
              { tenantId, code: { in: uniqueCodes } },
              { tenantId: null, code: { in: uniqueCodes } },
            ],
          },
          select: { id: true, code: true },
        }),
      ])
      const pinMap = new Map(empsByPin.map((e) => [e.pin, e.id]))
      const codeMap = new Map(btsByCode.map((bt) => [bt.code, bt.id]))

      // Use transaction for atomic idempotency check + batch creation
      return ctx.prisma.$transaction(async (tx) => {
        // Idempotency check inside transaction
        const existing = await tx.importBatch.findFirst({
          where: { tenantId, batchReference },
        })
        if (existing) {
          return {
            batch: existing,
            wasDuplicate: true,
            message: `Batch '${batchReference}' already imported (${existing.recordsTotal} records)`,
          }
        }

        // Create import batch
        const batch = await tx.importBatch.create({
          data: {
            tenantId,
            batchReference,
            source: "terminal",
            terminalId,
            status: "processing",
            recordsTotal: input.bookings.length,
            startedAt: new Date(),
          },
        })

        try {
          // Build raw booking records using pre-fetched maps
          const rawBookingData = input.bookings.map((b) => {
            const rawTimestamp = new Date(b.rawTimestamp)
            const bookingDate = new Date(
              rawTimestamp.getFullYear(),
              rawTimestamp.getMonth(),
              rawTimestamp.getDate()
            )
            return {
              tenantId,
              importBatchId: batch.id,
              terminalId,
              employeePin: b.employeePin,
              employeeId: pinMap.get(b.employeePin) ?? null,
              rawTimestamp,
              rawBookingCode: b.rawBookingCode,
              bookingDate,
              bookingTypeId: codeMap.get(b.rawBookingCode) ?? null,
              status: "pending",
            }
          })

          // Batch insert raw bookings
          await tx.rawTerminalBooking.createMany({
            data: rawBookingData,
          })

          // Mark batch as completed
          const updatedBatch = await tx.importBatch.update({
            where: { id: batch.id },
            data: {
              status: "completed",
              recordsImported: rawBookingData.length,
              completedAt: new Date(),
            },
          })

          return {
            batch: updatedBatch,
            wasDuplicate: false,
            message: `Successfully imported ${rawBookingData.length} records from terminal '${terminalId}'`,
          }
        } catch (error) {
          // Mark batch as failed
          await tx.importBatch.update({
            where: { id: batch.id },
            data: {
              status: "failed",
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
              completedAt: new Date(),
            },
          })
          throw error
        }
      })
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * terminalBookings.batches -- Returns import batches for the current tenant.
   *
   * Supports filters: status, terminalId.
   * Paginated with limit/page.
   *
   * Requires: terminal_bookings.manage permission
   */
  batches: tenantProcedure
    .use(requirePermission(TERMINAL_BOOKINGS_MANAGE))
    .input(
      z.object({
        status: z
          .enum(["pending", "processing", "completed", "failed"])
          .optional(),
        terminalId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      })
    )
    .output(
      z.object({
        data: z.array(importBatchOutputSchema),
        meta: z.object({
          total: z.number(),
          limit: z.number(),
          hasMore: z.boolean(),
        }),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const where: Record<string, unknown> = { tenantId }
        if (input.status) {
          where.status = input.status
        }
        if (input.terminalId) {
          where.terminalId = input.terminalId
        }

        const [data, total] = await Promise.all([
          ctx.prisma.importBatch.findMany({
            where,
            take: input.limit,
            skip: (input.page - 1) * input.limit,
            orderBy: { createdAt: "desc" },
          }),
          ctx.prisma.importBatch.count({ where }),
        ])

        return {
          data,
          meta: {
            total,
            limit: input.limit,
            hasMore: input.page * input.limit < total,
          },
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * terminalBookings.batch -- Returns a single import batch by ID.
   *
   * Requires: terminal_bookings.manage permission
   */
  batch: tenantProcedure
    .use(requirePermission(TERMINAL_BOOKINGS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(importBatchOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const batch = await ctx.prisma.importBatch.findFirst({
          where: { id: input.id, tenantId },
        })

        if (!batch) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Import batch not found",
          })
        }

        return batch
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
