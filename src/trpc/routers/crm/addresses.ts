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
      search: z.string().max(255).optional(),
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
      company: z.string().min(1, "Company is required").max(500),
      street: z.string().max(500).optional(),
      zip: z.string().max(500).optional(),
      city: z.string().max(500).optional(),
      country: z.string().max(500).optional().default("DE"),
      phone: z.string().max(255).optional(),
      fax: z.string().max(255).optional(),
      email: z.string().email().optional().or(z.literal("")),
      website: z.string().max(255).optional(),
      taxNumber: z.string().max(255).optional(),
      vatId: z.string().max(255).optional(),
      leitwegId: z.string().max(50).optional(),
      matchCode: z.string().max(255).optional(),
      notes: z.string().max(2000).optional(),
      paymentTermDays: z.number().int().min(0).max(365).optional(),
      discountPercent: z.number().min(0).max(100).optional(),
      discountDays: z.number().int().min(0).max(365).optional(),
      discountGroup: z.string().max(100).optional(),
      ourCustomerNumber: z.string().max(50).optional(),
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
      company: z.string().min(1).max(500).optional(),
      street: z.string().max(500).nullable().optional(),
      zip: z.string().max(500).nullable().optional(),
      city: z.string().max(500).nullable().optional(),
      country: z.string().max(500).nullable().optional(),
      phone: z.string().max(255).nullable().optional(),
      fax: z.string().max(255).nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      website: z.string().max(255).nullable().optional(),
      taxNumber: z.string().max(255).nullable().optional(),
      vatId: z.string().max(255).nullable().optional(),
      leitwegId: z.string().max(50).nullable().optional(),
      matchCode: z.string().max(255).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
      discountPercent: z.number().min(0).max(100).nullable().optional(),
      discountDays: z.number().int().min(0).max(365).nullable().optional(),
      discountGroup: z.string().max(100).nullable().optional(),
      ourCustomerNumber: z.string().max(50).nullable().optional(),
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
      firstName: z.string().min(1, "First name is required").max(255),
      lastName: z.string().min(1, "Last name is required").max(255),
      position: z.string().max(255).optional(),
      department: z.string().max(255).optional(),
      phone: z.string().max(255).optional(),
      email: z.string().email().optional().or(z.literal("")),
      notes: z.string().max(2000).optional(),
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
      firstName: z.string().min(1).max(255).optional(),
      lastName: z.string().min(1).max(255).optional(),
      position: z.string().max(255).nullable().optional(),
      department: z.string().max(255).nullable().optional(),
      phone: z.string().max(255).nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      notes: z.string().max(2000).nullable().optional(),
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
      iban: z.string().min(1, "IBAN is required").max(34),
      bic: z.string().max(11).optional(),
      bankName: z.string().max(255).optional(),
      accountHolder: z.string().max(255).optional(),
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
      iban: z.string().min(1).max(34).optional(),
      bic: z.string().max(11).nullable().optional(),
      bankName: z.string().max(255).nullable().optional(),
      accountHolder: z.string().max(255).nullable().optional(),
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
