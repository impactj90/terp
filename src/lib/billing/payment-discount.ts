export function getApplicableDiscount(
  document: {
    documentDate: Date
    discountDays?: number | null
    discountPercent?: number | null
    discountDays2?: number | null
    discountPercent2?: number | null
  },
  paymentDate: Date
): { percent: number; tier: 1 | 2 } | null {
  const docDate = new Date(document.documentDate)
  const daysDiff = Math.floor(
    (paymentDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (
    document.discountDays != null &&
    document.discountPercent != null &&
    document.discountPercent > 0 &&
    daysDiff <= document.discountDays
  ) {
    return { percent: document.discountPercent, tier: 1 }
  }

  if (
    document.discountDays2 != null &&
    document.discountPercent2 != null &&
    document.discountPercent2 > 0 &&
    daysDiff <= document.discountDays2
  ) {
    return { percent: document.discountPercent2, tier: 2 }
  }

  return null
}
