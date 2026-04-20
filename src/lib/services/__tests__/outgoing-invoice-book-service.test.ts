import { describe, it, expect } from "vitest"
import {
  computeVatBreakdown,
  type OutgoingInvoiceBookEntry,
  type VatBreakdownBucket,
} from "../outgoing-invoice-book-repository"
import {
  aggregateSummary,
  type VatSummaryRow,
} from "../outgoing-invoice-book-service"

function requireBucket(
  buckets: VatBreakdownBucket[],
  rate: number
): VatBreakdownBucket {
  const b = buckets.find((x) => x.vatRate === rate)
  if (!b) throw new Error(`bucket ${rate}% not found`)
  return b
}

function requireRow(rows: VatSummaryRow[], rate: number): VatSummaryRow {
  const r = rows.find((x) => x.vatRate === rate)
  if (!r) throw new Error(`row ${rate}% not found`)
  return r
}

describe("computeVatBreakdown", () => {
  it("groups positions by vatRate (INVOICE)", () => {
    const buckets = computeVatBreakdown(
      [
        { type: "ARTICLE", vatRate: 19, totalPrice: 100 },
        { type: "ARTICLE", vatRate: 19, totalPrice: 200 },
        { type: "FREE", vatRate: 7, totalPrice: 50 },
      ],
      "INVOICE"
    )
    const b19 = requireBucket(buckets, 19)
    const b07 = requireBucket(buckets, 7)
    expect(b19.net).toBe(300)
    expect(b19.vat).toBe(57)
    expect(b19.gross).toBe(357)
    expect(b07.net).toBe(50)
    expect(b07.vat).toBe(3.5)
    expect(b07.gross).toBe(53.5)
  })

  it("skips structural positions (TEXT, PAGE_BREAK, SUBTOTAL)", () => {
    const buckets = computeVatBreakdown(
      [
        { type: "TEXT", vatRate: null, totalPrice: null },
        { type: "PAGE_BREAK", vatRate: null, totalPrice: null },
        { type: "SUBTOTAL", vatRate: null, totalPrice: null },
        { type: "ARTICLE", vatRate: 19, totalPrice: 100 },
      ],
      "INVOICE"
    )
    expect(buckets).toHaveLength(1)
    const b = requireBucket(buckets, 19)
    expect(b.net).toBe(100)
  })

  it("negates net/vat/gross for CREDIT_NOTE", () => {
    const buckets = computeVatBreakdown(
      [{ type: "ARTICLE", vatRate: 19, totalPrice: 100 }],
      "CREDIT_NOTE"
    )
    const b = requireBucket(buckets, 19)
    expect(b.net).toBe(-100)
    expect(b.vat).toBe(-19)
    expect(b.gross).toBe(-119)
  })

  it("sorts buckets by vatRate descending", () => {
    const buckets = computeVatBreakdown(
      [
        { type: "ARTICLE", vatRate: 0, totalPrice: 10 },
        { type: "ARTICLE", vatRate: 19, totalPrice: 100 },
        { type: "ARTICLE", vatRate: 7, totalPrice: 50 },
      ],
      "INVOICE"
    )
    expect(buckets.map((b) => b.vatRate)).toEqual([19, 7, 0])
  })

  it("returns zero-entry bucket if only 0% rate present", () => {
    const buckets = computeVatBreakdown(
      [{ type: "ARTICLE", vatRate: 0, totalPrice: 100 }],
      "INVOICE"
    )
    expect(buckets).toHaveLength(1)
    const b = requireBucket(buckets, 0)
    expect(b.net).toBe(100)
    expect(b.vat).toBe(0)
    expect(b.gross).toBe(100)
  })

  it("returns empty array when no revenue positions", () => {
    const buckets = computeVatBreakdown(
      [{ type: "TEXT", vatRate: null, totalPrice: null }],
      "INVOICE"
    )
    expect(buckets).toEqual([])
  })
})

describe("aggregateSummary", () => {
  function entry(
    id: string,
    type: "INVOICE" | "CREDIT_NOTE",
    breakdown: Array<{ vatRate: number; net: number; vat: number; gross: number }>
  ): OutgoingInvoiceBookEntry {
    const signed = breakdown.reduce(
      (acc, b) => ({
        net: acc.net + b.net,
        vat: acc.vat + b.vat,
        gross: acc.gross + b.gross,
      }),
      { net: 0, vat: 0, gross: 0 }
    )
    return {
      id,
      number: id,
      type,
      documentDate: new Date("2026-03-15"),
      servicePeriodFrom: null,
      servicePeriodTo: null,
      customerName: "Test",
      customerNumber: null,
      customerVatId: null,
      vatBreakdown: breakdown,
      subtotalNet: signed.net,
      totalVat: signed.vat,
      totalGross: signed.gross,
    }
  }

  it("aggregates per-rate across multiple entries", () => {
    const summary = aggregateSummary([
      entry("R1", "INVOICE", [
        { vatRate: 19, net: 100, vat: 19, gross: 119 },
      ]),
      entry("R2", "INVOICE", [
        { vatRate: 19, net: 200, vat: 38, gross: 238 },
        { vatRate: 7, net: 50, vat: 3.5, gross: 53.5 },
      ]),
    ])
    const r19 = requireRow(summary.perRate, 19)
    const r07 = requireRow(summary.perRate, 7)
    expect(r19.net).toBe(300)
    expect(r19.vat).toBe(57)
    expect(r19.gross).toBe(357)
    expect(r07.net).toBe(50)
    expect(r07.vat).toBe(3.5)
    expect(r07.gross).toBe(53.5)
  })

  it("computes grand totals across all rates", () => {
    const summary = aggregateSummary([
      entry("R1", "INVOICE", [
        { vatRate: 19, net: 100, vat: 19, gross: 119 },
        { vatRate: 7, net: 50, vat: 3.5, gross: 53.5 },
      ]),
    ])
    expect(summary.totalNet).toBe(150)
    expect(summary.totalVat).toBe(22.5)
    expect(summary.totalGross).toBe(172.5)
  })

  it("negates credit notes in totals", () => {
    const summary = aggregateSummary([
      entry("R1", "INVOICE", [{ vatRate: 19, net: 100, vat: 19, gross: 119 }]),
      entry("G1", "CREDIT_NOTE", [
        { vatRate: 19, net: -50, vat: -9.5, gross: -59.5 },
      ]),
    ])
    expect(summary.totalNet).toBe(50)
    expect(summary.totalVat).toBe(9.5)
    expect(summary.totalGross).toBe(59.5)
  })

  it("handles dynamic rates (e.g. historic 16%)", () => {
    const summary = aggregateSummary([
      entry("R1", "INVOICE", [{ vatRate: 16, net: 100, vat: 16, gross: 116 }]),
    ])
    expect(summary.perRate).toHaveLength(1)
    const r16 = requireRow(summary.perRate, 16)
    expect(r16.net).toBe(100)
  })

  it("returns empty perRate + zero totals for empty input", () => {
    const summary = aggregateSummary([])
    expect(summary.perRate).toEqual([])
    expect(summary.totalNet).toBe(0)
    expect(summary.totalVat).toBe(0)
    expect(summary.totalGross).toBe(0)
  })
})
