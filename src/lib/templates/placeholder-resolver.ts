/**
 * Shared placeholder resolver for letter-style templates that use the
 * double-brace `{{key}}` syntax. Used by BillingDocumentTemplate and
 * ReminderTemplate (Mahnwesen). Keys are matched case-insensitively.
 *
 * Note: the email-template system in `email-placeholder-resolver.ts`
 * uses a different (single-brace, fixed key) syntax and is independent.
 */

export type PlaceholderContext = Record<string, string | number | null | undefined>

/**
 * Replaces every `{{key}}` token in `text` with the matching value from
 * `context`. Lookups are case-insensitive. Unknown or null/undefined
 * values render as the empty string.
 */
export function resolvePlaceholders(text: string, context: PlaceholderContext): string {
  return text.replace(/\{\{(\w+)\}\}/gi, (_match, key: string) => {
    const val = context[key.toLowerCase()]
    if (val === undefined || val === null) return ""
    return String(val)
  })
}

/**
 * Builds the standard letter-salutation/contact placeholder block that is
 * shared by every letter-style template. Mirrors the keys that
 * billing-document-service has used since the original implementation,
 * with German + English aliases for the same fields.
 */
export function buildContactPlaceholders(
  address?: { company?: string | null } | null,
  contact?: {
    firstName?: string | null
    lastName?: string | null
    salutation?: string | null
    title?: string | null
    letterSalutation?: string | null
  } | null,
): PlaceholderContext {
  return {
    // German
    briefanrede: contact?.letterSalutation || "Sehr geehrte Damen und Herren,",
    anrede: contact?.salutation ?? "",
    titel: contact?.title ?? "",
    vorname: contact?.firstName ?? "",
    nachname: contact?.lastName ?? "",
    firma: address?.company ?? "",
    // English
    lettersalutation: contact?.letterSalutation || "Dear Sir or Madam,",
    salutation: contact?.salutation ?? "",
    title: contact?.title ?? "",
    firstname: contact?.firstName ?? "",
    lastname: contact?.lastName ?? "",
    company: address?.company ?? "",
  }
}
