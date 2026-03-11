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
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

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
      const tenantId = ctx.tenantId!

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
              employeePin: z.string(),
              rawTimestamp: z.string(),
              rawBookingCode: z.string(),
            })
          )
          .min(1, "At least one booking is required"),
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

      // Idempotency check
      const existing = await ctx.prisma.importBatch.findFirst({
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
      const batch = await ctx.prisma.importBatch.create({
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
        // Build raw booking records
        const rawBookingData = []
        for (const b of input.bookings) {
          const rawTimestamp = new Date(b.rawTimestamp)
          const bookingDate = new Date(
            rawTimestamp.getFullYear(),
            rawTimestamp.getMonth(),
            rawTimestamp.getDate()
          )

          // Resolve employee by PIN (graceful)
          let employeeId: string | null = null
          const emp = await ctx.prisma.employee.findFirst({
            where: { tenantId, pin: b.employeePin },
          })
          if (emp) {
            employeeId = emp.id
          }

          // Resolve booking type by code (graceful)
          let bookingTypeId: string | null = null
          const bt = await ctx.prisma.bookingType.findFirst({
            where: {
              OR: [
                { tenantId, code: b.rawBookingCode },
                { tenantId: null, code: b.rawBookingCode },
              ],
            },
          })
          if (bt) {
            bookingTypeId = bt.id
          }

          rawBookingData.push({
            tenantId,
            importBatchId: batch.id,
            terminalId,
            employeePin: b.employeePin,
            employeeId,
            rawTimestamp,
            rawBookingCode: b.rawBookingCode,
            bookingDate,
            bookingTypeId,
            status: "pending",
          })
        }

        // Batch insert raw bookings
        await ctx.prisma.rawTerminalBooking.createMany({
          data: rawBookingData,
        })

        // Mark batch as completed
        const updatedBatch = await ctx.prisma.importBatch.update({
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
        await ctx.prisma.importBatch.update({
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
    }),
})
