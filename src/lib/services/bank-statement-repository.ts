import { Prisma } from "@/generated/prisma/client"
import type {
  PrismaClient,
  BankStatement,
  BankTransaction,
  BankTransactionDirection,
  BankTransactionStatus,
} from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

// --- Statement CRUD ---

export async function findStatementByHash(
  prisma: Tx,
  tenantId: string,
  sha256Hash: string,
): Promise<BankStatement | null> {
  return prisma.bankStatement.findFirst({
    where: { tenantId, sha256Hash },
  })
}

export async function findStatementById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<BankStatement | null> {
  return prisma.bankStatement.findFirst({
    where: { id, tenantId },
  })
}

export interface CreateStatementInput {
  id?: string
  tenantId: string
  fileName: string
  sha256Hash: string
  xmlStoragePath: string
  accountIban: string
  statementId: string
  periodFrom: Date
  periodTo: Date
  openingBalance: number
  closingBalance: number
  currency: string
  importedById: string | null
}

export async function createStatement(
  prisma: Tx,
  input: CreateStatementInput,
): Promise<BankStatement> {
  return prisma.bankStatement.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      tenantId: input.tenantId,
      fileName: input.fileName,
      sha256Hash: input.sha256Hash,
      xmlStoragePath: input.xmlStoragePath,
      accountIban: input.accountIban,
      statementId: input.statementId,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      currency: input.currency,
      importedById: input.importedById,
    },
  })
}

export async function listStatements(
  prisma: Tx,
  tenantId: string,
  filters: { limit?: number; offset?: number } = {},
): Promise<{ items: BankStatement[]; total: number }> {
  const limit = filters.limit ?? 25
  const offset = filters.offset ?? 0
  const [items, total] = await Promise.all([
    prisma.bankStatement.findMany({
      where: { tenantId },
      orderBy: { importedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        _count: { select: { transactions: true } },
      },
    }),
    prisma.bankStatement.count({ where: { tenantId } }),
  ])
  return { items, total }
}

// --- Transaction CRUD ---

export interface CreateTransactionRow {
  tenantId: string
  statementId: string
  bookingDate: Date
  valueDate: Date
  amount: number
  currency: string
  direction: BankTransactionDirection
  counterpartyIban: string | null
  counterpartyName: string | null
  counterpartyBic: string | null
  remittanceInfo: string | null
  endToEndId: string | null
  mandateId: string | null
  bankReference: string | null
  bankTxCode: Prisma.InputJsonValue | null
  status: BankTransactionStatus
}

export async function createTransactionsBatch(
  prisma: Tx,
  tenantId: string,
  statementId: string,
  rows: CreateTransactionRow[],
): Promise<BankTransaction[]> {
  if (rows.length === 0) return []

  await prisma.bankTransaction.createMany({
    data: rows.map((r) => ({
      tenantId: r.tenantId,
      statementId: r.statementId,
      bookingDate: r.bookingDate,
      valueDate: r.valueDate,
      amount: r.amount,
      currency: r.currency,
      direction: r.direction,
      counterpartyIban: r.counterpartyIban,
      counterpartyName: r.counterpartyName,
      counterpartyBic: r.counterpartyBic,
      remittanceInfo: r.remittanceInfo,
      endToEndId: r.endToEndId,
      mandateId: r.mandateId,
      bankReference: r.bankReference,
      bankTxCode: r.bankTxCode ?? Prisma.JsonNull,
      status: r.status,
    })),
  })

  return prisma.bankTransaction.findMany({
    where: { tenantId, statementId },
    orderBy: { createdAt: "asc" },
  })
}
