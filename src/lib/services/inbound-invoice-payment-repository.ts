import type { PrismaClient, InboundInvoicePaymentType } from "@/generated/prisma/client"

// --- Includes (shared across find operations) ---

const PAYMENT_INCLUDE = {
  invoice: {
    select: {
      id: true,
      number: true,
      invoiceNumber: true,
      sellerName: true,
      totalGross: true,
      paymentStatus: true,
      paidAmount: true,
    },
  },
} as const

// --- Repository Functions ---

export async function findPaymentsByInvoiceId(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string
) {
  return prisma.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId },
    orderBy: { date: "desc" },
    include: PAYMENT_INCLUDE,
  })
}

export async function findPaymentById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.inboundInvoicePayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function createPayment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    invoiceId: string
    date: Date
    amount: number
    type: InboundInvoicePaymentType
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.inboundInvoicePayment.create({
    data: {
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      date: data.date,
      amount: data.amount,
      type: data.type,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
    include: PAYMENT_INCLUDE,
  })
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  cancelledById: string,
  notes?: string | null
) {
  // Use updateMany for tenant-scoped safety, then fetch with includes
  await prisma.inboundInvoicePayment.updateMany({
    where: { id, tenantId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById,
      ...(notes !== undefined && notes !== null ? { notes } : {}),
    },
  })
  return prisma.inboundInvoicePayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function getActivePaymentsForInvoice(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string
) {
  return prisma.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId, status: "ACTIVE" },
    orderBy: { date: "desc" },
  })
}
