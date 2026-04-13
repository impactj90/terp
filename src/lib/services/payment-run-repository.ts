/**
 * Payment Run Repository
 *
 * Pure Prisma data-access for PaymentRun + PaymentRunItem.
 * Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 1.6
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

export const DEFAULT_INCLUDE = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      inboundInvoice: {
        select: {
          id: true,
          number: true,
          invoiceNumber: true,
          sellerName: true,
          dueDate: true,
          totalGross: true,
          supplierId: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentRunInclude

export type PaymentRunWithItems = Prisma.PaymentRunGetPayload<{
  include: typeof DEFAULT_INCLUDE
}>

export interface ListFilters {
  status?: string
  search?: string
}

export interface ListPagination {
  page?: number
  pageSize?: number
}

export async function findById(
  prisma: Tx,
  tenantId: string,
  id: string
): Promise<PaymentRunWithItems | null> {
  return prisma.paymentRun.findFirst({
    where: { id, tenantId },
    include: DEFAULT_INCLUDE,
  })
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  filters: ListFilters = {},
  pagination: ListPagination = {}
) {
  const page = pagination.page ?? 1
  const pageSize = pagination.pageSize ?? 20
  const skip = (page - 1) * pageSize

  const where: Prisma.PaymentRunWhereInput = { tenantId }
  if (filters.status) where.status = filters.status
  if (filters.search) {
    where.OR = [
      { number: { contains: filters.search, mode: "insensitive" } },
      { debtorName: { contains: filters.search, mode: "insensitive" } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.paymentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        tenantId: true,
        number: true,
        status: true,
        executionDate: true,
        debtorName: true,
        debtorIban: true,
        totalAmountCents: true,
        itemCount: true,
        xmlGeneratedAt: true,
        bookedAt: true,
        cancelledAt: true,
        createdAt: true,
      },
    }),
    prisma.paymentRun.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export interface CreatePaymentRunData {
  id?: string
  number: string
  executionDate: Date
  debtorName: string
  debtorIban: string
  debtorBic: string | null
  totalAmountCents: bigint
  itemCount: number
  notes: string | null
  createdBy: string | null
}

export interface CreatePaymentRunItemData {
  effectiveCreditorName: string
  effectiveIban: string
  effectiveBic: string | null
  effectiveStreet: string | null
  effectiveZip: string | null
  effectiveCity: string
  effectiveCountry: string
  effectiveAmountCents: bigint
  effectiveCurrency: string
  effectiveRemittanceInfo: string
  ibanSource: "CRM" | "INVOICE" | "MANUAL"
  addressSource: "CRM" | "INVOICE" | "MANUAL"
  endToEndId: string
  inboundInvoiceId: string
}

export async function createWithItems(
  prisma: Tx,
  tenantId: string,
  run: CreatePaymentRunData,
  items: CreatePaymentRunItemData[]
): Promise<PaymentRunWithItems> {
  const created = await prisma.paymentRun.create({
    data: {
      ...(run.id ? { id: run.id } : {}),
      tenantId,
      number: run.number,
      status: "DRAFT",
      executionDate: run.executionDate,
      debtorName: run.debtorName,
      debtorIban: run.debtorIban,
      debtorBic: run.debtorBic,
      totalAmountCents: run.totalAmountCents,
      itemCount: run.itemCount,
      notes: run.notes,
      createdBy: run.createdBy,
      items: {
        create: items.map((it) => ({
          tenantId,
          effectiveCreditorName: it.effectiveCreditorName,
          effectiveIban: it.effectiveIban,
          effectiveBic: it.effectiveBic,
          effectiveStreet: it.effectiveStreet,
          effectiveZip: it.effectiveZip,
          effectiveCity: it.effectiveCity,
          effectiveCountry: it.effectiveCountry,
          effectiveAmountCents: it.effectiveAmountCents,
          effectiveCurrency: it.effectiveCurrency,
          effectiveRemittanceInfo: it.effectiveRemittanceInfo,
          ibanSource: it.ibanSource,
          addressSource: it.addressSource,
          endToEndId: it.endToEndId,
          inboundInvoiceId: it.inboundInvoiceId,
        })),
      },
    },
    include: DEFAULT_INCLUDE,
  })
  return created
}

export interface UpdateStatusPatch {
  status?: string
  xmlStoragePath?: string | null
  xmlGeneratedAt?: Date | null
  bookedAt?: Date | null
  bookedBy?: string | null
  cancelledAt?: Date | null
  cancelledBy?: string | null
  cancelledReason?: string | null
}

export async function updateStatus(
  prisma: Tx,
  tenantId: string,
  id: string,
  patch: UpdateStatusPatch
): Promise<PaymentRunWithItems | null> {
  const { count } = await prisma.paymentRun.updateMany({
    where: { id, tenantId },
    data: patch,
  })
  if (count === 0) return null
  return findById(prisma, tenantId, id)
}

/**
 * Returns the set of invoice IDs that are currently bound to a
 * non-cancelled payment run. Used by the proposal filter and by the
 * safety check in the service before creating new runs.
 */
export async function findInvoiceIdsWithActivePaymentRun(
  prisma: PrismaClient,
  tenantId: string,
  invoiceIds: string[]
): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set()

  const rows = await prisma.paymentRunItem.findMany({
    where: {
      tenantId,
      inboundInvoiceId: { in: invoiceIds },
      paymentRun: { status: { not: "CANCELLED" } },
    },
    select: { inboundInvoiceId: true },
  })

  return new Set(rows.map((r) => r.inboundInvoiceId))
}
