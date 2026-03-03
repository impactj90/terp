/**
 * Tenants Router
 *
 * Provides tenant CRUD operations via tRPC procedures.
 * Replaces the Go backend tenant endpoints:
 * - GET /tenants (list) -> tenants.list
 * - GET /tenants/{id} -> tenants.getById
 * - POST /tenants -> tenants.create
 * - PATCH /tenants/{id} -> tenants.update
 * - DELETE /tenants/{id} -> tenants.deactivate
 *
 * @see apps/api/internal/service/tenant.go
 * @see apps/api/internal/handler/tenant.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!

// --- Enums ---

const vacationBasisEnum = z.enum(["calendar_year", "entry_date"])

// --- Output Schema ---

const tenantOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean().nullable(),
  addressStreet: z.string().nullable(),
  addressZip: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressCountry: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  payrollExportBasePath: z.string().nullable(),
  notes: z.string().nullable(),
  vacationBasis: z.string(),
  settings: z.unknown().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
})

// --- Input: Create ---

const createTenantInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(3, "Slug must be at least 3 characters"),
  addressStreet: z.string().min(1, "Street is required"),
  addressZip: z.string().min(1, "ZIP is required"),
  addressCity: z.string().min(1, "City is required"),
  addressCountry: z.string().min(1, "Country is required"),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional().default("calendar_year"),
})

// --- Input: Update ---

const updateTenantInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  addressStreet: z.string().min(1).optional(),
  addressZip: z.string().min(1).optional(),
  addressCity: z.string().min(1).optional(),
  addressCountry: z.string().min(1).optional(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Normalizes an optional string: trims whitespace, returns null if empty.
 * Mirrors Go's normalizeOptionalString (tenant.go lines 264-271).
 */
function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// --- Router ---

