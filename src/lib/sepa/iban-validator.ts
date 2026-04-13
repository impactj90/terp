/**
 * IBAN validation helper for SEPA payment runs.
 *
 * Thin wrapper around the `iban` npm package so we can swap implementations
 * if needed and centralize normalization rules (strip whitespace, uppercase).
 */
import { isValid as ibanIsValid } from "iban"

export function normalizeIban(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.replace(/\s+/g, "").toUpperCase()
}

export function isValidIban(raw: string | null | undefined): boolean {
  const normalized = normalizeIban(raw)
  if (!normalized) return false
  return ibanIsValid(normalized)
}
