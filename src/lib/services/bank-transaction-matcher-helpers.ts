import type { TenantPrefixSnapshot } from "./number-sequence-service"

export function buildInvoiceNumberRegex(snapshot: TenantPrefixSnapshot): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const prefixes = [snapshot.invoicePrefix, snapshot.creditNotePrefix].map(escape).join("|")
  return new RegExp(`(${prefixes})\\d+`, "gi")
}

export function buildInboundNumberRegex(snapshot: TenantPrefixSnapshot): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(${escape(snapshot.inboundInvoicePrefix)})\\d+`, "gi")
}

export function extractInvoiceNumbers(remittanceInfo: string | null, regex: RegExp): string[] {
  if (!remittanceInfo) return []
  return Array.from(remittanceInfo.matchAll(regex)).map((m) => m[0])
}

export function extractFreeformInvoiceNumbers(remittanceInfo: string | null): string[] {
  if (!remittanceInfo) return []
  const matches = remittanceInfo.match(/[A-Za-z0-9][A-Za-z0-9\-/.]{2,}[A-Za-z0-9]/g)
  if (!matches) return []
  return matches.filter((m) => m.length >= 4)
}

export function compareAmountWithSkonto(
  txAmount: number,
  document: {
    openAmount: number
    effectiveTotalGross: number
    documentDate: Date
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
  },
  paymentDate: Date,
  getDiscount: (
    doc: { documentDate: Date; discountDays?: number | null; discountPercent?: number | null; discountDays2?: number | null; discountPercent2?: number | null },
    date: Date,
  ) => { percent: number; tier: 1 | 2 } | null,
): { match: "exact" | "skonto" | "none"; discount?: { percent: number; tier: 1 | 2 } } {
  const tolerance = 0.01
  if (Math.abs(txAmount - document.openAmount) <= tolerance) {
    return { match: "exact" }
  }
  const applicable = getDiscount(document, paymentDate)
  if (applicable) {
    const expectedAfterDiscount =
      document.openAmount * (1 - applicable.percent / 100)
    if (Math.abs(txAmount - expectedAfterDiscount) <= tolerance) {
      return { match: "skonto", discount: applicable }
    }
  }
  return { match: "none" }
}
