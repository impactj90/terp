/**
 * Employee Contacts Router
 *
 * Provides employee contact CRUD operations via tRPC procedures.
 * Replaces the Go backend employee contact endpoints:
 * - GET /employees/{id}/contacts -> employeeContacts.list
 * - POST /employees/{id}/contacts -> employeeContacts.create
 * - DELETE /employees/{id}/contacts/{contactId} -> employeeContacts.delete
 *
 * @see apps/api/internal/service/employee.go (contact operations)
 * @see apps/api/internal/handler/employee.go (contact handlers)
 */
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-contacts-service"

// --- Permission Constants ---
// Contacts use employee permissions per Go handler pattern

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// --- Output Schemas ---

const employeeContactOutputSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  contactType: z.string(),
  value: z.string(),
  label: z.string().nullable(),
  isPrimary: z.boolean(),
  contactKindId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// --- Router ---

export const employeeContactsRouter = createTRPCRouter({
  /**
   * employeeContacts.list -- Returns contacts for an employee.
   *
   * Verifies employee belongs to tenant. Orders by createdAt ascending.
   *
   * Requires: employees.view permission
   */
  list: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .input(z.object({ employeeId: z.string().uuid() }))
    .output(z.object({ data: z.array(employeeContactOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.listContacts(
          ctx.prisma,
          ctx.tenantId!,
          input.employeeId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeContacts.create -- Creates a new contact for an employee.
   *
   * Validates contactType and value are non-empty after trimming.
   * Verifies employee belongs to tenant.
   *
   * Requires: employees.edit permission
   */
  create: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .input(
      z.object({
        employeeId: z.string().uuid(),
        contactType: z.string().min(1, "Contact type is required"),
        value: z.string().min(1, "Value is required"),
        label: z.string().optional(),
        isPrimary: z.boolean().optional(),
        contactKindId: z.string().uuid().optional(),
      })
    )
    .output(employeeContactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.createContact(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employeeContacts.delete -- Deletes a contact.
   *
   * Fetches the contact with its employee relation to verify
   * the employee belongs to the current tenant.
   *
   * Requires: employees.edit permission
   */
  delete: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await service.deleteContact(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
