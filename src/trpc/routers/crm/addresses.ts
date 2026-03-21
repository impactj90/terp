import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmAddressService from "@/lib/services/crm-address-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Router ---
export const crmAddressesRouter = createTRPCRouter({
  // Address CRUD
  list: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({
      search: z.string().optional(),
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
      isActive: z.boolean().optional().default(true),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(CRM_CREATE))
    .input(z.object({
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional().default("CUSTOMER"),
      company: z.string().min(1, "Company is required"),
      street: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional().default("DE"),
      phone: z.string().optional(),
      fax: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      website: z.string().optional(),
      taxNumber: z.string().optional(),
      vatId: z.string().optional(),
      leitwegId: z.string().max(50).optional(),
      matchCode: z.string().optional(),
      notes: z.string().optional(),
      paymentTermDays: z.number().int().optional(),
      discountPercent: z.number().optional(),
      discountDays: z.number().int().optional(),
      discountGroup: z.string().optional(),
      priceListId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.create(
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

  update: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
      company: z.string().min(1).optional(),
      street: z.string().nullable().optional(),
      zip: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      fax: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      website: z.string().nullable().optional(),
      taxNumber: z.string().nullable().optional(),
      vatId: z.string().nullable().optional(),
      leitwegId: z.string().max(50).nullable().optional(),
      matchCode: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      paymentTermDays: z.number().int().nullable().optional(),
      discountPercent: z.number().nullable().optional(),
      discountDays: z.number().int().nullable().optional(),
      discountGroup: z.string().nullable().optional(),
      priceListId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: crmProcedure
    .use(requirePermission(CRM_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.remove(
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

  restore: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.restoreAddress(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Contact Sub-Procedures ---

  contactsList: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ addressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.listContacts(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.addressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsCreate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      addressId: z.string().uuid(),
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      position: z.string().optional(),
      department: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      notes: z.string().optional(),
      isPrimary: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.createContact(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsUpdate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      position: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      notes: z.string().nullable().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.updateContact(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsDelete: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.deleteContact(
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

  // --- Bank Account Sub-Procedures ---

  bankAccountsList: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ addressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.listBankAccounts(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.addressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsCreate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      addressId: z.string().uuid(),
      iban: z.string().min(1, "IBAN is required"),
      bic: z.string().optional(),
      bankName: z.string().optional(),
      accountHolder: z.string().optional(),
      isDefault: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.createBankAccount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsUpdate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      iban: z.string().min(1).optional(),
      bic: z.string().nullable().optional(),
      bankName: z.string().nullable().optional(),
      accountHolder: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.updateBankAccount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsDelete: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.deleteBankAccount(
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
