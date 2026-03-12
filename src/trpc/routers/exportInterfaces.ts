/**
 * Export Interfaces Router
 *
 * Provides CRUD operations + account assignment management for export interfaces
 * via tRPC procedures.
 *
 * Replaces the Go backend export interface endpoints:
 * - GET    /export-interfaces              -> exportInterfaces.list
 * - GET    /export-interfaces/{id}         -> exportInterfaces.getById
 * - POST   /export-interfaces              -> exportInterfaces.create
 * - PATCH  /export-interfaces/{id}         -> exportInterfaces.update
 * - DELETE /export-interfaces/{id}         -> exportInterfaces.delete
 * - GET    /export-interfaces/{id}/accounts -> exportInterfaces.listAccounts
 * - PUT    /export-interfaces/{id}/accounts -> exportInterfaces.setAccounts
 *
 * @see apps/api/internal/service/exportinterface.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"

// --- Permission Constants ---

const PAYROLL_MANAGE = permissionIdByKey("payroll.manage")!

// --- Output Schemas ---

const accountOutputSchema = z.object({
  id: z.string(),
  exportInterfaceId: z.string(),
  accountId: z.string(),
  sortOrder: z.number(),
  createdAt: z.date(),
  account: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    payrollCode: z.string().nullable(),
  }).optional(),
})

const exportInterfaceOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  interfaceNumber: z.number(),
  name: z.string(),
  mandantNumber: z.string().nullable(),
  exportScript: z.string().nullable(),
  exportPath: z.string().nullable(),
  outputFilename: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  accounts: z.array(accountOutputSchema).optional(),
})

// --- Input Schemas ---

const createInputSchema = z.object({
  interfaceNumber: z.number().int().min(1, "Interface number must be at least 1"),
  name: z.string().min(1, "Name is required").max(255),
  mandantNumber: z.string().max(50).optional(),
  exportScript: z.string().max(255).optional(),
  exportPath: z.string().max(500).optional(),
  outputFilename: z.string().max(255).optional(),
})

const updateInputSchema = z.object({
  id: z.string(),
  interfaceNumber: z.number().int().min(1).optional(),
  name: z.string().min(1).max(255).optional(),
  mandantNumber: z.string().max(50).nullable().optional(),
  exportScript: z.string().max(255).nullable().optional(),
  exportPath: z.string().max(500).nullable().optional(),
  outputFilename: z.string().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Router ---

export const exportInterfacesRouter = createTRPCRouter({
  /**
   * exportInterfaces.list -- Returns export interfaces for the current tenant.
   *
   * Supports optional activeOnly filter.
   * Orders by interfaceNumber ASC.
   *
   * Requires: payroll.manage permission
   */
  list: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .output(z.object({ data: z.array(exportInterfaceOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const where: Record<string, unknown> = { tenantId }
        if (input?.activeOnly) {
          where.isActive = true
        }

        const interfaces = await ctx.prisma.exportInterface.findMany({
          where,
          include: {
            accounts: {
              include: {
                account: {
                  select: { id: true, code: true, name: true, payrollCode: true },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { interfaceNumber: "asc" },
        })

        return { data: interfaces }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.getById -- Returns a single export interface by ID.
   *
   * Requires: payroll.manage permission
   */
  getById: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(exportInterfaceOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const ei = await ctx.prisma.exportInterface.findFirst({
          where: { id: input.id, tenantId },
          include: {
            accounts: {
              include: {
                account: {
                  select: { id: true, code: true, name: true, payrollCode: true },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        })

        if (!ei) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Export interface not found",
          })
        }

        return ei
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.create -- Creates a new export interface.
   *
   * Validates name non-empty, interfaceNumber > 0, uniqueness per tenant.
   *
   * Requires: payroll.manage permission
   */
  create: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(createInputSchema)
    .output(exportInterfaceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Trim and validate name
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Export interface name is required",
          })
        }

        // Validate interfaceNumber > 0
        if (input.interfaceNumber <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Export interface number must be greater than 0",
          })
        }

        // Check uniqueness of interfaceNumber within tenant
        const existing = await ctx.prisma.exportInterface.findFirst({
          where: { tenantId, interfaceNumber: input.interfaceNumber },
        })
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Export interface number already exists",
          })
        }

        let ei
        try {
          ei = await ctx.prisma.exportInterface.create({
            data: {
              tenantId,
              interfaceNumber: input.interfaceNumber,
              name,
              mandantNumber: input.mandantNumber || null,
              exportScript: input.exportScript || null,
              exportPath: input.exportPath || null,
              outputFilename: input.outputFilename || null,
              isActive: true,
            },
          })
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Export interface number already exists",
            })
          }
          throw err
        }

        return { ...ei, accounts: [] }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.update -- Updates an existing export interface.
   *
   * Supports partial updates. Validates interfaceNumber uniqueness if changed.
   *
   * Requires: payroll.manage permission
   */
  update: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(updateInputSchema)
    .output(exportInterfaceOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify exists with tenant scope
        const existing = await ctx.prisma.exportInterface.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Export interface not found",
          })
        }

        // Build partial update data
        const data: Record<string, unknown> = {}

        if (input.name !== undefined) {
          const name = input.name.trim()
          if (name.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Export interface name is required",
            })
          }
          data.name = name
        }

        if (input.interfaceNumber !== undefined) {
          if (input.interfaceNumber <= 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Export interface number must be greater than 0",
            })
          }
          // Check uniqueness if changed
          if (input.interfaceNumber !== existing.interfaceNumber) {
            const conflict = await ctx.prisma.exportInterface.findFirst({
              where: { tenantId, interfaceNumber: input.interfaceNumber },
            })
            if (conflict) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Export interface number already exists",
              })
            }
            data.interfaceNumber = input.interfaceNumber
          }
        }

        if (input.mandantNumber !== undefined) {
          data.mandantNumber = input.mandantNumber
        }
        if (input.exportScript !== undefined) {
          data.exportScript = input.exportScript
        }
        if (input.exportPath !== undefined) {
          data.exportPath = input.exportPath
        }
        if (input.outputFilename !== undefined) {
          data.outputFilename = input.outputFilename
        }
        if (input.isActive !== undefined) {
          data.isActive = input.isActive
        }

        const updated = await ctx.prisma.exportInterface.update({
          where: { id: input.id },
          data,
          include: {
            accounts: {
              include: {
                account: {
                  select: { id: true, code: true, name: true, payrollCode: true },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        })

        return updated
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.delete -- Deletes an export interface.
   *
   * Checks if the interface has been used for any payroll exports before deletion.
   *
   * Requires: payroll.manage permission
   */
  delete: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify exists with tenant scope
        const existing = await ctx.prisma.exportInterface.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Export interface not found",
          })
        }

        // Check if interface has generated exports
        const usageCount = await ctx.prisma.payrollExport.count({
          where: { exportInterfaceId: input.id },
        })
        if (usageCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot delete export interface that has generated exports",
          })
        }

        await ctx.prisma.exportInterface.delete({
          where: { id: input.id },
        })

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.listAccounts -- Returns accounts for an export interface.
   *
   * Requires: payroll.manage permission
   */
  listAccounts: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: z.array(accountOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify interface exists with tenant scope
        const ei = await ctx.prisma.exportInterface.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!ei) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Export interface not found",
          })
        }

        const accounts = await ctx.prisma.exportInterfaceAccount.findMany({
          where: { exportInterfaceId: input.id },
          include: {
            account: {
              select: { id: true, code: true, name: true, payrollCode: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        })

        return { data: accounts }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * exportInterfaces.setAccounts -- Bulk replace accounts for an export interface.
   *
   * Deletes all existing accounts and creates new ones with sortOrder = array index.
   *
   * Requires: payroll.manage permission
   */
  setAccounts: tenantProcedure
    .use(requirePermission(PAYROLL_MANAGE))
    .input(z.object({
      id: z.string(),
      accountIds: z.array(z.string()),
    }))
    .output(z.object({ data: z.array(accountOutputSchema) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // Verify interface exists with tenant scope
        const ei = await ctx.prisma.exportInterface.findFirst({
          where: { id: input.id, tenantId },
        })
        if (!ei) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Export interface not found",
          })
        }

        // Transaction: delete all, then create new
        await ctx.prisma.$transaction(async (tx) => {
          await tx.exportInterfaceAccount.deleteMany({
            where: { exportInterfaceId: input.id },
          })

          if (input.accountIds.length > 0) {
            await tx.exportInterfaceAccount.createMany({
              data: input.accountIds.map((accountId, index) => ({
                exportInterfaceId: input.id,
                accountId,
                sortOrder: index,
              })),
            })
          }
        })

        // Fetch and return newly created accounts with relation
        const accounts = await ctx.prisma.exportInterfaceAccount.findMany({
          where: { exportInterfaceId: input.id },
          include: {
            account: {
              select: { id: true, code: true, name: true, payrollCode: true },
            },
          },
          orderBy: { sortOrder: "asc" },
        })

        return { data: accounts }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
