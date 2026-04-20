import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./outgoing-invoice-book-repository"
import type { OutgoingInvoiceBookEntry } from "./outgoing-invoice-book-repository"

export type { OutgoingInvoiceBookEntry, VatBreakdownBucket } from "./outgoing-invoice-book-repository"

export interface VatSummaryRow {
  vatRate: number
  net: number
  vat: number
  gross: number
}

export interface VatSummary {
  perRate: VatSummaryRow[]
  totalNet: number
  totalVat: number
  totalGross: number
}

export class OutgoingInvoiceBookValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OutgoingInvoiceBookValidationError"
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function aggregateSummary(entries: OutgoingInvoiceBookEntry[]): VatSummary {
  const byRate = new Map<number, { net: number; vat: number; gross: number }>()
  let totalNet = 0
  let totalVat = 0
  let totalGross = 0

  for (const e of entries) {
    for (const b of e.vatBreakdown) {
      const existing = byRate.get(b.vatRate)
      if (existing) {
        existing.net += b.net
        existing.vat += b.vat
        existing.gross += b.gross
      } else {
        byRate.set(b.vatRate, { net: b.net, vat: b.vat, gross: b.gross })
      }
      totalNet += b.net
      totalVat += b.vat
      totalGross += b.gross
    }
  }

  const perRate: VatSummaryRow[] = []
  for (const [vatRate, { net, vat, gross }] of byRate) {
    perRate.push({
      vatRate,
      net: round2(net),
      vat: round2(vat),
      gross: round2(gross),
    })
  }
  perRate.sort((a, b) => b.vatRate - a.vatRate)

  return {
    perRate,
    totalNet: round2(totalNet),
    totalVat: round2(totalVat),
    totalGross: round2(totalGross),
  }
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date }
): Promise<{ entries: OutgoingInvoiceBookEntry[]; summary: VatSummary }> {
  if (params.dateFrom > params.dateTo) {
    throw new OutgoingInvoiceBookValidationError(
      "dateFrom muss ≤ dateTo sein"
    )
  }
  const entries = await repo.list(prisma, tenantId, params)
  const summary = aggregateSummary(entries)
  return { entries, summary }
}
