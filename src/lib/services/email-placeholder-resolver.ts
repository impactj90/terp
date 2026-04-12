/**
 * Email Placeholder Resolver
 *
 * Pure function that replaces placeholder tokens in email subject/body text.
 * Missing placeholders are replaced with empty string.
 */

export interface PlaceholderContext {
  kundenname?: string
  anrede?: string
  dokumentennummer?: string
  betrag?: string
  faelligkeitsdatum?: string
  firmenname?: string
  projektname?: string
}

const PLACEHOLDER_MAP: Record<string, keyof PlaceholderContext> = {
  "{Kundenname}": "kundenname",
  "{Anrede}": "anrede",
  "{Dokumentennummer}": "dokumentennummer",
  "{Betrag}": "betrag",
  "{Fälligkeitsdatum}": "faelligkeitsdatum",
  "{Firmenname}": "firmenname",
  "{Projektname}": "projektname",
}

export function resolvePlaceholders(
  text: string,
  ctx: PlaceholderContext
): string {
  let result = text
  for (const [token, key] of Object.entries(PLACEHOLDER_MAP)) {
    result = result.replaceAll(token, ctx[key] ?? "")
  }
  return result
}
