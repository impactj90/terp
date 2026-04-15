/**
 * IBAN validation helper for SEPA payment runs.
 *
 * Centralizes normalization rules (strip whitespace, uppercase) and runs the
 * standard ISO 13616 mod-97 check. Implemented inline rather than via a third-
 * party package so we avoid pulling in unmaintained UMD modules that trip up
 * Turbopack's resolver.
 */

export function normalizeIban(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.replace(/\s+/g, "").toUpperCase()
}

export function isValidIban(raw: string | null | undefined): boolean {
  const iban = normalizeIban(raw)
  if (iban.length < 15 || iban.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false

  // Move first 4 chars to the end, then replace letters with digits
  // (A=10, B=11, ..., Z=35) and compute mod 97 — must equal 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0)
    const digit = code >= 65 ? code - 55 : code - 48
    if (digit >= 10) {
      remainder = (remainder * 100 + digit) % 97
    } else {
      remainder = (remainder * 10 + digit) % 97
    }
  }
  return remainder === 1
}
