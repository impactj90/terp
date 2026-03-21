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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as contactKindService from "@/lib/services/contact-kind-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---

const CONTACT_MANAGEMENT_MANAGE = permissionIdByKey("contact_management.manage")!

// --- Output Schemas ---

const contactKindOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactTypeId: z.string(),
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
  contactTypeId: z.string(),
  code: z.string().min(1, "Code is required"),
  label: z.string().min(1, "Label is required"),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const updateContactKindInputSchema = z.object({
  id: z.string(),
  contactTypeId: z.string().optional(),
  code: z.string().min(1).optional(),
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
   * Orders by sortOrder ASC.
   *
   * Requires: contact_management.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(
      z
        .object({
          contactTypeId: z.string().optional(),
          isActive: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(contactKindOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const kinds = await contactKindService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
        return {
          data: kinds.map(mapContactKindToOutput),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactKinds.getById -- Returns a single contact kind by ID.
   *
   * Tenant-scoped.
   *
   * Requires: contact_management.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(contactKindOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const ck = await contactKindService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapContactKindToOutput(ck)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactKinds.create -- Creates a new contact kind.
   *
   * Validates code and label are non-empty. Verifies contactTypeId exists.
   * Checks code uniqueness within tenant.
   *
   * Requires: contact_management.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(createContactKindInputSchema)
    .output(contactKindOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ck = await contactKindService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapContactKindToOutput(ck)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactKinds.update -- Updates an existing contact kind.
   *
   * Supports partial updates. Validates code uniqueness when changed.
   *
   * Requires: contact_management.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(updateContactKindInputSchema)
    .output(contactKindOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const ck = await contactKindService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapContactKindToOutput(ck)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * contactKinds.delete -- Deletes a contact kind.
   *
   * Prevents deletion when employee contacts reference it.
   *
   * Requires: contact_management.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(CONTACT_MANAGEMENT_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await contactKindService.remove(
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
