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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  generateHolidays as generateCalendarHolidays,
  parseState,
} from "../lib/holiday-calendar"

// --- Permission Constants ---

const HOLIDAYS_MANAGE = permissionIdByKey("holidays.manage")!

// --- Output Schemas ---

const holidayOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  holidayDate: z.date(),
  name: z.string(),
  holidayCategory: z.number().int().min(1).max(3),
  appliesToAll: z.boolean(),
  departmentId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type HolidayOutput = z.infer<typeof holidayOutputSchema>

// --- Input Schemas ---

const createHolidayInputSchema = z.object({
  holidayDate: z.string().min(1, "Holiday date is required"),
  name: z.string().min(1, "Name is required"),
  holidayCategory: z.number().int().min(1).max(3),
  appliesToAll: z.boolean().optional(),
  departmentId: z.string().uuid().nullable().optional(),
})

const updateHolidayInputSchema = z.object({
  id: z.string().uuid(),
  holidayDate: z.string().optional(),
  name: z.string().min(1).optional(),
  holidayCategory: z.number().int().min(1).max(3).optional(),
  appliesToAll: z.boolean().optional(),
  departmentId: z.string().uuid().nullable().optional(),
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

/**
 * Normalize a date to midnight UTC (strip time).
 */
function normalizeDate(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
}

/**
 * Format a date as YYYY-MM-DD for use as a map key.
 */
function dateKey(d: Date): string {
  const nd = normalizeDate(d)
  return nd.toISOString().slice(0, 10)
}

/**
 * Create new date with a different year. Returns null for invalid dates
 * (e.g., Feb 29 in non-leap year).
 * Ported from Go: apps/api/internal/service/holiday.go lines 425-433.
 */
function dateWithYear(year: number, date: Date): Date | null {
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const target = new Date(Date.UTC(year, month, day))
  // If the month/day shifted (e.g., Feb 29 -> Mar 1), the date is invalid
  if (target.getUTCMonth() !== month || target.getUTCDate() !== day) {
    return null
  }
  return target
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
          from: z.string().optional(),
          to: z.string().optional(),
          departmentId: z.string().uuid().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(holidayOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.year !== undefined) {
        where.holidayDate = {
          gte: new Date(Date.UTC(input.year, 0, 1)),
          lt: new Date(Date.UTC(input.year + 1, 0, 1)),
        }
      } else if (input?.from || input?.to) {
        const dateFilter: Record<string, unknown> = {}
        if (input.from) {
          dateFilter.gte = new Date(input.from)
        }
        if (input.to) {
          dateFilter.lte = new Date(input.to)
        }
        where.holidayDate = dateFilter
      }

      if (input?.departmentId !== undefined) {
        where.departmentId = input.departmentId
      }

      const holidays = await ctx.prisma.holiday.findMany({
        where,
        orderBy: { holidayDate: "asc" },
      })

      return {
        data: holidays.map(mapHolidayToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
    .output(holidayOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const holiday = await ctx.prisma.holiday.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!holiday) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Holiday not found",
        })
      }

      return mapHolidayToOutput(holiday)
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
      const tenantId = ctx.tenantId!

      // Parse and validate date
      const holidayDate = new Date(input.holidayDate)
      if (isNaN(holidayDate.getTime())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Holiday date is required",
        })
      }
      const normalizedDate = normalizeDate(holidayDate)

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Holiday name is required",
        })
      }

      // Check date uniqueness within tenant
      const existingByDate = await ctx.prisma.holiday.findFirst({
        where: { tenantId, holidayDate: normalizedDate },
      })
      if (existingByDate) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Holiday already exists on this date",
        })
      }

      const holiday = await ctx.prisma.holiday.create({
        data: {
          tenantId,
          holidayDate: normalizedDate,
          name,
          holidayCategory: input.holidayCategory,
          appliesToAll: input.appliesToAll ?? true,
          departmentId: input.departmentId ?? null,
        },
      })

      return mapHolidayToOutput(holiday)
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
      const tenantId = ctx.tenantId!

      // Verify holiday exists (tenant-scoped)
      const existing = await ctx.prisma.holiday.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Holiday not found",
        })
      }

      const data: Record<string, unknown> = {}

      // Handle date update
      if (input.holidayDate !== undefined) {
        const holidayDate = new Date(input.holidayDate)
        if (isNaN(holidayDate.getTime())) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Holiday date is required",
          })
        }
        data.holidayDate = normalizeDate(holidayDate)
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Holiday name is required",
          })
        }
        data.name = name
      }

      // Handle category update
      if (input.holidayCategory !== undefined) {
        data.holidayCategory = input.holidayCategory
      }

      // Handle appliesToAll update
      if (input.appliesToAll !== undefined) {
        data.appliesToAll = input.appliesToAll
      }

      // Handle departmentId update
      if (input.departmentId !== undefined) {
        data.departmentId = input.departmentId
      }

      const holiday = await ctx.prisma.holiday.update({
        where: { id: input.id },
        data,
      })

      return mapHolidayToOutput(holiday)
    }),

  /**
   * holidays.delete -- Deletes a holiday.
   *
   * Requires: holidays.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(HOLIDAYS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify holiday exists (tenant-scoped)
      const existing = await ctx.prisma.holiday.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Holiday not found",
        })
      }

      await ctx.prisma.holiday.delete({
        where: { id: input.id },
      })

      return { success: true }
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
      const tenantId = ctx.tenantId!

      // Validate and parse state
      let state
      try {
        state = parseState(input.state)
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid state code",
        })
      }

      // Generate holiday definitions
      const definitions = generateCalendarHolidays(input.year, state)

      // Load existing holidays for the year
      const yearStart = new Date(Date.UTC(input.year, 0, 1))
      const yearEnd = new Date(Date.UTC(input.year + 1, 0, 1))
      const existing = await ctx.prisma.holiday.findMany({
        where: {
          tenantId,
          holidayDate: { gte: yearStart, lt: yearEnd },
        },
      })
      const existingByDate = new Set(existing.map((h) => dateKey(h.holidayDate)))

      // Create holidays
      const created: HolidayOutput[] = []
      for (const def of definitions) {
        const key = dateKey(def.date)
        if (input.skipExisting && existingByDate.has(key)) {
          continue
        }

        const holiday = await ctx.prisma.holiday.create({
          data: {
            tenantId,
            holidayDate: normalizeDate(def.date),
            name: def.name,
            holidayCategory: 1,
            appliesToAll: true,
          },
        })
        created.push(mapHolidayToOutput(holiday))
      }

      return { created }
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
      const tenantId = ctx.tenantId!

      if (input.sourceYear === input.targetYear) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source and target year must differ",
        })
      }

      // Build category override map keyed by "MM-DD"
      const overrideMap = new Map<string, number>()
      if (input.categoryOverrides) {
        for (const override of input.categoryOverrides) {
          const key = `${String(override.month).padStart(2, "0")}-${String(override.day).padStart(2, "0")}`
          overrideMap.set(key, override.category)
        }
      }

      // Load source year holidays
      const sourceStart = new Date(Date.UTC(input.sourceYear, 0, 1))
      const sourceEnd = new Date(Date.UTC(input.sourceYear + 1, 0, 1))
      const source = await ctx.prisma.holiday.findMany({
        where: {
          tenantId,
          holidayDate: { gte: sourceStart, lt: sourceEnd },
        },
        orderBy: { holidayDate: "asc" },
      })

      if (source.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No holidays found for source year",
        })
      }

      // Load target year existing holidays
      const targetStart = new Date(Date.UTC(input.targetYear, 0, 1))
      const targetEnd = new Date(Date.UTC(input.targetYear + 1, 0, 1))
      const existingTarget = await ctx.prisma.holiday.findMany({
        where: {
          tenantId,
          holidayDate: { gte: targetStart, lt: targetEnd },
        },
      })
      const existingByDate = new Set(
        existingTarget.map((h) => dateKey(h.holidayDate))
      )

      // Copy holidays
      const copied: HolidayOutput[] = []
      for (const src of source) {
        const targetDate = dateWithYear(input.targetYear, src.holidayDate)
        if (!targetDate) {
          continue // Skip invalid dates (e.g., Feb 29 in non-leap year)
        }

        const key = dateKey(targetDate)
        if (input.skipExisting && existingByDate.has(key)) {
          continue
        }

        // Apply category override if present
        const monthDay = `${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}-${String(targetDate.getUTCDate()).padStart(2, "0")}`
        const category = overrideMap.get(monthDay) ?? src.holidayCategory

        const holiday = await ctx.prisma.holiday.create({
          data: {
            tenantId,
            holidayDate: normalizeDate(targetDate),
            name: src.name,
            holidayCategory: category,
            appliesToAll: src.appliesToAll,
            departmentId: src.departmentId,
          },
        })
        copied.push(mapHolidayToOutput(holiday))
      }

      return { copied }
    }),
})
