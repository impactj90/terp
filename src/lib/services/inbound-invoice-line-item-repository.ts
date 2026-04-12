import type { PrismaClient } from "@/generated/prisma/client"

export interface LineItemInput {
  position?: number
  articleNumber?: string | null
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unitPriceNet?: number | null
  totalNet?: number | null
  vatRate?: number | null
  vatAmount?: number | null
  totalGross?: number | null
  sortOrder?: number
}

export async function createMany(
  prisma: PrismaClient,
  invoiceId: string,
  items: LineItemInput[]
) {
  if (items.length === 0) return

  await prisma.inboundInvoiceLineItem.createMany({
    data: items.map((item, idx) => ({
      invoiceId,
      position: item.position ?? idx + 1,
      articleNumber: item.articleNumber ?? null,
      description: item.description ?? null,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      unitPriceNet: item.unitPriceNet ?? null,
      totalNet: item.totalNet ?? null,
      vatRate: item.vatRate ?? null,
      vatAmount: item.vatAmount ?? null,
      totalGross: item.totalGross ?? null,
      sortOrder: item.sortOrder ?? idx + 1,
    })),
  })
}

export async function findByInvoiceId(
  prisma: PrismaClient,
  invoiceId: string
) {
  return prisma.inboundInvoiceLineItem.findMany({
    where: { invoiceId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function deleteByInvoiceId(
  prisma: PrismaClient,
  invoiceId: string
) {
  await prisma.inboundInvoiceLineItem.deleteMany({
    where: { invoiceId },
  })
}

export async function replaceAll(
  prisma: PrismaClient,
  invoiceId: string,
  items: LineItemInput[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.inboundInvoiceLineItem.deleteMany({
      where: { invoiceId },
    })
    if (items.length > 0) {
      await tx.inboundInvoiceLineItem.createMany({
        data: items.map((item, idx) => ({
          invoiceId,
          position: item.position ?? idx + 1,
          articleNumber: item.articleNumber ?? null,
          description: item.description ?? null,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          unitPriceNet: item.unitPriceNet ?? null,
          totalNet: item.totalNet ?? null,
          vatRate: item.vatRate ?? null,
          vatAmount: item.vatAmount ?? null,
          totalGross: item.totalGross ?? null,
          sortOrder: item.sortOrder ?? idx + 1,
        })),
      })
    }
  })
}
