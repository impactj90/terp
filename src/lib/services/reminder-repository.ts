import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Thin Prisma wrapper for Reminder + ReminderItem rows. The service
 * file (reminder-service.ts) holds the business logic; this file is
 * intentionally dumb and only translates intent into Prisma calls.
 */

export type CreateReminderInput = {
  tenantId: string
  number: string
  customerAddressId: string
  level: number
  headerText: string
  footerText: string
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
  createdById: string | null
  items: Array<{
    billingDocumentId: string
    invoiceNumber: string
    invoiceDate: Date
    dueDate: Date
    originalAmount: number
    openAmountAtReminder: number
    daysOverdue: number
    interestAmount: number
    feeAmount: number
    levelAtReminder: number
  }>
}

export async function create(
  prisma: PrismaClient,
  input: CreateReminderInput
) {
  return await prisma.reminder.create({
    data: {
      tenantId: input.tenantId,
      number: input.number,
      customerAddressId: input.customerAddressId,
      level: input.level,
      status: "DRAFT",
      headerText: input.headerText,
      footerText: input.footerText,
      totalOpenAmount: input.totalOpenAmount,
      totalInterest: input.totalInterest,
      totalFees: input.totalFees,
      totalDue: input.totalDue,
      createdById: input.createdById,
      items: {
        create: input.items.map((item) => ({
          tenantId: input.tenantId,
          billingDocumentId: item.billingDocumentId,
          invoiceNumber: item.invoiceNumber,
          invoiceDate: item.invoiceDate,
          dueDate: item.dueDate,
          originalAmount: item.originalAmount,
          openAmountAtReminder: item.openAmountAtReminder,
          daysOverdue: item.daysOverdue,
          interestAmount: item.interestAmount,
          feeAmount: item.feeAmount,
          levelAtReminder: item.levelAtReminder,
        })),
      },
    },
    include: { items: true },
  })
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return await prisma.reminder.findFirst({
    where: { id, tenantId },
    include: { items: true, customerAddress: true },
  })
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  filter: { status?: "DRAFT" | "SENT" | "CANCELLED" } = {}
) {
  return await prisma.reminder.findMany({
    where: {
      tenantId,
      ...(filter.status && { status: filter.status }),
    },
    orderBy: { createdAt: "desc" },
    include: { items: true, customerAddress: true },
  })
}

export async function updateStatus(
  prisma: PrismaClient,
  id: string,
  status: "DRAFT" | "SENT" | "CANCELLED"
) {
  return await prisma.reminder.update({
    where: { id },
    data: { status },
  })
}

/**
 * Returns true if a DRAFT reminder already exists for the given
 * billing document. Used by createRun to avoid duplicate items.
 */
export async function hasDraftItemForInvoice(
  prisma: PrismaClient,
  tenantId: string,
  billingDocumentId: string
): Promise<boolean> {
  const existing = await prisma.reminderItem.findFirst({
    where: {
      tenantId,
      billingDocumentId,
      reminder: { status: "DRAFT" },
    },
    select: { id: true },
  })
  return existing !== null
}
