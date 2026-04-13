/**
 * Payment Runs tRPC router.
 *
 * Exposes pre-flight + proposal + list + CRUD + download endpoints for
 * SEPA payment runs (pain.001.001.09). Thin wrapper over
 * payment-run-service / payment-run-xml-flow.
 *
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 2.2
 */
import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import { handleServiceError } from "@/trpc/errors"
import * as paymentRunService from "@/lib/services/payment-run-service"
import type { PaymentRunWithItems } from "@/lib/services/payment-run-repository"
import * as paymentRunXmlFlow from "@/lib/services/payment-run-xml-flow"

// --- Permission Constants ---

const VIEW = permissionIdByKey("payment_runs.view")!
const CREATE = permissionIdByKey("payment_runs.create")!
const EXPORT = permissionIdByKey("payment_runs.export")!
const BOOK = permissionIdByKey("payment_runs.book")!
const CANCEL = permissionIdByKey("payment_runs.cancel")!

// --- Base procedure with module guard ---

const prProcedure = tenantProcedure.use(requireModule("payment_runs"))

// --- Serialization helpers ---
// The tRPC transport is plain JSON, so BigInt values must be converted.
// `total_amount_cents` fits comfortably within Number.MAX_SAFE_INTEGER
// (2^53 − 1 ≈ 9e15) for any realistic payment-run volume.

function bigIntToNumber(v: bigint | null | undefined): number {
  if (v === null || v === undefined) return 0
  return Number(v)
}

function mapItem(item: PaymentRunWithItems["items"][number]) {
  return {
    id: item.id,
    tenantId: item.tenantId,
    paymentRunId: item.paymentRunId,
    inboundInvoiceId: item.inboundInvoiceId,
    effectiveCreditorName: item.effectiveCreditorName,
    effectiveIban: item.effectiveIban,
    effectiveBic: item.effectiveBic,
    effectiveStreet: item.effectiveStreet,
    effectiveZip: item.effectiveZip,
    effectiveCity: item.effectiveCity,
    effectiveCountry: item.effectiveCountry,
    effectiveAmountCents: bigIntToNumber(item.effectiveAmountCents),
    effectiveCurrency: item.effectiveCurrency,
    effectiveRemittanceInfo: item.effectiveRemittanceInfo,
    ibanSource: item.ibanSource,
    addressSource: item.addressSource,
    endToEndId: item.endToEndId,
    createdAt: item.createdAt,
    inboundInvoice: item.inboundInvoice
      ? {
          id: item.inboundInvoice.id,
          number: item.inboundInvoice.number,
          invoiceNumber: item.inboundInvoice.invoiceNumber,
          sellerName: item.inboundInvoice.sellerName,
          dueDate: item.inboundInvoice.dueDate,
          totalGross: item.inboundInvoice.totalGross
            ? Number(item.inboundInvoice.totalGross)
            : null,
          supplierId: item.inboundInvoice.supplierId,
        }
      : null,
  }
}

function mapRun(run: PaymentRunWithItems) {
  return {
    id: run.id,
    tenantId: run.tenantId,
    number: run.number,
    status: run.status,
    executionDate: run.executionDate,
    debtorName: run.debtorName,
    debtorIban: run.debtorIban,
    debtorBic: run.debtorBic,
    totalAmountCents: bigIntToNumber(run.totalAmountCents),
    itemCount: run.itemCount,
    xmlStoragePath: run.xmlStoragePath,
    xmlGeneratedAt: run.xmlGeneratedAt,
    bookedAt: run.bookedAt,
    bookedBy: run.bookedBy,
    cancelledAt: run.cancelledAt,
    cancelledBy: run.cancelledBy,
    cancelledReason: run.cancelledReason,
    notes: run.notes,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    createdBy: run.createdBy,
    items: run.items.map(mapItem),
  }
}

// --- Input Schemas ---

const proposalFiltersSchema = z.object({
  fromDueDate: z.string().optional(),
  toDueDate: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  minAmountCents: z.number().int().nonnegative().optional(),
  maxAmountCents: z.number().int().nonnegative().optional(),
})

const listSchema = z.object({
  status: z.enum(["DRAFT", "EXPORTED", "BOOKED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
})

const createSchema = z.object({
  executionDate: z.string(), // ISO YYYY-MM-DD
  items: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        ibanSource: z.enum(["CRM", "INVOICE"]),
        addressSource: z.enum(["CRM", "INVOICE"]),
      })
    )
    .min(1),
  notes: z.string().max(5000).optional(),
})

// --- Router ---

export const paymentRunsRouter = createTRPCRouter({
  getPreflight: prProcedure
    .use(requirePermission(VIEW))
    .query(async ({ ctx }) => {
      try {
        return await paymentRunService.getPreflight(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getProposal: prProcedure
    .use(requirePermission(VIEW))
    .input(proposalFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        const rows = await paymentRunService.getProposal(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          {
            fromDueDate: input.fromDueDate
              ? new Date(input.fromDueDate)
              : undefined,
            toDueDate: input.toDueDate ? new Date(input.toDueDate) : undefined,
            supplierId: input.supplierId,
            minAmountCents: input.minAmountCents,
            maxAmountCents: input.maxAmountCents,
          }
        )
        // Convert bigint amountCents so the JSON transport can serialize.
        return rows.map((r) => ({
          ...r,
          amountCents: Number(r.amountCents),
        }))
      } catch (err) {
        handleServiceError(err)
      }
    }),

  list: prProcedure
    .use(requirePermission(VIEW))
    .input(listSchema)
    .query(async ({ ctx, input }) => {
      try {
        const result = await paymentRunService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          { status: input.status, search: input.search },
          { page: input.page, pageSize: input.pageSize }
        )
        return {
          items: result.items.map((run) => ({
            ...run,
            totalAmountCents: Number(run.totalAmountCents),
          })),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: prProcedure
    .use(requirePermission(VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const run = await paymentRunService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return mapRun(run)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: prProcedure
    .use(requirePermission(CREATE))
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const run = await paymentRunService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          {
            executionDate: new Date(input.executionDate),
            items: input.items,
            notes: input.notes ?? null,
          },
          ctx.user!.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return mapRun(run)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  downloadXml: prProcedure
    .use(requirePermission(EXPORT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentRunXmlFlow.generateAndGetSignedUrl(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  markBooked: prProcedure
    .use(requirePermission(BOOK))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const run = await paymentRunService.markBooked(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return mapRun(run)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: prProcedure
    .use(requirePermission(CANCEL))
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const run = await paymentRunService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason ?? "",
          {
            userId: ctx.user!.id,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          }
        )
        return mapRun(run)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
