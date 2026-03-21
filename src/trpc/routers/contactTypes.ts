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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as contactTypeService from "@/lib/services/contact-type-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!

// --- Output Schemas ---

const contactTypeOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
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
  dataType: z.string().optional().default("text"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactTypeInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  dataType: z.string().optional(),
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
   * Supports optional filter: isActive (mapped from `active` query param).
   * Orders by sortOrder ASC.
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
      try {
        const types = await contactTypeService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return {
          data: types.map(mapContactTypeToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactTypes.getById -- Returns a single contact type by ID.
   *
   * Tenant-scoped.
   *
   * Requires: contact_management.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(contactTypeOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const ct = await contactTypeService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapContactTypeToOutput(ct)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactTypes.create -- Creates a new contact type.
   *
   * Validates code and name are non-empty. Checks code uniqueness.
   *
   * Requires: contact_management.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(createContactTypeInputSchema)
    .output(contactTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ct = await contactTypeService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapContactTypeToOutput(ct)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactTypes.update -- Updates an existing contact type.
   *
   * Supports partial updates. Validates code uniqueness when changed.
   *
   * Requires: contact_management.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(updateContactTypeInputSchema)
    .output(contactTypeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ct = await contactTypeService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapContactTypeToOutput(ct)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactTypes.delete -- Deletes a contact type.
   *
   * Prevents deletion when contact kinds are associated.
   *
   * Requires: contact_management.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await contactTypeService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
