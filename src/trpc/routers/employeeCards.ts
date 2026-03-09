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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-cards-service"

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
      try {
        return await service.listCards(
          ctx.prisma,
          ctx.tenantId!,
          input.employeeId
        )
      } catch (err) {
        handleServiceError(err)
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
      try {
        return await service.createCard(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        return await service.deactivateCard(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
