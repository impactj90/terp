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
import { requirePermission, applyDataScope, type DataScope } from "@/lib/auth/middleware"
import { checkRelatedEmployeeDataScope } from "@/lib/auth/data-scope"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as service from "@/lib/services/employee-contacts-service"

// --- Permission Constants ---
// Contacts use employee permissions per Go handler pattern

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!

// --- Output Schemas ---

const employeeContactOutputSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  contactType: z.string(),
  value: z.string(),
  label: z.string().nullable(),
  isPrimary: z.boolean(),
  contactKindId: z.string().nullable(),
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
    .use(applyDataScope())
    .input(z.object({ employeeId: z.string() }))
    .output(z.object({ data: z.array(employeeContactOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeContact")
        }
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
    .use(applyDataScope())
    .input(
      z.object({
        employeeId: z.string(),
        contactType: z.string().min(1, "Contact type is required"),
        value: z.string().min(1, "Value is required"),
        label: z.string().optional(),
        isPrimary: z.boolean().optional(),
        contactKindId: z.string().optional(),
      })
    )
    .output(employeeContactOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: input.employeeId, tenantId: ctx.tenantId!, deletedAt: null },
          select: { id: true, departmentId: true },
        })
        if (employee) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: employee.id,
            employee: { departmentId: employee.departmentId },
          }, "EmployeeContact")
        }
        return await service.createContact(ctx.prisma, ctx.tenantId!, input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
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
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        const contact = await ctx.prisma.employeeContact.findFirst({
          where: { id: input.id },
          include: { employee: { select: { id: true, departmentId: true, tenantId: true } } },
        })
        if (contact) {
          checkRelatedEmployeeDataScope(dataScope, {
            employeeId: contact.employeeId,
            employee: contact.employee ? { departmentId: contact.employee.departmentId } : null,
          }, "EmployeeContact")
        }
        return await service.deleteContact(ctx.prisma, ctx.tenantId!, input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
