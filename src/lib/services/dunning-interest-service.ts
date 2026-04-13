/**
 * Dunning interest + fee helpers.
 *
 * Verzugszinsen (BGB §288) are calculated in integer cents internally to
 * avoid Float drift, but the service surface stays Float-EUR to match the
 * rest of the billing stack (Prisma.Float). The result is rounded to whole
 * cents.
 */

/**
 * Calculate statutory late-payment interest for an open amount.
 *
 * Formula (per BGB §288, simple-interest, calendar-year basis):
 *   interest = openAmount * annualRatePercent/100 * daysOverdue/365
 *
 * Negative or zero inputs short-circuit to 0.
 */
export function calculateInterest(
  openAmount: number,
  daysOverdue: number,
  annualRatePercent: number
): number {
  if (openAmount <= 0 || daysOverdue <= 0 || annualRatePercent <= 0) return 0
  const amountCents = Math.round(openAmount * 100)
  const dailyInterestCents = (amountCents * annualRatePercent) / 100 / 365
  const totalInterestCents = Math.round(dailyInterestCents * daysOverdue)
  return totalInterestCents / 100
}

/**
 * Returns the dunning fee for a given level. Levels are 1-indexed
 * (level 1 maps to feeAmounts[0]). Out-of-range levels return 0.
 */
export function feeForLevel(feeAmounts: number[], level: number): number {
  if (level < 1 || level > feeAmounts.length) return 0
  return feeAmounts[level - 1] ?? 0
}
