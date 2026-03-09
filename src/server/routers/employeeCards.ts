/**
 * Employee Cards Router
 *
 * Provides employee card CRUD and deactivation via tRPC procedures.
 * Replaces the Go backend employee card endpoints:
 * - GET /employees/{id}/cards -> employeeCards.list
 * - POST /employees/{id}/cards -> employeeCards.create
 * - DELETE /employees/{id}/cards/{cardId} -> employeeCards.deactivate
 *
 * @see apps/api/internal/service/employee.go (card operations)
 * @see apps/api/internal/handler/employee.go (card handlers)
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---
// Cards use employee permissions per Go handler pattern

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// --- Output Schemas ---

const employeeCardOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  cardNumber: z.string(),
  cardType: z.string(),
  validFrom: z.date(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  deactivatedAt: z.date().nullable(),
  deactivationReason: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type EmployeeCardOutput = z.infer<typeof employeeCardOutputSchema>

// --- Helpers ---

/**
 * Maps a Prisma EmployeeCard record to the output schema shape.
 */
function mapCardToOutput(card: {
  id: string
  tenantId: string
  employeeId: string
  cardNumber: string
  cardType: string
  validFrom: Date
  validTo: Date | null
  isActive: boolean
  deactivatedAt: Date | null
  deactivationReason: string | null
  createdAt: Date
  updatedAt: Date
}): EmployeeCardOutput {
  return {
    id: card.id,
    tenantId: card.tenantId,
    employeeId: card.employeeId,
    cardNumber: card.cardNumber,
    cardType: card.cardType,
    validFrom: card.validFrom,
    validTo: card.validTo,
    isActive: card.isActive,
    deactivatedAt: card.deactivatedAt,
    deactivationReason: card.deactivationReason,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  }
}

// --- Router ---

export const employeeCardsRouter = createTRPCRouter({
  /**
   * employeeCards.list -- Returns cards for an employee.
   *
   * Verifies employee belongs to tenant. Orders by createdAt descending.
   *
   * Requires: employees.view permission
   */
  list: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .input(z.object({ employeeId: z.string().uuid() }))
    .output(z.object({ data: z.array(employeeCardOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify employee exists and belongs to tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      const cards = await ctx.prisma.employeeCard.findMany({
        where: { employeeId: input.employeeId },
        orderBy: { createdAt: "desc" },
      })

      return {
        data: cards.map(mapCardToOutput),
      }
    }),

  /**
   * employeeCards.create -- Creates a new card for an employee.
   *
   * Validates cardNumber non-empty after trimming.
   * Checks card number uniqueness per tenant.
   * Defaults cardType to "rfid" if not provided.
   * Verifies employee belongs to tenant.
   *
   * Requires: employees.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        cardNumber: z.string().min(1, "Card number is required"),
        cardType: z.string().optional(),
        validFrom: z.coerce.date().optional(),
        validTo: z.coerce.date().optional(),
      })
    )
    .output(employeeCardOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify employee exists and belongs to tenant
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.employeeId, tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Trim and validate card number
      const cardNumber = input.cardNumber.trim()
      if (cardNumber.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Card number is required",
        })
      }

      // Check card number uniqueness per tenant
      const existingCard = await ctx.prisma.employeeCard.findFirst({
        where: { tenantId, cardNumber },
      })
      if (existingCard) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Card number already exists",
        })
      }

      const card = await ctx.prisma.employeeCard.create({
        data: {
          tenantId,
          employeeId: input.employeeId,
          cardNumber,
          cardType: input.cardType?.trim() || "rfid",
          validFrom: input.validFrom ?? new Date(),
          validTo: input.validTo ?? null,
          isActive: true,
        },
      })

      return mapCardToOutput(card)
    }),

  /**
   * employeeCards.deactivate -- Deactivates a card.
   *
   * Sets isActive=false, deactivatedAt=now, and optional deactivationReason.
   * Fetches card to verify tenant matches.
   *
   * Requires: employees.edit permission
   */
  deactivate: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().optional(),
      })
    )
    .output(employeeCardOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Fetch card and verify tenant
      const existing = await ctx.prisma.employeeCard.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Card not found",
        })
      }

      const card = await ctx.prisma.employeeCard.update({
        where: { id: input.id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivationReason: input.reason?.trim() ?? null,
        },
      })

      return mapCardToOutput(card)
    }),
})
