import { z } from "zod"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requireModule } from "@/lib/modules"
import * as bankStatementService from "@/lib/services/bank-statement-service"
import * as bankStatementRepo from "@/lib/services/bank-statement-repository"
import * as matcherService from "@/lib/services/bank-transaction-matcher-service"
import { enrichOpenItem } from "@/lib/services/billing-payment-service"
import { hasPlatformSubscriptionMarker } from "@/lib/platform/subscription-service"
import * as auditLog from "@/lib/services/audit-logs-service"

const VIEW = permissionIdByKey("bank_transactions.view")!
const IMPORT = permissionIdByKey("bank_transactions.import")!
const MATCH = permissionIdByKey("bank_transactions.match")!
const UNMATCH = permissionIdByKey("bank_transactions.unmatch")!
const IGNORE = permissionIdByKey("bank_transactions.ignore")!

const bankStatementsProcedure = tenantProcedure.use(
  requireModule("bank_statements"),
)

export const bankStatementsRouter = createTRPCRouter({
  delete: bankStatementsProcedure
    .use(requirePermission(IMPORT))
    .input(z.object({ statementId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await bankStatementService.deleteStatement(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.statementId,
          ctx.user?.id ?? null,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  import: bankStatementsProcedure
    .use(requirePermission(IMPORT))
    .input(
      z.object({
        fileBase64: z.string().min(1),
        fileName: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await bankStatementService.importCamtStatement(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user?.id ?? null,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  list: bankStatementsProcedure
    .use(requirePermission(VIEW))
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await bankStatementRepo.listStatements(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankTransactions: createTRPCRouter({
    list: bankStatementsProcedure
      .use(requirePermission(VIEW))
      .input(
        z.object({
          status: z.enum(["unmatched", "matched", "ignored"]),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          const prisma = ctx.prisma as unknown as PrismaClient
          const tenantId = ctx.tenantId!
          const [items, total] = await Promise.all([
            prisma.bankTransaction.findMany({
              where: { tenantId, status: input.status },
              orderBy: { valueDate: "desc" },
              take: input.limit,
              skip: input.offset,
              include: {
                suggestedAddress: {
                  select: { id: true, company: true, number: true },
                },
              },
            }),
            prisma.bankTransaction.count({
              where: { tenantId, status: input.status },
            }),
          ])
          return { items, total }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    counts: bankStatementsProcedure
      .use(requirePermission(VIEW))
      .query(async ({ ctx }) => {
        try {
          const prisma = ctx.prisma as unknown as PrismaClient
          const tenantId = ctx.tenantId!
          const [unmatched, matched, ignored] = await Promise.all([
            prisma.bankTransaction.count({ where: { tenantId, status: "unmatched" } }),
            prisma.bankTransaction.count({ where: { tenantId, status: "matched" } }),
            prisma.bankTransaction.count({ where: { tenantId, status: "ignored" } }),
          ])
          return { unmatched, matched, ignored }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getById: bankStatementsProcedure
      .use(requirePermission(VIEW))
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          const prisma = ctx.prisma as unknown as PrismaClient
          const tenantId = ctx.tenantId!
          const tx = await prisma.bankTransaction.findFirst({
            where: { id: input.id, tenantId },
            include: {
              suggestedAddress: {
                select: { id: true, company: true, number: true },
              },
              billingAllocations: {
                include: {
                  billingDocument: {
                    select: { id: true, number: true, type: true, totalGross: true, status: true },
                  },
                },
              },
              inboundAllocations: {
                include: {
                  inboundInvoice: {
                    select: { id: true, number: true, invoiceNumber: true, totalGross: true, status: true },
                  },
                },
              },
            },
          })
          return tx
        } catch (err) {
          handleServiceError(err)
        }
      }),

    manualMatch: bankStatementsProcedure
      .use(requirePermission(MATCH))
      .input(
        z.object({
          bankTransactionId: z.string().uuid(),
          allocations: z
            .array(
              z.object({
                billingDocumentId: z.string().uuid().optional(),
                inboundInvoiceId: z.string().uuid().optional(),
                amount: z.number().positive(),
              }),
            )
            .min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          await matcherService.manualMatchTransaction(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.bankTransactionId,
            input.allocations,
            ctx.user!.id,
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    unmatch: bankStatementsProcedure
      .use(requirePermission(UNMATCH))
      .input(z.object({ bankTransactionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await matcherService.unmatchBankTransaction(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.bankTransactionId,
            ctx.user?.id ?? null,
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    ignore: bankStatementsProcedure
      .use(requirePermission(IGNORE))
      .input(
        z.object({
          bankTransactionId: z.string().uuid(),
          reason: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const prisma = ctx.prisma as unknown as PrismaClient
          const tenantId = ctx.tenantId!
          const userId = ctx.user!.id

          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, tenantId },
          })
          if (!bankTx) throw new matcherService.BankTransactionMatchValidationError("transaction not found")
          if (bankTx.status !== "unmatched") {
            throw new matcherService.BankTransactionMatchValidationError(
              `transaction is not unmatched (status=${bankTx.status})`,
            )
          }

          await prisma.bankTransaction.update({
            where: { id: input.bankTransactionId },
            data: {
              status: "ignored",
              ignoredAt: new Date(),
              ignoredById: userId,
              ignoredReason: input.reason ?? null,
            },
          })

          await auditLog.log(prisma, {
            tenantId,
            userId,
            action: "ignore",
            entityType: "bank_transaction",
            entityId: input.bankTransactionId,
            metadata: { reason: input.reason ?? null },
          }).catch(() => {})
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getCandidates: bankStatementsProcedure
      .use(requirePermission(MATCH))
      .input(
        z.object({
          bankTransactionId: z.string().uuid(),
          addressId: z.string().uuid().optional(),
          search: z.string().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        try {
          const prisma = ctx.prisma as unknown as PrismaClient
          const tenantId = ctx.tenantId!

          const bankTx = await prisma.bankTransaction.findFirst({
            where: { id: input.bankTransactionId, tenantId },
          })
          if (!bankTx) return { creditCandidates: [], debitCandidates: [] }

          if (bankTx.direction === "CREDIT") {
            const where: Record<string, unknown> = {
              tenantId,
              status: "PRINTED",
              type: { in: ["INVOICE", "CREDIT_NOTE"] },
            }
            if (input.addressId) where.addressId = input.addressId
            if (input.search) {
              where.OR = [
                { number: { contains: input.search, mode: "insensitive" } },
                { address: { company: { contains: input.search, mode: "insensitive" } } },
              ]
            }

            const docs = await prisma.billingDocument.findMany({
              where,
              take: 50,
              orderBy: { documentDate: "desc" },
              include: {
                payments: { where: { status: "ACTIVE" } },
                childDocuments: { where: { status: "PRINTED", type: "CREDIT_NOTE" } },
                address: { select: { id: true, company: true, number: true } },
              },
            })

            const eligible = docs.filter(
              (doc) => !hasPlatformSubscriptionMarker(doc.internalNotes ?? ""),
            )

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enriched = eligible.map((doc: any) => ({
              id: doc.id,
              number: doc.number,
              type: doc.type,
              totalGross: doc.totalGross,
              documentDate: doc.documentDate,
              address: doc.address,
              ...enrichOpenItem(doc),
            }))

            return {
              creditCandidates: enriched.filter((d) => d.openAmount > 0.01),
              debitCandidates: [],
            }
          }

          // DEBIT direction
          const where: Record<string, unknown> = {
            tenantId,
            paymentStatus: { in: ["UNPAID", "PARTIAL"] },
            status: { in: ["APPROVED", "EXPORTED"] },
          }
          if (input.addressId) where.supplierId = input.addressId
          if (input.search) {
            where.OR = [
              { number: { contains: input.search, mode: "insensitive" } },
              { invoiceNumber: { contains: input.search, mode: "insensitive" } },
              { sellerName: { contains: input.search, mode: "insensitive" } },
            ]
          }

          const invoices = await prisma.inboundInvoice.findMany({
            where,
            take: 50,
            orderBy: { dueDate: "desc" },
            select: {
              id: true,
              number: true,
              invoiceNumber: true,
              totalGross: true,
              paidAmount: true,
              dueDate: true,
              sellerName: true,
              supplierId: true,
              supplier: { select: { id: true, company: true, number: true } },
            },
          })

          const debitCandidates = invoices.map((inv) => {
            const totalGross = inv.totalGross ? Number(inv.totalGross) : 0
            return {
              id: inv.id,
              number: inv.number,
              invoiceNumber: inv.invoiceNumber,
              totalGross,
              openAmount: Math.round((totalGross - (inv.paidAmount ?? 0)) * 100) / 100,
              dueDate: inv.dueDate,
              sellerName: inv.sellerName,
              address: inv.supplier,
            }
          })

          return {
            creditCandidates: [],
            debitCandidates: debitCandidates.filter((d) => d.openAmount > 0.01),
          }
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
