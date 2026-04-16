import crypto from "node:crypto"
import type { PrismaClient } from "@/generated/prisma/client"
import * as storage from "@/lib/supabase/storage"
import { parseCamt053 } from "./bank-statement-camt-parser"
import * as repo from "./bank-statement-repository"
import * as auditLog from "./audit-logs-service"
import * as matcherService from "./bank-transaction-matcher-service"
import * as numberSequenceService from "./number-sequence-service"
import * as billingPaymentRepo from "./billing-payment-repository"
import * as inboundPaymentRepo from "./inbound-invoice-payment-repository"

export class BankStatementNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankStatementNotFoundError"
  }
}

export class BankStatementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankStatementValidationError"
  }
}

export class BankStatementConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BankStatementConflictError"
  }
}

export const BANK_STATEMENTS_BUCKET = "bank-statements"

export interface ImportCamtInput {
  fileBase64: string
  fileName: string
}

export interface ImportCamtResult {
  statementId: string
  alreadyImported: boolean
  transactionsImported: number
}

export interface AutoMatchResult {
  autoMatched: number
  unmatched: number
  failed: number
}

export interface MatchProgress {
  total: number
  processed: number
  matched: number
}

export async function importCamtStatement(
  prisma: PrismaClient,
  tenantId: string,
  input: ImportCamtInput,
  userId: string | null,
): Promise<ImportCamtResult> {
  let buffer: Buffer
  try {
    buffer = Buffer.from(input.fileBase64, "base64")
  } catch {
    throw new BankStatementValidationError("Ungültige Base64-Kodierung")
  }
  if (buffer.length === 0) {
    throw new BankStatementValidationError("Leere Datei")
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex")

  const existing = await repo.findStatementByHash(prisma, tenantId, sha256)
  if (existing) {
    return {
      statementId: existing.id,
      alreadyImported: true,
      transactionsImported: 0,
    }
  }

  // Parse first — cheap, and lets us fail fast before any I/O
  const parsed = parseCamt053(buffer.toString("utf8"))

  const statementRowId = crypto.randomUUID()
  const storagePath = `${tenantId}/${statementRowId}.xml`

  try {
    await storage.upload(BANK_STATEMENTS_BUCKET, storagePath, buffer, {
      contentType: "application/xml",
      upsert: false,
    })
  } catch (err) {
    if (
      err instanceof Error &&
      /duplicate|already exists/i.test(err.message)
    ) {
      throw new BankStatementConflictError(
        "Diese Datei existiert bereits im Storage",
      )
    }
    throw err
  }

  let statementId: string
  let transactionsImported: number

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      const stmt = await repo.createStatement(tx, {
        id: statementRowId,
        tenantId,
        fileName: input.fileName,
        sha256Hash: sha256,
        xmlStoragePath: storagePath,
        accountIban: parsed.accountIban,
        statementId: parsed.statementId,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        currency: parsed.currency,
        importedById: userId,
      })

      const rows = parsed.transactions.map((t) => ({
        tenantId,
        statementId: stmt.id,
        bookingDate: t.bookingDate,
        valueDate: t.valueDate,
        amount: t.amount,
        currency: t.currency,
        direction: t.direction,
        counterpartyIban: t.counterpartyIban,
        counterpartyName: t.counterpartyName,
        counterpartyBic: t.counterpartyBic,
        remittanceInfo: t.remittanceInfo,
        endToEndId: t.endToEndId,
        mandateId: t.mandateId,
        bankReference: t.bankReference,
        bankTxCode: t.bankTxCode,
        status: "unmatched" as const,
      }))

      const txns = await repo.createTransactionsBatch(tx, tenantId, stmt.id, rows)

      await auditLog.log(tx, {
        tenantId,
        userId,
        action: "import",
        entityType: "bank_statement",
        entityId: stmt.id,
        entityName: input.fileName,
        metadata: {
          transactionsImported: txns.length,
          accountIban: parsed.accountIban,
          statementId: parsed.statementId,
        },
      })

      return { statementId: stmt.id, count: txns.length }
    })
    statementId = txResult.statementId
    transactionsImported = txResult.count
  } catch (err) {
    await storage
      .remove(BANK_STATEMENTS_BUCKET, [storagePath])
      .catch(() => {})
    throw err
  }

  return { statementId, alreadyImported: false, transactionsImported }
}

export async function autoMatchStatement(
  prisma: PrismaClient,
  tenantId: string,
  statementId: string,
  userId: string | null,
): Promise<AutoMatchResult> {
  const transactions = await prisma.bankTransaction.findMany({
    where: { tenantId, statementId, status: "unmatched" },
    select: { id: true, direction: true },
  })

  const snapshot = await numberSequenceService.getPrefixSnapshot(prisma, tenantId)
  let autoMatched = 0
  let failed = 0

  for (const bankTx of transactions) {
    let matched = false
    try {
      if (bankTx.direction === "CREDIT") {
        const decision = await matcherService.runCreditMatchForTransaction(
          prisma, tenantId, bankTx.id, snapshot, userId,
        )
        if (decision.result === "matched") { autoMatched++; matched = true }
      } else {
        const decision = await matcherService.runDebitMatchForTransaction(
          prisma, tenantId, bankTx.id, snapshot, userId,
        )
        if (decision.result === "matched" || decision.result === "consistency_confirmed") { autoMatched++; matched = true }
      }
    } catch {
      failed++
    }
    if (!matched) {
      await prisma.bankTransaction.update({
        where: { id: bankTx.id },
        data: { updatedAt: new Date() },
      })
    }
  }

  return {
    autoMatched,
    unmatched: transactions.length - autoMatched - failed,
    failed,
  }
}

