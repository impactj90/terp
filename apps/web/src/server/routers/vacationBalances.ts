/**
 * Vacation Balances CRUD Router
 *
 * Provides CRUD operations on vacation balance records via tRPC procedures.
 * Separated from the vacation router which handles business logic mutations.
 *
 * Replaces the Go backend endpoints:
 * - GET    /vacation-balances      -> vacationBalances.list
 * - GET    /vacation-balances/:id  -> vacationBalances.getById
 * - POST   /vacation-balances      -> vacationBalances.create
 * - PATCH  /vacation-balances/:id  -> vacationBalances.update
 *
 * @see apps/api/internal/service/vacationbalance.go
 * @see apps/api/internal/handler/vacation_balance.go
 */
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const ABSENCES_MANAGE = permissionIdByKey("absences.manage")!

// --- Output Schema ---

const vacationBalanceOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  year: z.number(),
  entitlement: z.number(),
  carryover: z.number(),
  adjustments: z.number(),
  taken: z.number(),
  total: z.number(),
  available: z.number(),
  carryoverExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      personnelNumber: z.string(),
      isActive: z.boolean(),
      departmentId: z.string().uuid().nullable(),
    })
    .nullable()
    .optional(),
})

// --- Helpers ---

function decimalToNumber(
  val: Prisma.Decimal | null | undefined
): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

/**
 * Maps a Prisma VacationBalance record to the output schema shape.
 */
function mapBalanceToOutput(
  record: {
    id: string
    tenantId: string
    employeeId: string
    year: number
    entitlement: Prisma.Decimal
    carryover: Prisma.Decimal
    adjustments: Prisma.Decimal
    taken: Prisma.Decimal
    carryoverExpiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    employee?: {
      id: string
      firstName: string
      lastName: string
      personnelNumber: string
      isActive: boolean
      departmentId: string | null
    } | null
  }
) {
  const entitlement = decimalToNumber(record.entitlement)
  const carryover = decimalToNumber(record.carryover)
  const adjustments = decimalToNumber(record.adjustments)
  const taken = decimalToNumber(record.taken)
  const total = entitlement + carryover + adjustments
  const available = total - taken

  return {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    year: record.year,
    entitlement,
    carryover,
    adjustments,
    taken,
    total,
    available,
    carryoverExpiresAt: record.carryoverExpiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    employee: record.employee
      ? {
          id: record.employee.id,
          firstName: record.employee.firstName,
          lastName: record.employee.lastName,
          personnelNumber: record.employee.personnelNumber,
          isActive: record.employee.isActive,
          departmentId: record.employee.departmentId,
        }
      : null,
  }
}

// Employee select for CRUD includes
const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  personnelNumber: true,
  isActive: true,
  departmentId: true,
} as const

// --- Router ---

export const vacationBalancesRouter = createTRPCRouter({
  /**
   * vacationBalances.list -- Lists vacation balances with optional filters.
   *
   * Port of Go VacationBalanceService.List() + VacationBalanceRepository.ListAll()
   * Requires: absences.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z
        .object({
          employeeId: z.string().uuid().optional(),
          year: z.number().int().optional(),
          departmentId: z.string().uuid().optional(),
        })
        .optional()
        .default({})
    )
    .output(z.array(vacationBalanceOutputSchema))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Build where clause
      const where: Prisma.VacationBalanceWhereInput = { tenantId }
      if (input.employeeId) {
        where.employeeId = input.employeeId
      }
      if (input.year) {
        where.year = input.year
      }
      if (input.departmentId) {
        where.employee = { departmentId: input.departmentId }
      }

      const balances = await ctx.prisma.vacationBalance.findMany({
        where,
        include: { employee: { select: employeeSelect } },
        orderBy: { year: "desc" },
      })

      return balances.map(mapBalanceToOutput)
    }),

  /**
   * vacationBalances.getById -- Returns a single vacation balance by ID.
   *
   * Port of Go VacationBalanceService.GetByID()
   * Requires: absences.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(vacationBalanceOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      const balance = await ctx.prisma.vacationBalance.findFirst({
        where: { id: input.id, tenantId },
        include: { employee: { select: employeeSelect } },
      })

      if (!balance) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacationBalances.create -- Creates a new vacation balance.
   *
   * Returns CONFLICT if a balance already exists for the employee/year.
   *
   * Port of Go VacationBalanceService.Create()
   * Requires: absences.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        year: z.number().int().min(1900).max(2200),
        entitlement: z.number().default(0),
        carryover: z.number().default(0),
        adjustments: z.number().default(0),
        carryoverExpiresAt: z.date().nullable().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Check for existing balance
      const existing = await ctx.prisma.vacationBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          year: input.year,
          tenantId,
        },
      })
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Vacation balance already exists for this employee and year",
        })
      }

      const balance = await ctx.prisma.vacationBalance.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          year: input.year,
          entitlement: input.entitlement,
          carryover: input.carryover,
          adjustments: input.adjustments,
          taken: 0,
          carryoverExpiresAt: input.carryoverExpiresAt ?? null,
        },
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),

  /**
   * vacationBalances.update -- Partially updates an existing vacation balance.
   *
   * Port of Go VacationBalanceService.Update()
   * Requires: absences.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(ABSENCES_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        entitlement: z.number().optional(),
        carryover: z.number().optional(),
        adjustments: z.number().optional(),
        carryoverExpiresAt: z.date().nullable().optional(),
      })
    )
    .output(vacationBalanceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Find balance by ID + tenant scope
      const existing = await ctx.prisma.vacationBalance.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vacation balance not found",
        })
      }

      // Build partial update data
      const data: Prisma.VacationBalanceUpdateInput = {}
      if (input.entitlement !== undefined) {
        data.entitlement = input.entitlement
      }
      if (input.carryover !== undefined) {
        data.carryover = input.carryover
      }
      if (input.adjustments !== undefined) {
        data.adjustments = input.adjustments
      }
      if (input.carryoverExpiresAt !== undefined) {
        data.carryoverExpiresAt = input.carryoverExpiresAt
      }

      const balance = await ctx.prisma.vacationBalance.update({
        where: { id: input.id },
        data,
        include: { employee: { select: employeeSelect } },
      })

      return mapBalanceToOutput(balance)
    }),
})
