/**
 * Holidays Router
 *
 * Provides holiday CRUD operations plus Generate and Copy via tRPC procedures.
 * Replaces the Go backend holiday endpoints:
 * - GET /holidays -> holidays.list
 * - GET /holidays/{id} -> holidays.getById
 * - POST /holidays -> holidays.create
 * - PATCH /holidays/{id} -> holidays.update
 * - DELETE /holidays/{id} -> holidays.delete
 * - POST /holidays/generate -> holidays.generate
 * - POST /holidays/copy -> holidays.copy
 *
 * @see apps/api/internal/service/holiday.go
 * @see apps/api/internal/holiday/calendar.go
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as holidayService from "@/lib/services/holiday-service"

// --- Permission Constants ---

const HOLIDAYS_MANAGE = permissionIdByKey("holidays.manage")!

// --- Output Schemas ---

const holidayOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  holidayDate: z.date(),
  name: z.string(),
  holidayCategory: z.number().int().min(1).max(3),
  appliesToAll: z.boolean(),
  departmentId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type HolidayOutput = z.infer<typeof holidayOutputSchema>

// --- Input Schemas ---

const createHolidayInputSchema = z.object({
  holidayDate: z.string().date("Holiday date must be a valid YYYY-MM-DD date"),
  name: z.string().min(1, "Name is required"),
  holidayCategory: z.number().int().min(1).max(3),
  appliesToAll: z.boolean().optional(),
  departmentId: z.string().nullable().optional(),
})

const updateHolidayInputSchema = z.object({
  id: z.string(),
  holidayDate: z.string().date().optional(),
  name: z.string().min(1).optional(),
  holidayCategory: z.number().int().min(1).max(3).optional(),
  appliesToAll: z.boolean().optional(),
  departmentId: z.string().nullable().optional(),
})

const generateHolidaysInputSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  state: z.string().min(1),
  skipExisting: z.boolean().optional(),
})

const copyHolidaysInputSchema = z.object({
  sourceYear: z.number().int().min(1900).max(2200),
  targetYear: z.number().int().min(1900).max(2200),
  categoryOverrides: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        day: z.number().int().min(1).max(31),
        category: z.number().int().min(1).max(3),
      })
    )
    .optional(),
  skipExisting: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Holiday record to the output schema shape.
 */
function mapHolidayToOutput(h: {
  id: string
  tenantId: string
  holidayDate: Date
  name: string
  holidayCategory: number
  appliesToAll: boolean
  departmentId: string | null
  createdAt: Date
  updatedAt: Date
}): HolidayOutput {
  return {
    id: h.id,
    tenantId: h.tenantId,
    holidayDate: h.holidayDate,
    name: h.name,
    holidayCategory: h.holidayCategory,
    appliesToAll: h.appliesToAll,
    departmentId: h.departmentId,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  }
}

// --- Router ---

export const holidaysRouter = createTRPCRouter({
  /**
   * holidays.list -- Returns holidays for the current tenant.
   *
   * Supports filters: year, from/to date range, departmentId.
   * Orders by holidayDate ASC.
   *
   * Requires: holidays.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(
      z
        .object({
          year: z.number().int().optional(),
          from: z.string().date().optional(),
          to: z.string().date().optional(),
          departmentId: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(holidayOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const holidays = await holidayService.list(
          ctx.prisma,
          ctx.tenantId!,
          input ?? undefined
        )
        return { data: holidays.map(mapHolidayToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.getById -- Returns a single holiday by ID.
   *
   * Tenant-scoped.
   *
   * Requires: holidays.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(holidayOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const holiday = await holidayService.getById(
          ctx.prisma,
          ctx.tenantId!,
          input.id
        )
        return mapHolidayToOutput(holiday)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.create -- Creates a new holiday.
   *
   * Validates date, name, category. Checks date uniqueness per tenant.
   *
   * Requires: holidays.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(createHolidayInputSchema)
    .output(holidayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const holiday = await holidayService.create(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapHolidayToOutput(holiday)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.update -- Updates an existing holiday.
   *
   * Supports partial updates.
   *
   * Requires: holidays.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(updateHolidayInputSchema)
    .output(holidayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const holiday = await holidayService.update(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return mapHolidayToOutput(holiday)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.delete -- Deletes a holiday.
   *
   * Requires: holidays.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await holidayService.remove(ctx.prisma, ctx.tenantId!, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.generate -- Generates holidays for a year and German state.
   *
   * Uses the holiday-calendar library to generate holiday definitions,
   * then creates records for each, optionally skipping existing dates.
   *
   * Requires: holidays.manage permission
   */
  generate: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(generateHolidaysInputSchema)
    .output(z.object({ created: z.array(holidayOutputSchema) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const created = await holidayService.generate(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return { created: created.map(mapHolidayToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * holidays.copy -- Copies holidays from a source year to a target year.
   *
   * Adjusts dates to the target year, applies optional category overrides,
   * and optionally skips dates that already exist in the target year.
   *
   * Requires: holidays.manage permission
   */
  copy: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(copyHolidaysInputSchema)
    .output(z.object({ copied: z.array(holidayOutputSchema) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const copied = await holidayService.copy(
          ctx.prisma,
          ctx.tenantId!,
          input
        )
        return { copied: copied.map(mapHolidayToOutput) }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