export async function getMatchProgress(
  prisma: PrismaClient,
  tenantId: string,
  statementId: string,
): Promise<MatchProgress> {
  const [result] = await prisma.$queryRaw<[{ total: bigint; processed: bigint; matched: bigint }]>`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE updated_at > created_at)::bigint AS processed,
      COUNT(*) FILTER (WHERE status = 'matched')::bigint AS matched
    FROM bank_transactions
    WHERE tenant_id = ${tenantId} AND statement_id = ${statementId}
  `
  return {
    total: Number(result.total),
    processed: Number(result.processed),
    matched: Number(result.matched),
  }
}

export interface DeleteStatementResult {
  transactionsDeleted: number
  paymentsReversed: number
}

export async function deleteStatement(
  prisma: PrismaClient,
  tenantId: string,
  statementId: string,
  userId: string | null,
): Promise<DeleteStatementResult> {
  const statement = await repo.findStatementById(prisma, tenantId, statementId)
  if (!statement) {
    throw new BankStatementNotFoundError("Statement not found")
  }

  const result = await prisma.$transaction(async (tx) => {
    const txAsPrisma = tx as unknown as PrismaClient
    const cancelledBy = userId ?? "system"

    const transactions = await tx.bankTransaction.findMany({
      where: { tenantId, statementId: statement.id },
    })

    let paymentsReversed = 0

    for (const bankTx of transactions) {
      if (bankTx.status !== "matched") continue

      const creditAllocs = await tx.billingDocumentBankAllocation.findMany({
        where: { tenantId, bankTransactionId: bankTx.id },
      })
      for (const alloc of creditAllocs) {
        if (alloc.billingPaymentId) {
          const payment = await tx.billingPayment.findFirst({
            where: { id: alloc.billingPaymentId, tenantId },
          })
          if (payment && payment.status !== "CANCELLED") {
            await billingPaymentRepo.cancelPayment(txAsPrisma, tenantId, payment.id, cancelledBy)
            paymentsReversed++
            if (!payment.isDiscount) {
              const relatedSkonto = await tx.billingPayment.findMany({
                where: {
                  tenantId,
                  documentId: payment.documentId,
                  isDiscount: true,
                  status: "ACTIVE",
                  date: payment.date,
                },
              })
              for (const skonto of relatedSkonto) {
                await billingPaymentRepo.cancelPayment(txAsPrisma, tenantId, skonto.id, cancelledBy)
              }
            }
          }
        }
        await tx.billingDocumentBankAllocation.delete({ where: { id: alloc.id } })
      }

      const debitAllocs = await tx.inboundInvoiceBankAllocation.findMany({
        where: { tenantId, bankTransactionId: bankTx.id },
      })
      const affectedInvoiceIds = new Set<string>()
      for (const alloc of debitAllocs) {
        if (alloc.inboundInvoicePaymentId) {
          await inboundPaymentRepo.cancelPayment(txAsPrisma, tenantId, alloc.inboundInvoicePaymentId, cancelledBy)
          paymentsReversed++
          affectedInvoiceIds.add(alloc.inboundInvoiceId)
        }
        await tx.inboundInvoiceBankAllocation.delete({ where: { id: alloc.id } })
      }

      for (const invoiceId of affectedInvoiceIds) {
        const activePayments = await tx.inboundInvoicePayment.findMany({
          where: { tenantId, invoiceId, status: "ACTIVE" },
          select: { amount: true },
        })
        const paidAmount = Math.round(activePayments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
        const invoice = await tx.inboundInvoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { totalGross: true, paidAt: true },
        })
        const totalGross = invoice.totalGross ? Number(invoice.totalGross) : 0
        const newStatus = totalGross <= 0 ? "UNPAID" : paidAmount >= totalGross - 0.01 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID"
        await tx.inboundInvoice.update({
          where: { id: invoiceId },
          data: {
            paymentStatus: newStatus,
            paidAmount,
            paidAt: newStatus === "PAID" ? (invoice.paidAt ?? new Date()) : null,
          },
        })
      }
    }

    await tx.bankTransaction.deleteMany({
      where: { tenantId, statementId: statement.id },
    })
    await tx.bankStatement.delete({
      where: { id: statement.id },
    })

    await auditLog.log(tx, {
      tenantId,
      userId,
      action: "delete",
      entityType: "bank_statement",
      entityId: statement.id,
      entityName: statement.fileName,
      metadata: {
        transactionsDeleted: transactions.length,
        paymentsReversed,
      },
    }).catch(() => {})

    return { transactionsDeleted: transactions.length, paymentsReversed }
  })

  if (statement.xmlStoragePath) {
    await storage
      .remove(BANK_STATEMENTS_BUCKET, [statement.xmlStoragePath])
      .catch(() => {})
  }

  return result
}

// Re-export parser errors so callers can use a single import.
export { CamtValidationError } from "./bank-statement-camt-parser"
