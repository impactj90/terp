import type { PrismaClient } from "@/generated/prisma/client"

export interface VatBreakdownBucket {
  vatRate: number
  net: number
  vat: number
  gross: number
}

export interface OutgoingInvoiceBookEntry {
  id: string
  number: string
  type: "INVOICE" | "CREDIT_NOTE"
  documentDate: Date
  servicePeriodFrom: Date | null
  servicePeriodTo: Date | null
  customerName: string
  customerNumber: string | null
  customerVatId: string | null
  vatBreakdown: VatBreakdownBucket[]
  subtotalNet: number
  totalVat: number
  totalGross: number
}

// Position types that contribute to revenue. Structural positions
// (TEXT, PAGE_BREAK, SUBTOTAL) don't carry totalPrice.
const REVENUE_POSITION_TYPES = new Set(["ARTICLE", "FREE"])

interface PositionForBreakdown {
  vatRate: number | null
  totalPrice: number | null
  type: string
}

export function computeVatBreakdown(
  positions: PositionForBreakdown[],
  type: "INVOICE" | "CREDIT_NOTE"
): VatBreakdownBucket[] {
  const sign = type === "CREDIT_NOTE" ? -1 : 1
  const buckets = new Map<number, { net: number }>()

  for (const p of positions) {
    if (!REVENUE_POSITION_TYPES.has(p.type)) continue
    const rate = Number(p.vatRate ?? 0)
    const net = Number(p.totalPrice ?? 0) * sign
    if (net === 0 && rate === 0 && (p.totalPrice ?? null) === null) continue
    const existing = buckets.get(rate)
    if (existing) {
      existing.net += net
    } else {
      buckets.set(rate, { net })
    }
  }

  const result: VatBreakdownBucket[] = []
  for (const [rate, { net }] of buckets) {
    const vat = round2((net * rate) / 100)
    const gross = round2(net + vat)
    result.push({
      vatRate: rate,
      net: round2(net),
      vat,
      gross,
    })
  }
  // Sort descending so 19% appears before 7% before 0%.
  result.sort((a, b) => b.vatRate - a.vatRate)
  return result
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date }
): Promise<OutgoingInvoiceBookEntry[]> {
  const docs = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      type: { in: ["INVOICE", "CREDIT_NOTE"] },
      status: { notIn: ["DRAFT", "CANCELLED"] },
      documentDate: { gte: params.dateFrom, lte: params.dateTo },
    },
    include: {
      address: { select: { id: true, company: true, number: true, vatId: true } },
      positions: { select: { vatRate: true, totalPrice: true, type: true } },
    },
    orderBy: [{ documentDate: "asc" }, { number: "asc" }],
  })

  return docs.map((d) => {
    const type = d.type as "INVOICE" | "CREDIT_NOTE"
    const sign = type === "CREDIT_NOTE" ? -1 : 1
    return {
      id: d.id,
      number: d.number,
      type,
      documentDate: d.documentDate,
      servicePeriodFrom: d.servicePeriodFrom,
      servicePeriodTo: d.servicePeriodTo,
      customerName: d.address?.company ?? "—",
      customerNumber: d.address?.number ?? null,
      customerVatId: d.address?.vatId ?? null,
      vatBreakdown: computeVatBreakdown(d.positions as PositionForBreakdown[], type),
      subtotalNet: round2(d.subtotalNet * sign),
      totalVat: round2(d.totalVat * sign),
      totalGross: round2(d.totalGross * sign),
    }
  })
}
