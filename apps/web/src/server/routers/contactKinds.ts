/**
 * Contact Kinds Router
 *
 * Provides contact kind CRUD operations via tRPC procedures.
 * Replaces the Go backend contact kind endpoints:
 * - GET /contact-kinds -> contactKinds.list
 * - GET /contact-kinds/{id} -> contactKinds.getById
 * - POST /contact-kinds -> contactKinds.create
 * - PATCH /contact-kinds/{id} -> contactKinds.update
 * - DELETE /contact-kinds/{id} -> contactKinds.delete
 *
 * @see apps/api/internal/service/contactkind.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!

// --- Output Schemas ---

const contactKindOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  contactTypeId: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type ContactKindOutput = z.infer<typeof contactKindOutputSchema>

// --- Input Schemas ---

const createContactKindInputSchema = z.object({
  contactTypeId: z.string().uuid(),
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  sortOrder: z.number().int().optional(),
})

const updateContactKindInputSchema = z.object({
  id: z.string().uuid(),
  // Note: code and contactTypeId CANNOT be changed (per Go service)
  label: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma ContactKind record to the output schema shape.
 */
function mapContactKindToOutput(ck: {
  id: string
  tenantId: string
  contactTypeId: string
  code: string
  label: string
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): ContactKindOutput {
  return {
    id: ck.id,
    tenantId: ck.tenantId,
    contactTypeId: ck.contactTypeId,
    code: ck.code,
    label: ck.label,
    isActive: ck.isActive,
    sortOrder: ck.sortOrder,
    createdAt: ck.createdAt,
    updatedAt: ck.updatedAt,
  }
}

// --- Router ---

export const contactKindsRouter = createTRPCRouter({
  /**
   * contactKinds.list -- Returns contact kinds for the current tenant.
   *
   * Supports optional filters: contactTypeId, isActive.
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: contact_management.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(
      z
        .object({
          contactTypeId: z.string().uuid().optional(),
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(contactKindOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.contactTypeId !== undefined) {
        where.contactTypeId = input.contactTypeId
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const contactKinds = await ctx.prisma.contactKind.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: contactKinds.map(mapContactKindToOutput),
      }
    }),

  /**
   * contactKinds.getById -- Returns a single contact kind by ID.
   *
   * Tenant-scoped: only returns contact kinds belonging to the current tenant.
   *
   * Requires: contact_management.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(contactKindOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const contactKind = await ctx.prisma.contactKind.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!contactKind) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact kind not found",
        })
      }

      return mapContactKindToOutput(contactKind)
    }),

  /**
   * contactKinds.create -- Creates a new contact kind.
   *
   * Validates code and label are non-empty after trimming.
   * Verifies contact type exists.
   * Checks code uniqueness within tenant.
   *
   * Requires: contact_management.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(createContactKindInputSchema)
    .output(contactKindOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact kind code is required",
        })
      }

      // Trim and validate label
      const label = input.label.trim()
      if (label.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact kind label is required",
        })
      }

      // Verify contact type exists
      const contactType = await ctx.prisma.contactType.findFirst({
        where: { id: input.contactTypeId, tenantId },
      })
      if (!contactType) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact type not found",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.contactKind.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Contact kind code already exists",
        })
      }

      // Create contact kind
      const contactKind = await ctx.prisma.contactKind.create({
        data: {
          tenantId,
          contactTypeId: input.contactTypeId,
          code,
          label,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      })

      return mapContactKindToOutput(contactKind)
    }),

  /**
   * contactKinds.update -- Updates an existing contact kind.
   *
   * Supports partial updates of label, isActive, sortOrder.
   * Code and contactTypeId are immutable.
   *
   * Requires: contact_management.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(updateContactKindInputSchema)
    .output(contactKindOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify contact kind exists (tenant-scoped)
      const existing = await ctx.prisma.contactKind.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact kind not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle label update
      if (input.label !== undefined) {
        const label = input.label.trim()
        if (label.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Contact kind label is required",
          })
        }
        data.label = label
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle sortOrder update
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const contactKind = await ctx.prisma.contactKind.update({
        where: { id: input.id },
        data,
      })

      return mapContactKindToOutput(contactKind)
    }),

  /**
   * contactKinds.delete -- Deletes a contact kind.
   *
   * No additional referential check -- DB FK handles cascading to employee_contacts via SET NULL.
   *
   * Requires: contact_management.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify contact kind exists (tenant-scoped)
      const existing = await ctx.prisma.contactKind.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact kind not found",
        })
      }

      // Hard delete
      await ctx.prisma.contactKind.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