export const tenantsRouter = createTRPCRouter({
  /**
   * tenants.list -- Returns tenants the current user has access to.
   *
   * No permission required -- data is filtered to user's authorized tenants.
   * Uses protectedProcedure (not tenantProcedure) since listing tenants
   * does not require a tenant context.
   *
   * Replaces: GET /tenants (Go TenantHandler.List)
   */
  list: protectedProcedure
    .input(
      z
        .object({
          name: z.string().optional(),
          active: z.boolean().optional(),
        })
        .optional()
    )
    .output(z.array(tenantOutputSchema))
    .query(async ({ ctx, input }) => {
      // Get user's authorized tenants via userTenants join table
      const userTenants = await ctx.prisma.userTenant.findMany({
        where: { userId: ctx.user.id },
        include: { tenant: true },
      })

      let tenants = userTenants.map((ut) => ut.tenant)

      // Apply optional name filter (case-insensitive contains)
      if (input?.name) {
        const lowerName = input.name.toLowerCase()
        tenants = tenants.filter((t) =>
          t.name.toLowerCase().includes(lowerName)
        )
      }

      // Apply optional active filter
      if (input?.active !== undefined) {
        tenants = tenants.filter((t) => t.isActive === input.active)
      }

      return tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        isActive: t.isActive,
        addressStreet: t.addressStreet,
        addressZip: t.addressZip,
        addressCity: t.addressCity,
        addressCountry: t.addressCountry,
        phone: t.phone,
        email: t.email,
        payrollExportBasePath: t.payrollExportBasePath,
        notes: t.notes,
        vacationBasis: t.vacationBasis,
        settings: t.settings,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    }),

  /**
   * tenants.getById -- Returns a single tenant by ID.
   *
   * Requires: tenants.manage permission
   *
   * Replaces: GET /tenants/{id} (Go TenantHandler.Get)
   */
  getById: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(tenantOutputSchema)
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        })
      }

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        addressStreet: tenant.addressStreet,
        addressZip: tenant.addressZip,
        addressCity: tenant.addressCity,
        addressCountry: tenant.addressCountry,
        phone: tenant.phone,
        email: tenant.email,
        payrollExportBasePath: tenant.payrollExportBasePath,
        notes: tenant.notes,
        vacationBasis: tenant.vacationBasis,
        settings: tenant.settings,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      }
    }),

  /**
   * tenants.create -- Creates a new tenant.
   *
   * Requires: tenants.manage permission
   * Auto-adds the creating user to the tenant with role "owner".
   *
   * Replaces: POST /tenants (Go TenantHandler.Create + TenantService.Create)
   */
  create: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(createTenantInputSchema)
    .output(tenantOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Normalize slug and name
      const slug = input.slug.trim().toLowerCase()
      const name = input.name.trim()

      // Re-validate after trim
      if (slug.length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Slug must be at least 3 characters",
        })
      }
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Name is required",
        })
      }

      // Validate address fields after trim
      const addressStreet = input.addressStreet.trim()
      const addressZip = input.addressZip.trim()
      const addressCity = input.addressCity.trim()
      const addressCountry = input.addressCountry.trim()

      if (
        !addressStreet ||
        !addressZip ||
        !addressCity ||
        !addressCountry
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All address fields are required",
        })
      }

      // Check slug uniqueness
      const existingBySlug = await ctx.prisma.tenant.findUnique({
        where: { slug },
      })
      if (existingBySlug) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tenant slug already exists",
        })
      }

      // Normalize optional strings
      const phone = normalizeOptionalString(input.phone)
      const email = normalizeOptionalString(input.email)
      const payrollExportBasePath = normalizeOptionalString(
        input.payrollExportBasePath
      )
      const notes = normalizeOptionalString(input.notes)

      // Create tenant
      const tenant = await ctx.prisma.tenant.create({
        data: {
          name,
          slug,
          addressStreet,
          addressZip,
          addressCity,
          addressCountry,
          phone,
          email,
          payrollExportBasePath,
          notes,
          vacationBasis: input.vacationBasis,
          isActive: true,
        },
      })

      // Auto-add creator to tenant with role "owner"
      // ctx.user is guaranteed non-null by protectedProcedure
      const userId = ctx.user!.id
      await ctx.prisma.userTenant.upsert({
        where: {
          userId_tenantId: {
            userId,
            tenantId: tenant.id,
          },
        },
        create: {
          userId,
          tenantId: tenant.id,
          role: "owner",
        },
        update: {},
      })

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        addressStreet: tenant.addressStreet,
        addressZip: tenant.addressZip,
        addressCity: tenant.addressCity,
        addressCountry: tenant.addressCountry,
        phone: tenant.phone,
        email: tenant.email,
        payrollExportBasePath: tenant.payrollExportBasePath,
        notes: tenant.notes,
        vacationBasis: tenant.vacationBasis,
        settings: tenant.settings,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      }
    }),

  /**
   * tenants.update -- Updates an existing tenant.
   *
   * Requires: tenants.manage permission
   * Only updates provided fields (partial update).
   *
   * Replaces: PATCH /tenants/{id} (Go TenantHandler.Update + TenantService.Update)
   */
  update: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(updateTenantInputSchema)
    .output(tenantOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify tenant exists
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        })
      }

      // Build update data with only provided fields
      const data: Record<string, unknown> = {}

      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Name cannot be empty",
          })
        }
        data.name = name
      }

      if (input.addressStreet !== undefined) {
        const val = input.addressStreet.trim()
        if (val.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Street cannot be empty",
          })
        }
        data.addressStreet = val
      }

      if (input.addressZip !== undefined) {
        const val = input.addressZip.trim()
        if (val.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ZIP cannot be empty",
          })
        }
        data.addressZip = val
      }

      if (input.addressCity !== undefined) {
        const val = input.addressCity.trim()
        if (val.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "City cannot be empty",
          })
        }
        data.addressCity = val
      }

      if (input.addressCountry !== undefined) {
        const val = input.addressCountry.trim()
        if (val.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Country cannot be empty",
          })
        }
        data.addressCountry = val
      }

      if (input.phone !== undefined) {
        data.phone = normalizeOptionalString(input.phone)
      }

      if (input.email !== undefined) {
        data.email = normalizeOptionalString(input.email)
      }

      if (input.payrollExportBasePath !== undefined) {
        data.payrollExportBasePath = normalizeOptionalString(
          input.payrollExportBasePath
        )
      }

      if (input.notes !== undefined) {
        data.notes = normalizeOptionalString(input.notes)
      }

      if (input.vacationBasis !== undefined) {
        data.vacationBasis = input.vacationBasis
      }

      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const tenant = await ctx.prisma.tenant.update({
        where: { id: input.id },
        data,
      })

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
        addressStreet: tenant.addressStreet,
        addressZip: tenant.addressZip,
        addressCity: tenant.addressCity,
        addressCountry: tenant.addressCountry,
        phone: tenant.phone,
        email: tenant.email,
        payrollExportBasePath: tenant.payrollExportBasePath,
        notes: tenant.notes,
        vacationBasis: tenant.vacationBasis,
        settings: tenant.settings,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      }
    }),

  /**
   * tenants.deactivate -- Soft-deletes a tenant by setting isActive = false.
   *
   * Requires: tenants.manage permission
   *
   * Replaces: DELETE /tenants/{id} (Go TenantHandler.Delete -> TenantService.Deactivate)
   */
  deactivate: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Verify tenant exists
      const existing = await ctx.prisma.tenant.findUnique({
        where: { id: input.id },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        })
      }

      await ctx.prisma.tenant.update({
        where: { id: input.id },
        data: { isActive: false },
      })

      return { success: true }
    }),
})
