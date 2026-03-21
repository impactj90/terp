import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as configService from "@/lib/services/billing-tenant-config-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const upsertInput = z.object({
  companyName: z.string().max(255).nullable().optional(),
  companyAddress: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  bankName: z.string().max(255).nullable().optional(),
  iban: z.string().max(34).nullable().optional(),
  bic: z.string().max(11).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  commercialRegister: z.string().max(255).nullable().optional(),
  managingDirector: z.string().max(255).nullable().optional(),
  footerHtml: z.string().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  website: z.string().max(255).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  leitwegId: z.string().max(50).nullable().optional(),
  eInvoiceEnabled: z.boolean().optional(),
  companyStreet: z.string().max(255).nullable().optional(),
  companyZip: z.string().max(20).nullable().optional(),
  companyCity: z.string().max(100).nullable().optional(),
  companyCountry: z.string().max(10).nullable().optional(),
})

// --- Router ---
export const billingTenantConfigRouter = createTRPCRouter({
  get: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .query(async ({ ctx }) => {
      try {
        return await configService.get(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  upsert: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(upsertInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await configService.upsert(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
