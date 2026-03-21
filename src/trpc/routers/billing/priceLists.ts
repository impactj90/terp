import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as priceListService from "@/lib/services/billing-price-list-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---

// Relaxed UUID: Zod v4's z.string().uuid() rejects non-standard UUIDs (version=0)
// used in seed data. Use regex to accept any 8-4-4-4-12 hex string.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
const optionalUuid = uuid.optional()

const listInput = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
})

const updateInput = z.object({
  id: uuid,
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
})

const idInput = z.object({ id: uuid })

const entryListInput = z.object({
  priceListId: uuid,
  search: z.string().optional(),
})

const createEntryInput = z.object({
  priceListId: uuid,
  articleId: optionalUuid,
  itemKey: z.string().optional(),
  description: z.string().optional(),
  unitPrice: z.number(),
  minQuantity: z.number().optional(),
  unit: z.string().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
})

const updateEntryInput = z.object({
  id: uuid,
  priceListId: uuid,
  description: z.string().nullable().optional(),
  unitPrice: z.number().optional(),
  minQuantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
})

const deleteEntryInput = z.object({
  id: uuid,
  priceListId: uuid,
})

const bulkImportInput = z.object({
  priceListId: uuid,
  entries: z.array(z.object({
    articleId: optionalUuid,
    itemKey: z.string().optional(),
    description: z.string().optional(),
    unitPrice: z.number(),
    minQuantity: z.number().optional(),
    unit: z.string().optional(),
  })).min(1),
})

const lookupPriceInput = z.object({
  addressId: uuid,
  articleId: optionalUuid,
  itemKey: z.string().optional(),
  quantity: z.number().optional(),
})

// --- Router ---
export const billingPriceListsRouter = createTRPCRouter({
  // --- Price List CRUD ---
  list: billingProcedure
    .use(requirePermission(PL_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await priceListService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(PL_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await priceListService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(PL_MANAGE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await priceListService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: billingProcedure
    .use(requirePermission(PL_MANAGE))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await priceListService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(PL_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await priceListService.remove(
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

  setDefault: billingProcedure
    .use(requirePermission(PL_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await priceListService.setDefault(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Entries sub-router ---
  entries: createTRPCRouter({
    list: billingProcedure
      .use(requirePermission(PL_VIEW))
      .input(entryListInput)
      .query(async ({ ctx, input }) => {
        try {
          return await priceListService.listEntries(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.priceListId,
            { search: input.search }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    create: billingProcedure
      .use(requirePermission(PL_MANAGE))
      .input(createEntryInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await priceListService.createEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: billingProcedure
      .use(requirePermission(PL_MANAGE))
      .input(updateEntryInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await priceListService.updateEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: billingProcedure
      .use(requirePermission(PL_MANAGE))
      .input(deleteEntryInput)
      .mutation(async ({ ctx, input }) => {
        try {
          await priceListService.removeEntry(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.priceListId,
            input.id,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
          return { success: true }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    bulkImport: billingProcedure
      .use(requirePermission(PL_MANAGE))
      .input(bulkImportInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await priceListService.bulkImport(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.priceListId,
            input.entries,
            { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),

  // --- Entries for Address (autocomplete) ---
  entriesForAddress: billingProcedure
    .use(requirePermission(PL_VIEW))
    .input(z.object({ addressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await priceListService.entriesForAddress(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.addressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Price Lookup ---
  lookupPrice: billingProcedure
    .use(requirePermission(PL_VIEW))
    .input(lookupPriceInput)
    .query(async ({ ctx, input }) => {
      try {
        return await priceListService.lookupPrice(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
