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
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

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

type EmployeeContactOutput = z.infer<typeof employeeContactOutputSchema>

// --- Helpers ---

/**
 * Maps a Prisma EmployeeContact record to the output schema shape.
 */
function mapContactToOutput(c: {
  id: string
  employeeId: string
  contactType: string
  value: string
  label: string | null
  isPrimary: boolean
  contactKindId: string | null
  createdAt: Date
  updatedAt: Date
}): EmployeeContactOutput {
  return {
    id: c.id,
    employeeId: c.employeeId,
    contactType: c.contactType,
    value: c.value,
    label: c.label,
    isPrimary: c.isPrimary,
    contactKindId: c.contactKindId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

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

      const contacts = await ctx.prisma.employeeContact.findMany({
        where: { employeeId: input.employeeId },
        orderBy: { createdAt: "asc" },
      })

      return {
        data: contacts.map(mapContactToOutput),
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

      // Trim and validate
      const contactType = input.contactType.trim()
      if (contactType.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact type is required",
        })
      }

      const value = input.value.trim()
      if (value.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact value is required",
        })
      }

      const contact = await ctx.prisma.employeeContact.create({
        data: {
          employeeId: input.employeeId,
          contactType,
          value,
          label: input.label?.trim() || null,
          isPrimary: input.isPrimary ?? false,
          contactKindId: input.contactKindId ?? null,
        },
      })

      return mapContactToOutput(contact)
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
      const tenantId = ctx.tenantId!

      // Fetch contact with employee relation to check tenant
      const contact = await ctx.prisma.employeeContact.findUnique({
        where: { id: input.id },
        include: {
          employee: {
            select: { tenantId: true },
          },
        },
      })

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        })
      }

      // Verify employee belongs to tenant
      if (contact.employee.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        })
      }

      await ctx.prisma.employeeContact.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
