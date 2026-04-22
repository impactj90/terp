/**
 * ServiceSchedules Router
 *
 * tRPC endpoints for maintenance schedules (Wartungspläne). Each
 * schedule belongs to a ServiceObject and drives the "due / overdue"
 * dashboard widget plus the 1-click "generate maintenance order" flow.
 *
 * Gated by the `crm` module and four permissions:
 * - service_schedules.view
 * - service_schedules.manage
 * - service_schedules.delete
 * - service_schedules.generate_order
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md (Phase D)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as service from "@/lib/services/service-schedule-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SCHED_VIEW = permissionIdByKey("service_schedules.view")!
const SCHED_MANAGE = permissionIdByKey("service_schedules.manage")!
const SCHED_DELETE = permissionIdByKey("service_schedules.delete")!
const SCHED_GENERATE_ORDER = permissionIdByKey(
  "service_schedules.generate_order"
)!

// --- Base procedure with module guard ---
const serviceScheduleProcedure = tenantProcedure.use(requireModule("crm"))

// --- Zod Enums ---
const INTERVAL_TYPE_ENUM = z.enum(["TIME_BASED", "CALENDAR_FIXED"])
const INTERVAL_UNIT_ENUM = z.enum(["DAYS", "MONTHS", "YEARS"])
const STATUS_FILTER_ENUM = z.enum(["overdue", "due_soon", "ok", "inactive"])

/**
 * Reject `anchorDate` values more than 100 years in the past.
 *
 * Defense-in-depth against bad user input that could trigger a
 * pathologically long while-loop in `calculateNextDueAt` (native-JS
 * date arithmetic iterates anchor→now one interval at a time).
 * Combined with `intervalValue.min(1)` and the DB CHECK constraint,
 * this bounds the loop at ~36,500 iterations for the absolute worst
 * case (DAYS, value=1, 100-year-old anchor) — a few ms on V8.
 *
 * See plan §Performance-Annahmen for the full analysis.
 */
const anchorDateNotTooOld = (d: string | null | undefined): boolean => {
  if (!d) return true
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return true // leave format validation to z.string().date()
  const minDate = new Date()
  minDate.setFullYear(minDate.getFullYear() - 100)
  return date >= minDate
}

// --- Input Schemas ---

const createScheduleInput = z
  .object({
    serviceObjectId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().max(5000).nullable().optional(),
    intervalType: INTERVAL_TYPE_ENUM,
    intervalValue: z.number().int().min(1),
    intervalUnit: INTERVAL_UNIT_ENUM,
    anchorDate: z
      .string()
      .date()
      .nullable()
      .optional()
      .refine(anchorDateNotTooOld, {
        message: "anchorDate cannot be more than 100 years in the past",
      }),
    defaultActivityId: z.string().uuid().nullable().optional(),
    responsibleEmployeeId: z.string().uuid().nullable().optional(),
    estimatedHours: z.number().min(0).max(9999).nullable().optional(),
    leadTimeDays: z.number().int().min(0).max(365).default(14),
    isActive: z.boolean().default(true),
  })
  .refine(
    (d) =>
      d.intervalType === "CALENDAR_FIXED"
        ? !!d.anchorDate
        : !d.anchorDate,
    {
      message:
        "anchorDate required for CALENDAR_FIXED, forbidden for TIME_BASED",
    }
  )

const updateScheduleInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  intervalType: INTERVAL_TYPE_ENUM.optional(),
  intervalValue: z.number().int().min(1).optional(),
  intervalUnit: INTERVAL_UNIT_ENUM.optional(),
  anchorDate: z
    .string()
    .date()
    .nullable()
    .optional()
    .refine(anchorDateNotTooOld, {
      message: "anchorDate cannot be more than 100 years in the past",
    }),
  defaultActivityId: z.string().uuid().nullable().optional(),
  responsibleEmployeeId: z.string().uuid().nullable().optional(),
  estimatedHours: z.number().min(0).max(9999).nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
})

export const serviceSchedulesRouter = createTRPCRouter({
  // --- Read ---

  list: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(
      z
        .object({
          serviceObjectId: z.string().uuid().optional(),
          status: STATUS_FILTER_ENUM.optional(),
          customerAddressId: z.string().uuid().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  listByServiceObject: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .input(z.object({ serviceObjectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.listByServiceObject(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.serviceObjectId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getDashboardSummary: serviceScheduleProcedure
    .use(requirePermission(SCHED_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await service.getDashboardSummary(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Write ---

  create: serviceScheduleProcedure
    .use(requirePermission(SCHED_MANAGE))
    .input(createScheduleInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: serviceScheduleProcedure
    .use(requirePermission(SCHED_MANAGE))
    .input(updateScheduleInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...rest } = input
        return await service.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          id,
          rest,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: serviceScheduleProcedure
    .use(requirePermission(SCHED_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await service.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return { success: true as const }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Generate Order ---

  generateOrder: serviceScheduleProcedure
    .use(requirePermission(SCHED_GENERATE_ORDER))
    .input(
      z.object({
        id: z.string().uuid(),
        createInitialAssignment: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.generateOrder(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { createInitialAssignment: input.createInitialAssignment },
          ctx.user!.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
