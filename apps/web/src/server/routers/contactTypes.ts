/**
 * Contact Types Router
 *
 * Provides contact type CRUD operations via tRPC procedures.
 * Replaces the Go backend contact type endpoints:
 * - GET /contact-types -> contactTypes.list
 * - GET /contact-types/{id} -> contactTypes.getById
 * - POST /contact-types -> contactTypes.create
 * - PATCH /contact-types/{id} -> contactTypes.update
 * - DELETE /contact-types/{id} -> contactTypes.delete
 *
 * @see apps/api/internal/service/contacttype.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!

// --- Constants ---

const VALID_DATA_TYPES = ["text", "email", "phone", "url"] as const

// --- Output Schemas ---

const contactTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  dataType: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type ContactTypeOutput = z.infer<typeof contactTypeOutputSchema>

// --- Input Schemas ---

const createContactTypeInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  dataType: z.enum(VALID_DATA_TYPES),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactTypeInputSchema = z.object({
  id: z.string().uuid(),
  // Note: code and dataType CANNOT be changed (per Go service)
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma ContactType record to the output schema shape.
 */
function mapContactTypeToOutput(ct: {
  id: string
  tenantId: string
  code: string
  name: string
  dataType: string
  description: string | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): ContactTypeOutput {
  return {
    id: ct.id,
    tenantId: ct.tenantId,
    code: ct.code,
    name: ct.name,
    dataType: ct.dataType,
    description: ct.description,
    isActive: ct.isActive,
    sortOrder: ct.sortOrder,
    createdAt: ct.createdAt,
    updatedAt: ct.updatedAt,
  }
}

// --- Router ---

export const contactTypesRouter = createTRPCRouter({
  /**
   * contactTypes.list -- Returns contact types for the current tenant.
   *
   * Supports optional filter: isActive.
   * Orders by sortOrder ASC, code ASC.
   *
   * Requires: contact_management.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(contactTypeOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = { tenantId }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      const contactTypes = await ctx.prisma.contactType.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      })

      return {
        data: contactTypes.map(mapContactTypeToOutput),
      }
    }),

  /**
   * contactTypes.getById -- Returns a single contact type by ID.
   *
   * Tenant-scoped: only returns contact types belonging to the current tenant.
   *
   * Requires: contact_management.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(contactTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!
      const contactType = await ctx.prisma.contactType.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!contactType) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact type not found",
        })
      }

      return mapContactTypeToOutput(contactType)
    }),

  /**
   * contactTypes.create -- Creates a new contact type.
   *
   * Validates code, name, and dataType are non-empty after trimming.
   * Checks code uniqueness within tenant.
   *
   * Requires: contact_management.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(createContactTypeInputSchema)
    .output(contactTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact type code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Contact type name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.contactType.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Contact type code already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create contact type
      const contactType = await ctx.prisma.contactType.create({
        data: {
          tenantId,
          code,
          name,
          dataType: input.dataType,
          description,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      })

      return mapContactTypeToOutput(contactType)
    }),

  /**
   * contactTypes.update -- Updates an existing contact type.
   *
   * Supports partial updates of name, description, isActive, sortOrder.
   * Code and dataType are immutable.
   *
   * Requires: contact_management.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(updateContactTypeInputSchema)
    .output(contactTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify contact type exists (tenant-scoped)
      const existing = await ctx.prisma.contactType.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact type not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Contact type name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim() || null
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      // Handle sortOrder update
      if (input.sortOrder !== undefined) {
        data.sortOrder = input.sortOrder
      }

      const contactType = await ctx.prisma.contactType.update({
        where: { id: input.id },
        data,
      })

      return mapContactTypeToOutput(contactType)
    }),

  /**
   * contactTypes.delete -- Deletes a contact type.
   *
   * Prevents deletion when contact kinds reference this type.
   *
   * Requires: contact_management.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!

      // Verify contact type exists (tenant-scoped)
      const existing = await ctx.prisma.contactType.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact type not found",
        })
      }

      // Check for contact kinds referencing this type
      const kindCount = await ctx.prisma.contactKind.count({
        where: { contactTypeId: input.id },
      })
      if (kindCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete contact type that has contact kinds",
        })
      }

      // Hard delete
      await ctx.prisma.contactType.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
